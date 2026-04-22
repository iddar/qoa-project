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

  if (row.action === 'match_existing' && row.matchedStoreProductId && row.matchedProduct) {
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
