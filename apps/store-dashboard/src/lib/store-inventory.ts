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
