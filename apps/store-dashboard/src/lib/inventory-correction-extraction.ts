import { generateObject } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

const extractionSchema = z.object({
  corrections: z.array(
    z.object({
      productQuery: z
        .string()
        .describe("Nombre del producto tal como aparece o se refiere en el mensaje"),
      quantity: z
        .number()
        .optional()
        .describe("Cantidad de unidades si se menciona, null si no"),
      price: z
        .number()
        .optional()
        .describe("Precio de venta si se menciona, null si no"),
    }),
  ),
});

export type InventoryCorrectionExtraction = {
  productQuery: string;
  quantity?: number;
  price?: number;
};

export const extractInventoryCorrectionsWithLLM = async (
  text: string,
  options?: { model?: string },
): Promise<InventoryCorrectionExtraction[]> => {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_NOT_CONFIGURED");
  }

  const { object } = await generateObject({
    model: openrouter(options?.model ?? process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash"),
    schema: extractionSchema,
    system: [
      "Eres un extractor de correcciones de inventario para tenderos mexicanos.",
      "Tu trabajo es leer un mensaje breve del tendero y extraer qué productos quiere corregir.",
      "Para cada producto extrae:",
      "- productQuery: el nombre del producto tal como se menciona",
      "- quantity: la cantidad en unidades (solo si se menciona explícitamente)",
      "- price: el precio de venta (solo si se menciona explícitamente)",
      "",
      "Reglas:",
      "- Si el mensaje dice 'son 15' o 'a 20 unidades', extrae quantity.",
      "- Si dice 'precio 25' o 'a $18 pesos', extrae price.",
      "- Si un producto tiene ambos, extrae ambos.",
      "- Si hay múltiples productos en un mensaje, extrae todos.",
      "- Ignora saludos, despedidas y texto irrelevante.",
      "- Si no hay correcciones, devuelve un array vacío.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: text,
      },
    ],
  });

  return object.corrections.map((c) => ({
    productQuery: c.productQuery.trim(),
    quantity: c.quantity,
    price: c.price,
  }));
};
