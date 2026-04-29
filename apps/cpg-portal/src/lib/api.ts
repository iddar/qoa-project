import { treaty } from "@elysiajs/eden";
import type { App } from "@qoa/core/app";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL
  ?? "https://qoacore-production.up.railway.app";

export const api = treaty<App>(apiBaseUrl as unknown as App);
