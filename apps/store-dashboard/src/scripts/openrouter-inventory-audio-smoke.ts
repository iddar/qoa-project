import path from "node:path";
import { createEmptyInventoryDraft, type StoreInventoryDraft } from "@/lib/store-inventory";
import type { AgentMessage } from "@/lib/store-pos";

const DEFAULT_AUDIO_PATH = "../../examples/fix inventario demo.mp3";
const API_URL = process.env.API_URL ?? "http://localhost:3000";
const AGENT_URL = process.env.STORE_AGENT_URL ?? "http://localhost:3003/api/agent/inventory-chat";

const buildAudioDataUrl = async (filePath: string) => {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`AUDIO_NOT_FOUND: ${filePath}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    sizeBytes: buffer.byteLength,
    dataUrl: `data:audio/mpeg;base64,${buffer.toString("base64")}`,
  };
};

const buildDraft = (): StoreInventoryDraft => ({
  ...createEmptyInventoryDraft(),
  idempotencyKey: "inventory-audio-smoke",
  rows: [
    {
      id: "row-panque-nuez",
      lineNumber: 1,
      rawText: "Panque Nuez, 7500810015810, 10",
      name: "Panque Nuez",
      sku: "7500810015810",
      quantity: 10,
      status: "matched",
      action: "match_existing",
      matchedStoreProductId: "store-product-panque-nuez",
    },
  ],
});

const main = async () => {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required");
  }

  const loginResponse = await fetch(`${API_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: process.env.STORE_EMAIL ?? "store.development@qoa.local",
      password: process.env.STORE_PASSWORD ?? "Password123!",
    }),
  });
  if (!loginResponse.ok) {
    throw new Error(`LOGIN_FAILED:${loginResponse.status}`);
  }
  const loginBody = (await loginResponse.json()) as { data?: { accessToken?: string } };
  const token = loginBody.data?.accessToken;
  if (!token) {
    throw new Error("LOGIN_TOKEN_MISSING");
  }

  const audioPath = path.resolve(process.cwd(), Bun.argv[2] ?? DEFAULT_AUDIO_PATH);
  const audio = await buildAudioDataUrl(audioPath);
  const userMessage: AgentMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: "Adjunto una nota de voz.",
    attachments: [
      {
        id: crypto.randomUUID(),
        name: path.basename(audioPath),
        contentType: "audio/mpeg",
        dataUrl: audio.dataUrl,
        kind: "audio",
        status: "ready",
      },
    ],
  };

  const response = await fetch(AGENT_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messages: [userMessage],
      draft: buildDraft(),
    }),
  });

  const body = (await response.json()) as { draft?: StoreInventoryDraft; message?: AgentMessage; error?: string };
  const panqueRow = body.draft?.rows.find((row) => row.name.toLowerCase().includes("panque"));
  const result = {
    filePath: audioPath,
    sizeBytes: audio.sizeBytes,
    status: response.status,
    assistant: body.message?.content,
    panqueQuantity: panqueRow?.quantity,
  };

  console.log(JSON.stringify(result, null, 2));

  if (!response.ok || body.error) {
    throw new Error(`SMOKE_REQUEST_FAILED: ${body.error ?? response.status}`);
  }

  if (panqueRow?.quantity !== 15) {
    throw new Error(`SMOKE_FAILED: expected Panque Nuez quantity 15, got ${panqueRow?.quantity ?? "missing"}`);
  }
};

await main().catch((error) => {
  console.error("OpenRouter inventory audio smoke test failed.");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
