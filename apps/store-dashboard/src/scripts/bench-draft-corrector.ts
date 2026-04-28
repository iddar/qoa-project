import { parseInventoryCorrections } from "@/lib/store-inventory";
import { extractInventoryCorrectionsWithLLM } from "@/lib/inventory-correction-extraction";
import { extractDraftCorrectionsWithContext } from "@/lib/inventory-draft-corrector";
import { resolveInventoryRowState } from "@/lib/store-inventory";
import type { InventoryDraftRow } from "@/lib/store-inventory";

const makeRow = (name: string, quantity: number, price?: number): InventoryDraftRow =>
  resolveInventoryRowState({
    id: crypto.randomUUID(),
    lineNumber: 1,
    rawText: name,
    name,
    quantity,
    price,
    status: "matched",
    action: "match_existing",
    matchedStoreProductId: "sp-test",
  });

const TEST_CASES = [
  {
    name: "single quantity",
    draft: [makeRow("Panque Nuez", 10, 20)],
    input: "corrige el panque de nuez son 15 unidades",
    expected: [{ rowName: "Panque Nuez", quantity: 15 }],
  },
  {
    name: "quantity + price",
    draft: [makeRow("Panque Nuez", 10, 20)],
    input: "cambia el panque de nuez a 15 piezas y precio 25",
    expected: [{ rowName: "Panque Nuez", quantity: 15, price: 25 }],
  },
  {
    name: "multiple products",
    draft: [makeRow("Panque Nuez", 10), makeRow("Refresco 600ml", 5)],
    input: "el panque de nuez son 15 y el refresco son 20",
    expected: [
      { rowName: "Panque Nuez", quantity: 15 },
      { rowName: "Refresco 600ml", quantity: 20 },
    ],
  },
  {
    name: "price only",
    draft: [makeRow("Panque Nuez", 10, 20)],
    input: "cambia el precio del panque a 30 pesos",
    expected: [{ rowName: "Panque Nuez", price: 30 }],
  },
  {
    name: "natural speech fuzzy",
    draft: [makeRow("Panque Nuez", 10, 20)],
    input: "mira el panque de nuez no son 10 son 12 y subele el precio a 28",
    expected: [{ rowName: "Panque Nuez", quantity: 12, price: 28 }],
  },
  {
    name: "ambiguous product name",
    draft: [makeRow("Panque Nuez", 10), makeRow("Panque Marmoleado", 8)],
    input: "el panque de nuez son 15",
    expected: [{ rowName: "Panque Nuez", quantity: 15 }],
  },
];

const scoreResult = (
  actual: Array<{ rowId?: string; quantity?: number; price?: number; productQuery?: string }>,
  expected: Array<{ rowName: string; quantity?: number; price?: number }>,
  draft: InventoryDraftRow[],
) => {
  let score = 0;
  let max = 0;

  for (const exp of expected) {
    max += 1 + (exp.quantity !== undefined ? 1 : 0) + (exp.price !== undefined ? 1 : 0);
    const matched = actual.find((a) => {
      const row = draft.find((r) => r.id === a.rowId);
      if (row) return row.name === exp.rowName;
      // Fallback for regex/LLM generic
      const query = (a.productQuery ?? "").toLowerCase();
      return query.includes(exp.rowName.toLowerCase()) || exp.rowName.toLowerCase().includes(query);
    });
    if (matched) {
      score += 1;
      if (exp.quantity !== undefined) score += (matched.quantity === exp.quantity ? 1 : 0);
      if (exp.price !== undefined) score += (matched.price === exp.price ? 1 : 0);
    }
  }

  return { score, max };
};

const runRegex = async () => {
  console.log("=== REGEX (sin contexto) ===\n");
  let totalScore = 0;
  let totalMax = 0;

  for (const testCase of TEST_CASES) {
    const start = Date.now();
    const actual = parseInventoryCorrections(testCase.input);
    const elapsed = Date.now() - start;
    const { score, max } = scoreResult(actual, testCase.expected, testCase.draft);

    console.log(`${testCase.name} (${elapsed}ms): ${score}/${max}`);
    console.log(`  Input: "${testCase.input}"`);
    console.log(`  Expected: ${JSON.stringify(testCase.expected)}`);
    console.log(`  Actual:   ${JSON.stringify(actual)}\n`);

    totalScore += score;
    totalMax += max;
  }

  console.log(`TOTAL: ${totalScore}/${totalMax} (${((totalScore / totalMax) * 100).toFixed(1)}%)\n`);
  return { totalScore, totalMax };
};

const runLLMGeneric = async () => {
  console.log("=== LLM GENERICO (sin contexto) ===\n");
  let totalScore = 0;
  let totalMax = 0;

  for (const testCase of TEST_CASES) {
    const start = Date.now();
    try {
      const actual = await extractInventoryCorrectionsWithLLM(testCase.input);
      const elapsed = Date.now() - start;
      const { score, max } = scoreResult(actual, testCase.expected, testCase.draft);

      console.log(`${testCase.name} (${elapsed}ms): ${score}/${max}`);
      console.log(`  Input: "${testCase.input}"`);
      console.log(`  Expected: ${JSON.stringify(testCase.expected)}`);
      console.log(`  Actual:   ${JSON.stringify(actual)}\n`);

      totalScore += score;
      totalMax += max;
    } catch (error) {
      console.log(`${testCase.name}: ERROR — ${error instanceof Error ? error.message : String(error)}\n`);
      totalMax += testCase.expected.reduce((s, e) => s + 1 + (e.quantity !== undefined ? 1 : 0) + (e.price !== undefined ? 1 : 0), 0);
    }
  }

  console.log(`TOTAL: ${totalScore}/${totalMax} (${((totalScore / totalMax) * 100).toFixed(1)}%)\n`);
  return { totalScore, totalMax };
};

const runLLMWithContext = async () => {
  console.log("=== LLM CON CONTEXTO DEL DRAFT ===\n");
  let totalScore = 0;
  let totalMax = 0;

  for (const testCase of TEST_CASES) {
    const start = Date.now();
    try {
      const actual = await extractDraftCorrectionsWithContext(testCase.input, testCase.draft);
      const elapsed = Date.now() - start;
      const { score, max } = scoreResult(actual, testCase.expected, testCase.draft);

      console.log(`${testCase.name} (${elapsed}ms): ${score}/${max}`);
      console.log(`  Input: "${testCase.input}"`);
      console.log(`  Expected: ${JSON.stringify(testCase.expected)}`);
      console.log(`  Actual:   ${JSON.stringify(actual)}\n`);

      totalScore += score;
      totalMax += max;
    } catch (error) {
      console.log(`${testCase.name}: ERROR — ${error instanceof Error ? error.message : String(error)}\n`);
      totalMax += testCase.expected.reduce((s, e) => s + 1 + (e.quantity !== undefined ? 1 : 0) + (e.price !== undefined ? 1 : 0), 0);
    }
  }

  console.log(`TOTAL: ${totalScore}/${totalMax} (${((totalScore / totalMax) * 100).toFixed(1)}%)\n`);
  return { totalScore, totalMax };
};

const main = async () => {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY no está configurado.");
    process.exit(1);
  }

  const regex = await runRegex();
  const llmGeneric = await runLLMGeneric();
  const llmContext = await runLLMWithContext();

  console.log("=== COMPARATIVA ===");
  console.log(`Regex:           ${regex.totalScore}/${regex.totalMax} (${((regex.totalScore / regex.totalMax) * 100).toFixed(1)}%) — 0ms`);
  console.log(`LLM Genérico:    ${llmGeneric.totalScore}/${llmGeneric.totalMax} (${((llmGeneric.totalScore / llmGeneric.totalMax) * 100).toFixed(1)}%) — lento, alucina`);
  console.log(`LLM + Contexto:  ${llmContext.totalScore}/${llmContext.totalMax} (${((llmContext.totalScore / llmContext.totalMax) * 100).toFixed(1)}%) — preciso, conoce universo`);

  if (llmContext.totalScore >= regex.totalScore && llmContext.totalScore >= llmGeneric.totalScore) {
    console.log("\n✅ LLM con contexto del draft es la mejor opción.");
  } else if (regex.totalScore >= llmContext.totalScore) {
    console.log("\n⚠️ Regex sigue siendo más preciso pero frágil. LLM con contexto es buen fallback.");
  }
};

main();
