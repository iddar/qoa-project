type PurchaseItemInput = {
  productId: string;
  quantity?: number;
  amount?: number;
  metadata?: string;
};

type PurchasePayloadInput = {
  storeId?: string;
  cardId?: string;
  entityType?: string;
  entityId?: string;
  items?: PurchaseItemInput[];
  metadata?: string;
  payload?: unknown;
};

export type NormalizedPurchasePayload = {
  storeId: string;
  cardId?: string;
  items: Array<{
    productId: string;
    quantity: number;
    amount: number;
    metadata?: string;
  }>;
  metadata?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const sanitizeItem = (input: PurchaseItemInput) => {
  if (!input.productId || typeof input.productId !== 'string') {
    throw new Error('invalid_item_product');
  }

  const quantity = Number(input.quantity ?? 1);
  const amount = Number(input.amount ?? 0);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('invalid_item_quantity');
  }

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('invalid_item_amount');
  }

  return {
    productId: input.productId,
    quantity,
    amount,
    metadata: input.metadata,
  };
};

export const normalizePurchasePayload = (rawValue: string): NormalizedPurchasePayload => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error('invalid_json');
  }

  if (!isRecord(parsed)) {
    throw new Error('invalid_payload');
  }

  const payloadSource = (isRecord(parsed.payload) ? parsed.payload : parsed) as PurchasePayloadInput;
  const fallbackCardId =
    payloadSource.entityType === 'card' && typeof payloadSource.entityId === 'string' ? payloadSource.entityId : undefined;

  if (!payloadSource.storeId || typeof payloadSource.storeId !== 'string') {
    throw new Error('missing_store');
  }

  if (!Array.isArray(payloadSource.items) || payloadSource.items.length === 0) {
    throw new Error('missing_items');
  }

  return {
    storeId: payloadSource.storeId,
    cardId: payloadSource.cardId ?? fallbackCardId,
    items: payloadSource.items.map((item) => sanitizeItem(item)),
    metadata: payloadSource.metadata,
  };
};

export const purchasePayloadTemplate = `{
  "storeId": "STORE_UUID",
  "cardId": "CARD_UUID",
  "items": [
    {
      "productId": "PRODUCT_UUID",
      "quantity": 1,
      "amount": 85
    }
  ],
  "metadata": "compra desde wallet"
}`;
