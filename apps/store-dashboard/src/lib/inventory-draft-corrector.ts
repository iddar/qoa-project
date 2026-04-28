import { generateObject } from "ai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import type { InventoryDraftRow } from "@/lib/store-inventory";

const correctionSchema = z.object({
  changes: z.array(
    z.object({
      targetName: z
        .string()
        .describe("Nombre de la fila tal como aparece en el borrador, exactamente"),
      newQuantity: z
        .number()
        .optional()
        .describe("Nueva cantidad si se menciona, omitir si no cambia"),
      newPrice: z
        .number()
        .optional()
        .describe("Nuevo precio si se menciona, omitir si no cambia"),
    }),
  ),
});

export type DraftCorrection = {
  rowId: string;
  quantity?: number;
  price?: number;
};

export const extractDraftCorrectionsWithContext = async (
  text: string,
  rows: InventoryDraftRow[],
  options?: { model?: string },
): Promise<DraftCorrection[]> => {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_NOT_CONFIGURED");
  }

  if (rows.length === 0) {
    return [];
  }

  const draftContext = rows
    .map(
      (row) =>
        `- "${row.name}" (línea ${row.lineNumber}): cantidad=${row.quantity}${row.price !== undefined ? `, precio=${row.price}` : ""}`,
    )
    .join("\n");

  const { object } = await generateObject({
    model: openrouter(
      options?.model ?? process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash",
    ),
    schema: correctionSchema,
    system: [
      "Eres un asistente de inventario que aplica correcciones a un borrador existente.",
      "",
      "REGLAS:",
      "- Solo puedes modificar filas que existen en el borrador.",
      "- No inventes productos nuevos.",
      "- El targetName debe ser EXACTAMENTE uno de los nombres listados abajo.",
      "- Si el usuario se refiere a un producto de forma diferente (ej. 'panque nuez' → 'Panque Nuez'), mapea al nombre correcto del borrador.",
      "- Si no hay cambios claros, devuelve un array vacío.",
      "- Cantidad y precio son independientes: puedes cambiar ambos, solo uno, o ninguno.",
      "",
      "BORRADOR ACTUAL:",
      draftContext,
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: text,
      },
    ],
  });

  const results: DraftCorrection[] = [];

  for (const change of object.changes) {
    const matched = rows.find(
      (row) =>
        row.name.toLowerCase().trim() === change.targetName.toLowerCase().trim(),
    );
    if (!matched) continue;

    const patch: DraftCorrection = { rowId: matched.id };
    if (change.newQuantity !== undefined) patch.quantity = change.newQuantity;
    if (change.newPrice !== undefined) patch.price = change.newPrice;

    if (patch.quantity !== undefined || patch.price !== undefined) {
      results.push(patch);
    }
  }

  return results;
};
