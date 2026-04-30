import { generateObject, generateText, stepCountIs, tool } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { api } from "@/lib/api";
import { buildInventoryPreviewTextFromImageRows, inventoryImageExtractionSchema } from "@/lib/inventory-image-extraction";
import { renderAssistantMarkdownToHtml } from "@/lib/markdown";
import { type AgentAction, type AgentAttachment, type AgentMessage } from "@/lib/store-pos";
import { appendInventoryDraftRows, applyInventoryDraftRowPatch, buildInventoryAgentActions, buildInventoryDraftSummaryText, buildInventoryStockAddDraftRow, canConfirmInventoryDraft, createEmptyInventoryDraft, createInventoryIntakeIdempotencyKey, extractInventoryStockAddRequests, findInventoryDraftRowByQuery, getInventoryDraftSummary, parseInventoryCorrections, rankInventoryProductsByQuery, resolveInventoryRowState, type InventoryDraftMatchedProduct, type InventoryDraftRow, type InventoryStockAddRequest, type StoreInventoryDraft } from "@/lib/store-inventory";
import { extractDraftCorrectionsWithContext } from "@/lib/inventory-draft-corrector";

const AUDIO_PLACEHOLDER = "Adjunto una nota de voz.";
const execFileAsync = promisify(execFile);

const isFixtureDemoRequest = (request: Request) =>
  process.env.QOA_DEMO_AGENT_MODE === "fixture" ||
  (process.env.NODE_ENV !== "production" && request.headers.get("x-qoa-demo-agent-mode") === "fixture");

const normalizeDemoText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const findDemoInventoryProduct = (products: StoreProduct[], skuNeedle: string, nameNeedle: string) => {
  const normalizedNameNeedle = normalizeDemoText(nameNeedle);
  return products.find((product) => product.sku?.includes(skuNeedle)) ??
    products.find((product) => normalizeDemoText(product.name).includes(normalizedNameNeedle));
};

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

const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  contentType: z.string(),
  dataUrl: z.string(),
  kind: z.enum(["image", "audio"]).optional(),
  durationMs: z.number().optional(),
  transcript: z.string().optional(),
  status: z.enum(["pending", "ready", "processing", "transcribed", "failed"]).optional(),
});

const requestSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      renderedHtml: z.string().optional(),
      attachments: z.array(attachmentSchema).optional(),
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

const getAttachmentKind = (attachment: AgentAttachment) => {
  if (attachment.kind) {
    return attachment.kind;
  }

  return attachment.contentType.startsWith("audio/") ? "audio" : "image";
};

const normalizeAttachments = (attachments: AgentAttachment[]) =>
  attachments.map((attachment) => ({
    ...attachment,
    kind: getAttachmentKind(attachment),
  }));

const buildTextMessageContent = (message: AgentMessage) => {
  const attachmentLabel = message.attachments?.length
    ? `\nAdjuntos: ${message.attachments.map((file) => file.name).join(", ")}`
    : "";
  return `${message.content}${attachmentLabel}`;
};

const parseDataUrl = (dataUrl: string) => {
  const [meta, encoded] = dataUrl.split(",");
  if (!meta || !encoded || !meta.startsWith("data:")) {
    throw new Error("INVALID_DATA_URL");
  }

  const metaWithoutPrefix = meta.slice(5);
  if (!metaWithoutPrefix.endsWith(";base64")) {
    throw new Error("INVALID_DATA_URL");
  }

  const contentType = metaWithoutPrefix.slice(0, -7);
  if (!contentType) {
    throw new Error("INVALID_DATA_URL");
  }

  return {
    contentType,
    buffer: Buffer.from(encoded, "base64"),
  };
};

const getBaseContentType = (contentType: string) => contentType.split(";")[0]?.trim().toLowerCase() ?? "";

const getAudioExtension = (contentType: string) => {
  const baseContentType = getBaseContentType(contentType);

  if (baseContentType === "audio/aac") return "aac";
  if (baseContentType === "audio/aiff" || baseContentType === "audio/x-aiff") return "aiff";
  if (baseContentType === "audio/flac") return "flac";
  if (baseContentType === "audio/m4a") return "m4a";
  if (baseContentType === "audio/mp4") return "m4a";
  if (baseContentType === "audio/mp3" || baseContentType === "audio/mpeg") return "mp3";
  if (baseContentType === "audio/ogg") return "ogg";
  if (baseContentType === "audio/wav" || baseContentType === "audio/x-wav") return "wav";
  if (baseContentType === "audio/webm") return "webm";

  return "bin";
};

const transcodeAudioToMp3 = async (buffer: Buffer, contentType: string) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "qoa-openrouter-inventory-audio-"));
  const inputPath = path.join(tempDir, `input.${getAudioExtension(contentType)}`);
  const outputPath = path.join(tempDir, "output.mp3");

  try {
    await writeFile(inputPath, buffer);
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-ar",
      "16000",
      "-ac",
      "1",
      outputPath,
    ]);

    return Buffer.from(await readFile(outputPath));
  } catch {
    throw new Error("AUDIO_TRANSCODE_FAILED");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

const normalizeAudioForOpenRouter = async (buffer: Buffer, contentType: string) => {
  const baseContentType = getBaseContentType(contentType);

  switch (baseContentType) {
    case "audio/aac":
      return { buffer, mediaType: "audio/aac" };
    case "audio/aiff":
    case "audio/x-aiff":
      return { buffer, mediaType: "audio/aiff" };
    case "audio/flac":
      return { buffer, mediaType: "audio/flac" };
    case "audio/m4a":
    case "audio/mp4":
      return { buffer, mediaType: "audio/m4a" };
    case "audio/mp3":
    case "audio/mpeg":
      return { buffer, mediaType: "audio/mpeg" };
    case "audio/ogg":
      return { buffer, mediaType: "audio/ogg" };
    case "audio/wav":
    case "audio/x-wav":
      return { buffer, mediaType: "audio/wav" };
    default:
      return {
        buffer: await transcodeAudioToMp3(buffer, baseContentType || contentType),
        mediaType: "audio/mpeg",
      };
  }
};

const buildModelMessages = async (messages: AgentMessage[], latestUserMessageId?: string) =>
  Promise.all(messages.map(async (message) => {
    const isLatestUserMessage = message.role === "user" && message.id === latestUserMessageId;
    const audioAttachments = isLatestUserMessage
      ? (message.attachments ?? []).filter((attachment) => getAttachmentKind(attachment) === "audio")
      : [];

    if (audioAttachments.length === 0) {
      return {
        role: message.role,
        content: buildTextMessageContent(message),
      };
    }

    const typedContent = message.content.trim();
    const textParts = [
      typedContent && typedContent !== AUDIO_PLACEHOLDER ? typedContent : "Nota de voz del tendero para ajustar el borrador de inventario.",
      message.attachments?.some((attachment) => getAttachmentKind(attachment) === "image") ? "Tambien hay adjuntos de imagen en este turno." : "",
    ].filter(Boolean);

    return {
      role: message.role,
      content: [
        ...textParts.map((text) => ({ type: "text" as const, text })),
        ...(await Promise.all(audioAttachments.map(async (attachment) => {
          const { buffer, contentType } = parseDataUrl(attachment.dataUrl);
          const normalizedAudio = await normalizeAudioForOpenRouter(buffer, contentType);
          return {
            type: "file" as const,
            data: normalizedAudio.buffer,
            mediaType: normalizedAudio.mediaType,
          };
        }))),
      ],
    };
  }));


const mapImagePreviewError = (error: unknown) => {
  if (error instanceof Error) {
    switch (error.message) {
      case "IMAGE_ATTACHMENT_REQUIRED":
        return "Necesito una foto para preparar el preview de inventario.";
      case "INVENTORY_IMAGE_EMPTY":
        return "No pude extraer productos claros de esa foto. Intenta con otra imagen mas centrada o con mejor luz.";
      case "OPENROUTER_NOT_CONFIGURED":
        return "No tengo configurado el modelo para leer imagenes en este momento.";
      default:
        break;
    }
  }

  return "No pude leer esa foto de inventario. Intenta con otra imagen o pega la lista en texto.";
};

const buildActions = (draft: StoreInventoryDraft): AgentAction[] => buildInventoryAgentActions(draft);

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

const buildPreviewApplicationResult = (draft: StoreInventoryDraft, addedRows: number) => ({
  addedRows,
  totalRows: draft.rows.length,
  summary: getInventoryDraftSummary(draft),
});

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

  let workingDraft = cloneDraft(draft ? { ...draft, idempotencyKey: draft.idempotencyKey ?? null } : createEmptyInventoryDraft());
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  let latestAttachments = latestUserMessage?.attachments ?? [];
  let normalizedUserMessage = latestUserMessage ? { ...latestUserMessage } : null;

  if (normalizedUserMessage?.attachments?.length) {
    const normalizedAttachments = normalizeAttachments(normalizedUserMessage.attachments as AgentAttachment[]);
    normalizedUserMessage = {
      ...normalizedUserMessage,
      attachments: normalizedAttachments,
    };
    latestAttachments = normalizedAttachments;
  }

  const normalizedMessages = normalizedUserMessage
    ? messages.map((message) => (message.id === normalizedUserMessage?.id ? normalizedUserMessage : message))
    : messages;
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

  const applyPreviewRows = (rows: Array<Omit<InventoryDraftRow, "id" | "action"> & { matchedProduct?: StoreProduct }>, options?: { overwrite?: boolean }) => {
    const nextDraftRows = toDraftRows(rows);
    const overwrite = options?.overwrite ?? false;
    const mergedRows = overwrite ? nextDraftRows : appendInventoryDraftRows(workingDraft.rows, nextDraftRows);

    workingDraft = {
      rows: mergedRows,
      lastReceipt: null,
      idempotencyKey: overwrite || !workingDraft.idempotencyKey
        ? createInventoryIntakeIdempotencyKey()
        : workingDraft.idempotencyKey,
    };

    return buildPreviewApplicationResult(workingDraft, nextDraftRows.length);
  };

  const appendResolvedInventoryRows = (rows: InventoryDraftRow[]) => {
    workingDraft = {
      rows: appendInventoryDraftRows(workingDraft.rows, rows),
      lastReceipt: null,
      idempotencyKey: workingDraft.idempotencyKey ?? createInventoryIntakeIdempotencyKey(),
    };

    return buildPreviewApplicationResult(workingDraft, rows.length);
  };

  const addInventoryDraftRowByQuery = async (request: InventoryStockAddRequest) => {
    const activeStoreProducts = (await getStoreProducts()).filter((product) => product.status === "active");
    const result = buildInventoryStockAddDraftRow(request, activeStoreProducts, {
      id: crypto.randomUUID(),
      lineNumber: 1,
    });

    if (result.status === "not_found") {
      return result;
    }

    const preview = appendResolvedInventoryRows([result.row]);
    return {
      ...result,
      preview,
    };
  };

  const addInventoryDraftRowsForFamily = async (request: InventoryStockAddRequest) => {
    const activeStoreProducts = (await getStoreProducts()).filter((product) => product.status === "active");
    const matches = rankInventoryProductsByQuery(activeStoreProducts, request.query)
      .filter((entry) => entry.score >= 0.62)
      .slice(0, 12);

    if (matches.length === 0) {
      return {
        status: "not_found" as const,
        query: request.query,
        quantity: request.quantity,
      };
    }

    const rows = matches.map((entry) => resolveInventoryRowState({
      id: crypto.randomUUID(),
      lineNumber: 1,
      rawText: `${request.quantity} ${entry.product.name}`,
      name: entry.product.name,
      sku: entry.product.sku,
      quantity: request.quantity,
      price: entry.product.price,
      status: "matched" as const,
      action: "match_existing" as const,
      matchedStoreProductId: entry.product.id,
      matchedProduct: entry.product,
    }));

    const preview = appendResolvedInventoryRows(rows);
    return {
      status: "matched_family" as const,
      query: request.query,
      quantity: request.quantity,
      rows,
      preview,
    };
  };

  const addInventoryDraftRowsFromRequests = async (requests: InventoryStockAddRequest[]) => {
    const results = [];
    for (const request of requests) {
      results.push(
        request.mode === "all_matching"
          ? await addInventoryDraftRowsForFamily(request)
          : await addInventoryDraftRowByQuery(request),
      );
    }

    return results;
  };

  const previewInventoryFromText = async (text: string, options?: { overwrite?: boolean }) => {
    const { data, error } = await api.v1.stores[storeId].inventory.intake.preview.post(
      { text },
      { headers: { authorization } },
    );
    if (error || !data?.data) {
      throw new Error("INVENTORY_PREVIEW_FAILED");
    }

    return applyPreviewRows(data.data.rows, options);
  };

  const previewInventoryFromLatestImage = async ({ overwrite = false }: { overwrite?: boolean } = {}) => {
    const imageAttachments = latestAttachments.filter((attachment) => getAttachmentKind(attachment) === "image");
    const latestImage = imageAttachments.at(-1);
    if (!latestImage) {
      throw new Error("IMAGE_ATTACHMENT_REQUIRED");
    }

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_NOT_CONFIGURED");
    }

    const { buffer, contentType } = parseDataUrl(latestImage.dataUrl);
    const extraction = await generateObject({
      model: openrouter(process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash"),
      schema: inventoryImageExtractionSchema,
      system: [
        "Extrae productos de notas o tickets de proveedor para inventario.",
        "Devuelve solo productos reales, sin encabezados ni totales.",
        "Ignora vendedor, ruta, subtotal, descuento, IVA, IEPS, total y texto legal.",
        "Para cada producto devuelve name, sku si existe y quantity.",
        "price es opcional y no es obligatorio si no se ve claro.",
        "No inventes filas ni cantidades.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Lee esta foto de inventario y extrae las filas de producto. Instruccion del tendero: ${latestUserMessage?.content.trim() || "Preparar preview de inventario desde la foto."}`,
            },
            {
              type: "file",
              data: buffer,
              mediaType: contentType,
            },
          ],
        },
      ],
    });

    const previewText = buildInventoryPreviewTextFromImageRows(extraction.object.rows);
    if (!previewText.trim()) {
      throw new Error("INVENTORY_IMAGE_EMPTY");
    }

    const preview = await previewInventoryFromText(previewText, { overwrite });
    return {
      ...preview,
      source: "image" as const,
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

  const updateDraftRowByQuery = async (input: {
    query: string;
    name?: string;
    sku?: string;
    quantity?: number;
    price?: number;
    action?: "match_existing" | "create_new";
    storeProductId?: string;
  }) => {
    const match = findInventoryDraftRowByQuery(workingDraft.rows, input.query);
    if (match.status === "not_found") {
      return {
        updated: false,
        reason: "row_not_found" as const,
        query: input.query,
      };
    }

    if (match.status === "ambiguous") {
      return {
        updated: false,
        reason: "ambiguous" as const,
        query: input.query,
        candidates: match.candidates.map((candidate) => ({
          rowId: candidate.row.id,
          name: candidate.row.name,
          quantity: candidate.row.quantity,
          score: Number(candidate.score.toFixed(3)),
        })),
      };
    }

    const matchedProduct = input.storeProductId
      ? (await getStoreProducts()).find((product) => product.id === input.storeProductId)
      : input.action === "create_new"
        ? undefined
        : match.row.matchedProduct;
    const nextRow = applyInventoryDraftRowPatch(match.row, {
      name: input.name,
      sku: input.sku,
      quantity: input.quantity,
      price: input.price,
      action: input.action,
      matchedStoreProductId: input.storeProductId ?? (input.action === "create_new" ? undefined : match.row.matchedStoreProductId),
      matchedProduct,
    });

    workingDraft.rows = workingDraft.rows.map((row) => row.id === nextRow.id ? nextRow : row);
    return {
      updated: true as const,
      row: nextRow,
      draft: buildSummaryText(workingDraft),
    };
  };

  const removeDraftRow = async (rowId: string) => {
    workingDraft.rows = workingDraft.rows.filter((row) => row.id !== rowId);
    return buildSummaryText(workingDraft);
  };

  const clearDraft = async () => {
    workingDraft = createEmptyInventoryDraft();
    return buildSummaryText(workingDraft);
  };

  const selectExistingProductForDraftRow = async (rowId: string, storeProductId: string) => {
    const row = workingDraft.rows.find((entry) => entry.id === rowId);
    const product = (await getStoreProducts()).find((entry) => entry.id === storeProductId);
    if (!row || !product) {
      return {
        selected: false as const,
        reason: row ? "product_not_found" : "row_not_found",
      };
    }

    const nextRow = resolveInventoryRowState({
      ...row,
      name: product.name,
      sku: product.sku,
      price: product.price,
      action: "match_existing",
      matchedStoreProductId: product.id,
      matchedProduct: product,
      candidates: undefined,
    });

    workingDraft.rows = workingDraft.rows.map((entry) => entry.id === rowId ? nextRow : entry);
    return {
      selected: true as const,
      row: nextRow,
      draft: buildSummaryText(workingDraft),
    };
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

  const buildFixtureResponse = async (
    content: string,
    userMessage: AgentMessage | null = normalizedUserMessage as AgentMessage | null,
  ) => {
    const renderedHtml = await renderAssistantMarkdownToHtml(content);
    return Response.json({
      message: {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        renderedHtml: renderedHtml || undefined,
        actions: buildActions(workingDraft),
      } as AgentMessage,
      userMessage,
      draft: workingDraft,
    });
  };

  const applyDemoInventoryPhotoPreview = async () => {
    const products = await getStoreProducts();
    const demoRows = [
      { product: findDemoInventoryProduct(products, "QOA-COLA-600", "refresco cola"), quantity: 24 },
      { product: findDemoInventoryProduct(products, "QOA-PAPAS-45", "papas clasicas"), quantity: 18 },
      { product: findDemoInventoryProduct(products, "QOA-GALLETA-90", "galletas vainilla"), quantity: 12 },
    ].filter((entry): entry is { product: StoreProduct; quantity: number } => Boolean(entry.product));

    if (demoRows.length === 0) {
      throw new Error("DEMO_PRODUCTS_NOT_FOUND");
    }

    const preview = applyPreviewRows(
      demoRows.map(({ product, quantity }, index) => ({
        lineNumber: index + 1,
        rawText: `${quantity} ${product.name}`,
        name: product.name,
        sku: product.sku,
        quantity,
        price: product.price,
        status: "matched" as const,
        matchedStoreProductId: product.id,
        matchedProduct: product,
      })),
      { overwrite: true },
    );

    return preview;
  };

  const applyDemoInventoryVoiceCorrection = async () => {
    const updated: Array<{ name: string; quantity: number }> = [];
    workingDraft.rows = workingDraft.rows.map((row) => {
      if (normalizeDemoText(row.name).includes("galletas")) {
        const nextRow = applyInventoryDraftRowPatch(row, { quantity: 16 });
        updated.push({ name: nextRow.name, quantity: nextRow.quantity });
        return nextRow;
      }

      if (normalizeDemoText(row.name).includes("papas")) {
        const nextRow = applyInventoryDraftRowPatch(row, { quantity: 20 });
        updated.push({ name: nextRow.name, quantity: nextRow.quantity });
        return nextRow;
      }

      return row;
    });

    return updated;
  };

  const tryHandleFixtureDemo = async () => {
    if (!isFixtureDemoRequest(request) || !normalizedUserMessage || normalizedUserMessage.role !== "user") {
      return null;
    }

    const latestContent = normalizedUserMessage.content.trim();
    const normalizedContent = normalizeDemoText(latestContent);
    const hasLatestImage = latestAttachments.some((attachment) => getAttachmentKind(attachment) === "image");
    const hasLatestAudio = latestAttachments.some((attachment) => getAttachmentKind(attachment) === "audio");
    const wantsPhotoPreview =
      hasLatestImage ||
      normalizedContent.includes("demo:inventory:photo") ||
      normalizedContent.includes("foto de inventario");
    const wantsVoiceCorrection =
      hasLatestAudio ||
      normalizedContent.includes("demo:inventory:voice") ||
      normalizedContent.includes("nota de voz");
    const wantsConfirmation = /\b(confirmar|confirma|aplicar|aplica|guardar entrada|guarda entrada)\b/i.test(normalizedContent);

    if (wantsConfirmation) {
      try {
        const receipt = await confirmInventoryIntake();
        return await buildFixtureResponse(
          `Entrada aplicada: **${receipt.summary.totalQuantity} piezas** cargadas al inventario. Se actualizaron **${receipt.summary.updatedProducts} productos** y se crearon **${receipt.summary.createdProducts}** nuevos.`,
        );
      } catch {
        return await buildFixtureResponse("No pude aplicar la entrada de demo. Revisa que no queden filas pendientes.");
      }
    }

    if (wantsVoiceCorrection && workingDraft.rows.length > 0) {
      const updated = await applyDemoInventoryVoiceCorrection();
      const userMessageWithTranscript: AgentMessage = {
        ...(normalizedUserMessage as AgentMessage),
        attachments: normalizedUserMessage.attachments?.map((attachment) =>
          getAttachmentKind(attachment) === "audio"
            ? {
                ...attachment,
                transcript: "Corrige las galletas a 16 piezas y las papas a 20.",
                status: "transcribed" as const,
              }
            : attachment,
        ),
      };

      const correctionText = updated.length > 0
        ? updated.map((entry) => `**${entry.name}** → **${entry.quantity} unidades**`).join("\n")
        : "No encontré filas para corregir en el borrador actual.";

      return await buildFixtureResponse(
        `Escuché la nota de voz y corregí:\n${correctionText}\n\n${buildInventoryDraftSummaryText(workingDraft)}`,
        userMessageWithTranscript,
      );
    }

    if (wantsPhotoPreview) {
      try {
        const preview = await applyDemoInventoryPhotoPreview();
        return await buildFixtureResponse(
          `Preparé el preview de inventario desde la foto con **${preview.totalRows} filas** y **${preview.summary.quantity} piezas**. Revísalo antes de confirmar la entrada.`,
        );
      } catch {
        return await buildFixtureResponse("No encontré productos seed para preparar la foto de inventario de demo.");
      }
    }

    return null;
  };

  const transcribeLatestAudio = async () => {
    const audioAttachments = latestAttachments.filter((attachment) => getAttachmentKind(attachment) === "audio");
    const latestAudio = audioAttachments.at(-1);
    if (!latestAudio) {
      return null;
    }

    const { buffer, contentType } = parseDataUrl(latestAudio.dataUrl);
    const normalizedAudio = await normalizeAudioForOpenRouter(buffer, contentType);
    const transcription = await generateText({
      model: openrouter(process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash"),
      system: "Transcribe la nota de voz del tendero en espanol. Devuelve solo el texto dicho, sin explicaciones.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe esta nota de voz de inventario." },
            { type: "file", data: normalizedAudio.buffer, mediaType: normalizedAudio.mediaType },
          ],
        },
      ],
    });

    return transcription.text.trim();
  };

  const latestContent = latestUserMessage?.content.trim() ?? "";
  const fixtureDemoResponse = await tryHandleFixtureDemo();
  if (fixtureDemoResponse) {
    return fixtureDemoResponse;
  }

  const selectionActionMatch = latestContent.match(/\browId=([^\s]+)\s+storeProductId=([^\s]+)/i);
  if (selectionActionMatch) {
    const result = await selectExistingProductForDraftRow(selectionActionMatch[1]!, selectionActionMatch[2]!);
    const content = result.selected
      ? `Listo, vinculé la fila **${result.row.name}** al producto existente. ${buildInventoryDraftSummaryText(workingDraft)}`
      : "No pude aplicar esa selección. La fila o el producto ya no están disponibles.";
    const renderedHtml = await renderAssistantMarkdownToHtml(content);
    return Response.json({
      message: {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        renderedHtml: renderedHtml || undefined,
        actions: buildActions(workingDraft),
      } as AgentMessage,
      userMessage: normalizedUserMessage,
      draft: workingDraft,
    });
  }

  if (/^(?:dame\s+)?(?:un\s+)?resumen\b|(?:que|qué)\s+(?:hay|tengo)\s+en\s+(?:el\s+)?borrador|revisa\s+(?:la\s+)?carga/i.test(latestContent)) {
    const content = buildInventoryDraftSummaryText(workingDraft);
    const renderedHtml = await renderAssistantMarkdownToHtml(content);
    return Response.json({
      message: {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        renderedHtml: renderedHtml || undefined,
        actions: buildActions(workingDraft),
      } as AgentMessage,
      userMessage: normalizedUserMessage,
      draft: workingDraft,
    });
  }

  if (/^vac[ií]a\s+(?:el\s+)?borrador/i.test(latestContent)) {
    await clearDraft();
    const content = "Listo, vacié el borrador de inventario.";
    const renderedHtml = await renderAssistantMarkdownToHtml(content);
    return Response.json({
      message: {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        renderedHtml: renderedHtml || undefined,
        actions: buildActions(workingDraft),
      } as AgentMessage,
      userMessage: normalizedUserMessage,
      draft: workingDraft,
    });
  }

  const hasLatestImage = latestAttachments.some((attachment) => getAttachmentKind(attachment) === "image");
  if (hasLatestImage) {
    try {
      const preview = await previewInventoryFromLatestImage();
      const content = workingDraft.rows.length > preview.addedRows
        ? `Agregué **${preview.addedRows} filas** desde la foto al borrador actual. Ahora tienes **${preview.totalRows} filas** para revisar antes de confirmar.`
        : `Preparé el preview de inventario desde la foto con **${preview.totalRows} filas**. Revísalo y edítalo antes de confirmar la entrada.`;
      const renderedHtml = await renderAssistantMarkdownToHtml(content);
      return Response.json({
        message: {
          id: crypto.randomUUID(),
          role: "assistant",
          content,
          renderedHtml: renderedHtml || undefined,
          actions: buildActions(workingDraft),
        } as AgentMessage,
        userMessage: normalizedUserMessage,
        draft: workingDraft,
      });
    } catch (error) {
      const content = mapImagePreviewError(error);
      const renderedHtml = await renderAssistantMarkdownToHtml(content);
      return Response.json({
        message: {
          id: crypto.randomUUID(),
          role: "assistant",
          content,
          renderedHtml: renderedHtml || undefined,
          actions: buildActions(workingDraft),
        } as AgentMessage,
        userMessage: normalizedUserMessage,
        draft: workingDraft,
      });
    }
  }

  const deterministicPreview = latestUserMessage && /\n|\t|,|(?:^|[\n,\t])\s*\d+\s*[xX]?\s+\S/m.test(latestUserMessage.content);
  if (deterministicPreview) {
    const preview = await previewInventoryFromText(latestUserMessage.content);
    const content = workingDraft.rows.length > preview.addedRows
      ? `Agregué **${preview.addedRows} filas** al borrador actual. Ahora tienes **${preview.totalRows} filas** para revisar antes de confirmar.`
      : `Preparé el preview de inventario con **${preview.totalRows} filas**. Revisa las coincidencias y confirma la entrada cuando esté lista.`;
    const renderedHtml = await renderAssistantMarkdownToHtml(content);
    return Response.json({
      message: {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        renderedHtml: renderedHtml || undefined,
        actions: buildActions(workingDraft),
      } as AgentMessage,
      userMessage: normalizedUserMessage,
      draft: workingDraft,
    });
  }

  const stockAddRequests = latestUserMessage ? extractInventoryStockAddRequests(latestUserMessage.content) : [];
  if (stockAddRequests.length > 0) {
    const results = await addInventoryDraftRowsFromRequests(stockAddRequests);
    const content = (() => {
      const matchedRows = results.flatMap((result) => {
        if (result.status === "matched") return [result.row];
        if (result.status === "matched_family") return result.rows;
        return [];
      });
      const ambiguousResults = results.filter((result) => result.status === "ambiguous");
      const notFoundResults = results.filter((result) => result.status === "not_found");

      const parts: string[] = [];
      if (matchedRows.length > 0) {
        const quantity = matchedRows.reduce((sum, row) => sum + row.quantity, 0);
        const names = matchedRows.map((row) => `**${row.name}**${row.sku ? ` (${row.sku})` : ""}`).join(", ");
        parts.push(`Agregué **${matchedRows.length} ${matchedRows.length === 1 ? "fila" : "filas"}** (${quantity} piezas): ${names}.`);
      }

      for (const result of ambiguousResults) {
        if (result.status !== "ambiguous") continue;
        const names = result.candidates.map((candidate) => `**${candidate.name}**${candidate.sku ? ` (${candidate.sku})` : ""}`).join(", ");
        parts.push(`Encontré varias coincidencias para **${result.row.name}**: ${names}. Dejé la fila pendiente para que selecciones el producto correcto.`);
      }

      for (const result of notFoundResults) {
        if (result.status !== "not_found") continue;
        parts.push(`No encontré **${result.query}** entre tus productos registrados. Si quieres crearlo como producto nuevo, dime el precio para cargar **${result.quantity} piezas**.`);
      }

      parts.push(buildInventoryDraftSummaryText(workingDraft));
      return parts.join("\n\n");
    })();
    const renderedHtml = await renderAssistantMarkdownToHtml(content);
    return Response.json({
      message: {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        renderedHtml: renderedHtml || undefined,
        actions: buildActions(workingDraft),
      } as AgentMessage,
      userMessage: normalizedUserMessage,
      draft: workingDraft,
    });
  }

  const applyCorrections = async (corrections: Array<{ query: string; quantity?: number; price?: number }>) => {
    const updated: Array<{ name: string; quantity?: number; price?: number }> = [];
    const notFound: string[] = [];
    const ambiguous: Array<{ query: string; candidates: Array<{ rowId: string; name: string; quantity: number; score: number }> }> = [];

    for (const correction of corrections) {
      const result = await updateDraftRowByQuery(correction);
      if (result.updated && result.row) {
        updated.push({ name: result.row.name, quantity: correction.quantity, price: correction.price });
      } else if (result.reason === "ambiguous") {
        ambiguous.push({ query: correction.query, candidates: result.candidates ?? [] });
      } else {
        notFound.push(correction.query);
      }
    }

    const parts: string[] = [];
    if (updated.length > 0) {
      const items = updated.map((u) => {
        const qtyPart = u.quantity !== undefined ? `**${u.quantity} unidades**` : "";
        const pricePart = u.price !== undefined ? `**$${u.price}**` : "";
        const changes = [qtyPart, pricePart].filter(Boolean).join(" / ");
        return `**${u.name}** → ${changes}`;
      });
      parts.push(`Listo, corregí:\n${items.join("\n")}`);
    }
    if (ambiguous.length > 0) {
      const names = ambiguous.map((a) => `"${a.query}"`).join(", ");
      parts.push(`Encontré varias filas parecidas para ${names}. Dime cuál quieres corregir.`);
    }
    if (notFound.length > 0) {
      const names = notFound.map((q) => `"${q}"`).join(", ");
      parts.push(`No encontré filas para ${names} en el borrador actual.`);
    }

    if (parts.length === 0) {
      return "No entendí qué corregir. ¿Puedes repetirlo?";
    }

    return parts.join("\n\n");
  };

  const textCorrections = latestUserMessage ? parseInventoryCorrections(latestUserMessage.content) : [];
  if (textCorrections.length > 0) {
    const content = await applyCorrections(textCorrections);
    const renderedHtml = await renderAssistantMarkdownToHtml(content);
    return Response.json({
      message: {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        renderedHtml: renderedHtml || undefined,
        actions: buildActions(workingDraft),
      } as AgentMessage,
      userMessage: normalizedUserMessage,
      draft: workingDraft,
    });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({ error: "OPENROUTER_NOT_CONFIGURED" }, { status: 500 });
  }

  if (latestUserMessage && workingDraft.rows.length > 0 && /\b(corrige|cambia|actualiza|ajusta|modifica|precio|cuesta|vale|son|sube|baja)\b/i.test(latestUserMessage.content)) {
    try {
      const draftCorrections = await extractDraftCorrectionsWithContext(latestUserMessage.content, workingDraft.rows);
      if (draftCorrections.length > 0) {
        const updated: Array<{ name: string; quantity?: number; price?: number }> = [];

        for (const correction of draftCorrections) {
          const row = workingDraft.rows.find((r) => r.id === correction.rowId);
          if (!row) continue;

          const nextRow = applyInventoryDraftRowPatch(row, {
            quantity: correction.quantity,
            price: correction.price,
          });
          workingDraft.rows = workingDraft.rows.map((r) => (r.id === nextRow.id ? nextRow : r));
          updated.push({
            name: nextRow.name,
            quantity: correction.quantity,
            price: correction.price,
          });
        }

        const items = updated.map((u) => {
          const qtyPart = u.quantity !== undefined ? `**${u.quantity} unidades**` : "";
          const pricePart = u.price !== undefined ? `**$${u.price}**` : "";
          const changes = [qtyPart, pricePart].filter(Boolean).join(" / ");
          return `**${u.name}** → ${changes}`;
        });

        const content = `Listo, corregí:\n${items.join("\n")}\n\n${buildInventoryDraftSummaryText(workingDraft)}`;
        const renderedHtml = await renderAssistantMarkdownToHtml(content);
        return Response.json({
          message: {
            id: crypto.randomUUID(),
            role: "assistant",
            content,
            renderedHtml: renderedHtml || undefined,
            actions: buildActions(workingDraft),
          } as AgentMessage,
          userMessage: normalizedUserMessage,
          draft: workingDraft,
        });
      }
    } catch {
      // Si el extractor contextual no entiende el mensaje, sigue con el flujo normal de tools.
    }
  }

  const audioTranscript = await transcribeLatestAudio();
  if (audioTranscript && workingDraft.rows.length > 0) {
    try {
      const draftCorrections = await extractDraftCorrectionsWithContext(audioTranscript, workingDraft.rows);
      if (draftCorrections.length > 0) {
        const updated: Array<{ name: string; quantity?: number; price?: number }> = [];

        for (const correction of draftCorrections) {
          const row = workingDraft.rows.find((r) => r.id === correction.rowId);
          if (!row) continue;

          const nextRow = applyInventoryDraftRowPatch(row, {
            quantity: correction.quantity,
            price: correction.price,
          });
          workingDraft.rows = workingDraft.rows.map((r) => (r.id === nextRow.id ? nextRow : r));
          updated.push({
            name: nextRow.name,
            quantity: correction.quantity,
            price: correction.price,
          });
        }

        const items = updated.map((u) => {
          const qtyPart = u.quantity !== undefined ? `**${u.quantity} unidades**` : "";
          const pricePart = u.price !== undefined ? `**$${u.price}**` : "";
          const changes = [qtyPart, pricePart].filter(Boolean).join(" / ");
          return `**${u.name}** → ${changes}`;
        });

        const content = `Escuché "${audioTranscript}". Listo, corregí:\n${items.join("\n")}`;
        const renderedHtml = await renderAssistantMarkdownToHtml(content);
        return Response.json({
          message: {
            id: crypto.randomUUID(),
            role: "assistant",
            content,
            renderedHtml: renderedHtml || undefined,
            actions: buildActions(workingDraft),
          } as AgentMessage,
          userMessage: normalizedUserMessage
            ? {
                ...normalizedUserMessage,
                attachments: normalizedUserMessage.attachments?.map((attachment) =>
                  getAttachmentKind(attachment) === "audio"
                    ? { ...attachment, transcript: audioTranscript, status: "transcribed" as const }
                    : attachment,
                ),
              }
            : normalizedUserMessage,
          draft: workingDraft,
        });
      }
    } catch {
      // Si el LLM con contexto falla, cae al flujo normal de tools
    }
  }

  const modelMessages = await buildModelMessages(normalizedMessages as AgentMessage[], normalizedUserMessage?.id);

  const result = await generateText({
    model: openrouter(process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash"),
    system: [
      "Eres un asistente de inventario para tenderos en Qoa.",
      "Responde siempre en espanol claro y breve.",
      "Usa herramientas para interpretar listas de proveedor, editar el borrador y confirmar entradas.",
      "No digas que la entrada fue aplicada si no ejecutaste confirmInventoryIntake.",
      "Mensajes como '20 de Papas Chile y Limon' significan cantidad=20 y producto='Papas Chile y Limon'. La palabra 'de' o 'del' no forma parte del producto.",
      "Tolera acentos faltantes, mayusculas, guiones, parentesis y variaciones como pza/pz/piezas/unidades.",
      "SKU exacto o parcial tiene prioridad sobre nombre hablado.",
      "Si el usuario dice 'cada refresco', 'cada galleta' o 'todos los X', agrega una fila por cada producto activo encontrado en esa familia.",
      "Si el usuario solo dice una familia ambigua sin 'cada' o 'todos', no elijas al azar: deja la fila pendiente o pide seleccion.",
      "Nunca confirmes si hay filas ambiguas, invalidas, sin action, sin matchedStoreProductId cuando action=match_existing, o sin precio cuando action=create_new.",
      "Si confirmacion esta bloqueada, explica exactamente que fila falta resolver.",
      "Usa singular/plural correcto: '1 fila', '2 filas', '1 pendiente', '2 pendientes'.",
      "Si el usuario pega una lista o tabla, usa previewInventoryFromText.",
      "Si el usuario adjunta una foto de nota o ticket, usa previewInventoryFromLatestImage.",
      "Si el usuario manda audio, interpretalo como instruccion del tendero para preparar, corregir o confirmar el borrador.",
      "Cuando el borrador ya tenga filas y llegue otra foto o lista, agregala al borrador actual salvo que el usuario pida reemplazarlo por completo.",
      "Si el usuario pregunta por un producto (precio, stock, si existe), usa searchStoreProducts para buscarlo.",
      "Si el usuario pide agregar existencias de un producto que no esta en el borrador, usa addInventoryDraftRowByQuery para buscarlo en productos registrados y crear la fila vinculada.",
      "Si el usuario pide agregar un producto que no esta en el borrador, busca primero con searchStoreProducts para confirmar que existe y obtener su storeProductId.",
      "Si el usuario pide corregir un producto por nombre, usa updateInventoryDraftRowByQuery antes de pedir rowId.",
      "Ejemplo: 'corrige el panque de nuez son 15 unidades' significa buscar Panque Nuez y cambiar quantity a 15.",
      "Si el usuario pide resumen, usa summarizeInventoryDraft y responde con filas, piezas, pendientes y detalle por producto.",
      "Si hay filas ambiguas o invalidas, pide correccion puntual o usa updateInventoryDraftRow/updateInventoryDraftRowByQuery cuando ya tengas la instruccion.",
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
      previewInventoryFromLatestImage: tool({
        description: "Lee la foto mas reciente adjunta y agrega sus filas al preview de inventario actual, salvo que se pida overwrite.",
        inputSchema: z.object({
          overwrite: z.boolean().optional(),
        }),
        execute: async ({ overwrite }) => {
          try {
            return await previewInventoryFromLatestImage({ overwrite });
          } catch (error) {
            return {
              error: mapImagePreviewError(error),
            };
          }
        },
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
      updateInventoryDraftRowByQuery: tool({
        description: "Edita una fila del borrador buscando por nombre hablado o escrito.",
        inputSchema: z.object({
          query: z.string().min(1),
          name: z.string().optional(),
          sku: z.string().optional(),
          quantity: z.number().int().min(1).optional(),
          price: z.number().min(0).optional(),
          action: z.enum(["match_existing", "create_new"]).optional(),
          storeProductId: z.string().optional(),
        }),
        execute: async (input) => updateDraftRowByQuery(input),
      }),
      addInventoryDraftRowByQuery: tool({
        description: "Busca un producto registrado de la tienda por nombre o SKU y agrega una fila de entrada de inventario vinculada a ese producto.",
        inputSchema: z.object({
          query: z.string().min(2).describe("Nombre o SKU del producto registrado"),
          quantity: z.number().int().min(1).describe("Cantidad de piezas o unidades a cargar"),
        }),
        execute: async (input) => addInventoryDraftRowByQuery(input),
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
      searchStoreProducts: tool({
        description: "Busca productos activos en el catalogo de la tienda por nombre o SKU. Util para verificar si un producto existe, obtener su storeProductId, precio o stock.",
        inputSchema: z.object({
          query: z.string().min(2).describe("Nombre o SKU del producto a buscar"),
          limit: z.number().int().min(1).max(20).optional().describe("Maximo de resultados, default 8"),
        }),
        execute: async ({ query, limit }) => {
          const { data, error } = await api.v1.stores[storeId]["products-search"].get({
            query: { q: query, limit: String(limit ?? 8) },
            headers: { authorization },
          });
          if (error) {
            return { error: "PRODUCT_SEARCH_FAILED" };
          }
          return {
            storeProducts: ((data?.data?.storeProducts ?? []) as StoreProduct[]).map((p) => ({
              storeProductId: p.id,
              name: p.name,
              sku: p.sku,
              price: p.price,
              stock: p.stock,
              status: p.status,
            })),
          };
        },
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
    userMessage: normalizedUserMessage,
    draft: workingDraft,
  });
}
