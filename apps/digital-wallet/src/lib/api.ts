import { treaty } from "@elysiajs/eden";
import type { App } from "@qoa/core/app";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export const api = treaty<App>(apiBaseUrl);
