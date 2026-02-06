import { t } from 'elysia';

export const healthResponse = t.Object({
  status: t.Literal('ok'),
  uptime: t.Number(),
  timestamp: t.String({ format: 'date-time' }),
});

export type HealthResponse = {
  status: 'ok';
  uptime: number;
  timestamp: string;
};
