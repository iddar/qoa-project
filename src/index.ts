import { createApp } from './app';

const port = Number(process.env.PORT ?? 3000);

const app = createApp().listen(port);
const hostname = app.server?.hostname ?? 'localhost';
const actualPort = app.server?.port ?? port;

console.log(`QOA API listening on http://${hostname}:${actualPort}`);
console.log('OpenAPI UI: /openapi • Spec: /openapi/json');
