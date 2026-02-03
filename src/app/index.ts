import { Elysia } from "elysia";
import { openApiPlugin } from "./plugins/openapi";
import { healthModule } from "../modules/health";

export const createApp = () =>
  new Elysia({ name: "qoa-app" })
    .use(openApiPlugin)
    .use(healthModule);

