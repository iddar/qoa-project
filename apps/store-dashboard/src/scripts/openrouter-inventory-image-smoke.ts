import path from "node:path";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { buildInventoryPreviewTextFromImageRows, inventoryImageExtractionSchema, normalizeInventoryImageRows } from "@/lib/inventory-image-extraction";

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
const DEFAULT_IMAGE_PATHS = ["../../examples/tiket_ejemplo.jpg"];

type ExpectedRow = {
  label: string;
  quantity: number;
  aliases: string[];
};

const EXPECTED_ROWS_BY_FIXTURE: Record<string, ExpectedRow[]> = {
  "tiket_ejemplo.jpg": [
    { label: "Pan Blanco", quantity: 100, aliases: ["pan blanco", "panblanco"] },
    { label: "Bimbollos", quantity: 20, aliases: ["bimbollos", "bimbo llos"] },
    { label: "Roles Canela", quantity: 40, aliases: ["roles canela", "rol es canela"] },
    { label: "Panque Nuez", quantity: 10, aliases: ["panque nuez", "panque nuez 28"] },
  ],
};

const resolveImagePaths = () => {
  const inputPaths = Bun.argv.slice(2);
  const candidates = inputPaths.length > 0 ? inputPaths : DEFAULT_IMAGE_PATHS;
  return candidates.map((candidate) => path.resolve(process.cwd(), candidate));
};

const inferMediaType = (filePath: string) => {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
};

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const matchesExpectedRow = (rowName: string, expected: ExpectedRow) => {
  const normalizedName = normalizeText(rowName);
  return expected.aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias);
    return normalizedName.includes(normalizedAlias) || normalizedAlias.includes(normalizedName);
  });
};

const evaluateRows = (fixtureName: string, rows: Array<{ name: string; quantity: number; sku?: string }>) => {
  const expectedRows = EXPECTED_ROWS_BY_FIXTURE[fixtureName];
  if (!expectedRows) {
    return [] as string[];
  }

  const failures: string[] = [];
  for (const expected of expectedRows) {
    const match = rows.find((row) => matchesExpectedRow(row.name, expected));
    if (!match) {
      failures.push(`missing_${normalizeText(expected.label).replace(/\s+/g, "_")}`);
      continue;
    }

    if (match.quantity !== expected.quantity) {
      failures.push(`wrong_quantity_${normalizeText(expected.label).replace(/\s+/g, "_")}:${match.quantity}`);
    }
  }

  if (rows.length !== expectedRows.length) {
    failures.push(`unexpected_row_count:${rows.length}`);
  }

  return failures;
};

const runSmokeCase = async (filePath: string) => {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`IMAGE_NOT_FOUND: ${filePath}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mediaType = inferMediaType(filePath);
  const result = await generateObject({
    model: openrouter(DEFAULT_MODEL),
    schema: inventoryImageExtractionSchema,
    system: [
      "Extrae productos de notas o tickets de proveedor para inventario.",
      "Devuelve solo productos reales, sin encabezados ni totales.",
      "Ignora vendedor, ruta, subtotal, descuento, IVA, IEPS, total y texto legal.",
      "Para cada producto devuelve name, sku si existe y quantity.",
      "price es opcional y no es obligatorio si no se ve claro.",
      "No inventes filas ni cantidades.",
    ].join(" "),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Lee esta foto de inventario y extrae las filas de producto para preparar un preview editable.",
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

  const normalizedRows = normalizeInventoryImageRows(result.object.rows);
  const previewText = buildInventoryPreviewTextFromImageRows(result.object.rows);
  const fixtureName = path.basename(filePath);
  const failures = evaluateRows(fixtureName, normalizedRows);

  return {
    filePath,
    mediaType,
    sizeBytes: buffer.byteLength,
    extractedRows: result.object.rows,
    normalizedRows,
    previewText,
    usage: result.usage,
    warnings: result.warnings,
    failures,
  };
};

const main = async () => {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required");
  }

  const imagePaths = resolveImagePaths();
  console.log(`Model: ${DEFAULT_MODEL}`);
  console.log(`Images: ${imagePaths.length}`);

  for (const filePath of imagePaths) {
    const result = await runSmokeCase(filePath);
    console.log("---");
    console.log(`File: ${path.basename(result.filePath)}`);
    console.log(`Path: ${result.filePath}`);
    console.log(`Media type: ${result.mediaType}`);
    console.log(`Size: ${result.sizeBytes} bytes`);
    if (result.usage) {
      console.log(`Usage: input=${result.usage.inputTokens ?? 0}, output=${result.usage.outputTokens ?? 0}, total=${result.usage.totalTokens ?? 0}`);
    }
    if (result.warnings?.length) {
      console.log(`Warnings: ${JSON.stringify(result.warnings)}`);
    }
    console.log(`Extracted rows: ${JSON.stringify(result.extractedRows, null, 2)}`);
    console.log(`Normalized rows: ${JSON.stringify(result.normalizedRows, null, 2)}`);
    console.log(`Preview text:\n${result.previewText}`);

    if (result.failures.length > 0) {
      console.log(`Failures: ${JSON.stringify(result.failures)}`);
      throw new Error(`SMOKE_FAILED: ${path.basename(filePath)}`);
    }

    console.log("Smoke result: PASS");
  }
};

await main().catch((error) => {
  console.error("OpenRouter inventory image smoke test failed.");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
