import { z } from "zod";

export const inventoryImageExtractionRowSchema = z.object({
  name: z.string().trim().optional().nullable(),
  sku: z.string().trim().optional().nullable(),
  quantity: z.coerce.number().optional().nullable(),
  price: z.coerce.number().optional().nullable(),
});

export const inventoryImageExtractionSchema = z.object({
  rows: z.array(inventoryImageExtractionRowSchema),
});

export type InventoryImageExtractionRow = z.infer<typeof inventoryImageExtractionRowSchema>;

const EMBEDDED_TICKET_ROW_PATTERN = /([A-Za-z\u00c1\u00c9\u00cd\u00d3\u00da\u00dc\u00d1\u00e1\u00e9\u00ed\u00f3\u00fa\u00fc\u00f10-9]{3,})\s+(\d{8,18})\s+(\d{1,5})\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?(?:\s+\$?\d+(?:\.\d+)?)?/g;

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeName = (value: string) => collapseWhitespace(
  value
    .replace(/([a-z\u00f1])([A-Z\u00d1])/g, "$1 $2")
    .replace(/([A-Za-z\u00d1\u00f1])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z\u00d1\u00f1])/g, "$1 $2"),
);

const stripTrailingBarcodeBleed = (value: string, options?: { hasSku?: boolean; originalName?: string | null | undefined }) => {
  const normalizedValue = collapseWhitespace(value);
  if (!normalizedValue || !options?.hasSku) {
    return normalizedValue;
  }

  const originalName = options.originalName?.trim() ?? "";
  const originalLooksCompressed = originalName.length > 0 && !/\s/.test(originalName);
  const trailingDigitMatch = normalizedValue.match(/^(.*?)(\d{1,4})$/);
  if (!trailingDigitMatch || !originalLooksCompressed) {
    return normalizedValue;
  }

  const candidate = collapseWhitespace(trailingDigitMatch[1] ?? "");
  return candidate.length >= 3 ? candidate : normalizedValue;
};

const parseSkuArtifact = (value: string | null | undefined) => {
  if (!value) {
    return { sku: undefined, quantity: undefined };
  }

  const normalizedValue = value.trim();
  const segments = normalizedValue.split(/[-|\s]+/).filter(Boolean);
  const [firstSegment] = segments;
  const skuCandidate = firstSegment?.match(/^\d{8,18}$/)?.[0];
  const quantityCandidate = segments.slice(1).find((segment) => /^\d{1,5}$/.test(segment));

  return {
    sku: skuCandidate,
    quantity: quantityCandidate ? Number.parseInt(quantityCandidate, 10) : undefined,
  };
};

const extractEmbeddedTicketRows = (row: InventoryImageExtractionRow): InventoryImageExtractionRow[] => {
  const blob = [row.name ?? "", row.sku ?? ""].filter(Boolean).join(" ");
  const uniqueRows = new Map<string, InventoryImageExtractionRow>();

  for (const match of blob.matchAll(EMBEDDED_TICKET_ROW_PATTERN)) {
    const [, name, sku, quantity] = match;
    if (!name || !sku || !quantity) {
      continue;
    }

    const key = `${sku}:${quantity}`;
    if (!uniqueRows.has(key)) {
      uniqueRows.set(key, {
        name,
        sku,
        quantity: Number.parseInt(quantity, 10),
      });
    }
  }

  return [...uniqueRows.values()];
};

const expandRows = (rows: InventoryImageExtractionRow[]) =>
  rows.flatMap((row) => {
    const embeddedRows = extractEmbeddedTicketRows(row);
    if (embeddedRows.length >= 2) {
      return embeddedRows;
    }

    return [row];
  });

const normalizeSku = (value: string | null | undefined) => {
  if (!value) {
    return undefined;
  }

  const compact = value.replace(/\s+/g, "").trim();
  return compact || undefined;
};

export const normalizeInventoryImageRows = (rows: InventoryImageExtractionRow[]) =>
  expandRows(rows)
    .map((row) => {
      const skuArtifact = parseSkuArtifact(row.sku);
      const normalizedName = normalizeName(row.name ?? "");
      return {
        name: stripTrailingBarcodeBleed(normalizedName, {
          hasSku: Boolean(skuArtifact.sku ?? normalizeSku(row.sku)),
          originalName: row.name,
        }),
        sku: skuArtifact.sku ?? normalizeSku(row.sku),
        quantity: Math.trunc(row.quantity ?? skuArtifact.quantity ?? 0),
      };
    })
    .filter((row) => row.name.length > 0 && row.quantity > 0);

export const buildInventoryPreviewTextFromImageRows = (rows: InventoryImageExtractionRow[]) =>
  normalizeInventoryImageRows(rows)
    .map((row) => [row.name, row.sku, String(row.quantity)].filter(Boolean).join(", "))
    .join("\n");
