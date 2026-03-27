import { createApp } from './app';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const publicHost = process.env.PUBLIC_HOST ?? host;

const app = createApp().listen({ port, hostname: host } as any);
const hostname = app.server?.hostname ?? host;
const actualPort = app.server?.port ?? port;

console.log(`QOA API listening on http://${hostname}:${actualPort}`);
if (publicHost !== hostname) {
  console.log(`QOA API LAN URL: http://${publicHost}:${actualPort}`);
}
console.log('OpenAPI UI: /openapi • Spec: /openapi/json');
