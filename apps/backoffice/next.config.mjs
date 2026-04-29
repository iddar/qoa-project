import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corePublicUrl = process.env.NEXT_PUBLIC_API_URL
  ?? (process.env.RAILWAY_SERVICE__QOA_CORE_URL
    ? `https://${process.env.RAILWAY_SERVICE__QOA_CORE_URL}`
    : "https://qoacore-production.up.railway.app");
const cpgPortalUrl = process.env.NEXT_PUBLIC_CPG_PORTAL_URL
  ?? (process.env.RAILWAY_SERVICE_CPG_PORTAL_URL
    ? `https://${process.env.RAILWAY_SERVICE_CPG_PORTAL_URL}`
    : undefined);
const storeDashboardUrl = process.env.NEXT_PUBLIC_STORE_DASHBOARD_URL
  ?? (process.env.RAILWAY_SERVICE_STORE_DASHBOARD_URL
    ? `https://${process.env.RAILWAY_SERVICE_STORE_DASHBOARD_URL}`
    : undefined);
const walletUrl = process.env.NEXT_PUBLIC_WALLET_URL
  ?? (process.env.RAILWAY_SERVICE_DIGITAL_WALLET_URL
    ? `https://${process.env.RAILWAY_SERVICE_DIGITAL_WALLET_URL}`
    : undefined);
const allowedDevOrigins = [...new Set([
  "192.168.1.203",
  process.env.PUBLIC_HOST,
  ...(process.env.ALLOWED_DEV_ORIGINS?.split(",") ?? []).map((origin) => origin.trim()).filter(Boolean),
].filter(Boolean))];

const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  allowedDevOrigins,
  env: {
    NEXT_PUBLIC_API_URL: corePublicUrl,
    NEXT_PUBLIC_CPG_PORTAL_URL: cpgPortalUrl,
    NEXT_PUBLIC_STORE_DASHBOARD_URL: storeDashboardUrl,
    NEXT_PUBLIC_WALLET_URL: walletUrl,
  },
};

export default nextConfig;
