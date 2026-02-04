import { Elysia } from 'elysia';
import { healthResponse } from './model';

export const healthModule = new Elysia({
  prefix: '/health',
  detail: {
    tags: ['Health'],
  },
}).get(
  '/',
  () => ({
    status: 'ok' as const,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }),
  {
    response: {
      200: healthResponse,
    },
    detail: {
      summary: 'Basic service health check',
      description: 'Returns uptime metadata so orchestrators can verify the service.',
    },
  },
);
