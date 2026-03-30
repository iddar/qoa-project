import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiProxyTarget = process.env.QOA_API_PROXY_TARGET?.trim().replace(/\/$/, "");
const allowedDevOrigins = [...new Set([
  "192.168.1.203",
  process.env.PUBLIC_HOST,
  ...(process.env.ALLOWED_DEV_ORIGINS?.split(",") ?? []).map((origin) => origin.trim()).filter(Boolean),
].filter(Boolean))];

const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  allowedDevOrigins,
  typescript: { ignoreBuildErrors: true },
  async rewrites() {
    if (!apiProxyTarget) {
      return [];
    }

    return [
      {
        source: "/v1/:path*",
        destination: `${apiProxyTarget}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
