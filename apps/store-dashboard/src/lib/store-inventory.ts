export type InventoryDraftCandidate = {
  storeProductId: string;
  name: string;
  sku?: string;
  price: number;
  stock: number;
  score: number;
};

export type InventoryDraftMatchedProduct = {
  id: string;
  storeId: string;
  productId?: string;
  cpgId?: string;
  name: string;
  sku?: string;
  unitType: string;
  price: number;
  stock: number;
  status: string;
  createdAt: string;
};

export type InventoryDraftRow = {
  id: string;
  lineNumber: number;
  rawText: string;
  name: string;
  sku?: string;
  quantity: number;
  price?: number;
  status: 'matched' | 'new' | 'ambiguous' | 'invalid';
  action?: 'match_existing' | 'create_new';
  matchedStoreProductId?: string;
  matchedProduct?: InventoryDraftMatchedProduct;
  candidates?: InventoryDraftCandidate[];
  errors?: string[];
};

export type InventoryDraftReceipt = {
  idempotencyKey: string;
  replayed: boolean;
  rows: Array<{
    storeProductId: string;
    name: string;
    sku?: string;
    quantityDelta: number;
    previousStock: number;
    currentStock: number;
    created: boolean;
  }>;
  summary: {
    totalRows: number;
    totalQuantity: number;
    createdProducts: number;
    updatedProducts: number;
  };
};

export type StoreInventoryDraft = {
  rows: InventoryDraftRow[];
  lastReceipt: InventoryDraftReceipt | null;
  idempotencyKey: string | null;
};

export type InventoryStockAddRequest = {
  query: string;
  quantity: number;
  mode?: "single" | "all_matching";
};

export type InventoryProductQueryMatch =
  | { status: "matched"; product: InventoryDraftMatchedProduct; score: number }
  | { status: "ambiguous"; candidates: Array<{ product: InventoryDraftMatchedProduct; score: number }> }
  | { status: "not_found" };

export type InventoryStockAddDraftRowResult =
  | { status: "matched"; row: InventoryDraftRow; score: number }
  | { status: "ambiguous"; row: InventoryDraftRow; candidates: InventoryDraftCandidate[] }
  | { status: "not_found"; query: string; quantity: number };

const buildDraftKeySuffix = () => {
  if (typeof globalThis !== "undefined") {
    const runtimeCrypto = globalThis.crypto;
    if (runtimeCrypto?.randomUUID) {
      return runtimeCrypto.randomUUID();
    }

    if (runtimeCrypto?.getRandomValues) {
      const bytes = runtimeCrypto.getRandomValues(new Uint8Array(12));
      return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createInventoryIntakeIdempotencyKey = () => `inventory-intake-${buildDraftKeySuffix()}`;

export const createEmptyInventoryDraft = (): StoreInventoryDraft => ({
  rows: [],
  lastReceipt: null,
  idempotencyKey: null,
});

export const appendInventoryDraftRows = (currentRows: InventoryDraftRow[], nextRows: InventoryDraftRow[]) => {
  const currentMaxLineNumber = currentRows.reduce((max, row) => Math.max(max, row.lineNumber), 0);

  return [
    ...currentRows,
    ...nextRows.map((row, index) => ({
      ...row,
      lineNumber: currentMaxLineNumber + index + 1,
    })),
  ];
};

const normalizeInventorySearchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(de|del|la|las|el|los|un|una|unos|unas)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const levenshteinDistance = (left: string, right: string) => {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const matrix = Array.from({ length: left.length + 1 }, () => Array.from({ length: right.length + 1 }, () => 0));
  for (let row = 0; row <= left.length; row += 1) {
    matrix[row]![0] = row;
  }
  for (let column = 0; column <= right.length; column += 1) {
    matrix[0]![column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row]![column] = Math.min(
        matrix[row - 1]![column]! + 1,
        matrix[row]![column - 1]! + 1,
        matrix[row - 1]![column - 1]! + cost,
      );
    }
  }

  return matrix[left.length]![right.length]!;
};

const similarityScore = (left: string, right: string) => {
  if (!left || !right) {
    return 0;
  }

  const longest = Math.max(left.length, right.length);
  return 1 - levenshteinDistance(left, right) / longest;
};

const compactInventoryText = (value: string) => normalizeInventorySearchText(value).replace(/\s+/g, "");

const scoreInventoryRowMatch = (row: InventoryDraftRow, query: string) => {
  const normalizedQuery = normalizeInventorySearchText(query);
  const normalizedName = normalizeInventorySearchText(row.name);
  const normalizedRawText = normalizeInventorySearchText(row.rawText);
  const normalizedSku = normalizeInventorySearchText(row.sku ?? "");

  if (!normalizedQuery || (!normalizedName && !normalizedRawText && !normalizedSku)) {
    return 0;
  }

  if (normalizedName === normalizedQuery || normalizedSku === normalizedQuery) {
    return 1;
  }

  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const compactName = normalizedName.replace(/\s+/g, "");

  if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName) || compactQuery.includes(compactName)) {
    return 0.92;
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const haystackTokens = new Set(`${normalizedName} ${normalizedRawText} ${normalizedSku}`.split(" ").filter(Boolean));
  const matchedTokens = queryTokens.filter((token) => haystackTokens.has(token));
  if (queryTokens.length === 0) {
    return 0;
  }

  return matchedTokens.length / queryTokens.length;
};

const scoreInventoryProductMatch = (product: InventoryDraftMatchedProduct, query: string) => {
  const normalizedQuery = normalizeInventorySearchText(query);
  const normalizedName = normalizeInventorySearchText(product.name);
  const normalizedSku = normalizeInventorySearchText(product.sku ?? "");

  if (!normalizedQuery || (!normalizedName && !normalizedSku)) {
    return 0;
  }

  const compactQuery = compactInventoryText(query);
  const compactName = compactInventoryText(product.name);
  const compactSku = compactInventoryText(product.sku ?? "");

  if (normalizedName === normalizedQuery || normalizedSku === normalizedQuery || (compactSku && compactSku === compactQuery)) {
    return 1;
  }

  let score = similarityScore(normalizedQuery, normalizedName) * 0.82;

  if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName) || (compactName && compactQuery.includes(compactName))) {
    score = Math.max(score, 0.9);
  }

  if (compactSku && compactQuery.length >= 4 && (compactSku.includes(compactQuery) || compactQuery.includes(compactSku))) {
    score = Math.max(score, compactSku === compactQuery ? 1 : 0.96);
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const nameTokens = normalizedName.split(" ").filter(Boolean);
  if (queryTokens.length > 0 && nameTokens.length > 0) {
    const tokenScores = queryTokens.map((token) =>
      nameTokens.reduce((best, candidate) => Math.max(best, similarityScore(token, candidate)), 0),
    );
    const tokenHits = tokenScores.filter((tokenScore) => tokenScore >= 0.72).length;
    const averageTokenScore = tokenScores.reduce((sum, tokenScore) => sum + tokenScore, 0) / tokenScores.length;
    const minimumTokenScore = Math.min(...tokenScores);

    score = Math.max(score, averageTokenScore * 0.92);

    if (tokenHits === queryTokens.length) {
      score = Math.max(score, minimumTokenScore >= 0.9 ? 0.98 : minimumTokenScore >= 0.8 ? 0.94 : 0.9);
    } else if (tokenHits > 0) {
      score = Math.max(score, 0.62 + (tokenHits / queryTokens.length) * 0.18 + averageTokenScore * 0.08);
    }
  }

  return score;
};

const numberWords = new Map<string, number>([
  ["un", 1],
  ["una", 1],
  ["uno", 1],
  ["dos", 2],
  ["tres", 3],
  ["cuatro", 4],
  ["cinco", 5],
  ["seis", 6],
  ["siete", 7],
  ["ocho", 8],
  ["nueve", 9],
  ["diez", 10],
]);

const normalizeInventoryCommandText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const INVENTORY_ADD_VERBS = /^(?:agrega|agregar|anade|anadir|suma|sumar|carga|cargar|ingresa|ingresar|registra|registrar|mete|meter|pon|poner)\s+/i;
const INVENTORY_CONTEXT_PREFIX = /^(?:(?:al|a la|en el|en la)\s+)?(?:inventario|existencia|existencias|stock)\s+/i;
const INVENTORY_UNIT_WORDS = /(?:piezas?|pzas?|pz|unidades?|uds?|cajas?|bolsas?|botellas?|latas?)?/i;
const INVENTORY_CONTEXT_SUFFIX = /\s+(?:(?:al|a la|en el|en la)\s+)?(?:inventario|existencia|existencias|stock)\s*$/i;
const INVENTORY_ALL_MATCHING_PREFIX = /^(?:cada|todos?\s+los?|todas?\s+las?)\s+/i;

const cleanInventoryProductQuery = (value: string) =>
  value
    .replace(INVENTORY_CONTEXT_SUFFIX, "")
    .replace(INVENTORY_ALL_MATCHING_PREFIX, "")
    .replace(/^(?:de|del|la|el|los|las)\s+/i, "")
    .trim();

const parseInventoryQuantityToken = (value: string) => {
  const quantityToken = value.toLowerCase();
  return Number.isNaN(Number(quantityToken)) ? (numberWords.get(quantityToken) ?? 0) : Number(quantityToken);
};

const parseInventoryStockAddSegment = (segment: string): InventoryStockAddRequest | null => {
  const quantityPattern = new RegExp(`^(\\d+|${[...numberWords.keys()].join("|")})\\s*${INVENTORY_UNIT_WORDS.source}\\s*(?:de\\s+|del\\s+|la\\s+|el\\s+|los\\s+|las\\s+)?(.+)$`, "i");
  const match = segment.trim().match(quantityPattern);
  if (!match) {
    return null;
  }

  const quantity = parseInventoryQuantityToken(match[1]!);
  const rawQuery = match[2]!.trim();
  const mode = INVENTORY_ALL_MATCHING_PREFIX.test(rawQuery) ? "all_matching" : "single";
  const query = cleanInventoryProductQuery(rawQuery);

  if (!query || quantity <= 0) {
    return null;
  }

  return {
    query,
    quantity,
    ...(mode === "all_matching" ? { mode } : {}),
  };
};

export const extractInventoryStockAddRequests = (content: string): InventoryStockAddRequest[] => {
  const normalized = normalizeInventoryCommandText(content);
  if (!normalized || !INVENTORY_ADD_VERBS.test(normalized)) {
    return [];
  }

  let remaining = normalized.replace(INVENTORY_ADD_VERBS, "").trim();
  remaining = remaining.replace(INVENTORY_CONTEXT_PREFIX, "").trim();

  const firstRequest = parseInventoryStockAddSegment(remaining);
  if (!firstRequest) {
    return [];
  }

  const segmentPattern = new RegExp(`(?:^|\\s+(?:y|,|;|ademas|tambien)\\s+)(\\d+|${[...numberWords.keys()].join("|")})\\s*${INVENTORY_UNIT_WORDS.source}\\s*(?:de\\s+|del\\s+|la\\s+|el\\s+|los\\s+|las\\s+)?(.+?)(?=\\s+(?:y|,|;|ademas|tambien)\\s+(?:\\d+|${[...numberWords.keys()].join("|")})\\s*${INVENTORY_UNIT_WORDS.source}\\s*(?:de\\s+|del\\s+|la\\s+|el\\s+|los\\s+|las\\s+)?|$)`, "gi");
  const requests: InventoryStockAddRequest[] = [];

  for (const match of remaining.matchAll(segmentPattern)) {
    const quantity = parseInventoryQuantityToken(match[1]!);
    const rawQuery = match[2]!.trim();
    const mode = INVENTORY_ALL_MATCHING_PREFIX.test(rawQuery) ? "all_matching" : "single";
    const query = cleanInventoryProductQuery(rawQuery);
    if (query && quantity > 0) {
      requests.push({
        query,
        quantity,
        ...(mode === "all_matching" ? { mode } : {}),
      });
    }
  }

  return requests.length > 0 ? requests : [firstRequest];
};

export const extractInventoryStockAddRequest = (content: string): InventoryStockAddRequest | null => {
  return extractInventoryStockAddRequests(content)[0] ?? null;
};

export const rankInventoryProductsByQuery = (products: InventoryDraftMatchedProduct[], query: string) =>
  products
    .map((product) => ({ product, score: scoreInventoryProductMatch(product, query) }))
    .filter((entry) => entry.score >= 0.45)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

export const findInventoryProductByQuery = (products: InventoryDraftMatchedProduct[], query: string): InventoryProductQueryMatch => {
  const ranked = rankInventoryProductsByQuery(products, query);
  const [best, second] = ranked;
  if (!best) {
    return { status: "not_found" };
  }

  const confidentSingleMatch = best.score >= 0.64 && (!second || best.score - second.score >= 0.08 || second.score < 0.56);
  if (!confidentSingleMatch) {
    return { status: "ambiguous", candidates: ranked.slice(0, 3) };
  }

  return { status: "matched", product: best.product, score: best.score };
};

export const buildInventoryStockAddDraftRow = (
  request: InventoryStockAddRequest,
  products: InventoryDraftMatchedProduct[],
  options: { id: string; lineNumber: number },
): InventoryStockAddDraftRowResult => {
  const match = findInventoryProductByQuery(products, request.query);
  if (match.status === "not_found") {
    return {
      status: "not_found",
      query: request.query,
      quantity: request.quantity,
    };
  }

  if (match.status === "ambiguous") {
    const candidates = match.candidates.map((candidate) => ({
      storeProductId: candidate.product.id,
      name: candidate.product.name,
      sku: candidate.product.sku,
      price: candidate.product.price,
      stock: candidate.product.stock,
      score: Number(candidate.score.toFixed(3)),
    }));

    return {
      status: "ambiguous",
      candidates,
      row: resolveInventoryRowState({
        id: options.id,
        lineNumber: options.lineNumber,
        rawText: `${request.quantity} ${request.query}`,
        name: request.query,
        quantity: request.quantity,
        status: "ambiguous",
        candidates,
      }),
    };
  }

  return {
    status: "matched",
    score: match.score,
    row: resolveInventoryRowState({
      id: options.id,
      lineNumber: options.lineNumber,
      rawText: `${request.quantity} ${request.query}`,
      name: match.product.name,
      sku: match.product.sku,
      quantity: request.quantity,
      price: match.product.price,
      status: "matched",
      action: "match_existing",
      matchedStoreProductId: match.product.id,
      matchedProduct: match.product,
    }),
  };
};

export type InventoryDraftRowQueryMatch =
  | { status: "matched"; row: InventoryDraftRow; score: number }
  | { status: "ambiguous"; candidates: Array<{ row: InventoryDraftRow; score: number }> }
  | { status: "not_found" };

export const findInventoryDraftRowByQuery = (rows: InventoryDraftRow[], query: string): InventoryDraftRowQueryMatch => {
  const ranked = rows
    .map((row) => ({ row, score: scoreInventoryRowMatch(row, query) }))
    .filter((entry) => entry.score >= 0.5)
    .sort((left, right) => right.score - left.score);

  const [best, second] = ranked;
  if (!best) {
    return { status: "not_found" };
  }

  if (second && best.score - second.score < 0.18) {
    return { status: "ambiguous", candidates: ranked.slice(0, 3) };
  }

  return { status: "matched", row: best.row, score: best.score };
};

export const parseInventoryQuantityCorrection = (content: string) => {
  const corrections = parseInventoryCorrections(content);
  return corrections[0] ?? null;
};

export type InventoryCorrection = {
  query: string;
  quantity?: number;
  price?: number;
};

const normalizeCorrectionText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const CORRECTION_VERBS = /^(?:corrige|corrigir|cambia|actualiza|ajusta|modifica|pon|haz)\s+/i;
const ARTICLES = /^(?:el|la|los|las|un|una|unos|unas)\s+/i;
const CONNECTORS = /^(?:y\s+|,\s+|;\s+|\/\s+)/i;

const QUANTITY_PATTERN = /\b(son|a|en|por)\s+(\d+)\s*(?:unidades|piezas|pz|uds|cajas|bolsas|botellas|latas)?\b/i;
const PRICE_PATTERN = /\b(?:precio(?:\s+de\s+venta)?|cuesta|vale)\s*(?:es|a|en|por)?\s*\$?(\d+(?:\.\d{1,2})?)\s*(?:pesos|mxn)?\b/i;
const INLINE_PRICE_PATTERN = /\b(?:y|con)\s+(?:precio(?:\s+de\s+venta)?\s+|a\s+)?\$?(\d+(?:\.\d{1,2})?)\s*(?:pesos|mxn)?\b/i;
const DIRECT_PRICE_PATTERN = /\b(?:precio(?:\s+de\s+venta)?|cuesta|vale)\s+(?:es|a|en|por)?\s*\$?(\d+(?:\.\d{1,2})?)\s*(?:pesos|mxn)?\b/i;

const stripLeadingVerbsAndArticles = (segment: string): string => {
  let cleaned = segment.replace(CORRECTION_VERBS, "").trim();
  // Strip connectors and articles repeatedly
  while (true) {
    const next = cleaned.replace(CONNECTORS, "").trim();
    if (next === cleaned) break;
    cleaned = next;
  }
  while (true) {
    const next = cleaned.replace(ARTICLES, "").trim();
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned;
};

const extractQuantity = (segment: string): { value: number; raw: string; index: number } | null => {
  const match = segment.match(QUANTITY_PATTERN);
  if (!match) return null;
  return {
    value: Number(match[2]),
    raw: match[0],
    index: match.index ?? 0,
  };
};

const extractPrice = (segment: string): { value: number; raw: string; index: number } | null => {
  const match = segment.match(PRICE_PATTERN);
  if (!match) return null;
  return {
    value: Number(match[1]),
    raw: match[0],
    index: match.index ?? 0,
  };
};

const extractInlinePriceAfter = (segment: string, afterIndex: number): { value: number; raw: string } | null => {
  const substring = segment.slice(afterIndex);
  const match = substring.match(INLINE_PRICE_PATTERN);
  if (!match) return null;
  return {
    value: Number(match[1]),
    raw: match[0],
  };
};

export const parseInventoryCorrections = (content: string): InventoryCorrection[] => {
  const normalized = normalizeCorrectionText(content);
  if (!normalized) return [];

  const results: InventoryCorrection[] = [];
  let remaining = normalized;

  while (remaining.length > 0) {
    const qty = extractQuantity(remaining);
    if (!qty) break;

    // The product name is everything before the quantity marker
    const beforeQty = remaining.slice(0, qty.index).trim();
    const query = stripLeadingVerbsAndArticles(beforeQty);

    if (!query) {
      // Move past this quantity to avoid infinite loop
      remaining = remaining.slice(qty.index + qty.raw.length);
      continue;
    }

    const correction: InventoryCorrection = { query, quantity: qty.value };

    // Look for an inline price right after the quantity
    // e.g. "son 15 y precio 25" or "son 15 piezas precio 25"
    const afterQtyText = remaining.slice(qty.index + qty.raw.length);
    let inlinePrice = extractInlinePriceAfter(remaining, qty.index + qty.raw.length);
    if (!inlinePrice) {
      const directPriceMatch = afterQtyText.match(DIRECT_PRICE_PATTERN);
      if (directPriceMatch) {
        inlinePrice = {
          value: Number(directPriceMatch[1]),
          raw: directPriceMatch[0],
        };
      }
    }
    if (inlinePrice) {
      correction.price = inlinePrice.value;
    }

    results.push(correction);

    // Advance remaining text to after the quantity (and inline price if found)
    const advanceTo = inlinePrice
      ? qty.index + qty.raw.length + (remaining.slice(qty.index + qty.raw.length).indexOf(inlinePrice.raw) + inlinePrice.raw.length)
      : qty.index + qty.raw.length;
    remaining = remaining.slice(advanceTo).trim();
  }

  // Handle price-only corrections (no quantity mentioned)
  // e.g. "cambia el precio del panque a 25" or "panque precio 25"
  // Only process if we haven't already captured a price for this product
  const remainingPrice = extractPrice(normalized);
  if (remainingPrice && results.length === 0) {
    const beforePrice = normalized.slice(0, remainingPrice.index).trim();
    // Try to extract product name from "precio del [producto]" pattern
    const priceOfMatch = beforePrice.match(/(?:precio|precio de venta|cuesta|vale)\s+(?:del|de\s+la|de\s+los|de\s+las)\s+(.+)$/i);
    if (priceOfMatch) {
      results.push({
        query: stripLeadingVerbsAndArticles(priceOfMatch[1]),
        price: remainingPrice.value,
      });
    }
  }

  // If nothing found with quantities but the whole text looks like a single
  // product reference with a trailing number, try one more heuristic
  if (results.length === 0) {
    const fallbackMatch = normalized.match(/(?:corrige|corrigir|cambia|actualiza|ajusta|modifica|pon|haz)?\s*(?:el|la|los|las|un|una)?\s*(.+?)\s+(?:a|en|por)\s+\$?(\d+(?:\.\d{1,2})?)\s*(?:pesos|mxn)?\b/i);
    if (fallbackMatch) {
      results.push({
        query: fallbackMatch[1].trim(),
        price: Number(fallbackMatch[2]),
      });
    }
  }

  return results;
};

export const applyInventoryDraftRowPatch = (
  row: InventoryDraftRow,
  patch: Partial<Pick<InventoryDraftRow, "name" | "sku" | "quantity" | "price" | "action" | "matchedStoreProductId" | "matchedProduct">>,
) => resolveInventoryRowState({
  ...row,
  name: patch.name ?? row.name,
  sku: patch.sku ?? row.sku,
  quantity: patch.quantity ?? row.quantity,
  price: patch.price ?? row.price,
  action: patch.action ?? row.action,
  matchedStoreProductId: patch.matchedStoreProductId ?? row.matchedStoreProductId,
  matchedProduct: patch.matchedProduct ?? row.matchedProduct,
  rawText: patch.name ?? row.rawText,
});

export const getInventoryDraftSummary = (draft: StoreInventoryDraft) => ({
  rows: draft.rows.length,
  quantity: draft.rows.reduce((sum, row) => sum + (row.status === 'invalid' ? 0 : row.quantity), 0),
  matched: draft.rows.filter((row) => row.status === 'matched').length,
  created: draft.rows.filter((row) => row.action === 'create_new').length,
  ambiguous: draft.rows.filter((row) => row.status === 'ambiguous').length,
  invalid: draft.rows.filter((row) => row.status === 'invalid').length,
});

export const formatInventoryCount = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

export const buildInventoryDraftSummaryText = (draft: StoreInventoryDraft) => {
  const summary = getInventoryDraftSummary(draft);
  if (summary.rows === 0) {
    return "El borrador de inventario está vacío.";
  }

  const rowLines = draft.rows.map((row) => {
    const state = row.status === "matched"
      ? "existente"
      : row.status === "new"
        ? "nuevo"
        : row.status === "ambiguous"
          ? "pendiente"
          : "inválido";
    const sku = row.sku ? `, SKU ${row.sku}` : "";
    const price = row.price !== undefined ? `, precio $${row.price}` : "";
    return `- Línea ${row.lineNumber}: ${row.quantity} x ${row.name}${sku}${price} (${state})`;
  });

  return [
    `Resumen: ${formatInventoryCount(summary.rows, "fila", "filas")}, ${formatInventoryCount(summary.quantity, "pieza", "piezas")}, ${formatInventoryCount(summary.ambiguous + summary.invalid, "pendiente", "pendientes")}.`,
    ...rowLines,
  ].join("\n");
};

export const buildInventoryAgentActions = (draft: StoreInventoryDraft) => {
  const firstPending = draft.rows.find((row) => row.status === "ambiguous" && row.candidates && row.candidates.length > 0);
  if (firstPending?.candidates?.length) {
    return firstPending.candidates.slice(0, 4).map((candidate) => ({
      id: `inventory-choice-${firstPending.id}-${candidate.storeProductId}`,
      label: candidate.name,
      prompt: `Selecciona el producto existente para la fila de inventario. rowId=${firstPending.id} storeProductId=${candidate.storeProductId}`,
      variant: "secondary" as const,
    }));
  }

  const actions = [];
  if (canConfirmInventoryDraft(draft)) {
    actions.push({
      id: "inventory-confirm",
      label: "Confirmar entrada",
      prompt: "Confirma la entrada de inventario actual.",
      variant: "primary" as const,
    });
  }
  if (draft.rows.length > 0) {
    actions.push({
      id: "inventory-summary",
      label: "Resumen",
      prompt: "Dame un resumen del borrador de inventario actual.",
      variant: "secondary" as const,
    });
    actions.push({
      id: "inventory-clear",
      label: "Vaciar borrador",
      prompt: "Vacía el borrador de inventario actual.",
      variant: "danger" as const,
    });
  }

  return actions;
};

export const canConfirmInventoryDraft = (draft: StoreInventoryDraft) =>
  draft.rows.length > 0 && draft.rows.every((row) => {
    if (row.quantity <= 0 || !row.name.trim()) {
      return false;
    }

    if (row.action === 'match_existing') {
      return Boolean(row.matchedStoreProductId);
    }

    if (row.action === 'create_new') {
      return row.price !== undefined && row.price >= 0;
    }

    return false;
  });

export const resolveInventoryRowState = (row: InventoryDraftRow): InventoryDraftRow => {
  const name = row.name.trim();
  const quantity = Number.isFinite(row.quantity) ? row.quantity : 0;

  if (!name || quantity <= 0) {
    return {
      ...row,
      status: 'invalid',
      action: undefined,
      errors: ['Completa nombre y cantidad para poder confirmar esta fila.'],
    };
  }

  if (row.action === 'match_existing' && row.matchedStoreProductId) {
    return {
      ...row,
      status: 'matched',
      errors: undefined,
    };
  }

  if (row.action === 'create_new') {
    return {
      ...row,
      status: 'new',
      errors: row.price === undefined ? ['Agrega precio para crear este producto nuevo.'] : undefined,
    };
  }

  if (row.candidates && row.candidates.length > 0) {
    return {
      ...row,
      status: 'ambiguous',
      errors: ['Selecciona un producto existente o cámbialo a producto nuevo.'],
    };
  }

  return {
    ...row,
    status: row.price === undefined ? 'invalid' : 'new',
    action: row.price === undefined ? undefined : 'create_new',
    errors: row.price === undefined ? ['Agrega precio para crear este producto nuevo.'] : undefined,
  };
};
