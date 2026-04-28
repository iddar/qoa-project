import { expect, test } from "bun:test";
import { appendInventoryDraftRows, applyInventoryDraftRowPatch, canConfirmInventoryDraft, createEmptyInventoryDraft, createInventoryIntakeIdempotencyKey, findInventoryDraftRowByQuery, parseInventoryCorrections, parseInventoryQuantityCorrection, resolveInventoryRowState } from "@/lib/store-inventory";

test("marks row as new once required intake fields are completed", () => {
  const row = resolveInventoryRowState({
    id: "row-1",
    lineNumber: 1,
    rawText: "Galletas Mantequilla",
    name: "Galletas Mantequilla",
    quantity: 6,
    price: 30,
    status: "invalid",
    action: "create_new",
  });

  expect(row.status).toBe("new");
  expect(row.errors).toBeUndefined();
});

test("requires an explicit action before confirming the inventory draft", () => {
  const unresolvedRow = resolveInventoryRowState({
    id: "row-2",
    lineNumber: 2,
    rawText: "Refresco 600ml",
    name: "Refresco 600ml",
    quantity: 2,
    status: "ambiguous",
    candidates: [
      {
        storeProductId: "sp-1",
        name: "Refresco 600ml",
        price: 25,
        stock: 3,
        score: 0.88,
      },
    ],
  });

  expect(canConfirmInventoryDraft({ ...createEmptyInventoryDraft(), rows: [unresolvedRow] })).toBe(false);

  const resolvedRow = resolveInventoryRowState({
    ...unresolvedRow,
    action: "match_existing",
    matchedStoreProductId: "sp-1",
    matchedProduct: {
      id: "sp-1",
      storeId: "store-1",
      name: "Refresco 600ml",
      unitType: "piece",
      price: 25,
      stock: 3,
      status: "active",
      createdAt: new Date().toISOString(),
    },
  });

  expect(canConfirmInventoryDraft({ ...createEmptyInventoryDraft(), rows: [resolvedRow] })).toBe(true);
});

test("creates inventory intake idempotency keys with the expected prefix", () => {
  const first = createInventoryIntakeIdempotencyKey();
  const second = createInventoryIntakeIdempotencyKey();

  expect(first.startsWith("inventory-intake-")).toBe(true);
  expect(second.startsWith("inventory-intake-")).toBe(true);
  expect(first).not.toBe(second);
});

test("does not allow confirming a new row without price", () => {
  const row = resolveInventoryRowState({
    id: "row-3",
    lineNumber: 3,
    rawText: "Papas Fuego",
    name: "Papas Fuego",
    quantity: 4,
    status: "new",
    action: "create_new",
  });

  expect(row.status).toBe("new");
  expect(row.errors).toEqual(["Agrega precio para crear este producto nuevo."]);
  expect(canConfirmInventoryDraft({ ...createEmptyInventoryDraft(), rows: [row] })).toBe(false);
});

test("appends new preview rows after the current draft line numbers", () => {
  const merged = appendInventoryDraftRows(
    [
      {
        id: "existing-1",
        lineNumber: 1,
        rawText: "Pan Blanco",
        name: "Pan Blanco",
        quantity: 100,
        status: "matched",
        action: "match_existing",
        matchedStoreProductId: "sp-1",
      },
      {
        id: "existing-2",
        lineNumber: 2,
        rawText: "Bimbollos",
        name: "Bimbollos",
        quantity: 20,
        status: "matched",
        action: "match_existing",
        matchedStoreProductId: "sp-2",
      },
    ],
    [
      {
        id: "next-1",
        lineNumber: 1,
        rawText: "Roles Canela",
        name: "Roles Canela",
        quantity: 40,
        status: "matched",
        action: "match_existing",
        matchedStoreProductId: "sp-3",
      },
    ],
  );

  expect(merged.map((row) => ({ id: row.id, lineNumber: row.lineNumber }))).toEqual([
    { id: "existing-1", lineNumber: 1 },
    { id: "existing-2", lineNumber: 2 },
    { id: "next-1", lineNumber: 3 },
  ]);
});

test("finds an inventory draft row by spoken product name", () => {
  const rows = [
    resolveInventoryRowState({
      id: "row-1",
      lineNumber: 1,
      rawText: "Pan Blanco, 100",
      name: "Pan Blanco",
      quantity: 100,
      status: "matched",
      action: "match_existing",
      matchedStoreProductId: "sp-pan-blanco",
    }),
    resolveInventoryRowState({
      id: "row-2",
      lineNumber: 2,
      rawText: "Panque Nuez, 10",
      name: "Panque Nuez",
      quantity: 10,
      status: "matched",
      action: "match_existing",
      matchedStoreProductId: "sp-panque-nuez",
    }),
  ];

  const match = findInventoryDraftRowByQuery(rows, "el panque de nuez");

  expect(match.status).toBe("matched");
  if (match.status !== "matched") {
    throw new Error("Expected row match");
  }
  expect(match.row.id).toBe("row-2");
});

test("finds a row when the model keeps correction words in the query", () => {
  const rows = [
    resolveInventoryRowState({
      id: "row-2",
      lineNumber: 2,
      rawText: "Panque Nuez, 10",
      name: "Panque Nuez",
      quantity: 10,
      status: "matched",
      action: "match_existing",
      matchedStoreProductId: "sp-panque-nuez",
    }),
  ];

  const match = findInventoryDraftRowByQuery(rows, "corrige el panque de nuez son 15 unidades");

  expect(match.status).toBe("matched");
});

test("applies quantity correction to a matched inventory row", () => {
  const row = resolveInventoryRowState({
    id: "row-2",
    lineNumber: 2,
    rawText: "Panque Nuez, 10",
    name: "Panque Nuez",
    quantity: 10,
    status: "matched",
    action: "match_existing",
    matchedStoreProductId: "sp-panque-nuez",
  });

  const corrected = applyInventoryDraftRowPatch(row, { quantity: 15 });

  expect(corrected.quantity).toBe(15);
  expect(corrected.status).toBe("matched");
  expect(corrected.action).toBe("match_existing");
});

test("reports ambiguous inventory row matches", () => {
  const rows = [
    resolveInventoryRowState({
      id: "row-1",
      lineNumber: 1,
      rawText: "Panque Nuez, 10",
      name: "Panque Nuez",
      quantity: 10,
      status: "matched",
      action: "match_existing",
      matchedStoreProductId: "sp-panque-nuez",
    }),
    resolveInventoryRowState({
      id: "row-2",
      lineNumber: 2,
      rawText: "Panque Marmoleado, 8",
      name: "Panque Marmoleado",
      quantity: 8,
      status: "matched",
      action: "match_existing",
      matchedStoreProductId: "sp-panque-marmoleado",
    }),
  ];

  const match = findInventoryDraftRowByQuery(rows, "panque");

  expect(match.status).toBe("ambiguous");
});

test("parses spoken quantity correction text", () => {
  expect(parseInventoryQuantityCorrection("corrige el panque de nuez son 15 unidades")).toEqual({
    query: "panque de nuez",
    quantity: 15,
  });
});

test("parses single correction with quantity and price", () => {
  const corrections = parseInventoryCorrections("cambia el panque de nuez a 15 piezas y precio 25");
  expect(corrections).toHaveLength(1);
  expect(corrections[0]).toEqual({
    query: "panque de nuez",
    quantity: 15,
    price: 25,
  });
});

test("parses multiple quantity corrections in one message", () => {
  const corrections = parseInventoryCorrections("el panque de nuez son 15 y el refresco son 20");
  expect(corrections).toHaveLength(2);
  expect(corrections[0]).toEqual({ query: "panque de nuez", quantity: 15 });
  expect(corrections[1]).toEqual({ query: "refresco", quantity: 20 });
});

test("parses multiple corrections with mixed quantity and price", () => {
  const corrections = parseInventoryCorrections(
    "cambia el panque de nuez a 15 piezas y precio 25, y el refresco a 20 unidades"
  );
  expect(corrections).toHaveLength(2);
  expect(corrections[0]).toEqual({ query: "panque de nuez", quantity: 15, price: 25 });
  expect(corrections[1]).toEqual({ query: "refresco", quantity: 20 });
});

test("parses audio-style multi-correction with prices", () => {
  const corrections = parseInventoryCorrections(
    "corrige el panque de nuez son 15 piezas precio 25 pesos y el pan molido son 10 unidades precio 18"
  );
  expect(corrections).toHaveLength(2);
  expect(corrections[0]).toEqual({ query: "panque de nuez", quantity: 15, price: 25 });
  expect(corrections[1]).toEqual({ query: "pan molido", quantity: 10, price: 18 });
});

test("returns empty array when no corrections are found", () => {
  expect(parseInventoryCorrections("hola como estas")).toHaveLength(0);
});

test("backward compat: parseInventoryQuantityCorrection still works", () => {
  const result = parseInventoryQuantityCorrection("corrige las galletas son 30 unidades");
  expect(result).toEqual({ query: "galletas", quantity: 30 });
});
