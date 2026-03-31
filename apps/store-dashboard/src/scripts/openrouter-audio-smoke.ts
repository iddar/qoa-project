import { openrouter } from "@openrouter/ai-sdk-provider";
import { generateText, stepCountIs, tool } from "ai";
import path from "node:path";
import { z } from "zod";

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
const DEFAULT_AUDIO_PATHS = [
  "../../examples/sampler-1.mp3",
  "../../examples/sampler-2.mp3",
];

const mediaTypeByExtension: Record<string, string> = {
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};

const resolveAudioPaths = () => {
  const inputPaths = Bun.argv.slice(2);
  const candidates = inputPaths.length > 0 ? inputPaths : DEFAULT_AUDIO_PATHS;
  return candidates.map((candidate) => path.resolve(process.cwd(), candidate));
};

const inferMediaType = (filePath: string) => {
  const extension = path.extname(filePath).toLowerCase();
  return mediaTypeByExtension[extension] ?? "application/octet-stream";
};

const runSmokeCase = async (filePath: string) => {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`AUDIO_NOT_FOUND: ${filePath}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mediaType = inferMediaType(filePath);

  const result = await generateText({
    model: openrouter(DEFAULT_MODEL),
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Escucha el audio y devuelve solo la orden del tendero en espanol.",
              "No expliques nada.",
              "No agregues texto extra.",
              'Si el audio no es claro, responde exactamente: NO_ENTENDI.',
            ].join(" "),
          },
          {
            type: "file",
            data: buffer,
            mediaType,
          },
        ],
      },
    ],
  });

  return {
    filePath,
    mediaType,
    sizeBytes: buffer.byteLength,
    text: result.text.trim(),
    finishReason: result.finishReason,
    usage: result.usage,
  };
};

const runToolCallingSmokeCase = async (filePath: string) => {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`AUDIO_NOT_FOUND: ${filePath}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mediaType = inferMediaType(filePath);
  const toolExecutions: Array<{ query: string; quantity: number }> = [];

  const result = await generateText({
    model: openrouter(DEFAULT_MODEL),
    temperature: 0,
    stopWhen: stepCountIs(5),
    system: [
      "Eres un asistente de POS para tenderos.",
      "Debes convertir la nota de voz en llamadas de tool para agregar productos.",
      "Usa addProductToDraftByQuery una vez por cada producto detectado.",
      "No pidas confirmacion.",
      "Si no entiendes el audio, responde exactamente NO_ENTENDI y no llames tools.",
    ].join(" "),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Escucha la nota de voz y agrega los productos al pedido usando tools.",
              "Si hay varios productos, llama la tool varias veces.",
            ].join(" "),
          },
          {
            type: "file",
            data: buffer,
            mediaType,
          },
        ],
      },
    ],
    tools: {
      addProductToDraftByQuery: tool({
        description: "Agrega un producto al pedido por nombre y cantidad.",
        inputSchema: z.object({
          query: z.string().min(2),
          quantity: z.number().int().min(1).default(1),
        }),
        execute: async ({ query, quantity }) => {
          const execution = { query, quantity };
          toolExecutions.push(execution);
          return {
            ok: true,
            ...execution,
          };
        },
      }),
    },
  });

  return {
    filePath,
    mediaType,
    sizeBytes: buffer.byteLength,
    text: result.text.trim(),
    finishReason: result.finishReason,
    usage: result.usage,
    toolExecutions,
  };
};

const main = async () => {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required");
  }

  const audioPaths = resolveAudioPaths();
  console.log(`Model: ${DEFAULT_MODEL}`);
  console.log(`Files: ${audioPaths.length}`);

  for (const filePath of audioPaths) {
    const result = await runSmokeCase(filePath);
    const toolResult = await runToolCallingSmokeCase(filePath);
    console.log("---");
    console.log(`File: ${path.basename(result.filePath)}`);
    console.log(`Path: ${result.filePath}`);
    console.log(`Media type: ${result.mediaType}`);
    console.log(`Size: ${result.sizeBytes} bytes`);
    console.log(`Finish reason: ${result.finishReason}`);
    if (result.usage) {
      console.log(`Usage: input=${result.usage.inputTokens ?? 0}, output=${result.usage.outputTokens ?? 0}, total=${result.usage.totalTokens ?? 0}`);
    }
    console.log(`Transcription-like response: ${result.text}`);
    console.log(`Tool finish reason: ${toolResult.finishReason}`);
    if (toolResult.usage) {
      console.log(`Tool usage: input=${toolResult.usage.inputTokens ?? 0}, output=${toolResult.usage.outputTokens ?? 0}, total=${toolResult.usage.totalTokens ?? 0}`);
    }
    console.log(`Tool response: ${toolResult.text}`);
    console.log(`Tool calls: ${JSON.stringify(toolResult.toolExecutions)}`);

    if (toolResult.toolExecutions.length === 0) {
      throw new Error(`NO_TOOL_CALLS: ${path.basename(filePath)}`);
    }
  }
};

await main().catch((error) => {
  console.error("OpenRouter audio smoke test failed.");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
