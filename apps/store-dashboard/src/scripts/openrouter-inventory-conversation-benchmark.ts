import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { previewInventoryImport } from "../../../../src/services/store-inventory";
import {
  appendInventoryDraftRows,
  buildInventoryAgentActions,
  buildInventoryDraftSummaryText,
  buildInventoryStockAddDraftRow,
  canConfirmInventoryDraft,
  createEmptyInventoryDraft,
  extractInventoryStockAddRequests,
  findInventoryDraftRowByQuery,
  getInventoryDraftSummary,
  rankInventoryProductsByQuery,
  resolveInventoryRowState,
  type InventoryDraftMatchedProduct,
  type InventoryDraftRow,
  type StoreInventoryDraft,
} from "@/lib/store-inventory";
import type { AgentAction, AgentMessage } from "@/lib/store-pos";

type ToolExecution = {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
};

type TurnResult = {
  assistantMessage: AgentMessage;
  draft: StoreInventoryDraft;
  confirmed: boolean;
  toolExecutions: ToolExecution[];
};

type Scenario = {
  id: string;
  description: string;
  turns: string[];
  initialDraft?: () => StoreInventoryDraft;
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
    rows: Array<{ name: string; quantity: number; status: InventoryDraftRow["status"]; action?: InventoryDraftRow["action"] }>;
    actions: string[];
    confirmed: boolean;
    toolExecutions: ToolExecution[];
  }>;
};

type PromptVariant = {
  id: string;
  description: string;
  buildSystemPrompt: (draft: StoreInventoryDraft) => string;
};

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
const DEFAULT_RUNS = Number(process.env.INVENTORY_MATRIX_RUNS ?? "3");
const DEFAULT_TEMPERATURES = (process.env.INVENTORY_MATRIX_TEMPERATURES ?? "0,0.2")
  .split(",")
  .map((entry) => Number(entry.trim()))
  .filter((value) => Number.isFinite(value));
const ENABLED_PROMPT_VARIANTS = (process.env.INVENTORY_PROMPT_VARIANTS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const OUTPUT_PATH = process.env.INVENTORY_BENCH_OUTPUT;
const MIN_PASS_RATE = process.env.INVENTORY_BENCH_MIN_RATE ? Number(process.env.INVENTORY_BENCH_MIN_RATE) : null;

const STORE_PRODUCTS: InventoryDraftMatchedProduct[] = [
  {
    id: "sp-cola-600",
    storeId: "store-1",
    productId: "p-cola-600",
    name: "Refresco Cola 600 ml (staging)",
    sku: "QOA-COLA-600-STAGING",
    unitType: "pieza",
    price: 18,
    stock: 0,
    status: "active",
    createdAt: "2026-04-22T00:00:00.000Z",
  },
  {
    id: "sp-naranja-600",
    storeId: "store-1",
    productId: "p-naranja-600",
    name: "Refresco Naranja 600 ml (staging)",
    sku: "QOA-NARANJA-600-STAGING",
    unitType: "pieza",
    price: 18,
    stock: 0,
    status: "active",
    createdAt: "2026-04-22T00:00:00.000Z",
  },
  {
    id: "sp-lima-600",
    storeId: "store-1",
    productId: "p-lima-600",
    name: "Refresco Lima-Limon 600 ml (staging)",
    sku: "QOA-LIMA-600-STAGING",
    unitType: "pieza",
    price: 18,
    stock: 0,
    status: "active",
    createdAt: "2026-04-22T00:00:00.000Z",
  },
  {
    id: "sp-papas-chile-limon",
    storeId: "store-1",
    productId: "p-papas-chile-limon",
    name: "Papas Chile y Limon 45 g (staging)",
    sku: "QOA-PAPAS-CHILE-LIMON-45-STAGING",
    unitType: "pieza",
    price: 16,
    stock: 0,
    status: "active",
    createdAt: "2026-04-22T00:00:00.000Z",
  },
  {
    id: "sp-papas-sal-limon",
    storeId: "store-1",
    productId: "p-papas-sal-limon",
    name: "Papas Limon y Sal 45 g (staging)",
    sku: "QOA-PAPAS-LIMON-SAL-45-STAGING",
    unitType: "pieza",
    price: 16,
    stock: 0,
    status: "active",
    createdAt: "2026-04-22T00:00:00.000Z",
  },
  {
    id: "sp-galletas-mantequilla",
    storeId: "store-1",
    productId: "p-galletas-mantequilla",
    name: "Galletas Mantequilla",
    sku: "GAL-001",
    unitType: "pieza",
    price: 30,
    stock: 6,
    status: "active",
    createdAt: "2026-04-22T00:00:00.000Z",
  },
];

const cloneDraft = (draft: StoreInventoryDraft): StoreInventoryDraft => ({
  rows: draft.rows.map((row) => ({
    ...row,
    matchedProduct: row.matchedProduct ? { ...row.matchedProduct } : undefined,
    candidates: row.candidates?.map((candidate) => ({ ...candidate })),
    errors: row.errors ? [...row.errors] : undefined,
  })),
  lastReceipt: draft.lastReceipt
    ? {
        ...draft.lastReceipt,
        rows: draft.lastReceipt.rows.map((row) => ({ ...row })),
        summary: { ...draft.lastReceipt.summary },
      }
    : null,
  idempotencyKey: draft.idempotencyKey,
});

const buildActions = (draft: StoreInventoryDraft): AgentAction[] => {
  return buildInventoryAgentActions(draft);
};

const buildDraftSummary = (draft: StoreInventoryDraft) => {
  const summary = getInventoryDraftSummary(draft);
  const rows = draft.rows.map((row) => {
    const candidates = row.candidates?.length ? ` candidates=[${row.candidates.map((candidate) => candidate.name).join(" | ")}]` : "";
    const sku = row.sku ? ` sku=${row.sku}` : "";
    return `- line=${row.lineNumber} id=${row.id} name="${row.name}" qty=${row.quantity} status=${row.status} action=${row.action ?? "none"}${sku}${candidates}`;
  });

  return [
    `summary rows=${summary.rows} quantity=${summary.quantity} matched=${summary.matched} created=${summary.created} ambiguous=${summary.ambiguous} invalid=${summary.invalid}`,
    rows.length ? rows.join("\n") : "rows: empty",
  ].join("\n");
};

const toDraftRows = (
  rows: Array<{
    lineNumber: number;
    rawText: string;
    name: string;
    sku?: string;
    quantity: number;
    price?: number;
    status: "matched" | "new" | "ambiguous" | "invalid";
    matchedStoreProductId?: string;
    matchedProduct?: InventoryDraftMatchedProduct;
    candidates?: InventoryDraftRow["candidates"];
    errors?: string[];
  }>,
): InventoryDraftRow[] =>
  rows.map((row) =>
    resolveInventoryRowState({
      ...row,
      id: crypto.randomUUID(),
      action:
        row.status === "matched"
          ? "match_existing"
          : row.status === "new" && row.price !== undefined
            ? "create_new"
            : undefined,
    }),
  );

const makeAmbiguousRefrescoDraft = (): StoreInventoryDraft => ({
  ...createEmptyInventoryDraft(),
  idempotencyKey: "inventory-benchmark-pending",
  rows: [
    resolveInventoryRowState({
      id: "row-ambiguous-refresco",
      lineNumber: 1,
      rawText: "10 refresco 600",
      name: "refresco 600",
      quantity: 10,
      status: "ambiguous",
      candidates: STORE_PRODUCTS.filter((product) => product.name.startsWith("Refresco")).map((product) => ({
        storeProductId: product.id,
        name: product.name,
        sku: product.sku,
        price: product.price,
        stock: product.stock,
        score: 0.9,
      })),
    }),
  ],
});

const findRowByProductName = (draft: StoreInventoryDraft, productName: string) =>
  draft.rows.find((row) => row.name === productName || row.matchedProduct?.name === productName);

const latest = (results: TurnResult[]) => results.at(-1);

const hasConfirmed = (results: TurnResult[]) => results.some((result) => result.confirmed);

const hasBadSingularPlural = (content: string) => /\b1\s+filas\b/i.test(content) || /\b1\s+pendientes\b/i.test(content);

const hasAction = (result: TurnResult | undefined, actionId: string) =>
  Boolean(result?.assistantMessage.actions?.some((action) => action.id === actionId));

const expectMatchedRow = (
  failures: string[],
  draft: StoreInventoryDraft,
  productName: string,
  quantity: number,
  failurePrefix: string,
) => {
  const row = findRowByProductName(draft, productName);
  if (!row) {
    failures.push(`${failurePrefix}_missing_row`);
    return;
  }
  if (row.quantity !== quantity) {
    failures.push(`${failurePrefix}_wrong_quantity:${row.quantity}`);
  }
  if (row.status !== "matched" || row.action !== "match_existing") {
    failures.push(`${failurePrefix}_not_matched:${row.status}/${row.action ?? "none"}`);
  }
};

const SCENARIOS: Scenario[] = [
  {
    id: "terse-line-strips-de",
    description: "Una linea corta '20 de producto' debe parsearse sin meter 'de' al nombre.",
    turns: ["20 de Papas Chile y Limon 45 g (staging)"],
    evaluate: (results) => {
      const failures: string[] = [];
      const final = latest(results);
      if (!final) return ["missing_turn"];
      expectMatchedRow(failures, final.draft, "Papas Chile y Limon 45 g (staging)", 20, "papas");
      if (final.draft.rows.some((row) => /^de\s+/i.test(row.name))) {
        failures.push("row_name_kept_leading_de");
      }
      if (hasBadSingularPlural(final.assistantMessage.content)) {
        failures.push("bad_singular_plural");
      }
      return failures;
    },
  },
  {
    id: "sku-direct-stock-add",
    description: "SKU exacto con unidad abreviada debe quedar vinculado al producto existente.",
    turns: ["agrega 10 pza del QOA-COLA-600-STAGING"],
    evaluate: (results) => {
      const failures: string[] = [];
      const final = latest(results);
      if (!final) return ["missing_turn"];
      expectMatchedRow(failures, final.draft, "Refresco Cola 600 ml (staging)", 10, "cola");
      if (hasBadSingularPlural(final.assistantMessage.content)) {
        failures.push("bad_singular_plural");
      }
      return failures;
    },
  },
  {
    id: "accentless-product-name",
    description: "Sin acento en Limon debe matchear el producto correcto.",
    turns: ["agrega 20 de Papas Chile y Limon 45 g staging"],
    evaluate: (results) => {
      const failures: string[] = [];
      const final = latest(results);
      if (!final) return ["missing_turn"];
      expectMatchedRow(failures, final.draft, "Papas Chile y Limon 45 g (staging)", 20, "papas");
      return failures;
    },
  },
  {
    id: "cada-refresco-expands",
    description: "'Cada refresco' debe expandir a cada refresco registrado, no dejar una sola fila ambigua.",
    turns: ["agrega 10 de cada refresco"],
    evaluate: (results) => {
      const failures: string[] = [];
      const final = latest(results);
      if (!final) return ["missing_turn"];
      expectMatchedRow(failures, final.draft, "Refresco Cola 600 ml (staging)", 10, "cola");
      expectMatchedRow(failures, final.draft, "Refresco Naranja 600 ml (staging)", 10, "naranja");
      expectMatchedRow(failures, final.draft, "Refresco Lima-Limon 600 ml (staging)", 10, "lima");
      if (final.draft.rows.length !== 3) {
        failures.push(`expected_3_rows:${final.draft.rows.length}`);
      }
      if (final.draft.rows.some((row) => row.status === "ambiguous")) {
        failures.push("unexpected_ambiguous_row");
      }
      return failures;
    },
  },
  {
    id: "ambiguous-refresco-does-not-guess",
    description: "Sin 'cada', un refresco ambiguo debe pedir seleccion y no escoger al azar.",
    turns: ["agrega 10 de refresco 600"],
    evaluate: (results) => {
      const failures: string[] = [];
      const final = latest(results);
      if (!final) return ["missing_turn"];
      const ambiguousRows = final.draft.rows.filter((row) => row.status === "ambiguous");
      if (ambiguousRows.length !== 1) {
        failures.push(`expected_one_ambiguous_row:${ambiguousRows.length}`);
      }
      if (final.draft.rows.some((row) => row.status === "matched")) {
        failures.push("guessed_matched_product");
      }
      if (hasAction(final, "inventory-confirm")) {
        failures.push("confirm_action_with_ambiguous_row");
      }
      return failures;
    },
  },
  {
    id: "ambiguous-refresco-ui-actions",
    description: "Una fila ambigua debe exponer acciones para que la UI resuelva con un click.",
    turns: ["agrega 10 de refresco 600"],
    evaluate: (results) => {
      const failures: string[] = [];
      const final = latest(results);
      if (!final) return ["missing_turn"];
      const labels = final.assistantMessage.actions?.map((action) => action.label) ?? [];
      for (const expected of ["Refresco Cola 600 ml (staging)", "Refresco Naranja 600 ml (staging)", "Refresco Lima-Limon 600 ml (staging)"]) {
        if (!labels.includes(expected)) {
          failures.push(`missing_ui_action:${expected}`);
        }
      }
      if (hasAction(final, "inventory-confirm")) {
        failures.push("confirm_action_with_ambiguous_row");
      }
      return failures;
    },
  },
  {
    id: "multiple-products-one-message",
    description: "Un solo mensaje puede agregar varios productos por nombre/SKU.",
    turns: ["agrega 10 pza del QOA-COLA-600-STAGING y 20 de Papas Chile y Limon 45 g staging"],
    evaluate: (results) => {
      const failures: string[] = [];
      const final = latest(results);
      if (!final) return ["missing_turn"];
      expectMatchedRow(failures, final.draft, "Refresco Cola 600 ml (staging)", 10, "cola");
      expectMatchedRow(failures, final.draft, "Papas Chile y Limon 45 g (staging)", 20, "papas");
      if (final.draft.rows.length !== 2) {
        failures.push(`expected_2_rows:${final.draft.rows.length}`);
      }
      return failures;
    },
  },
  {
    id: "summary-in-chat",
    description: "El agente debe responder con un resumen confirmable del borrador.",
    initialDraft: () => ({
      ...createEmptyInventoryDraft(),
      idempotencyKey: "inventory-benchmark-summary",
      rows: [
        resolveInventoryRowState({
          id: "row-cola",
          lineNumber: 1,
          rawText: "10 cola",
          name: "Refresco Cola 600 ml (staging)",
          sku: "QOA-COLA-600-STAGING",
          quantity: 10,
          price: 18,
          status: "matched",
          action: "match_existing",
          matchedStoreProductId: "sp-cola-600",
          matchedProduct: STORE_PRODUCTS[0]!,
        }),
        resolveInventoryRowState({
          id: "row-papas",
          lineNumber: 2,
          rawText: "20 papas",
          name: "Papas Chile y Limon 45 g (staging)",
          sku: "QOA-PAPAS-CHILE-LIMON-45-STAGING",
          quantity: 20,
          price: 16,
          status: "matched",
          action: "match_existing",
          matchedStoreProductId: "sp-papas-chile-limon",
          matchedProduct: STORE_PRODUCTS[3]!,
        }),
      ],
    }),
    turns: ["dame un resumen de la carga"],
    evaluate: (results) => {
      const failures: string[] = [];
      const final = latest(results);
      if (!final) return ["missing_turn"];
      const normalized = final.assistantMessage.content
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      for (const needle of ["2 filas", "30 piezas", "refresco cola", "papas chile"]) {
        if (!normalized.includes(needle)) {
          failures.push(`summary_missing:${needle}`);
        }
      }
      if (!hasAction(final, "inventory-confirm")) {
        failures.push("missing_confirm_action");
      }
      return failures;
    },
  },
  {
    id: "confirm-blocked-by-pending",
    description: "Confirmar con filas pendientes debe bloquearse y explicar el pendiente.",
    initialDraft: makeAmbiguousRefrescoDraft,
    turns: ["confirma la entrada"],
    evaluate: (results) => {
      const failures: string[] = [];
      const final = latest(results);
      if (!final) return ["missing_turn"];
      if (hasConfirmed(results)) {
        failures.push("confirmed_with_pending_row");
      }
      if (final.draft.rows.length !== 1 || final.draft.rows[0]?.status !== "ambiguous") {
        failures.push("pending_row_was_removed_or_mutated");
      }
      if (hasAction(final, "inventory-confirm")) {
        failures.push("confirm_action_with_pending_row");
      }
      const normalizedContent = final.assistantMessage.content
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      if (!/(pendiente|ambigua|ambiguo|seleccion|resolver|revis|fila)/.test(normalizedContent)) {
        failures.push("missing_pending_explanation");
      }
      return failures;
    },
  },
];

const PROMPT_VARIANTS: PromptVariant[] = [
  {
    id: "current-route",
    description: "Prompt cercano al flujo actual del agente de inventario.",
    buildSystemPrompt: (draft) => [
      "Eres un asistente de inventario para tenderos en Qoa.",
      "Responde siempre en espanol claro y breve.",
      "Usa herramientas para interpretar listas de proveedor, editar el borrador y confirmar entradas.",
      "No digas que la entrada fue aplicada si no ejecutaste confirmInventoryIntake.",
      "Si el usuario pega una lista o tabla, usa previewInventoryFromText.",
      "Si el usuario pide agregar existencias de un producto que no esta en el borrador, usa addInventoryDraftRowByQuery para buscarlo en productos registrados y crear la fila vinculada.",
      "Si el usuario pregunta por un producto, usa searchStoreProducts.",
      "Si hay filas ambiguas o invalidas, pide correccion puntual o usa updateInventoryDraftRowByQuery cuando ya tengas la instruccion.",
      `Estado actual del inventario en borrador:\n${buildDraftSummary(draft)}`,
    ].join("\n\n"),
  },
  {
    id: "precise-context",
    description: "Prompt con reglas explicitas para parseo resiliente y confirmacion segura.",
    buildSystemPrompt: (draft) => [
      "Eres un asistente de inventario para tenderos en Qoa.",
      "Responde siempre en espanol claro y breve.",
      "Tu objetivo es convertir ordenes cortas del tendero en cambios correctos al borrador.",
      "",
      "Reglas de parseo:",
      "- Mensajes como '20 de Papas Chile y Limon' significan cantidad=20 y producto='Papas Chile y Limon'. La palabra 'de' o 'del' no forma parte del producto.",
      "- Tolera acentos faltantes, mayusculas, guiones, parentesis y variaciones como pza/pz/piezas/unidades.",
      "- SKU exacto o parcial tiene prioridad sobre nombre hablado.",
      "- Si el usuario dice 'cada refresco', 'cada galleta' o 'todos los X', busca esa familia y agrega una fila por cada producto activo encontrado.",
      "- Si el usuario solo dice una familia ambigua sin 'cada' o 'todos', no elijas al azar: deja una fila ambigua o pide seleccion.",
      "",
      "Reglas de seguridad:",
      "- Nunca confirmes si hay filas ambiguous, invalidas, sin action, sin matchedStoreProductId cuando action=match_existing, o sin precio cuando action=create_new.",
      "- Si confirmacion esta bloqueada, explica exactamente que fila falta resolver.",
      "- Usa singular/plural correcto: '1 fila', '2 filas', '1 pendiente', '2 pendientes'.",
      "- No digas que aplicaste inventario si no ejecutaste confirmInventoryIntake con exito.",
      "",
      "Herramientas:",
      "- Para una linea corta de cantidad + producto, usa addInventoryDraftRowByQuery, no previewInventoryFromText.",
      "- Usa previewInventoryFromText solo para listas/tablas multilinea o texto de proveedor con varias columnas.",
      "- Para 'cada <familia>', usa searchStoreProducts y despues addInventoryDraftRowByQuery con el nombre exacto de cada producto encontrado.",
      `Estado actual del inventario en borrador:\n${buildDraftSummary(draft)}`,
    ].join("\n"),
  },
];

const getPromptVariants = () =>
  ENABLED_PROMPT_VARIANTS.length
    ? PROMPT_VARIANTS.filter((variant) => ENABLED_PROMPT_VARIANTS.includes(variant.id))
    : PROMPT_VARIANTS;

const runScenario = async (scenario: Scenario, promptVariant: PromptVariant, temperature: number, run: number): Promise<ScenarioRun> => {
  let workingDraft = scenario.initialDraft ? scenario.initialDraft() : createEmptyInventoryDraft();
  let confirmed = false;
  const transcriptMessages: AgentMessage[] = [];
  const turnResults: TurnResult[] = [];

  const applyPreviewRows = (text: string) => {
    const preview = previewInventoryImport(text, STORE_PRODUCTS);
    const nextRows = toDraftRows(preview.rows);
    workingDraft = {
      rows: appendInventoryDraftRows(workingDraft.rows, nextRows),
      lastReceipt: null,
      idempotencyKey: workingDraft.idempotencyKey ?? `inventory-benchmark-${crypto.randomUUID()}`,
    };
    return {
      addedRows: nextRows.length,
      summary: getInventoryDraftSummary(workingDraft),
      rows: nextRows.map((row) => ({
        name: row.name,
        quantity: row.quantity,
        status: row.status,
        action: row.action,
        matchedStoreProductId: row.matchedStoreProductId,
      })),
    };
  };

  const appendRowByRequest = (query: string, quantity: number) => {
    const result = buildInventoryStockAddDraftRow(
      { query, quantity },
      STORE_PRODUCTS.filter((product) => product.status === "active"),
      { id: crypto.randomUUID(), lineNumber: 1 },
    );

    if (result.status !== "not_found") {
      workingDraft = {
        rows: appendInventoryDraftRows(workingDraft.rows, [result.row]),
        lastReceipt: null,
        idempotencyKey: workingDraft.idempotencyKey ?? `inventory-benchmark-${crypto.randomUUID()}`,
      };
    }

    return result.status === "not_found"
      ? result
      : {
          status: result.status,
          row: {
            name: result.row.name,
            quantity: result.row.quantity,
            status: result.row.status,
            action: result.row.action,
            sku: result.row.sku,
            matchedStoreProductId: result.row.matchedStoreProductId,
          },
          candidates: result.status === "ambiguous" ? result.candidates : undefined,
          summary: getInventoryDraftSummary(workingDraft),
        };
  };

  const appendRowsForFamily = (query: string, quantity: number) => {
    const matches = rankInventoryProductsByQuery(
      STORE_PRODUCTS.filter((product) => product.status === "active"),
      query,
    )
      .filter((entry) => entry.score >= 0.62)
      .slice(0, 12);

    if (matches.length === 0) {
      return { status: "not_found" as const, query, quantity };
    }

    const rows = matches.map((entry) => resolveInventoryRowState({
      id: crypto.randomUUID(),
      lineNumber: 1,
      rawText: `${quantity} ${entry.product.name}`,
      name: entry.product.name,
      sku: entry.product.sku,
      quantity,
      price: entry.product.price,
      status: "matched",
      action: "match_existing",
      matchedStoreProductId: entry.product.id,
      matchedProduct: entry.product,
    }));

    workingDraft = {
      rows: appendInventoryDraftRows(workingDraft.rows, rows),
      lastReceipt: null,
      idempotencyKey: workingDraft.idempotencyKey ?? `inventory-benchmark-${crypto.randomUUID()}`,
    };

    return { status: "matched_family" as const, rows, query, quantity };
  };

  for (const userInput of scenario.turns) {
    const toolExecutions: ToolExecution[] = [];
    const deterministicRequests = extractInventoryStockAddRequests(userInput);

    if (deterministicRequests.length > 0) {
      const results = deterministicRequests.map((request) =>
        request.mode === "all_matching"
          ? appendRowsForFamily(request.query, request.quantity)
          : appendRowByRequest(request.query, request.quantity),
      );
      toolExecutions.push({
        tool: "deterministicInventoryStockAdd",
        input: { requests: deterministicRequests },
        output: results,
      });
      const assistantMessage: AgentMessage = {
        id: `assistant-${scenario.id}-${run}-${turnResults.length + 1}`,
        role: "assistant",
        content: buildInventoryDraftSummaryText(workingDraft),
        actions: buildActions(workingDraft),
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
        confirmed,
        toolExecutions,
      });
      continue;
    }

    if (/^(?:dame\s+)?(?:un\s+)?resumen\b|(?:que|qué)\s+(?:hay|tengo)\s+en\s+(?:el\s+)?borrador|revisa\s+(?:la\s+)?carga/i.test(userInput.trim())) {
      const assistantMessage: AgentMessage = {
        id: `assistant-${scenario.id}-${run}-${turnResults.length + 1}`,
        role: "assistant",
        content: buildInventoryDraftSummaryText(workingDraft),
        actions: buildActions(workingDraft),
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
        confirmed,
        toolExecutions,
      });
      continue;
    }

    const systemPrompt = promptVariant.buildSystemPrompt(workingDraft);
    const modelMessages: ModelMessage[] = [
      ...transcriptMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user", content: userInput },
    ];

    const result = await generateText({
      model: openrouter(DEFAULT_MODEL),
      temperature,
      system: systemPrompt,
      messages: modelMessages,
      stopWhen: stepCountIs(10),
      tools: {
        previewInventoryFromText: tool({
          description: "Interpreta texto pegado y agrega filas al borrador de inventario. Usar para listas o tablas, no para una sola orden corta.",
          inputSchema: z.object({ text: z.string().min(1) }),
          execute: async ({ text }) => {
            const output = applyPreviewRows(text);
            toolExecutions.push({ tool: "previewInventoryFromText", input: { text }, output });
            return output;
          },
        }),
        addInventoryDraftRowByQuery: tool({
          description: "Busca un producto registrado por nombre o SKU y agrega una fila vinculada con la cantidad indicada.",
          inputSchema: z.object({
            query: z.string().min(1),
            quantity: z.number().int().min(1),
          }),
          execute: async ({ query, quantity }) => {
            const output = appendRowByRequest(query, quantity);
            toolExecutions.push({ tool: "addInventoryDraftRowByQuery", input: { query, quantity }, output });
            return output;
          },
        }),
        searchStoreProducts: tool({
          description: "Busca productos activos por nombre, SKU o familia.",
          inputSchema: z.object({
            query: z.string().min(1),
            limit: z.number().int().min(1).max(20).optional(),
          }),
          execute: async ({ query, limit }) => {
            const ranked = rankInventoryProductsByQuery(
              STORE_PRODUCTS.filter((product) => product.status === "active"),
              query,
            ).slice(0, limit ?? 8);
            const output = {
              storeProducts: ranked.map((entry) => ({
                storeProductId: entry.product.id,
                name: entry.product.name,
                sku: entry.product.sku,
                price: entry.product.price,
                stock: entry.product.stock,
                score: Number(entry.score.toFixed(3)),
              })),
            };
            toolExecutions.push({ tool: "searchStoreProducts", input: { query, limit }, output });
            return output;
          },
        }),
        updateInventoryDraftRowByQuery: tool({
          description: "Edita una fila del borrador buscando por nombre hablado o escrito.",
          inputSchema: z.object({
            query: z.string().min(1),
            quantity: z.number().int().min(1).optional(),
            price: z.number().min(0).optional(),
            action: z.enum(["match_existing", "create_new"]).optional(),
            storeProductId: z.string().optional(),
          }),
          execute: async ({ query, quantity, price, action, storeProductId }) => {
            const match = findInventoryDraftRowByQuery(workingDraft.rows, query);
            if (match.status !== "matched") {
              const output = match.status === "ambiguous"
                ? {
                    updated: false,
                    reason: "ambiguous",
                    candidates: match.candidates.map((candidate) => ({
                      rowId: candidate.row.id,
                      name: candidate.row.name,
                      score: Number(candidate.score.toFixed(3)),
                    })),
                  }
                : { updated: false, reason: "not_found" };
              toolExecutions.push({ tool: "updateInventoryDraftRowByQuery", input: { query, quantity, price, action, storeProductId }, output });
              return output;
            }

            const product = storeProductId ? STORE_PRODUCTS.find((entry) => entry.id === storeProductId) : match.row.matchedProduct;
            const nextRow = resolveInventoryRowState({
              ...match.row,
              quantity: quantity ?? match.row.quantity,
              price: price ?? match.row.price,
              action: action ?? match.row.action,
              matchedStoreProductId: action === "create_new" ? undefined : storeProductId ?? match.row.matchedStoreProductId,
              matchedProduct: action === "create_new" ? undefined : product,
            });
            workingDraft = {
              ...workingDraft,
              rows: workingDraft.rows.map((row) => row.id === nextRow.id ? nextRow : row),
            };
            const output = { updated: true, row: nextRow, summary: getInventoryDraftSummary(workingDraft) };
            toolExecutions.push({ tool: "updateInventoryDraftRowByQuery", input: { query, quantity, price, action, storeProductId }, output });
            return output;
          },
        }),
        summarizeInventoryDraft: tool({
          description: "Devuelve el estado actual del borrador de inventario.",
          inputSchema: z.object({}),
          execute: async () => {
            const output = buildDraftSummary(workingDraft);
            toolExecutions.push({ tool: "summarizeInventoryDraft", input: {}, output });
            return output;
          },
        }),
        confirmInventoryIntake: tool({
          description: "Confirma y aplica la entrada de inventario actual solo si el borrador esta completo.",
          inputSchema: z.object({ confirmation: z.string().optional() }),
          execute: async () => {
            if (!canConfirmInventoryDraft(workingDraft)) {
              const output = {
                confirmed: false,
                reason: "invalid_draft",
                summary: getInventoryDraftSummary(workingDraft),
                unresolvedRows: workingDraft.rows
                  .filter((row) => row.status === "ambiguous" || row.status === "invalid" || !row.action)
                  .map((row) => ({ name: row.name, status: row.status, errors: row.errors })),
              };
              toolExecutions.push({ tool: "confirmInventoryIntake", input: {}, output });
              return output;
            }

            confirmed = true;
            const output = {
              confirmed: true,
              appliedRows: workingDraft.rows.map((row) => ({ name: row.name, quantity: row.quantity })),
              summary: getInventoryDraftSummary(workingDraft),
            };
            workingDraft = createEmptyInventoryDraft();
            toolExecutions.push({ tool: "confirmInventoryIntake", input: {}, output });
            return output;
          },
        }),
      },
    });

    const assistantMessage: AgentMessage = {
      id: `assistant-${scenario.id}-${run}-${turnResults.length + 1}`,
      role: "assistant",
      content: result.text.trim(),
      actions: buildActions(workingDraft),
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
      confirmed,
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
    transcript: turnResults.map((turn, index) => ({
      user: scenario.turns[index] ?? "",
      assistant: turn.assistantMessage.content,
      rows: turn.draft.rows.map((row) => ({
        name: row.name,
        quantity: row.quantity,
        status: row.status,
        action: row.action,
      })),
      actions: (turn.assistantMessage.actions ?? []).map((action) => action.label),
      confirmed: turn.confirmed,
      toolExecutions: turn.toolExecutions,
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

  return {
    scenario: scenario.id,
    promptVariant: promptVariant.id,
    description: scenario.description,
    temperature,
    passed,
    total: runs.length,
    rate: runs.length ? Number((passed / runs.length).toFixed(2)) : 0,
    topFailures: [...failureCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([failure, count]) => `${failure} (${count})`),
    sampleRun: runs.find((run) => !run.passed) ?? runs[0],
  };
};

const printReport = (matrixResults: ScenarioRun[], promptVariants: PromptVariant[]) => {
  console.log("# OpenRouter inventory agent benchmark");
  console.log(`Model: ${DEFAULT_MODEL}`);
  console.log(`Runs per scenario: ${DEFAULT_RUNS}`);
  console.log(`Temperatures: ${DEFAULT_TEMPERATURES.join(", ")}`);
  console.log(`Prompt variants: ${promptVariants.map((variant) => variant.id).join(", ")}`);
  console.log("");
  console.log("| Prompt | Scenario | Temp | Pass | Rate | Top failures |");
  console.log("| --- | --- | ---: | ---: | ---: | --- |");

  for (const promptVariant of promptVariants) {
    for (const temperature of DEFAULT_TEMPERATURES) {
      for (const scenario of SCENARIOS) {
        const runs = matrixResults.filter(
          (result) =>
            result.promptVariantId === promptVariant.id
            && result.temperature === temperature
            && result.scenarioId === scenario.id,
        );
        const summary = summarizeRuns(scenario, promptVariant, temperature, runs);
        console.log(`| ${summary.promptVariant} | ${summary.scenario} | ${summary.temperature} | ${summary.passed}/${summary.total} | ${summary.rate} | ${summary.topFailures.join(", ") || "-"} |`);
      }
    }
  }

  console.log("\n## Sample failures");
  let printed = 0;
  for (const promptVariant of promptVariants) {
    for (const temperature of DEFAULT_TEMPERATURES) {
      for (const scenario of SCENARIOS) {
        const sample = matrixResults.find(
          (result) =>
            !result.passed
            && result.promptVariantId === promptVariant.id
            && result.temperature === temperature
            && result.scenarioId === scenario.id,
        );
        if (!sample) continue;
        printed += 1;
        console.log(`\n### ${promptVariant.id} / ${scenario.id} @ temp=${temperature} (run ${sample.run})`);
        console.log(`Failures: ${sample.failures.join(", ")}`);
        for (const [index, turn] of sample.transcript.entries()) {
          console.log(`Turn ${index + 1} user: ${turn.user}`);
          console.log(`Turn ${index + 1} assistant: ${turn.assistant || "-"}`);
          console.log(`Turn ${index + 1} rows: ${turn.rows.map((row) => `${row.quantity}x ${row.name} [${row.status}/${row.action ?? "none"}]`).join(" | ") || "-"}`);
          console.log(`Turn ${index + 1} actions: ${turn.actions.join(" | ") || "-"}`);
          console.log(`Turn ${index + 1} confirmed: ${turn.confirmed}`);
          console.log(`Turn ${index + 1} tools: ${turn.toolExecutions.map((execution) => `${execution.tool}:${JSON.stringify(execution.input)}`).join(" | ") || "-"}`);
        }
      }
    }
  }

  if (printed === 0) {
    console.log("\nNo failures in this run.");
  }
};

const main = async () => {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required");
  }
  if (!Number.isInteger(DEFAULT_RUNS) || DEFAULT_RUNS <= 0) {
    throw new Error("INVENTORY_MATRIX_RUNS must be a positive integer");
  }
  if (DEFAULT_TEMPERATURES.length === 0) {
    throw new Error("INVENTORY_MATRIX_TEMPERATURES must include at least one numeric value");
  }

  const promptVariants = getPromptVariants();
  if (promptVariants.length === 0) {
    throw new Error(`No prompt variants selected. Available: ${PROMPT_VARIANTS.map((variant) => variant.id).join(", ")}`);
  }

  const matrixResults: ScenarioRun[] = [];
  for (const promptVariant of promptVariants) {
    for (const temperature of DEFAULT_TEMPERATURES) {
      for (const scenario of SCENARIOS) {
        for (let run = 1; run <= DEFAULT_RUNS; run += 1) {
          matrixResults.push(await runScenario(scenario, promptVariant, temperature, run));
        }
      }
    }
  }

  printReport(matrixResults, promptVariants);

  const totalRuns = matrixResults.length;
  const passedRuns = matrixResults.filter((result) => result.passed).length;
  const passRate = totalRuns ? passedRuns / totalRuns : 0;
  console.log(`\nOverall: ${passedRuns}/${totalRuns} (${(passRate * 100).toFixed(1)}%)`);

  if (OUTPUT_PATH) {
    const outputPath = path.resolve(process.cwd(), OUTPUT_PATH);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      JSON.stringify(
        {
          model: DEFAULT_MODEL,
          runsPerScenario: DEFAULT_RUNS,
          temperatures: DEFAULT_TEMPERATURES,
          promptVariants: promptVariants.map(({ id, description }) => ({ id, description })),
          scenarios: SCENARIOS.map(({ id, description }) => ({ id, description })),
          passRate,
          results: matrixResults,
        },
        null,
        2,
      ),
    );
    console.log(`Wrote JSON report to ${outputPath}`);
  }

  if (MIN_PASS_RATE !== null && passRate < MIN_PASS_RATE) {
    throw new Error(`Inventory benchmark pass rate ${(passRate * 100).toFixed(1)}% is below INVENTORY_BENCH_MIN_RATE ${(MIN_PASS_RATE * 100).toFixed(1)}%`);
  }
};

await main().catch((error) => {
  console.error("OpenRouter inventory agent benchmark failed.");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
