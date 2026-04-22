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

test("builds the expected preview lines for the sample bread ticket", () => {
  const previewText = buildInventoryPreviewTextFromImageRows([
    {
      name: "Pan Blanco",
      sku: "7501000111206",
      quantity: 100,
      price: 40.61,
    },
    {
      name: "Bimbollos",
      sku: "7501000111602",
      quantity: 20,
      price: 43.52,
    },
    {
      name: "Roles Canela",
      sku: "7501000309726",
      quantity: 40,
      price: 36.09,
    },
    {
      name: "Panque Nuez",
      sku: "7500810015810",
      quantity: 10,
      price: 33.4,
    },
  ]);

  expect(previewText).toBe([
    "Pan Blanco, 7501000111206, 100",
    "Bimbollos, 7501000111602, 20",
    "Roles Canela, 7501000309726, 40",
    "Panque Nuez, 7500810015810, 10",
  ].join("\n"));
});

test("recovers quantity and sku when the model compresses ticket columns into sku", () => {
  const rows = normalizeInventoryImageRows([
    {
      name: "PanBlanco680",
      sku: "7501000111206-100-0.0%-40.61-4061.00",
    },
    {
      name: "Bimbollos450",
      sku: "7501000111602-20-0.0%-43.52-870.40",
    },
    {
      name: "RolesCanela3",
      sku: "7501000309726-40-8.0%-36.09-1443.60",
    },
    {
      name: "PanqueNuez28",
      sku: "7500810015810-10-8.0%-33.40-334.00",
    },
  ]);

  expect(rows).toEqual([
    { name: "Pan Blanco", sku: "7501000111206", quantity: 100 },
    { name: "Bimbollos", sku: "7501000111602", quantity: 20 },
    { name: "Roles Canela", sku: "7501000309726", quantity: 40 },
    { name: "Panque Nuez", sku: "7500810015810", quantity: 10 },
  ]);
});

test("strips trailing barcode bleed digits from compressed names when sku is present", () => {
  const rows = normalizeInventoryImageRows([
    {
      name: "PanBlanco680",
      sku: "7501000111206",
      quantity: 100,
    },
    {
      name: "Bimbollos450",
      sku: "7501000111602",
      quantity: 20,
    },
  ]);

  expect(rows).toEqual([
    { name: "Pan Blanco", sku: "7501000111206", quantity: 100 },
    { name: "Bimbollos", sku: "7501000111602", quantity: 20 },
  ]);
});

test("expands repeated table blobs when the model dumps the full ticket into one field", () => {
  const rows = normalizeInventoryImageRows([
    {
      name: "Pan Blanco",
      sku: [
        "PanBlanco680 7501000111206 100 0.0% 40.61 $4061.00",
        "Bimbollos450 7501000111602 20 0.0% 43.52 $870.40",
        "RolesCanela3 7501000309726 40 8.0% 36.09 $1443.60",
        "PanqueNuez28 7500810015810 10 8.0% 33.40 $334.00",
      ].join("\n"),
    },
  ]);

  expect(rows).toEqual([
    { name: "Pan Blanco", sku: "7501000111206", quantity: 100 },
    { name: "Bimbollos", sku: "7501000111602", quantity: 20 },
    { name: "Roles Canela", sku: "7501000309726", quantity: 40 },
    { name: "Panque Nuez", sku: "7500810015810", quantity: 10 },
  ]);
});
