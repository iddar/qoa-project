import { Elysia } from 'elysia';

import { cors } from '@elysiajs/cors';
import { healthModule } from '../modules/health';
import { authModule } from '../modules/auth';
import { usersModule } from '../modules/users';
import { openApiPlugin } from './plugins/openapi';

export const createApp = () =>
  new Elysia({ name: 'qoa-app', prefix: '/v1' })
    .use(cors())
    .use(openApiPlugin)
    .use(healthModule)
    .use(authModule)
    .use(usersModule);
