import { Elysia } from 'elysia';

import { cors } from '@elysiajs/cors';
import { Logestic } from 'logestic';

import { authModule } from '../modules/auth';
import { alertsModule } from '../modules/alerts';
import { campaignsModule } from '../modules/campaigns';
import { catalogModule } from '../modules/catalog';
import { cardsModule } from '../modules/cards';
import { healthModule } from '../modules/health';
import { jobsModule } from '../modules/jobs';
import { reportsModule } from '../modules/reports';
import { rewardsModule } from '../modules/rewards';
import { storesModule } from '../modules/stores';
import { transactionsModule } from '../modules/transactions';
import { usersModule } from '../modules/users';
import { whatsappModule } from '../modules/whatsapp';
import { attachTraceToErrorResponses, normalizeUnhandledErrors, registerTraceContext } from './plugins/observability';
import { openApiPlugin } from './plugins/openapi';

export const createApp = () =>
  new Elysia({ name: 'qoa-app', prefix: '/v1' })
    .use(Logestic.preset('common'))
    .use(cors())
    .onRequest(registerTraceContext)
    .mapResponse(attachTraceToErrorResponses)
    .onError(normalizeUnhandledErrors)
    .use(openApiPlugin)
    .use(healthModule)
    .use(alertsModule)
    .use(authModule)
    .use(catalogModule)
    .use(campaignsModule)
    .use(usersModule)
    .use(storesModule)
    .use(cardsModule)
    .use(transactionsModule)
    .use(rewardsModule)
    .use(reportsModule)
    .use(whatsappModule)
    .use(jobsModule);

export type App = ReturnType<typeof createApp>;
