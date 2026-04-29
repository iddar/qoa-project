import { treaty } from "@elysiajs/eden";
import type { App } from "@qoa/core/app";

export const api = treaty<App>(
  (process.env.NEXT_PUBLIC_API_URL ?? "https://qoacore-production.up.railway.app") as unknown as App,
);
