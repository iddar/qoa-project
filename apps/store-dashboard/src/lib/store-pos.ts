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
  quantity: number;
};

export type DraftAccumulation = {
  cardId: string;
  campaignId: string;
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
  score: number;
};

export type StorePosDraft = {
  items: DraftItem[];
  customer: DraftCustomer | null;
  lastTransaction: DraftTransaction | null;
  pendingProductChoices?: DraftPendingProductChoice[];
};

export type AgentAttachment = {
  id: string;
  name: string;
  contentType: string;
  dataUrl: string;
  kind?: "image" | "audio";
  durationMs?: number;
  transcript?: string;
  status?: "pending" | "ready" | "processing" | "transcribed" | "failed";
};

export type AgentAction = {
  id: string;
  label: string;
  prompt: string;
  kind?: "prompt" | "capture-qr";
  variant?: "primary" | "secondary" | "danger";
};

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  renderedHtml?: string;
  customerCard?: DraftCustomer;
  attachments?: AgentAttachment[];
  actions?: AgentAction[];
};

export const createEmptyDraft = (): StorePosDraft => ({
  items: [],
  customer: null,
  lastTransaction: null,
  pendingProductChoices: [],
});

export const getDraftTotal = (draft: StorePosDraft) =>
  draft.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

export const getDraftItemCount = (draft: StorePosDraft) =>
  draft.items.reduce((sum, item) => sum + item.quantity, 0);
