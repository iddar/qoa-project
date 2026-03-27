import { describe, expect, test } from "bun:test";
import { getProductMatchScore, resolvePendingProductChoiceSelection } from "@/lib/store-copilot";

describe("store copilot product matching", () => {
  test("matches misspelled product names strongly enough", () => {
    const score = getProductMatchScore("galletas de baidilla", {
      id: "vainilla",
      name: "Galletas Vainilla 90 g",
      price: 22,
    });

    expect(score).toBeGreaterThan(0.72);
  });

  test("resolves short follow-up selection against pending choices", () => {
    const result = resolvePendingProductChoiceSelection(
      [
        { storeProductId: "cola", name: "Refresco Cola 600 ml", price: 18, score: 0.88 },
        { storeProductId: "lima", name: "Refresco Lima-Limon 600 ml", price: 18, score: 0.86 },
        { storeProductId: "naranja", name: "Refresco Naranja 600 ml", price: 18, score: 0.84 },
      ],
      "lima",
    );

    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.choice.storeProductId).toBe("lima");
    }
  });

  test("keeps asking when follow-up choice is still ambiguous", () => {
    const result = resolvePendingProductChoiceSelection(
      [
        { storeProductId: "clasicas", name: "Papas Clasicas 45 g", price: 17, score: 0.78 },
        { storeProductId: "limon", name: "Papas Chile y Limon 45 g", price: 17, score: 0.77 },
      ],
      "papas",
    );

    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.reason).toBe("needs_confirmation");
      expect(result.candidates.length).toBe(2);
    }
  });
});
