import { expect, test } from "bun:test";
import { canConfirmInventoryDraft, createEmptyInventoryDraft, createInventoryIntakeIdempotencyKey, resolveInventoryRowState } from "@/lib/store-inventory";

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
