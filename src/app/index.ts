import { Elysia } from 'elysia';

import { cors } from '@elysiajs/cors';
import { Logestic } from 'logestic';

import { authModule } from '../modules/auth';
import { cardsModule } from '../modules/cards';
import { healthModule } from '../modules/health';
import { storesModule } from '../modules/stores';
import { usersModule } from '../modules/users';
import { openApiPlugin } from './plugins/openapi';

export const createApp = () =>
  new Elysia({ name: 'qoa-app', prefix: '/v1' })
    .use(Logestic.preset('common'))
    .use(cors())
    .use(openApiPlugin)
    .use(healthModule)
    .use(authModule)
    .use(usersModule)
    .use(storesModule)
    .use(cardsModule);

export type App = ReturnType<typeof createApp>;
