export type DraftCustomer = {
  userId: string;
  cardId?: string;
  cardCode?: string;
  name?: string;
  phone: string;
  email?: string;
};

export type DraftItem = {
  storeProductId: string;
  productId?: string;
  name: string;
  sku?: string;
  unitType?: string;
  price: number;
  stock?: number;
  quantity: number;
};

export type DraftAccumulation = {
  cardId: string;
  campaignId: string;
  campaignName?: string;
  accumulated: number;
  newBalance: number;
  sourceType: string;
  codeCaptureId?: string;
  codeValue?: string;
};

export type DraftTransaction = {
  id: string;
  userId?: string;
  storeId: string;
  cardId?: string;
  totalAmount: number;
  guestFlag: boolean;
  customer?: DraftCustomer;
  accumulations: DraftAccumulation[];
  pointsTotal?: number;
  notificationStatus?: "sent" | "skipped" | "failed";
  createdAt: string;
  items: Array<{
    id?: string;
    storeProductId: string;
    productId?: string;
    name: string;
    quantity: number;
    amount: number;
  }>;
};

export type DraftPendingProductChoice = {
  storeProductId: string;
  name: string;
  price: number;
  stock?: number;
  score: number;
};

export type DraftPendingProductContext = {
  originalQuery: string;
  categoryHint?: string;
};

export type StorePosDraft = {
  items: DraftItem[];
  customer: DraftCustomer | null;
  lastTransaction: DraftTransaction | null;
  pendingProductChoices?: DraftPendingProductChoice[];
  pendingProductContext?: DraftPendingProductContext | null;
};

export type AgentAttachment = {
  id: string;
  name: string;
  contentType: string;
  dataUrl: string;
  previewUrl?: string;
  kind?: "image" | "audio";
  durationMs?: number;
  transcript?: string;
  status?: "pending" | "ready" | "processing" | "transcribed" | "failed";
  debug?: {
    source?: "live" | "upload";
    sizeBytes?: number;
    mimeType?: string;
    averageLevel?: number;
    peakLevel?: number;
    signalDetected?: boolean;
  };
};

export type AgentAction = {
  id: string;
  label: string;
  prompt: string;
  kind?: "prompt" | "capture-qr";
  variant?: "primary" | "secondary" | "danger";
};

export type AgentAddedItem = {
  storeProductId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  renderedHtml?: string;
  customerCard?: DraftCustomer;
  addedItems?: AgentAddedItem[];
  attachments?: AgentAttachment[];
  actions?: AgentAction[];
};

export const createEmptyDraft = (): StorePosDraft => ({
  items: [],
  customer: null,
  lastTransaction: null,
  pendingProductChoices: [],
  pendingProductContext: null,
});

export const getDraftTotal = (draft: StorePosDraft) =>
  draft.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

export const getDraftItemCount = (draft: StorePosDraft) =>
  draft.items.reduce((sum, item) => sum + item.quantity, 0);

export const getStockLimitedQuantity = (quantity: number, stock?: number) => {
  const normalizedQuantity = Math.max(quantity, 0);
  if (typeof stock !== "number") {
    return normalizedQuantity;
  }

  return Math.min(normalizedQuantity, Math.max(stock, 0));
};
