import { generateText, stepCountIs, tool } from "ai";
import jsQR from "jsqr";
import { minimax } from "vercel-minimax-ai-provider";
import sharp from "sharp";
import { z } from "zod";
import { api } from "@/lib/api";
import { renderAssistantMarkdownToHtml } from "@/lib/markdown";
import { buildCopilotActions, getProductMatchScore, normalizeText, resolvePendingProductChoiceSelection } from "@/lib/store-copilot";
import { createEmptyDraft, getDraftItemCount, getDraftTotal, type AgentAttachment, type AgentMessage, type DraftCustomer, type DraftPendingProductChoice, type DraftItem, type DraftTransaction, type StorePosDraft } from "@/lib/store-pos";

const AUDIO_PLACEHOLDER = "Adjunto una nota de voz.";

const requestSchema = z.object({
  messages: z.array(
          z.object({
            id: z.string(),
            role: z.enum(["user", "assistant"]),
            content: z.string(),
            renderedHtml: z.string().optional(),
            customerCard: z
              .object({
                userId: z.string(),
                cardId: z.string().optional(),
                cardCode: z.string().optional(),
                name: z.string().optional(),
                phone: z.string(),
                email: z.string().optional(),
              })
              .optional(),
            attachments: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            contentType: z.string(),
            dataUrl: z.string(),
            kind: z.enum(["image", "audio"]).optional(),
            durationMs: z.number().optional(),
            transcript: z.string().optional(),
            status: z.enum(["pending", "ready", "processing", "transcribed", "failed"]).optional(),
          }),
        )
        .optional(),
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
    pendingProductChoices: z
      .array(
        z.object({
          storeProductId: z.string(),
          name: z.string(),
          price: z.number(),
          score: z.number(),
        }),
      )
      .optional(),
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

type RankedStoreProduct = {
  product: StoreProduct;
  score: number;
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
  pendingProductChoices: draft.pendingProductChoices?.map((entry) => ({ ...entry })) ?? [],
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
  pendingProductChoices: draft.pendingProductChoices ?? [],
});

const describeDraft = (draft: StorePosDraft) => {
  const summary = buildDraftSummary(draft);
  return JSON.stringify(summary, null, 2);
};


const decodeQrPixels = (data: Buffer<ArrayBufferLike>, width: number, height: number) => {
  const decoded = jsQR(new Uint8ClampedArray(data), width, height, {
    inversionAttempts: "attemptBoth",
  });

  return decoded?.data ?? null;
};

const decodeQrWithPipeline = async (buffer: Buffer, transform?: (image: sharp.Sharp) => sharp.Sharp) => {
  const image = transform ? transform(sharp(buffer)) : sharp(buffer);
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return decodeQrPixels(data, info.width, info.height);
};

const buildCropRegions = (width: number, height: number) => {
  const shortestSide = Math.min(width, height);
  const cropSizes = [1, 0.88, 0.72, 0.6]
    .map((ratio) => Math.floor(shortestSide * ratio))
    .filter((size, index, all) => size > 48 && all.indexOf(size) === index);

  const regions = cropSizes.flatMap((size) => {
    const maxLeft = Math.max(width - size, 0);
    const maxTop = Math.max(height - size, 0);
    const horizontalPositions = [...new Set([0, Math.floor(maxLeft / 2), maxLeft])];
    const verticalPositions = [...new Set([0, Math.floor(maxTop / 2), maxTop])];

    return horizontalPositions.flatMap((left) =>
      verticalPositions.map((top) => ({
        left,
        top,
        width: Math.min(size, width - left),
        height: Math.min(size, height - top),
      })),
    );
  });

  return regions.filter((region, index, all) =>
    all.findIndex(
      (candidate) =>
        candidate.left === region.left &&
        candidate.top === region.top &&
        candidate.width === region.width &&
        candidate.height === region.height,
    ) === index,
  );
};

const decodeQrFromCrops = async (buffer: Buffer) => {
  const baseImage = sharp(buffer, { failOn: "none" }).rotate();
  const metadata = await baseImage.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width <= 0 || height <= 0) {
    return null;
  }

  const cropRegions = buildCropRegions(width, height);
  const variants = [
    (image: sharp.Sharp) => image,
    (image: sharp.Sharp) => image.grayscale().normalize(),
    (image: sharp.Sharp) => image.grayscale().normalize().threshold(150),
    (image: sharp.Sharp) => image.grayscale().normalize().threshold(180),
  ];

  for (const region of cropRegions) {
    for (const variant of variants) {
      try {
        const cropped = await baseImage
          .clone()
          .extract(region)
          .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: false })
          .toBuffer();

        const decoded = await decodeQrWithPipeline(cropped, variant);
        if (decoded) {
          return decoded;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
};

const decodeQrFromAttachment = async (attachment: AgentAttachment) => {
  const { buffer: imageBuffer } = parseDataUrl(attachment.dataUrl);
  const attempts = [
    () => decodeQrWithPipeline(imageBuffer, (image) => image.rotate()),
    () => decodeQrWithPipeline(imageBuffer, (image) => image.rotate().grayscale().normalize()),
    () => decodeQrWithPipeline(imageBuffer, (image) => image.rotate().grayscale().normalize().threshold(150)),
    () => decodeQrWithPipeline(imageBuffer, (image) => image.rotate().grayscale().normalize().threshold(180)),
    () => decodeQrWithPipeline(imageBuffer, (image) => image.rotate().resize({ width: 1600, withoutEnlargement: false }).grayscale().normalize()),
    () => decodeQrWithPipeline(imageBuffer, (image) => image.rotate().resize({ width: 2200, withoutEnlargement: false }).grayscale().normalize()),
    () => decodeQrFromCrops(imageBuffer),
  ];

  for (const attempt of attempts) {
    try {
      const decoded = await attempt();
      if (decoded) {
        return decoded;
      }
    } catch {
      continue;
    }
  }

  return null;
};

const getAttachmentKind = (attachment: AgentAttachment) => {
  if (attachment.kind) {
    return attachment.kind;
  }

  return attachment.contentType.startsWith("audio/") ? "audio" : "image";
};

const getFileExtension = (contentType: string) => {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
  if (contentType.includes("mp4") || contentType.includes("m4a") || contentType.includes("aac")) return "m4a";
  return "bin";
};

const parseDataUrl = (dataUrl: string) => {
  const [meta, encoded] = dataUrl.split(",");
  if (!meta || !encoded) {
    throw new Error("INVALID_DATA_URL");
  }

  if (!meta.startsWith("data:")) {
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

const transcribeAudioAttachment = async (attachment: AgentAttachment) => {
  const choughUrl = process.env.CHOUGH_URL;
  if (!choughUrl) {
    throw new Error("CHOUGH_NOT_CONFIGURED");
  }

  const { buffer, contentType } = parseDataUrl(attachment.dataUrl);
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([buffer], { type: contentType }),
    `${attachment.id}.${getFileExtension(contentType)}`,
  );
  formData.append("format", "text");
  formData.append("chunk_size", "30");

  const response = await fetch(new URL("/transcribe", choughUrl), {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error("TRANSCRIPTION_FAILED");
  }

  return (await response.text()).trim();
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
  const previousCustomerCardId = draft?.customer?.cardId ?? null;
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  let latestAttachments = latestUserMessage?.attachments ?? [];
  let normalizedUserMessage = latestUserMessage ? { ...latestUserMessage } : null;

  if (normalizedUserMessage?.attachments?.length) {
    const nextAttachments: AgentAttachment[] = [];
    const transcripts: string[] = [];

    for (const attachment of normalizedUserMessage.attachments) {
      if (getAttachmentKind(attachment) !== "audio") {
        nextAttachments.push({ ...attachment, kind: getAttachmentKind(attachment) });
        continue;
      }

      try {
        const transcript = await transcribeAudioAttachment(attachment);
        if (transcript) {
          transcripts.push(transcript);
        }
        nextAttachments.push({
          ...attachment,
          kind: "audio",
          transcript: transcript || undefined,
          status: transcript ? "transcribed" : "failed",
        });
      } catch {
        nextAttachments.push({
          ...attachment,
          kind: "audio",
          status: "failed",
        });
      }
    }

    const typedContent = normalizedUserMessage.content.trim();
    const transcriptBlock = transcripts.join("\n").trim();
    const hasOnlyAudioPlaceholder = typedContent === AUDIO_PLACEHOLDER || typedContent === "Adjunto una imagen para escanear.";

    normalizedUserMessage = {
      ...normalizedUserMessage,
      content: transcriptBlock
        ? hasOnlyAudioPlaceholder || !typedContent
          ? transcriptBlock
          : `${typedContent}\n\nNota de voz transcrita: ${transcriptBlock}`
        : typedContent,
      attachments: nextAttachments,
    };
    latestAttachments = nextAttachments;

    if (!transcriptBlock && nextAttachments.some((attachment) => attachment.kind === "audio") && (hasOnlyAudioPlaceholder || !typedContent)) {
      return Response.json({
        message: {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "No pude transcribir la nota de voz. Intenta grabarla otra vez o escribe el pedido.",
          actions: buildCopilotActions(workingDraft),
        },
        draft: workingDraft,
        userMessage: normalizedUserMessage,
      });
    }
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

  const rankStoreProducts = async (query: string) => {
    const products = await getStoreProducts();

    return products
      .map((product) => ({
        product,
        score: getProductMatchScore(query, product),
      }))
      .filter((entry) => entry.score >= 0.45)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8) as RankedStoreProduct[];
  };

  const clearPendingProductChoices = () => {
    workingDraft.pendingProductChoices = [];
  };

  const setPendingProductChoices = (choices: DraftPendingProductChoice[]) => {
    workingDraft.pendingProductChoices = choices;
  };

  const addProductToDraftById = async (storeProductId: string, quantity: number) => {
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

    clearPendingProductChoices();

    return product;
  };

  const resolvePendingProductChoice = async (selection: string, quantity: number) => {
    const resolution = resolvePendingProductChoiceSelection(workingDraft.pendingProductChoices ?? [], selection);
    if (!resolution.resolved) {
      return resolution;
    }

    const addedProduct = await addProductToDraftById(resolution.choice.storeProductId, quantity);

    return {
      resolved: true,
      product: {
        storeProductId: addedProduct.id,
        name: addedProduct.name,
        price: Number(addedProduct.price),
      },
      draft: buildDraftSummary(workingDraft),
    };
  };

  const systemPrompt = [
    "Eres un asistente de POS para tenderos en Qoa.",
    "Responde siempre en espanol claro y breve.",
    "Usa herramientas para cambiar el pedido, ligar clientes y confirmar ventas.",
    "No digas que una venta fue registrada si no ejecutaste confirmDraftTransaction.",
    "Si el usuario pide escanear una imagen, usa resolveCustomerCard sin input y toma el adjunto mas reciente.",
    "Tolera errores pequenos de transcripcion o dictado en nombres de producto.",
    "Cuando el tendero pida agregar un producto por nombre, intenta primero addProductToDraftByQuery.",
    "Si acabas de ofrecer opciones de producto y el tendero responde con una palabra corta como un sabor, marca o variante, intenta primero resolvePendingProductChoice.",
    "Si una tool ya tiene suficiente informacion para agregar el producto o ligar al cliente, ejecutala sin pedir confirmacion adicional.",
    "Minimiza interacciones innecesarias: solo pide aclaracion cuando una tool devuelva varias opciones plausibles o baja confianza.",
    "Si solo hay una coincidencia claramente probable para un producto, agregala sin pedir aclaracion.",
    "Solo pide aclaracion cuando haya varias coincidencias plausibles o la confianza sea baja.",
    `Estado actual del pedido:\n${describeDraft(workingDraft)}`,
  ].join("\n\n");

  const transcript = normalizedMessages
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
          const apiResults = await api.v1.stores[storeId]["products-search"].get({
            query: { q: query, limit: "8" },
            headers: { authorization },
          });
          const fuzzyResults = await rankStoreProducts(query);

          if (apiResults.error && fuzzyResults.length === 0) {
            throw new Error("PRODUCT_SEARCH_FAILED");
          }

          const merged = new Map<string, { storeProductId: string; name: string; sku?: string; price: number; score?: number }>();
          for (const product of ((apiResults.data?.data?.storeProducts ?? []) as StoreProduct[])) {
            merged.set(product.id, {
              storeProductId: product.id,
              name: product.name,
              sku: product.sku,
              price: Number(product.price),
              score: 1,
            });
          }

          for (const entry of fuzzyResults) {
            if (!merged.has(entry.product.id)) {
              merged.set(entry.product.id, {
                storeProductId: entry.product.id,
                name: entry.product.name,
                sku: entry.product.sku,
                price: Number(entry.product.price),
                score: Number(entry.score.toFixed(3)),
              });
            }
          }

          return {
            products: [...merged.values()],
          };
        },
      }),
      addProductToDraftByQuery: tool({
        description: "Busca el producto mas probable por nombre hablado o con errores y lo agrega si la coincidencia es suficientemente clara.",
        inputSchema: z.object({
          query: z.string().min(2),
          quantity: z.number().int().min(1).default(1),
        }),
        execute: async ({ query, quantity }) => {
          const ranked = await rankStoreProducts(query);
          const best = ranked[0];
          const second = ranked[1];

          if (!best) {
            return {
              added: false,
              reason: "no_match",
              candidates: [],
            };
          }

          const confidentSingleMatch = best.score >= 0.64 && (!second || best.score - second.score >= 0.08 || second.score < 0.56);
          if (!confidentSingleMatch) {
            const candidates = ranked.slice(0, 3).map((entry) => ({
              storeProductId: entry.product.id,
              name: entry.product.name,
              price: Number(entry.product.price),
              score: Number(entry.score.toFixed(3)),
            }));
            setPendingProductChoices(candidates);

            return {
              added: false,
              reason: "needs_confirmation",
              candidates,
            };
          }

          const addedProduct = await addProductToDraftById(best.product.id, quantity);

          return {
            added: true,
            matchedQuery: query,
            product: {
              storeProductId: addedProduct.id,
              name: addedProduct.name,
              price: Number(addedProduct.price),
              score: Number(best.score.toFixed(3)),
            },
            draft: buildDraftSummary(workingDraft),
          };
        },
      }),
      resolvePendingProductChoice: tool({
        description: "Resuelve una respuesta corta del tendero usando las opciones de producto ofrecidas en el turno anterior.",
        inputSchema: z.object({
          selection: z.string().min(1),
          quantity: z.number().int().min(1).default(1),
        }),
        execute: async ({ selection, quantity }) => resolvePendingProductChoice(selection, quantity),
      }),
      addProductToDraft: tool({
        description: "Agrega un producto del catalogo al pedido actual.",
        inputSchema: z.object({
          storeProductId: z.string(),
          quantity: z.number().int().min(1).default(1),
        }),
        execute: async ({ storeProductId, quantity }) => {
          await addProductToDraftById(storeProductId, quantity);

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
          clearPendingProductChoices();
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
          clearPendingProductChoices();
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
              if (getAttachmentKind(attachment) !== "image") {
                continue;
              }
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
          clearPendingProductChoices();
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
            pendingProductChoices: [],
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

  const renderedHtml = await renderAssistantMarkdownToHtml(result.text);
  const customerCard = workingDraft.customer?.cardId && workingDraft.customer.cardId !== previousCustomerCardId
    ? workingDraft.customer
    : undefined;

  return Response.json({
    message: {
      id: crypto.randomUUID(),
      role: "assistant",
      content: result.text,
      renderedHtml: renderedHtml || undefined,
      customerCard,
      actions: buildCopilotActions(workingDraft),
    },
    userMessage: normalizedUserMessage,
    draft: workingDraft,
  });
}
