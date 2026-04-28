import { parseInventoryCorrections } from "@/lib/store-inventory";
import { extractInventoryCorrectionsWithLLM } from "@/lib/inventory-correction-extraction";

const TEST_CASES = [
  {
    name: "single quantity",
    input: "corrige el panque de nuez son 15 unidades",
    expected: [{ query: "panque de nuez", quantity: 15 }],
  },
  {
    name: "quantity + price",
    input: "cambia el panque de nuez a 15 piezas y precio 25",
    expected: [{ query: "panque de nuez", quantity: 15, price: 25 }],
  },
  {
    name: "multiple quantities",
    input: "el panque de nuez son 15 y el refresco son 20",
    expected: [
      { query: "panque de nuez", quantity: 15 },
      { query: "refresco", quantity: 20 },
    ],
  },
  {
    name: "multiple mixed",
    input: "cambia el panque de nuez a 15 piezas y precio 25, y el refresco a 20 unidades",
    expected: [
      { query: "panque de nuez", quantity: 15, price: 25 },
      { query: "refresco", quantity: 20 },
    ],
  },
  {
    name: "audio style multi",
    input: "corrige el panque de nuez son 15 piezas precio 25 pesos y el pan molido son 10 unidades precio 18",
    expected: [
      { query: "panque de nuez", quantity: 15, price: 25 },
      { query: "pan molido", quantity: 10, price: 18 },
    ],
  },
  {
    name: "no corrections",
    input: "hola como estas",
    expected: [],
  },
  {
    name: "price only",
    input: "cambia el precio del panque a 30 pesos",
    expected: [{ query: "panque", price: 30 }],
  },
  {
    name: "natural speech",
    input: "mira el panque de nuez no son 10 son 12 y subele el precio a 28",
    expected: [{ query: "panque de nuez", quantity: 12, price: 28 }],
  },
];

const normalizeQuery = (q: string) =>
  q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const scoreMatch = (actual: { productQuery?: string; query?: string; quantity?: number; price?: number }, expected: { query: string; quantity?: number; price?: number }) => {
  const actualQuery = normalizeQuery(actual.productQuery ?? actual.query ?? "");
  const expectedQuery = normalizeQuery(expected.query);
  const queryScore = actualQuery.includes(expectedQuery) || expectedQuery.includes(actualQuery) ? 1 : 0;
  const qtyScore = expected.quantity !== undefined ? (actual.quantity === expected.quantity ? 1 : 0) : 1;
  const priceScore = expected.price !== undefined ? (actual.price === expected.price ? 1 : 0) : 1;
  return { queryScore, qtyScore, priceScore, total: queryScore + qtyScore + priceScore };
};

const runRegex = async () => {
  console.log("=== REGEX PARSER ===\n");
  let totalScore = 0;
  let maxScore = 0;

  for (const testCase of TEST_CASES) {
    const actual = parseInventoryCorrections(testCase.input);
    const caseMax = testCase.expected.reduce((sum, e) => sum + 1 + (e.quantity !== undefined ? 1 : 0) + (e.price !== undefined ? 1 : 0), 0);
    let caseScore = 0;

    console.log(`Test: ${testCase.name}`);
    console.log(`  Input: "${testCase.input}"`);
    console.log(`  Expected: ${JSON.stringify(testCase.expected)}`);
    console.log(`  Actual:   ${JSON.stringify(actual)}`);

    for (const expected of testCase.expected) {
      const bestMatch = actual
        .map((a) => ({ a, score: scoreMatch(a, expected) }))
        .sort((l, r) => r.score.total - l.score.total)[0];
      if (bestMatch) {
        caseScore += bestMatch.score.total;
      }
    }

    totalScore += caseScore;
    maxScore += caseMax;
    console.log(`  Score: ${caseScore}/${caseMax}\n`);
  }

  console.log(`REGEX TOTAL: ${totalScore}/${maxScore} (${((totalScore / maxScore) * 100).toFixed(1)}%)\n`);
  return { totalScore, maxScore };
};

const runLLM = async () => {
  console.log("=== LLM PARSER ===\n");
  let totalScore = 0;
  let maxScore = 0;

  for (const testCase of TEST_CASES) {
    const start = Date.now();
    try {
      const actual = await extractInventoryCorrectionsWithLLM(testCase.input);
      const elapsed = Date.now() - start;
      const caseMax = testCase.expected.reduce((sum, e) => sum + 1 + (e.quantity !== undefined ? 1 : 0) + (e.price !== undefined ? 1 : 0), 0);
      let caseScore = 0;

      console.log(`Test: ${testCase.name} (${elapsed}ms)`);
      console.log(`  Input: "${testCase.input}"`);
      console.log(`  Expected: ${JSON.stringify(testCase.expected)}`);
      console.log(`  Actual:   ${JSON.stringify(actual)}`);

      for (const expected of testCase.expected) {
        const bestMatch = actual
          .map((a) => ({ a, score: scoreMatch(a, expected) }))
          .sort((l, r) => r.score.total - l.score.total)[0];
        if (bestMatch) {
          caseScore += bestMatch.score.total;
        }
      }

      totalScore += caseScore;
      maxScore += caseMax;
      console.log(`  Score: ${caseScore}/${caseMax}\n`);
    } catch (error) {
      console.log(`Test: ${testCase.name} — ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  console.log(`LLM TOTAL: ${totalScore}/${maxScore} (${((totalScore / maxScore) * 100).toFixed(1)}%)\n`);
  return { totalScore, maxScore };
};

const main = async () => {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY no está configurado. Solo corriendo regex...");
    await runRegex();
    process.exit(1);
  }

  const regexResults = await runRegex();
  const llmResults = await runLLM();

  console.log("=== COMPARISON ===");
  console.log(`Regex: ${regexResults.totalScore}/${regexResults.maxScore} (${((regexResults.totalScore / regexResults.maxScore) * 100).toFixed(1)}%)`);
  console.log(`LLM:   ${llmResults.totalScore}/${llmResults.maxScore} (${((llmResults.totalScore / llmResults.maxScore) * 100).toFixed(1)}%)`);

  if (llmResults.totalScore >= regexResults.totalScore) {
    console.log("\n✅ LLM es igual o mejor que regex. Se recomienda usar LLM como parser principal.");
  } else {
    console.log("\n⚠️  Regex supera al LLM en estos casos. Mantener regex con LLM como fallback opcional.");
  }
};

main();
