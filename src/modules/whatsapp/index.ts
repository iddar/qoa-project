import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { authGuard, authPlugin, type AuthContext } from '../../app/plugins/auth';
import { backofficeRoles } from '../../app/plugins/roles';
import { authorizationHeader } from '../../app/plugins/schemas';
import { parseCursor, parseLimit } from '../../app/utils/pagination';
import { db } from '../../db/client';
import { whatsappMessages } from '../../db/schema';
import type { StatusHandler } from '../../types/handlers';
import {
  whatsappMessageListQuery,
  whatsappMessageListResponse,
  whatsappMetricsResponse,
  whatsappWebhookRequest,
  whatsappWebhookResponse,
} from './model';

const webhookHeader = t.Object({
  'x-whatsapp-signature': t.Optional(t.String()),
});

type MessageRow = {
  id: string;
  provider: string;
  externalMessageId: string;
  fromPhone: string;
  toPhone: string;
  textBody: string | null;
  status: 'received' | 'processed' | 'error' | 'replayed';
  replayCount: number;
  receivedAt: Date;
  processedAt: Date | null;
};

type WebhookContext = {
  body: {
    provider?: string;
    messageId: string;
    from: string;
    to: string;
    text?: string;
    timestamp?: string;
    metadata?: string;
  };
  headers: Record<string, string | undefined>;
  status: StatusHandler;
};

type MessageListContext = {
  auth: AuthContext | null;
  query: {
    status?: string;
    limit?: string;
    cursor?: string;
  };
  status: StatusHandler;
};

type MetricsContext = {
  auth: AuthContext | null;
  status: StatusHandler;
};

const serializeMessage = (row: MessageRow) => ({
  id: row.id,
  provider: row.provider,
  messageId: row.externalMessageId,
  from: row.fromPhone,
  to: row.toPhone,
  text: row.textBody ?? undefined,
  status: row.status,
  replayCount: row.replayCount,
  receivedAt: row.receivedAt.toISOString(),
  processedAt: row.processedAt ? row.processedAt.toISOString() : undefined,
});

const toSignature = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest('hex');

const signatureMatches = (provided: string | undefined, expected: string) => {
  if (!provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
};

export const whatsappModule = new Elysia({
  prefix: '/whatsapp',
  detail: {
    tags: ['WhatsApp'],
  },
})
  .use(authPlugin)
  .post(
    '/webhook',
    async ({ body, headers, status }: WebhookContext) => {
      const secret = process.env.WHATSAPP_WEBHOOK_SECRET ?? null;
      const rawPayload = JSON.stringify(body);

      if (secret) {
        const expected = toSignature(secret, rawPayload);
        if (!signatureMatches(headers['x-whatsapp-signature'], expected)) {
          return status(401, {
            error: {
              code: 'INVALID_WHATSAPP_SIGNATURE',
              message: 'Firma de webhook inválida',
            },
          });
        }
      }

      const provider = body.provider ?? 'meta';
      const [existing] = (await db
        .select()
        .from(whatsappMessages)
        .where(and(eq(whatsappMessages.provider, provider), eq(whatsappMessages.externalMessageId, body.messageId)))) as
        | MessageRow[]
        | [];

      if (existing) {
        await db
          .update(whatsappMessages)
          .set({
            replayCount: existing.replayCount + 1,
            status: 'replayed',
            lastReceivedAt: new Date(),
          })
          .where(eq(whatsappMessages.id, existing.id));

        return {
          data: {
            messageId: body.messageId,
            status: 'replayed',
            replayed: true,
          },
        };
      }

      await db.insert(whatsappMessages).values({
        provider,
        externalMessageId: body.messageId,
        fromPhone: body.from,
        toPhone: body.to,
        textBody: body.text ?? null,
        payload: rawPayload,
        status: 'processed',
        processedAt: new Date(),
      });

      return status(201, {
        data: {
          messageId: body.messageId,
          status: 'processed',
          replayed: false,
        },
      });
    },
    {
      headers: webhookHeader,
      body: whatsappWebhookRequest,
      response: {
        200: whatsappWebhookResponse,
        201: whatsappWebhookResponse,
      },
      detail: {
        summary: 'Recibir webhook de WhatsApp',
      },
    },
  )
  .get(
    '/messages',
    async ({ auth, query, status }: MessageListContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const cursorDate = parseCursor(query.cursor);
      if (query.cursor && !cursorDate) {
        return status(400, {
          error: {
            code: 'INVALID_CURSOR',
            message: 'Cursor inválido',
          },
        });
      }

      const conditions = [];
      if (query.status) {
        conditions.push(eq(whatsappMessages.status, query.status as 'received' | 'processed' | 'error' | 'replayed'));
      }
      if (cursorDate) {
        conditions.push(lt(whatsappMessages.receivedAt, cursorDate));
      }

      const limit = parseLimit(query.limit);
      let queryBuilder = db.select().from(whatsappMessages);
      if (conditions.length > 0) {
        queryBuilder = queryBuilder.where(and(...conditions));
      }

      const rows = (await queryBuilder
        .orderBy(desc(whatsappMessages.receivedAt), desc(whatsappMessages.id))
        .limit(limit + 1)) as MessageRow[];

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.receivedAt.toISOString() : null;

      return {
        data: items.map(serializeMessage),
        pagination: {
          hasMore,
          nextCursor: nextCursor ?? undefined,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...backofficeRoles] }),
      headers: authorizationHeader,
      query: whatsappMessageListQuery,
      response: {
        200: whatsappMessageListResponse,
      },
      detail: {
        summary: 'Listar mensajes de WhatsApp',
      },
    },
  )
  .get(
    '/metrics',
    async ({ auth, status }: MetricsContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const [totalRows, processedRows, replayedRows, errorRows] = (await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(whatsappMessages),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(whatsappMessages)
          .where(eq(whatsappMessages.status, 'processed')),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(whatsappMessages)
          .where(eq(whatsappMessages.status, 'replayed')),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(whatsappMessages)
          .where(eq(whatsappMessages.status, 'error')),
      ])) as [Array<{ count: number }>, Array<{ count: number }>, Array<{ count: number }>, Array<{ count: number }>];

      return {
        data: {
          totalReceived: totalRows[0]?.count ?? 0,
          processed: processedRows[0]?.count ?? 0,
          replayed: replayedRows[0]?.count ?? 0,
          errors: errorRows[0]?.count ?? 0,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...backofficeRoles] }),
      headers: authorizationHeader,
      response: {
        200: whatsappMetricsResponse,
      },
      detail: {
        summary: 'Métricas de ingestión de WhatsApp',
      },
    },
  );
