import { expect, test } from "bun:test";
import { getStockLimitedQuantity } from "./store-pos";

test("limits POS quantities to available stock", () => {
  expect(getStockLimitedQuantity(3, 5)).toBe(3);
  expect(getStockLimitedQuantity(8, 5)).toBe(5);
  expect(getStockLimitedQuantity(1, 0)).toBe(0);
});

test("keeps POS quantity behavior unrestricted when stock is unknown", () => {
  expect(getStockLimitedQuantity(8)).toBe(8);
});
