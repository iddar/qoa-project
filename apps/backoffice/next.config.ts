import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Core handles its own type checking; avoid re-checking Elysia's
  // complex type inference with the backoffice's TS version.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
