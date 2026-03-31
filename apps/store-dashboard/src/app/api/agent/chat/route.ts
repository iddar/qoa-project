import { generateText, stepCountIs, tool } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import jsQR from "jsqr";
import sharp from "sharp";
import { z } from "zod";
import { api } from "@/lib/api";
import { renderAssistantMarkdownToHtml } from "@/lib/markdown";
import { buildCopilotActions, filterRankedProductsByCategoryHint, hasConfidentSingleProductMatch, inferProductCategoryHint, planRequestedOrderItems, rankProductsByQuery, resolvePendingProductChoiceSelection } from "@/lib/store-copilot";
import { createEmptyDraft, getDraftItemCount, getDraftTotal, type AgentAddedItem, type AgentAttachment, type AgentMessage, type DraftCustomer, type DraftPendingProductChoice, type DraftTransaction, type StorePosDraft } from "@/lib/store-pos";

const AUDIO_PLACEHOLDER = "Adjunto una nota de voz.";
const execFileAsync = promisify(execFile);

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
            addedItems: z
              .array(
                z.object({
                  storeProductId: z.string(),
                  name: z.string(),
                  quantity: z.number(),
                  unitPrice: z.number(),
                  lineTotal: z.number(),
                }),
              )
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
    pendingProductContext: z
      .object({
        originalQuery: z.string(),
        categoryHint: z.string().optional(),
      })
      .nullable()
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
  pendingProductContext: draft.pendingProductContext ? { ...draft.pendingProductContext } : null,
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
  pendingProductContext: draft.pendingProductContext ?? null,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "qoa-openrouter-audio-"));
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
  } catch (error) {
    throw new Error(
      error instanceof Error && /ffmpeg/i.test(error.message)
        ? "AUDIO_TRANSCODE_FAILED"
        : "AUDIO_TRANSCODE_FAILED",
    );
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

const buildTextMessageContent = (message: AgentMessage) => {
  const attachmentLabel = message.attachments?.length
    ? `\nAdjuntos: ${message.attachments.map((file) => file.name).join(", ")}`
    : "";
  return `${message.content}${attachmentLabel}`;
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
      typedContent && typedContent !== AUDIO_PLACEHOLDER ? typedContent : "Nota de voz del tendero.",
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

const normalizeAttachments = (attachments: AgentAttachment[]) => {
  return attachments.map((attachment) => {
    const kind = getAttachmentKind(attachment);
    if (kind !== "audio") {
      return { ...attachment, kind };
    }

    return {
      ...attachment,
      kind: "audio" as const,
      transcript: undefined,
      status: "ready" as const,
    };
  });
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
  const initialDraftItems = (draft?.items ?? []).map((item) => ({ ...item }));
  const previousCustomerCardId = draft?.customer?.cardId ?? null;
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  let latestAttachments = latestUserMessage?.attachments ?? [];
  let normalizedUserMessage = latestUserMessage ? { ...latestUserMessage } : null;

  if (normalizedUserMessage?.attachments?.length) {
    const normalizedAttachments = normalizeAttachments(normalizedUserMessage.attachments);
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

    return rankProductsByQuery(query, products) as RankedStoreProduct[];
  };

  const clearPendingProductChoices = () => {
    workingDraft.pendingProductChoices = [];
    workingDraft.pendingProductContext = null;
  };

  const setPendingProductChoices = (query: string, choices: DraftPendingProductChoice[]) => {
    workingDraft.pendingProductChoices = choices;
    workingDraft.pendingProductContext = {
      originalQuery: query,
      categoryHint: inferProductCategoryHint(query) ?? undefined,
    };
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

  const buildAddedItem = (product: StoreProduct, quantity: number): AgentAddedItem => ({
    storeProductId: product.id,
    name: product.name,
    quantity,
    unitPrice: Number(product.price),
    lineTotal: Number(product.price) * quantity,
  });

  const buildAddedItemsMessage = (addedItems: AgentAddedItem[]) => {
    if (addedItems.length === 1) {
      const [item] = addedItems;
      return `Listo, agregué **${item?.quantity} ${item?.name}** al pedido por **$${item?.lineTotal}**.`;
    }

    const lines = addedItems.map((item) => `- **${item.quantity} x ${item.name}** · $${item.lineTotal}`);
    return `Listo, agregué estos productos al pedido:\n${lines.join("\n")}`;
  };

  const collectAddedItemsFromDraftDiff = () => {
    const previousItemsById = new Map(initialDraftItems.map((item) => [item.storeProductId, item]));
    const addedItems: AgentAddedItem[] = [];

    for (const currentItem of workingDraft.items) {
      const previousItem = previousItemsById.get(currentItem.storeProductId);
      const quantityDelta = currentItem.quantity - (previousItem?.quantity ?? 0);

      if (quantityDelta > 0) {
        addedItems.push({
          storeProductId: currentItem.storeProductId,
          name: currentItem.name,
          quantity: quantityDelta,
          unitPrice: currentItem.price,
          lineTotal: currentItem.price * quantityDelta,
        });
      }
    }

    return addedItems;
  };

  const tryHandleDeterministicCartBuild = async () => {
    if (!normalizedUserMessage || normalizedUserMessage.role !== "user") {
      return null;
    }

    if ((workingDraft.pendingProductChoices?.length ?? 0) > 0) {
      return null;
    }

    const plannedOrder = planRequestedOrderItems(normalizedUserMessage.content, await getStoreProducts());
    if (plannedOrder.requests.length === 0 || plannedOrder.resolved.length === 0 || plannedOrder.unresolved.length > 0) {
      return null;
    }

    const addedItems: AgentAddedItem[] = [];
    for (const entry of plannedOrder.resolved) {
      const addedProduct = await addProductToDraftById(entry.match.product.id, entry.request.quantity);
      addedItems.push(buildAddedItem(addedProduct, entry.request.quantity));
    }

    const content = buildAddedItemsMessage(addedItems);
    const renderedHtml = await renderAssistantMarkdownToHtml(content);

    return Response.json({
      message: {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        renderedHtml: renderedHtml || undefined,
        addedItems,
        actions: buildCopilotActions(workingDraft),
      },
      userMessage: normalizedUserMessage,
      draft: workingDraft,
    });
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
    "Prioriza armar el pedido: si tienes suficiente informacion para agregar productos, agregalos de inmediato en vez de pedir confirmacion.",
    "Solo muestra opciones o confirmaciones cuando la tool no tenga suficiente certeza para actuar sola.",
    "Si solo hay una coincidencia claramente probable para un producto, agregala sin pedir aclaracion.",
    "Solo pide aclaracion cuando haya varias coincidencias plausibles o la confianza sea baja.",
    `Estado actual del pedido:\n${describeDraft(workingDraft)}`,
  ].join("\n\n");

  const deterministicCartBuildResponse = await tryHandleDeterministicCartBuild();
  if (deterministicCartBuildResponse) {
    return deterministicCartBuildResponse;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({ error: "OPENROUTER_NOT_CONFIGURED" }, { status: 500 });
  }

  const modelMessages = await buildModelMessages(normalizedMessages, normalizedUserMessage?.id);

  const result = await generateText({
    model: openrouter(process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash"),
    system: systemPrompt,
    messages: modelMessages,
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
          const categoryHint = inferProductCategoryHint(query);
          const ranked = filterRankedProductsByCategoryHint(await rankStoreProducts(query), categoryHint);
          const best = ranked[0];

          if (!best) {
            return {
              added: false,
              reason: "no_match",
              candidates: [],
            };
          }

          const confidentSingleMatch = hasConfidentSingleProductMatch(ranked);
          if (!confidentSingleMatch) {
            const candidates = ranked.slice(0, 3).map((entry) => ({
              storeProductId: entry.product.id,
              name: entry.product.name,
              price: Number(entry.product.price),
              score: Number(entry.score.toFixed(3)),
            }));
            setPendingProductChoices(query, candidates);

            return {
              added: false,
              reason: "needs_confirmation",
              categoryHint: categoryHint ?? undefined,
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
  const addedItems = collectAddedItemsFromDraftDiff();

  return Response.json({
    message: {
      id: crypto.randomUUID(),
      role: "assistant",
      content: result.text,
      renderedHtml: renderedHtml || undefined,
      customerCard,
      addedItems: addedItems.length > 0 ? addedItems : undefined,
      actions: buildCopilotActions(workingDraft),
    },
    userMessage: normalizedUserMessage,
    draft: workingDraft,
  });
}
