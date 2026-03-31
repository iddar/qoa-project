import { openrouter } from "@openrouter/ai-sdk-provider";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";
import {
  buildCopilotActions,
  filterRankedProductsByCategoryHint,
  hasConfidentSingleProductMatch,
  inferProductCategoryHint,
  normalizeText,
  rankProductsByQuery,
  resolvePendingProductChoiceSelection,
  type RankedProductCandidate,
} from "@/lib/store-copilot";
import {
  createEmptyDraft,
  getDraftTotal,
  type AgentAction,
  type AgentAddedItem,
  type AgentMessage,
  type DraftPendingProductChoice,
  type StorePosDraft,
} from "@/lib/store-pos";

type StoreProduct = {
  id: string;
  productId: string;
  name: string;
  sku?: string;
  price: number;
  unitType?: string;
};

type ToolExecution = {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
};

type TurnResult = {
  assistantMessage: AgentMessage;
  draft: StorePosDraft;
  toolExecutions: ToolExecution[];
};

type Scenario = {
  id: string;
  description: string;
  turns: string[];
  evaluate: (results: TurnResult[]) => string[];
};

type ScenarioRun = {
  scenarioId: string;
  promptVariantId: string;
  temperature: number;
  run: number;
  passed: boolean;
  failures: string[];
  transcript: Array<{
    user: string;
    assistant: string;
    actions: string[];
    pendingChoices: string[];
    items: Array<{ name: string; quantity: number }>;
    toolExecutions: ToolExecution[];
  }>;
};

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
const DEFAULT_RUNS = Number(process.env.MATRIX_RUNS ?? "5");
const DEFAULT_TEMPERATURES = (process.env.MATRIX_TEMPERATURES ?? "0,0.2,0.5,0.8")
  .split(",")
  .map((entry) => Number(entry.trim()))
  .filter((value) => Number.isFinite(value));

type PromptVariant = {
  id: string;
  description: string;
  buildSystemPrompt: (draft: StorePosDraft) => string;
};

const STORE_PRODUCTS: StoreProduct[] = [
  {
    id: "sp-cola-600",
    productId: "p-cola-600",
    name: "Refresco Cola 600 ml (staging)",
    sku: "REF-COLA-600",
    price: 18,
    unitType: "pieza",
  },
  {
    id: "sp-limon-600",
    productId: "p-limon-600",
    name: "Refresco Lima-Limon 600 ml (staging)",
    sku: "REF-LIMA-600",
    price: 18,
    unitType: "pieza",
  },
  {
    id: "sp-papas-chile-limon",
    productId: "p-papas-chile-limon",
    name: "Papas Chile y Limon 45 g (staging)",
    sku: "PAP-CHL-LIM-45",
    price: 16,
    unitType: "pieza",
  },
  {
    id: "sp-papas-clasicas",
    productId: "p-papas-clasicas",
    name: "Papas Clasicas 45 g (staging)",
    sku: "PAP-CLA-45",
    price: 16,
    unitType: "pieza",
  },
  {
    id: "sp-papas-sal-limon",
    productId: "p-papas-sal-limon",
    name: "Papas Limon y Sal 45 g (staging)",
    sku: "PAP-LIM-SAL-45",
    price: 16,
    unitType: "pieza",
  },
];

const cloneDraft = (draft: StorePosDraft): StorePosDraft => ({
  items: draft.items.map((item) => ({ ...item })),
  customer: draft.customer ? { ...draft.customer } : null,
  lastTransaction: draft.lastTransaction
    ? {
        ...draft.lastTransaction,
        customer: draft.lastTransaction.customer ? { ...draft.lastTransaction.customer } : undefined,
        accumulations: draft.lastTransaction.accumulations.map((entry) => ({ ...entry })),
        items: draft.lastTransaction.items.map((item) => ({ ...item })),
      }
    : null,
  pendingProductChoices: draft.pendingProductChoices?.map((entry) => ({ ...entry })) ?? [],
  pendingProductContext: draft.pendingProductContext ? { ...draft.pendingProductContext } : null,
});

const buildDraftSummary = (draft: StorePosDraft) => {
  const lines = draft.items.map((item) => `- ${item.quantity} x ${item.name} ($${item.price})`);
  const customer = draft.customer ? `Cliente ligado: ${draft.customer.name ?? draft.customer.phone}` : "Sin cliente ligado.";
  const pending = draft.pendingProductChoices?.length
    ? `Pendientes: ${draft.pendingProductChoices.map((choice) => choice.name).join(", ")}`
    : "Sin opciones pendientes.";
  const pendingContext = draft.pendingProductContext
    ? `Contexto pendiente: ${draft.pendingProductContext.originalQuery}${draft.pendingProductContext.categoryHint ? ` (${draft.pendingProductContext.categoryHint})` : ""}`
    : "Sin contexto pendiente.";
  return [
    customer,
    lines.length > 0 ? `Pedido actual:\n${lines.join("\n")}` : "Pedido actual vacio.",
    `Total: $${getDraftTotal(draft)}`,
    pending,
    pendingContext,
  ].join("\n");
};

const getStoreProducts = async () => STORE_PRODUCTS;

const findStoreProductById = async (storeProductId: string) => STORE_PRODUCTS.find((product) => product.id === storeProductId) ?? null;

const rankStoreProducts = async (query: string) => rankProductsByQuery(query, STORE_PRODUCTS) as RankedProductCandidate<StoreProduct>[];

const collectAddedItemsFromDraftDiff = (beforeDraft: StorePosDraft, afterDraft: StorePosDraft): AgentAddedItem[] => {
  const previousItemsById = new Map(beforeDraft.items.map((item) => [item.storeProductId, item]));
  const addedItems: AgentAddedItem[] = [];

  for (const currentItem of afterDraft.items) {
    const previousItem = previousItemsById.get(currentItem.storeProductId);
    const quantityDelta = currentItem.quantity - (previousItem?.quantity ?? 0);
    if (quantityDelta > 0) {
      addedItems.push({
        storeProductId: currentItem.storeProductId,
        name: currentItem.name,
        quantity: quantityDelta,
        unitPrice: currentItem.price,
        lineTotal: currentItem.price * quantityDelta,
      });
    }
  }

  return addedItems;
};

const listActionLabels = (actions?: AgentAction[]) => (actions ?? []).map((action) => action.label);

const scenarioContainsOnlyPapasActions = (actions?: AgentAction[]) => {
  const labels = listActionLabels(actions);
  return labels.length > 0 && labels.every((label) => normalizeText(label).includes("papas"));
};

const hasItem = (draft: StorePosDraft, productName: string, quantity?: number) => {
  const item = draft.items.find((entry) => entry.name === productName);
  if (!item) {
    return false;
  }
  return quantity ? item.quantity === quantity : true;
};

const SCENARIOS: Scenario[] = [
  {
    id: "ambiguous-followup-limon-chile",
    description: "Agrega cola y luego aclara papas chile y limon",
    turns: [
      "agrega un refresco de cola y unas papas con limon y sal",
      "tienes razon limon y chile",
    ],
    evaluate: (results) => {
      const failures: string[] = [];
      const [firstTurn, secondTurn] = results;
      if (!firstTurn) {
        return ["missing_first_turn"];
      }

      if (!hasItem(firstTurn.draft, "Refresco Cola 600 ml (staging)", 1)) {
        failures.push("turn1_missing_cola");
      }

      if ((firstTurn.draft.pendingProductChoices?.length ?? 0) === 0) {
        failures.push("turn1_missing_pending_choices");
      }

      const pendingNames = new Set((firstTurn.draft.pendingProductChoices ?? []).map((choice) => choice.name));
      const actionNames = listActionLabels(firstTurn.assistantMessage.actions);
      if (actionNames.length === 0 || actionNames.some((label) => !pendingNames.has(label))) {
        failures.push("turn1_actions_not_pending_choices");
      }

      if (!scenarioContainsOnlyPapasActions(firstTurn.assistantMessage.actions)) {
        failures.push("turn1_actions_not_papas_only");
      }

      if (!secondTurn) {
        failures.push("missing_second_turn");
        return failures;
      }

      if (!hasItem(secondTurn.draft, "Papas Chile y Limon 45 g (staging)", 1)) {
        failures.push("turn2_missing_chile_limon_papas");
      }

      if ((secondTurn.draft.pendingProductChoices?.length ?? 0) > 0) {
        failures.push("turn2_pending_choices_not_cleared");
      }

      return failures;
    },
  },
  {
    id: "ambiguous-papas-clasicas",
    description: "Pide papas y luego escoge clasicas",
    turns: ["agrega unas papas", "clasicas"],
    evaluate: (results) => {
      const failures: string[] = [];
      const [firstTurn, secondTurn] = results;
      if (!firstTurn) {
        return ["missing_first_turn"];
      }

      if ((firstTurn.draft.pendingProductChoices?.length ?? 0) === 0) {
        failures.push("turn1_missing_pending_choices");
      }

      if (!scenarioContainsOnlyPapasActions(firstTurn.assistantMessage.actions)) {
        failures.push("turn1_actions_not_papas_only");
      }

      if (!secondTurn) {
        failures.push("missing_second_turn");
        return failures;
      }

      if (!hasItem(secondTurn.draft, "Papas Clasicas 45 g (staging)", 1)) {
        failures.push("turn2_missing_clasicas");
      }

      return failures;
    },
  },
  {
    id: "direct-two-limon-sodas",
    description: "Agrega dos refrescos de limon sin aclaracion",
    turns: ["agrega dos refrescos de limon"],
    evaluate: (results) => {
      const failures: string[] = [];
      const [firstTurn] = results;
      if (!firstTurn) {
        return ["missing_first_turn"];
      }

      if (!hasItem(firstTurn.draft, "Refresco Lima-Limon 600 ml (staging)", 2)) {
        failures.push("turn1_missing_two_limon_sodas");
      }

      if ((firstTurn.draft.pendingProductChoices?.length ?? 0) > 0) {
        failures.push("turn1_unexpected_pending_choices");
      }

      return failures;
    },
  },
];

const PROMPT_VARIANTS: PromptVariant[] = [
  {
    id: "baseline",
    description: "Prompt base del asistente POS",
    buildSystemPrompt: (draft) => [
      "Eres un asistente de POS para tenderos en Qoa.",
      "Responde siempre en espanol claro y breve.",
      "Usa herramientas para cambiar el pedido.",
      "Tolera errores pequenos de transcripcion o dictado en nombres de producto.",
      "Cuando el tendero pida agregar un producto por nombre, intenta primero addProductToDraftByQuery.",
      "Si acabas de ofrecer opciones de producto y el tendero responde con una palabra corta como un sabor, marca o variante, intenta primero resolvePendingProductChoice.",
      "Si una tool ya tiene suficiente informacion para agregar el producto, ejecutala sin pedir confirmacion adicional.",
      "Minimiza interacciones innecesarias: solo pide aclaracion cuando una tool devuelva varias opciones plausibles o baja confianza.",
      "Prioriza armar el pedido: si tienes suficiente informacion para agregar productos, agregalos de inmediato en vez de pedir confirmacion.",
      `Estado actual del pedido:\n${buildDraftSummary(draft)}`,
    ].join("\n\n"),
  },
  {
    id: "strict-pending-family",
    description: "Refuerza aclaraciones dentro de la misma familia de producto",
    buildSystemPrompt: (draft) => [
      "Eres un asistente de POS para tenderos en Qoa.",
      "Responde siempre en espanol claro y breve.",
      "Usa herramientas para cambiar el pedido.",
      "Tolera errores pequenos de transcripcion o dictado en nombres de producto.",
      "Cuando el tendero pida agregar un producto por nombre, intenta primero addProductToDraftByQuery.",
      "Si acabas de ofrecer opciones pendientes, mantente dentro de esa misma familia de producto al responder y al resolver la seleccion.",
      "Si el usuario ya estaba escogiendo unas papas, no mezcles refrescos ni otra categoria en la aclaracion textual.",
      "Si acabas de ofrecer opciones de producto y el tendero responde con una palabra corta como un sabor, marca o variante, intenta primero resolvePendingProductChoice.",
      "Si una tool ya tiene suficiente informacion para agregar el producto, ejecutala sin pedir confirmacion adicional.",
      "Minimiza interacciones innecesarias: solo pide aclaracion cuando una tool devuelva varias opciones plausibles o baja confianza.",
      "Prioriza armar el pedido: si tienes suficiente informacion para agregar productos, agregalos de inmediato en vez de pedir confirmacion.",
      `Estado actual del pedido:\n${buildDraftSummary(draft)}`,
    ].join("\n\n"),
  },
  {
    id: "strict-actions-and-followup",
    description: "Refuerza que la aclaracion use solo opciones pendientes y follow-ups cortos",
    buildSystemPrompt: (draft) => [
      "Eres un asistente de POS para tenderos en Qoa.",
      "Responde siempre en espanol claro y breve.",
      "Usa herramientas para cambiar el pedido.",
      "Tolera errores pequenos de transcripcion o dictado en nombres de producto.",
      "Cuando el tendero pida agregar un producto por nombre, intenta primero addProductToDraftByQuery.",
      "Si hay opciones pendientes, tu siguiente respuesta debe centrarse solo en esas opciones pendientes.",
      "No menciones ni sugieras productos fuera de las opciones pendientes cuando pidas aclaracion.",
      "Si acabas de ofrecer opciones de producto y el tendero responde con una palabra corta como un sabor, marca o variante, intenta primero resolvePendingProductChoice.",
      "Si el tendero responde con algo como 'limon y chile', 'clasicas', 'la primera' o 'esa de limon', interpreta eso como seleccion de la opcion pendiente mas probable.",
      "Si una tool ya tiene suficiente informacion para agregar el producto, ejecutala sin pedir confirmacion adicional.",
      "Minimiza interacciones innecesarias: solo pide aclaracion cuando una tool devuelva varias opciones plausibles o baja confianza.",
      `Estado actual del pedido:\n${buildDraftSummary(draft)}`,
    ].join("\n\n"),
  },
];

const runScenario = async (scenario: Scenario, promptVariant: PromptVariant, temperature: number, run: number): Promise<ScenarioRun> => {
  const workingDraft = createEmptyDraft();
  const transcriptMessages: AgentMessage[] = [];
  const turnResults: TurnResult[] = [];

  for (const userInput of scenario.turns) {
    const toolExecutions: ToolExecution[] = [];
    const turnDraftBefore = cloneDraft(workingDraft);
    const systemPrompt = promptVariant.buildSystemPrompt(workingDraft);

    const modelMessages: ModelMessage[] = [
      ...transcriptMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      {
        role: "user",
        content: userInput,
      },
    ];

    const clearPendingProductChoices = () => {
      workingDraft.pendingProductChoices = [];
      workingDraft.pendingProductContext = null;
    };

    const setPendingProductChoices = (query: string, choices: DraftPendingProductChoice[]) => {
      workingDraft.pendingProductChoices = choices;
      workingDraft.pendingProductContext = {
        originalQuery: query,
        categoryHint: inferProductCategoryHint(query) ?? undefined,
      };
    };

    const addProductToDraftById = async (storeProductId: string, quantity: number) => {
      const product = await findStoreProductById(storeProductId);
      if (!product) {
        throw new Error("STORE_PRODUCT_NOT_FOUND");
      }

      const existing = workingDraft.items.find((item) => item.storeProductId === storeProductId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        workingDraft.items.push({
          storeProductId: product.id,
          productId: product.productId,
          name: product.name,
          sku: product.sku,
          unitType: product.unitType,
          price: Number(product.price),
          quantity,
        });
      }

      clearPendingProductChoices();
      return product;
    };

    const result = await generateText({
      model: openrouter(DEFAULT_MODEL),
      temperature,
      system: systemPrompt,
      messages: modelMessages,
      stopWhen: stepCountIs(8),
      tools: {
        searchStoreProducts: tool({
          description: "Busca productos activos en el catalogo de la tienda.",
          inputSchema: z.object({ query: z.string().min(2) }),
          execute: async ({ query }) => {
            const products = await getStoreProducts();
            const ranked = rankProductsByQuery(query, products).map((entry) => ({
              storeProductId: entry.product.id,
              name: entry.product.name,
              price: Number(entry.product.price),
              score: Number(entry.score.toFixed(3)),
            }));
            const output = { products: ranked };
            toolExecutions.push({ tool: "searchStoreProducts", input: { query }, output });
            return output;
          },
        }),
        addProductToDraftByQuery: tool({
          description: "Busca el producto mas probable por nombre hablado o con errores y lo agrega si la coincidencia es suficientemente clara.",
          inputSchema: z.object({
            query: z.string().min(2),
            quantity: z.number().int().min(1).default(1),
          }),
        execute: async ({ query, quantity }) => {
            const categoryHint = inferProductCategoryHint(query);
            const ranked = filterRankedProductsByCategoryHint(await rankStoreProducts(query), categoryHint);
            const best = ranked[0];

            if (!best) {
              const output = { added: false, reason: "no_match", candidates: [] };
              toolExecutions.push({ tool: "addProductToDraftByQuery", input: { query, quantity }, output });
              return output;
            }

            if (!hasConfidentSingleProductMatch(ranked)) {
              const candidates = ranked.slice(0, 3).map((entry) => ({
                storeProductId: entry.product.id,
                name: entry.product.name,
                price: Number(entry.product.price),
                score: Number(entry.score.toFixed(3)),
              }));
              setPendingProductChoices(query, candidates);
              const output = { added: false, reason: "needs_confirmation", categoryHint: categoryHint ?? undefined, candidates };
              toolExecutions.push({ tool: "addProductToDraftByQuery", input: { query, quantity }, output });
              return output;
            }

            const addedProduct = await addProductToDraftById(best.product.id, quantity);
            const output = {
              added: true,
              matchedQuery: query,
              product: {
                storeProductId: addedProduct.id,
                name: addedProduct.name,
                price: Number(addedProduct.price),
                score: Number(best.score.toFixed(3)),
              },
              draft: buildDraftSummary(workingDraft),
            };
            toolExecutions.push({ tool: "addProductToDraftByQuery", input: { query, quantity }, output });
            return output;
          },
        }),
        resolvePendingProductChoice: tool({
          description: "Resuelve una respuesta corta del tendero usando las opciones de producto ofrecidas en el turno anterior.",
          inputSchema: z.object({
            selection: z.string().min(1),
            quantity: z.number().int().min(1).default(1),
          }),
          execute: async ({ selection, quantity }) => {
            const resolution = resolvePendingProductChoiceSelection(workingDraft.pendingProductChoices ?? [], selection);
            if (!resolution.resolved) {
              const output = resolution;
              toolExecutions.push({ tool: "resolvePendingProductChoice", input: { selection, quantity }, output });
              return output;
            }

            const addedProduct = await addProductToDraftById(resolution.choice.storeProductId, quantity);
            const output = {
              resolved: true,
              product: {
                storeProductId: addedProduct.id,
                name: addedProduct.name,
                price: Number(addedProduct.price),
              },
              draft: buildDraftSummary(workingDraft),
            };
            toolExecutions.push({ tool: "resolvePendingProductChoice", input: { selection, quantity }, output });
            return output;
          },
        }),
        summarizeDraft: tool({
          description: "Devuelve el estado actual del pedido.",
          inputSchema: z.object({}),
          execute: async () => {
            const output = buildDraftSummary(workingDraft);
            toolExecutions.push({ tool: "summarizeDraft", input: {}, output });
            return output;
          },
        }),
      },
    });

    const assistantMessage: AgentMessage = {
      id: `assistant-${scenario.id}-${run}-${turnResults.length + 1}`,
      role: "assistant",
      content: result.text.trim(),
      addedItems: collectAddedItemsFromDraftDiff(turnDraftBefore, workingDraft),
      actions: buildCopilotActions(workingDraft),
    };

    transcriptMessages.push({
      id: `user-${scenario.id}-${run}-${turnResults.length + 1}`,
      role: "user",
      content: userInput,
    });
    transcriptMessages.push(assistantMessage);
    turnResults.push({
      assistantMessage,
      draft: cloneDraft(workingDraft),
      toolExecutions,
    });
  }

  const failures = scenario.evaluate(turnResults);
  return {
    scenarioId: scenario.id,
    promptVariantId: promptVariant.id,
    temperature,
    run,
    passed: failures.length === 0,
    failures,
    transcript: turnResults.map((result, index) => ({
      user: scenario.turns[index] ?? "",
      assistant: result.assistantMessage.content,
      actions: listActionLabels(result.assistantMessage.actions),
      pendingChoices: (result.draft.pendingProductChoices ?? []).map((choice) => choice.name),
      items: result.draft.items.map((item) => ({ name: item.name, quantity: item.quantity })),
      toolExecutions: result.toolExecutions,
    })),
  };
};

const summarizeRuns = (scenario: Scenario, promptVariant: PromptVariant, temperature: number, runs: ScenarioRun[]) => {
  const passed = runs.filter((run) => run.passed).length;
  const failureCounts = new Map<string, number>();
  for (const run of runs) {
    for (const failure of run.failures) {
      failureCounts.set(failure, (failureCounts.get(failure) ?? 0) + 1);
    }
  }

  const topFailures = [...failureCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([failure, count]) => `${failure} (${count})`);

  const sampleRun = runs.find((run) => !run.passed) ?? runs[0];

  return {
    scenario: scenario.id,
    promptVariant: promptVariant.id,
    description: scenario.description,
    temperature,
    passed,
    total: runs.length,
    rate: Number((passed / runs.length).toFixed(2)),
    topFailures,
    sampleRun,
  };
};

const main = async () => {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required");
  }

  const matrixResults: ScenarioRun[] = [];
  for (const promptVariant of PROMPT_VARIANTS) {
    for (const temperature of DEFAULT_TEMPERATURES) {
      for (const scenario of SCENARIOS) {
        for (let run = 1; run <= DEFAULT_RUNS; run += 1) {
          matrixResults.push(await runScenario(scenario, promptVariant, temperature, run));
        }
      }
    }
  }

  console.log(`# OpenRouter conversation matrix`);
  console.log(`Model: ${DEFAULT_MODEL}`);
  console.log(`Runs per scenario: ${DEFAULT_RUNS}`);
  console.log(`Temperatures: ${DEFAULT_TEMPERATURES.join(", ")}`);
  console.log(`Prompt variants: ${PROMPT_VARIANTS.map((variant) => variant.id).join(", ")}`);
  console.log("");
  console.log(`| Prompt | Scenario | Temp | Pass | Rate | Top failures |`);
  console.log(`| --- | --- | ---: | ---: | ---: | --- |`);

  for (const promptVariant of PROMPT_VARIANTS) {
    for (const temperature of DEFAULT_TEMPERATURES) {
      for (const scenario of SCENARIOS) {
        const runs = matrixResults.filter((result) => result.promptVariantId === promptVariant.id && result.temperature === temperature && result.scenarioId === scenario.id);
        const summary = summarizeRuns(scenario, promptVariant, temperature, runs);
        console.log(`| ${summary.promptVariant} | ${summary.scenario} | ${summary.temperature} | ${summary.passed}/${summary.total} | ${summary.rate} | ${summary.topFailures.join(", ") || "-"} |`);
      }
    }
  }

  console.log("\n## Sample transcripts");
  for (const promptVariant of PROMPT_VARIANTS) {
    for (const temperature of DEFAULT_TEMPERATURES) {
      for (const scenario of SCENARIOS) {
        const runs = matrixResults.filter((result) => result.promptVariantId === promptVariant.id && result.temperature === temperature && result.scenarioId === scenario.id);
        const summary = summarizeRuns(scenario, promptVariant, temperature, runs);
        const sample = summary.sampleRun;
        if (!sample) {
          continue;
        }
        console.log(`\n### ${promptVariant.id} / ${scenario.id} @ temp=${temperature} (run ${sample.run}, ${sample.passed ? "pass" : "fail"})`);
        for (const [index, turn] of sample.transcript.entries()) {
          console.log(`Turn ${index + 1} user: ${turn.user}`);
          console.log(`Turn ${index + 1} assistant: ${turn.assistant}`);
          console.log(`Turn ${index + 1} actions: ${turn.actions.join(" | ") || "-"}`);
          console.log(`Turn ${index + 1} pending: ${turn.pendingChoices.join(" | ") || "-"}`);
          console.log(`Turn ${index + 1} items: ${turn.items.map((item) => `${item.quantity}x ${item.name}`).join(" | ") || "-"}`);
          console.log(`Turn ${index + 1} tools: ${turn.toolExecutions.map((execution) => `${execution.tool}:${JSON.stringify(execution.input)}`).join(" | ") || "-"}`);
        }
        if (sample.failures.length > 0) {
          console.log(`Failures: ${sample.failures.join(", ")}`);
        }
      }
    }
  }
};

await main().catch((error) => {
  console.error("OpenRouter conversation matrix failed.");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
