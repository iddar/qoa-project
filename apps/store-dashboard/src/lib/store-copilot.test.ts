import { describe, expect, test } from "bun:test";
import { buildCopilotActions, extractRequestedOrderItems, getInitialCopilotActions, getProductMatchScore, planRequestedOrderItems, resolvePendingProductChoiceSelection } from "@/lib/store-copilot";

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

  test("builds variant actions when there are pending product choices", () => {
    const actions = buildCopilotActions({
      items: [],
      customer: null,
      lastTransaction: null,
      pendingProductChoices: [
        { storeProductId: "cola", name: "Refresco Cola 600 ml", price: 18, score: 0.88 },
        { storeProductId: "lima", name: "Refresco Lima-Limon 600 ml", price: 18, score: 0.86 },
      ],
    });

    expect(actions.map((action) => action.label)).toEqual([
      "Refresco Cola 600 ml",
      "Refresco Lima-Limon 600 ml",
    ]);
  });

  test("builds deterministic draft actions for a non-empty cart", () => {
    const actions = buildCopilotActions({
      items: [
        {
          storeProductId: "cola",
          name: "Refresco Cola 600 ml",
          price: 18,
          quantity: 2,
        },
      ],
      customer: null,
      lastTransaction: null,
      pendingProductChoices: [],
    });

    expect(actions.map((action) => action.label)).toEqual([
      "Ligar tarjeta",
      "Confirmar venta",
      "Vaciar pedido",
    ]);
  });

  test("returns welcome actions for the first assistant message", () => {
    const actions = getInitialCopilotActions();
    expect(actions).toHaveLength(3);
    expect(actions.some((action) => action.label === "Confirmar venta")).toBe(false);
    expect(actions.find((action) => action.label === "Ligar tarjeta")?.kind).toBe("capture-qr");
  });

  test("extracts multiple requested items and quantities from a single order", () => {
    expect(extractRequestedOrderItems("Quiero un refresco de limon y una papas de chile.")).toEqual([
      { query: "refresco de limon", quantity: 1 },
      { query: "papas de chile", quantity: 1 },
    ]);
  });

  test("extracts numeric quantities from direct add commands", () => {
    expect(extractRequestedOrderItems("dame 3 refrescos de cola")).toEqual([
      { query: "refrescos de cola", quantity: 3 },
    ]);
  });

  test("plans a full order when each request has a single confident match", () => {
    const plan = planRequestedOrderItems("Quiero un refresco de limon y una papas de chile.", [
      { id: "cola", name: "Refresco Cola 600 ml", price: 18 },
      { id: "lima", name: "Refresco Lima-Limon 600 ml", price: 18 },
      { id: "papas-chile", name: "Papas Chile y Limon 45 g", price: 17 },
      { id: "chocolate", name: "Barra de Chocolate 40 g", price: 20 },
    ]);

    expect(plan.unresolved).toHaveLength(0);
    expect(plan.resolved).toHaveLength(2);
    expect(plan.resolved[0]?.match.product.id).toBe("lima");
    expect(plan.resolved[0]?.request.quantity).toBe(1);
    expect(plan.resolved[1]?.match.product.id).toBe("papas-chile");
  });

  test("plans quantity-preserving cola orders without confirmation", () => {
    const plan = planRequestedOrderItems("dame 3 refrescos de cola", [
      { id: "cola", name: "Refresco Cola 600 ml", price: 18 },
      { id: "naranja", name: "Refresco Naranja 600 ml", price: 18 },
    ]);

    expect(plan.unresolved).toHaveLength(0);
    expect(plan.resolved).toHaveLength(1);
    expect(plan.resolved[0]?.match.product.id).toBe("cola");
    expect(plan.resolved[0]?.request.quantity).toBe(3);
  });
});
