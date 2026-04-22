import { expect, test } from "bun:test";
import { buildInventoryPreviewTextFromImageRows, normalizeInventoryImageRows } from "@/lib/inventory-image-extraction";

test("builds preview text from extracted image rows without carrying price", () => {
  const previewText = buildInventoryPreviewTextFromImageRows([
    {
      name: "Pan Blanco 680",
      sku: "7501000111206",
      quantity: 100,
      price: 40.61,
    },
    {
      name: "Bimbollos 450",
      sku: "7501000 111602",
      quantity: 20,
      price: 43.52,
    },
  ]);

  expect(previewText).toBe([
    "Pan Blanco 680, 7501000111206, 100",
    "Bimbollos 450, 7501000111602, 20",
  ].join("\n"));
});

test("drops incomplete or invalid extracted image rows", () => {
  const rows = normalizeInventoryImageRows([
    {
      name: "  Roles Canela 3  ",
      sku: "7501000309726",
      quantity: 40.8,
    },
    {
      name: "",
      sku: "7500810015810",
      quantity: 10,
    },
    {
      name: "Panque Nuez 28",
      sku: null,
      quantity: 0,
    },
  ]);

  expect(rows).toEqual([
    {
      name: "Roles Canela 3",
      sku: "7501000309726",
      quantity: 40,
    },
  ]);
});
