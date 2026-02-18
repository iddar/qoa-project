import { Elysia, t } from 'elysia';
import { authGuard, authPlugin, type AuthContext } from '../../app/plugins/auth';
import { collectPlatformAlerts } from '../../services/alerts';
import { sendEmailMock } from '../../services/notifications';
import type { StatusHandler } from '../../types/handlers';
import { alertListResponse, alertNotifyRequest, alertNotifyResponse } from './model';

const adminRoles = ['qoa_support', 'qoa_admin'] as const;

const authHeader = t.Object({
  authorization: t.Optional(
    t.String({
      description: 'Bearer <accessToken>',
    }),
  ),
});

type AlertListContext = {
  auth: AuthContext | null;
  status: StatusHandler;
};

type AlertNotifyContext = {
  auth: AuthContext | null;
  body: {
    recipient?: string;
    minSeverity?: 'high' | 'critical';
  };
  status: StatusHandler;
};

export const alertsModule = new Elysia({
  prefix: '/alerts',
  detail: {
    tags: ['Alerts'],
  },
})
  .use(authPlugin)
  .get(
    '/',
    async ({ auth, status }: AlertListContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const alerts = await collectPlatformAlerts();

      return {
        data: alerts,
      };
    },
    {
      beforeHandle: authGuard({ roles: [...adminRoles] }),
      headers: authHeader,
      response: {
        200: alertListResponse,
      },
      detail: {
        summary: 'Listar alertas operativas de plataforma',
      },
    },
  )
  .post(
    '/notify',
    async ({ auth, body, status }: AlertNotifyContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const minSeverity = body.minSeverity ?? 'high';
      const recipient = body.recipient ?? process.env.ALERTS_DEFAULT_RECIPIENT ?? 'ops@qoa.local';

      const alerts = await collectPlatformAlerts();
      const filtered = alerts.filter((item) => {
        if (minSeverity === 'critical') {
          return item.severity === 'critical';
        }
        return item.severity === 'critical' || item.severity === 'high';
      });

      for (const alert of filtered) {
        await sendEmailMock({
          to: recipient,
          subject: `[QOA][${alert.severity.toUpperCase()}] ${alert.title}`,
          text: `${alert.message}\n\ncode=${alert.code}\nsource=${alert.source}\ncount=${alert.count}\nupdatedAt=${alert.updatedAt}`,
          alertCode: alert.code,
          severity: alert.severity,
          metadata: JSON.stringify(alert),
        });
      }

      return {
        data: {
          sent: filtered.length,
          recipient,
          severityFilter: minSeverity,
          mocked: true,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...adminRoles] }),
      headers: authHeader,
      body: alertNotifyRequest,
      response: {
        200: alertNotifyResponse,
      },
      detail: {
        summary: 'Notificar alertas por email (mock)',
      },
    },
  );
