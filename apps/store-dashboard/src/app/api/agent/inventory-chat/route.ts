import { generateText, stepCountIs, tool } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { api } from "@/lib/api";
import { renderAssistantMarkdownToHtml } from "@/lib/markdown";
import { type AgentAction, type AgentMessage } from "@/lib/store-pos";
import { canConfirmInventoryDraft, createEmptyInventoryDraft, createInventoryIntakeIdempotencyKey, getInventoryDraftSummary, resolveInventoryRowState, type InventoryDraftMatchedProduct, type InventoryDraftRow, type StoreInventoryDraft } from "@/lib/store-inventory";

const matchedProductSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  productId: z.string().optional(),
  cpgId: z.string().optional(),
  name: z.string(),
  sku: z.string().optional(),
  unitType: z.string(),
  price: z.number(),
  stock: z.number(),
  status: z.string(),
  createdAt: z.string(),
});

const requestSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      renderedHtml: z.string().optional(),
      actions: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            prompt: z.string(),
            kind: z.enum(["prompt", "capture-qr"]).optional(),
            variant: z.enum(["primary", "secondary", "danger"]).optional(),
          }),
        )
        .optional(),
    }),
  ),
  draft: z.object({
    rows: z.array(
      z.object({
        id: z.string(),
        lineNumber: z.number(),
        rawText: z.string(),
        name: z.string(),
        sku: z.string().optional(),
        quantity: z.number(),
        price: z.number().optional(),
        status: z.enum(["matched", "new", "ambiguous", "invalid"]),
        action: z.enum(["match_existing", "create_new"]).optional(),
        matchedStoreProductId: z.string().optional(),
        matchedProduct: matchedProductSchema.optional(),
        candidates: z
          .array(
            z.object({
              storeProductId: z.string(),
              name: z.string(),
              sku: z.string().optional(),
              price: z.number(),
              stock: z.number(),
              score: z.number(),
            }),
          )
          .optional(),
        errors: z.array(z.string()).optional(),
      }),
    ),
    lastReceipt: z
      .object({
        idempotencyKey: z.string(),
        replayed: z.boolean(),
        rows: z.array(
          z.object({
            storeProductId: z.string(),
            name: z.string(),
            sku: z.string().optional(),
            quantityDelta: z.number(),
            previousStock: z.number(),
            currentStock: z.number(),
            created: z.boolean(),
          }),
        ),
        summary: z.object({
          totalRows: z.number(),
          totalQuantity: z.number(),
          createdProducts: z.number(),
          updatedProducts: z.number(),
        }),
      })
      .nullable(),
    idempotencyKey: z.string().nullable().optional(),
  }),
});

type StoreProduct = InventoryDraftMatchedProduct;

const cloneDraft = (draft: StoreInventoryDraft): StoreInventoryDraft => ({
  rows: draft.rows.map((row) => ({
    ...row,
    matchedProduct: row.matchedProduct ? { ...row.matchedProduct } : undefined,
    candidates: row.candidates?.map((candidate) => ({ ...candidate })),
    errors: row.errors ? [...row.errors] : undefined,
  })),
  lastReceipt: draft.lastReceipt
    ? {
        ...draft.lastReceipt,
        rows: draft.lastReceipt.rows.map((row) => ({ ...row })),
        summary: { ...draft.lastReceipt.summary },
      }
    : null,
  idempotencyKey: draft.idempotencyKey ?? null,
});

const buildActions = (draft: StoreInventoryDraft): AgentAction[] => {
  const actions: AgentAction[] = [];

  if (canConfirmInventoryDraft(draft)) {
    actions.push({
      id: "inventory-confirm",
      label: "Confirmar entrada",
      prompt: "Confirma la entrada de inventario actual.",
      variant: "primary",
    });
  }

  if (draft.rows.length > 0) {
    actions.push({
      id: "inventory-clear",
      label: "Vaciar borrador",
      prompt: "Vacía el borrador de inventario actual.",
      variant: "danger",
    });
  }

  return actions;
};

const buildSummaryText = (draft: StoreInventoryDraft) => {
  const summary = getInventoryDraftSummary(draft);
  return JSON.stringify({
    rows: summary.rows,
    quantity: summary.quantity,
    matched: summary.matched,
    created: summary.created,
    ambiguous: summary.ambiguous,
    invalid: summary.invalid,
    items: draft.rows.map((row) => ({
      id: row.id,
      name: row.name,
      quantity: row.quantity,
      action: row.action,
      status: row.status,
      matchedStoreProductId: row.matchedStoreProductId,
    })),
  }, null, 2);
};

const toDraftRows = (rows: Array<Omit<InventoryDraftRow, "id" | "action"> & { matchedProduct?: StoreProduct }>): InventoryDraftRow[] =>
  rows.map((row) => resolveInventoryRowState({
    ...row,
    id: crypto.randomUUID(),
    action:
      row.status === "matched"
        ? "match_existing"
        : row.status === "new" && row.price !== undefined
          ? "create_new"
          : undefined,
  }));

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const parsedBody = requestSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return Response.json({ error: "INVALID_REQUEST", details: parsedBody.error.flatten() }, { status: 400 });
  }

  const { messages, draft } = parsedBody.data;
  const meResponse = await api.v1.users.me.get({ headers: { authorization } });
  if (meResponse.error || !meResponse.data?.data) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const storeId = meResponse.data.data.tenantType === "store" ? meResponse.data.data.tenantId : null;
  if (!storeId) {
    return Response.json({ error: "STORE_SCOPE_REQUIRED" }, { status: 403 });
  }

  let workingDraft = cloneDraft(draft ?? createEmptyInventoryDraft());
  const normalizedMessages = messages;
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  let storeProductsCache: StoreProduct[] | null = null;

  const getStoreProducts = async () => {
    if (storeProductsCache) {
      return storeProductsCache;
    }

    const { data, error } = await api.v1.stores[storeId].products.get({
      query: { limit: "200" },
      headers: { authorization },
    });
    if (error) {
      throw new Error("PRODUCTS_FETCH_FAILED");
    }

    storeProductsCache = (data?.data ?? []) as StoreProduct[];
    return storeProductsCache;
  };

  const previewInventoryFromText = async (text: string) => {
    const { data, error } = await api.v1.stores[storeId].inventory.intake.preview.post(
      { text },
      { headers: { authorization } },
    );
    if (error || !data?.data) {
      throw new Error("INVENTORY_PREVIEW_FAILED");
    }

    workingDraft = {
      rows: toDraftRows(data.data.rows),
      lastReceipt: null,
      idempotencyKey: createInventoryIntakeIdempotencyKey(),
    };

    return {
      rows: workingDraft.rows.length,
      summary: getInventoryDraftSummary(workingDraft),
    };
  };

  const updateDraftRow = async (input: {
    rowId: string;
    name?: string;
    sku?: string;
    quantity?: number;
    price?: number;
    action?: "match_existing" | "create_new";
    storeProductId?: string;
  }) => {
    const target = workingDraft.rows.find((row) => row.id === input.rowId);
    if (!target) {
      throw new Error("ROW_NOT_FOUND");
    }

    const matchedProduct = input.storeProductId
      ? (await getStoreProducts()).find((product) => product.id === input.storeProductId)
      : input.action === "create_new"
        ? undefined
        : target.matchedProduct;

    const nextRow = resolveInventoryRowState({
      ...target,
      name: input.name ?? target.name,
      sku: input.sku ?? target.sku,
      quantity: input.quantity ?? target.quantity,
      price: input.price ?? target.price,
      action: input.action ?? target.action,
      matchedStoreProductId: input.storeProductId ?? (input.action === "create_new" ? undefined : target.matchedStoreProductId),
      matchedProduct,
    });

    workingDraft.rows = workingDraft.rows.map((row) => row.id === nextRow.id ? nextRow : row);
    return buildSummaryText(workingDraft);
  };

  const removeDraftRow = async (rowId: string) => {
    workingDraft.rows = workingDraft.rows.filter((row) => row.id !== rowId);
    return buildSummaryText(workingDraft);
  };

  const clearDraft = async () => {
    workingDraft = createEmptyInventoryDraft();
    return buildSummaryText(workingDraft);
  };

  const confirmInventoryIntake = async () => {
    if (!canConfirmInventoryDraft(workingDraft)) {
      throw new Error("INVALID_DRAFT");
    }

    const { data, error } = await api.v1.stores[storeId].inventory.intake.confirm.post(
      {
        rows: workingDraft.rows.map((row) => ({
          lineNumber: row.lineNumber,
          rawText: row.rawText,
          name: row.name,
          sku: row.sku || undefined,
          quantity: row.quantity,
          price: row.price,
          action: row.action!,
          storeProductId: row.action === "match_existing" ? row.matchedStoreProductId : undefined,
        })),
        idempotencyKey: workingDraft.idempotencyKey ?? createInventoryIntakeIdempotencyKey(),
      },
      { headers: { authorization } },
    );
    if (error || !data?.data) {
      throw new Error("INVENTORY_CONFIRM_FAILED");
    }

    workingDraft = {
      rows: [],
      lastReceipt: data.data,
      idempotencyKey: null,
    };

    return data.data;
  };

  const deterministicPreview = latestUserMessage && workingDraft.rows.length === 0 && /\n|\t|,|\d\s*[xX]?\s+/.test(latestUserMessage.content);
  if (deterministicPreview) {
    await previewInventoryFromText(latestUserMessage.content);
    const content = `Preparé el preview de inventario con **${workingDraft.rows.length} filas**. Revisa las coincidencias y confirma la entrada cuando esté lista.`;
    const renderedHtml = await renderAssistantMarkdownToHtml(content);
    return Response.json({
      message: {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        renderedHtml: renderedHtml || undefined,
        actions: buildActions(workingDraft),
      } as AgentMessage,
      draft: workingDraft,
    });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({ error: "OPENROUTER_NOT_CONFIGURED" }, { status: 500 });
  }

  const modelMessages = normalizedMessages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const result = await generateText({
    model: openrouter(process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash"),
    system: [
      "Eres un asistente de inventario para tenderos en Qoa.",
      "Responde siempre en espanol claro y breve.",
      "Usa herramientas para interpretar listas de proveedor, editar el borrador y confirmar entradas.",
      "No digas que la entrada fue aplicada si no ejecutaste confirmInventoryIntake.",
      "Si el usuario pega una lista o tabla, usa previewInventoryFromText.",
      "Si hay filas ambiguas o invalidas, pide correccion puntual o usa updateInventoryDraftRow cuando ya tengas la instruccion.",
      `Estado actual del inventario en borrador:\n${buildSummaryText(workingDraft)}`,
    ].join("\n\n"),
    messages: modelMessages,
    stopWhen: stepCountIs(8),
    tools: {
      previewInventoryFromText: tool({
        description: "Interpreta texto pegado y genera un borrador de entrada de inventario.",
        inputSchema: z.object({ text: z.string().min(1) }),
        execute: async ({ text }) => previewInventoryFromText(text),
      }),
      updateInventoryDraftRow: tool({
        description: "Edita una fila del borrador de inventario.",
        inputSchema: z.object({
          rowId: z.string(),
          name: z.string().optional(),
          sku: z.string().optional(),
          quantity: z.number().int().min(1).optional(),
          price: z.number().min(0).optional(),
          action: z.enum(["match_existing", "create_new"]).optional(),
          storeProductId: z.string().optional(),
        }),
        execute: async (input) => updateDraftRow(input),
      }),
      removeInventoryDraftRow: tool({
        description: "Elimina una fila del borrador de inventario.",
        inputSchema: z.object({ rowId: z.string() }),
        execute: async ({ rowId }) => removeDraftRow(rowId),
      }),
      clearInventoryDraft: tool({
        description: "Vacía el borrador de inventario actual.",
        inputSchema: z.object({}),
        execute: async () => clearDraft(),
      }),
      summarizeInventoryDraft: tool({
        description: "Devuelve el estado actual del borrador de inventario.",
        inputSchema: z.object({}),
        execute: async () => buildSummaryText(workingDraft),
      }),
      confirmInventoryIntake: tool({
        description: "Confirma y aplica la entrada de inventario actual.",
        inputSchema: z.object({ confirmation: z.string() }),
        execute: async () => confirmInventoryIntake(),
      }),
    },
  });

  const renderedHtml = await renderAssistantMarkdownToHtml(result.text);
  return Response.json({
    message: {
      id: crypto.randomUUID(),
      role: "assistant",
      content: result.text,
      renderedHtml: renderedHtml || undefined,
      actions: buildActions(workingDraft),
    } as AgentMessage,
    draft: workingDraft,
  });
}
