export const env = {
  apiUrl: process.env.API_URL ?? "http://localhost:3000",
  backofficeUrl: process.env.BACKOFFICE_URL ?? "http://localhost:3001",
  cpgPortalUrl: process.env.CPG_PORTAL_URL ?? "http://localhost:3002",
  storeDashboardUrl: process.env.STORE_DASHBOARD_URL ?? "http://localhost:3003",
  walletUrl: process.env.WALLET_URL ?? "http://localhost:3004",
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
  },
};
