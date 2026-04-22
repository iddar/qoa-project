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

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeSku = (value: string | null | undefined) => {
  if (!value) {
    return undefined;
  }

  const compact = value.replace(/\s+/g, "").trim();
  return compact || undefined;
};

export const normalizeInventoryImageRows = (rows: InventoryImageExtractionRow[]) =>
  rows
    .map((row) => ({
      name: collapseWhitespace(row.name ?? ""),
      sku: normalizeSku(row.sku),
      quantity: Math.trunc(row.quantity ?? 0),
    }))
    .filter((row) => row.name.length > 0 && row.quantity > 0);

export const buildInventoryPreviewTextFromImageRows = (rows: InventoryImageExtractionRow[]) =>
  normalizeInventoryImageRows(rows)
    .map((row) => [row.name, row.sku, String(row.quantity)].filter(Boolean).join(", "))
    .join("\n");
