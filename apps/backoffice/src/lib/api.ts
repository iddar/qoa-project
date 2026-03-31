import { treaty } from "@elysiajs/eden";
import type { App } from "@qoa/core/app";

const apiBaseUrl = typeof window === "undefined"
  ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"
  : window.location.origin;

export const api = treaty<App>(apiBaseUrl);
