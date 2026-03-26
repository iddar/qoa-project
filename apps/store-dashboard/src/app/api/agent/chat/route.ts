import { generateText, stepCountIs, tool } from "ai";
import jsQR from "jsqr";
import { minimax } from "vercel-minimax-ai-provider";
import sharp from "sharp";
import { z } from "zod";
import { api } from "@/lib/api";
import { createEmptyDraft, getDraftItemCount, getDraftTotal, type AgentAttachment, type AgentMessage, type DraftCustomer, type DraftItem, type DraftTransaction, type StorePosDraft } from "@/lib/store-pos";

const requestSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      attachments: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            contentType: z.string(),
            dataUrl: z.string(),
          }),
        )
        .optional(),
    }),
  ),
  draft: z.object({
    items: z.array(
      z.object({
        storeProductId: z.string(),
        productId: z.string().optional(),
        name: z.string(),
        sku: z.string().optional(),
        unitType: z.string().optional(),
        price: z.number(),
        quantity: z.number(),
      }),
    ),
    customer: z
      .object({
        userId: z.string(),
        cardId: z.string().optional(),
        cardCode: z.string().optional(),
        name: z.string().optional(),
        phone: z.string(),
        email: z.string().optional(),
      })
      .nullable(),
    lastTransaction: z
      .object({
        id: z.string(),
        userId: z.string().optional(),
        storeId: z.string(),
        cardId: z.string().optional(),
        totalAmount: z.number(),
        guestFlag: z.boolean(),
        customer: z
          .object({
            userId: z.string(),
            cardId: z.string().optional(),
            cardCode: z.string().optional(),
            name: z.string().optional(),
            phone: z.string(),
            email: z.string().optional(),
          })
          .optional(),
        accumulations: z.array(
          z.object({
            cardId: z.string(),
            campaignId: z.string(),
            accumulated: z.number(),
            newBalance: z.number(),
            sourceType: z.string(),
            codeCaptureId: z.string().optional(),
            codeValue: z.string().optional(),
          }),
        ),
        createdAt: z.string(),
        items: z.array(
          z.object({
            id: z.string().optional(),
            storeProductId: z.string(),
            productId: z.string().optional(),
            name: z.string(),
            quantity: z.number(),
            amount: z.number(),
          }),
        ),
      })
      .nullable(),
  }),
});

type StoreProduct = {
  id: string;
  productId?: string;
  name: string;
  sku?: string;
  unitType: string;
  price: number;
};

const cloneDraft = (draft: StorePosDraft): StorePosDraft => ({
  items: draft.items.map((item) => ({ ...item })),
  customer: draft.customer ? { ...draft.customer } : null,
  lastTransaction: draft.lastTransaction
    ? {
        ...draft.lastTransaction,
        accumulations: draft.lastTransaction.accumulations.map((entry) => ({ ...entry })),
        items: draft.lastTransaction.items.map((entry) => ({ ...entry })),
      }
    : null,
});

const buildDraftSummary = (draft: StorePosDraft) => ({
  itemCount: getDraftItemCount(draft),
  total: getDraftTotal(draft),
  customer: draft.customer,
  items: draft.items.map((item) => ({
    storeProductId: item.storeProductId,
    name: item.name,
    quantity: item.quantity,
    price: item.price,
  })),
});

const describeDraft = (draft: StorePosDraft) => {
  const summary = buildDraftSummary(draft);
  return JSON.stringify(summary, null, 2);
};

const decodeQrFromAttachment = async (attachment: AgentAttachment) => {
  const [, encoded] = attachment.dataUrl.split(",");
  if (!encoded) {
    return null;
  }

  const imageBuffer = Buffer.from(encoded, "base64");
  const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const qr = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return qr?.data ?? null;
};

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
  const meResponse = await api.v1.users.me.get({
    headers: { authorization },
  });

  if (meResponse.error || !meResponse.data?.data) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const me = meResponse.data.data;
  const storeId = me.tenantType === "store" ? me.tenantId : null;
  if (!storeId) {
    return Response.json({ error: "STORE_SCOPE_REQUIRED" }, { status: 403 });
  }

  let workingDraft = cloneDraft(draft ?? createEmptyDraft());
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const latestAttachments = latestUserMessage?.attachments ?? [];
  let storeProductsCache: StoreProduct[] | null = null;

  const getStoreProducts = async () => {
    if (storeProductsCache) {
      return storeProductsCache;
    }

    const { data, error } = await api.v1.stores[storeId].products.get({
      query: { status: "active", limit: "200" },
      headers: { authorization },
    });
    if (error) {
      throw new Error("PRODUCTS_FETCH_FAILED");
    }

    storeProductsCache = (data?.data ?? []) as StoreProduct[];
    return storeProductsCache;
  };

  const findStoreProductById = async (storeProductId: string) => {
    const products = await getStoreProducts();
    return products.find((product) => product.id === storeProductId) ?? null;
  };

  const systemPrompt = [
    "Eres un asistente de POS para tenderos en Qoa.",
    "Responde siempre en espanol claro y breve.",
    "Usa herramientas para cambiar el pedido, ligar clientes y confirmar ventas.",
    "No digas que una venta fue registrada si no ejecutaste confirmDraftTransaction.",
    "Si el usuario pide escanear una imagen, usa resolveCustomerCard sin input y toma el adjunto mas reciente.",
    "Si hay ambiguedad en un producto, pide una sola aclaracion corta.",
    `Estado actual del pedido:\n${describeDraft(workingDraft)}`,
  ].join("\n\n");

  const transcript = messages
    .map((message: AgentMessage) => {
      const attachmentLabel = message.attachments?.length ? `\nAdjuntos: ${message.attachments.map((file) => file.name).join(", ")}` : "";
      return `${message.role === "assistant" ? "Asistente" : "Tendero"}: ${message.content}${attachmentLabel}`;
    })
    .join("\n\n");

  const result = await generateText({
    model: minimax("MiniMax-M2.7"),
    system: systemPrompt,
    prompt: transcript,
    stopWhen: stepCountIs(8),
    tools: {
      searchStoreProducts: tool({
        description: "Busca productos activos en el catalogo de la tienda.",
        inputSchema: z.object({
          query: z.string().min(2),
        }),
        execute: async ({ query }) => {
          const { data, error } = await api.v1.stores[storeId]["products-search"].get({
            query: { q: query, limit: "8" },
            headers: { authorization },
          });
          if (error) {
            throw new Error("PRODUCT_SEARCH_FAILED");
          }

          return {
            products: ((data?.data?.storeProducts ?? []) as StoreProduct[]).map((product) => ({
              storeProductId: product.id,
              name: product.name,
              sku: product.sku,
              price: Number(product.price),
            })),
          };
        },
      }),
      addProductToDraft: tool({
        description: "Agrega un producto del catalogo al pedido actual.",
        inputSchema: z.object({
          storeProductId: z.string(),
          quantity: z.number().int().min(1).default(1),
        }),
        execute: async ({ storeProductId, quantity }) => {
          const product = await findStoreProductById(storeProductId);
          if (!product) {
            throw new Error("STORE_PRODUCT_NOT_FOUND");
          }

          const existing = workingDraft.items.find((item) => item.storeProductId === storeProductId);
          if (existing) {
            existing.quantity += quantity;
          } else {
            workingDraft.items.push({
              storeProductId: product.id,
              productId: product.productId,
              name: product.name,
              sku: product.sku,
              unitType: product.unitType,
              price: Number(product.price),
              quantity,
            });
          }

          return buildDraftSummary(workingDraft);
        },
      }),
      updateDraftItemQuantity: tool({
        description: "Cambia la cantidad de un producto existente en el pedido.",
        inputSchema: z.object({
          storeProductId: z.string(),
          quantity: z.number().int().min(0),
        }),
        execute: async ({ storeProductId, quantity }) => {
          workingDraft.items = quantity === 0
            ? workingDraft.items.filter((item) => item.storeProductId !== storeProductId)
            : workingDraft.items.map((item) =>
                item.storeProductId === storeProductId ? { ...item, quantity } : item,
              );

          return buildDraftSummary(workingDraft);
        },
      }),
      removeDraftItem: tool({
        description: "Elimina un producto del pedido actual.",
        inputSchema: z.object({
          storeProductId: z.string(),
        }),
        execute: async ({ storeProductId }) => {
          workingDraft.items = workingDraft.items.filter((item) => item.storeProductId !== storeProductId);
          return buildDraftSummary(workingDraft);
        },
      }),
      resolveCustomerCard: tool({
        description: "Resuelve una tarjeta de cliente usando QR JSON, cardId, card code o el adjunto mas reciente.",
        inputSchema: z.object({
          input: z.string().optional(),
        }),
        execute: async ({ input }) => {
          let resolvedInput = input?.trim() || "";

          if (!resolvedInput) {
            for (const attachment of latestAttachments) {
              resolvedInput = (await decodeQrFromAttachment(attachment)) ?? "";
              if (resolvedInput) {
                break;
              }
            }
          }

          if (!resolvedInput) {
            throw new Error("CUSTOMER_INPUT_REQUIRED");
          }

          const { data, error } = await api.v1.stores[storeId]["customer-resolve"].post(
            { input: resolvedInput },
            { headers: { authorization } },
          );
          if (error || !data?.data) {
            throw new Error("CUSTOMER_NOT_FOUND");
          }

          workingDraft.customer = data.data as DraftCustomer;
          return {
            customer: workingDraft.customer,
            draft: buildDraftSummary(workingDraft),
          };
        },
      }),
      clearDraftCustomer: tool({
        description: "Quita el cliente ligado al pedido actual.",
        inputSchema: z.object({}),
        execute: async () => {
          workingDraft.customer = null;
          return buildDraftSummary(workingDraft);
        },
      }),
      summarizeDraft: tool({
        description: "Devuelve el estado actual del pedido.",
        inputSchema: z.object({}),
        execute: async () => buildDraftSummary(workingDraft),
      }),
      confirmDraftTransaction: tool({
        description: "Confirma la venta actual y registra la transaccion completa.",
        inputSchema: z.object({
          confirmation: z.string().describe("Debe indicar que el tendero pidio confirmar la venta."),
        }),
        execute: async () => {
          if (workingDraft.items.length === 0) {
            throw new Error("EMPTY_DRAFT");
          }

          const { data, error } = await api.v1.stores[storeId].transactions.post(
            {
              userId: workingDraft.customer?.userId,
              cardId: workingDraft.customer?.cardId,
              idempotencyKey: `agent-pos-${crypto.randomUUID()}`,
              items: workingDraft.items.map((item) => ({
                storeProductId: item.storeProductId,
                quantity: item.quantity,
                amount: item.price,
              })),
            },
            { headers: { authorization } },
          );

          if (error || !data?.data) {
            throw new Error("CONFIRM_FAILED");
          }

          const transaction = data.data as DraftTransaction;
          workingDraft = {
            items: [],
            customer: null,
            lastTransaction: transaction,
          };

          return {
            transactionId: transaction.id,
            totalAmount: transaction.totalAmount,
            accumulations: transaction.accumulations.length,
          };
        },
      }),
    },
  });

  return Response.json({
    message: {
      id: crypto.randomUUID(),
      role: "assistant",
      content: result.text,
    },
    draft: workingDraft,
  });
}
