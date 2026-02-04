import { Elysia } from "elysia";

import { cors } from '@elysiajs/cors';
import { healthModule } from "../modules/health";
import { openApiPlugin } from "./plugins/openapi";

export const createApp = () =>
  new Elysia({ name: "qoa-app" })
    .use(cors())
    .use(openApiPlugin)
    .use(healthModule);

