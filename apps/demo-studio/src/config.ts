import path from "node:path";

export const workspaceRoot = path.resolve(import.meta.dir, "../../..");
export const appRoot = path.resolve(import.meta.dir, "..");
export const publicDir = path.join(appRoot, "public");
export const generatedDir = path.join(publicDir, "generated");
export const recordingsDir = path.join(publicDir, "recordings");
export const outDir = path.join(appRoot, "out");
export const statePath = path.join(generatedDir, "demo-state.json");

export const env = {
  apiUrl: process.env.API_URL ?? "http://localhost:3000",
  backofficeUrl: process.env.BACKOFFICE_URL ?? "http://localhost:3001",
  cpgPortalUrl: process.env.CPG_PORTAL_URL ?? "http://localhost:3002",
  storeDashboardUrl: process.env.STORE_DASHBOARD_URL ?? "http://localhost:3003",
  walletUrl: process.env.WALLET_URL ?? "http://localhost:3004",
  scope: process.env.QOA_DEMO_SCOPE ?? "development",
  creds: {
    admin: {
      email: process.env.ADMIN_EMAIL ?? "admin.development@qoa.local",
      password: process.env.ADMIN_PASSWORD ?? "Password123!",
    },
    cpg: {
      email: process.env.CPG_EMAIL ?? "cpg.development@qoa.local",
      password: process.env.CPG_PASSWORD ?? "Password123!",
    },
    store: {
      email: process.env.STORE_EMAIL ?? "store.development@qoa.local",
      password: process.env.STORE_PASSWORD ?? "Password123!",
    },
    consumer: {
      email: process.env.CONSUMER_EMAIL ?? "consumer.development@qoa.local",
      password: process.env.CONSUMER_PASSWORD ?? "Password123!",
    },
  },
};

export type DemoState = {
  generatedAt: string;
  apiUrl: string;
  scope: string;
  store: { id: string; code: string; name: string };
  wallet: {
    cardId: string;
    cardCode: string;
    qrPayload: unknown;
    qrText: string;
    qrPng: string;
  };
  products: Array<{
    id: string;
    name: string;
    sku?: string;
    price: number;
    stock: number;
  }>;
  assets: {
    inventoryPhoto: string;
    posVoice: string;
    inventoryVoice: string;
  };
};
