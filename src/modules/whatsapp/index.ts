import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import { createHmac, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { authGuard, authPlugin, type AuthContext } from '../../app/plugins/auth';
import { backofficeRoles } from '../../app/plugins/roles';
import { authorizationHeader } from '../../app/plugins/schemas';
import { parseCursor, parseLimit } from '../../app/utils/pagination';
import { db } from '../../db/client';
import { cards, whatsappMessages } from '../../db/schema';
import {
  attachWhatsappOutboundMessageToSession,
} from '../../services/whatsapp-onboarding';
import { processWhatsappMessage } from '../../services/whatsapp-message-processor';
import {
  markInboundWhatsappMessageError,
  sendTwilioWhatsappMessage,
  validateTwilioWebhookRequest,
  verifyWhatsappCardQrImageSignature,
} from '../../services/twilio-whatsapp';
import type { StatusHandler } from '../../types/handlers';
import {
  twilioWhatsappWebhookResponse,
  whatsappQrImageQuery,
  whatsappMessageListQuery,
  whatsappMessageListResponse,
  whatsappMetricsResponse,
  whatsappWebhookRequest,
  whatsappWebhookResponse,
} from './model';

const webhookHeader = t.Object({
  'x-whatsapp-signature': t.Optional(t.String()),
});

const twilioWebhookHeader = t.Object({
  'x-twilio-signature': t.Optional(t.String()),
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

const stringRecord = (input: Record<string, unknown>) => {
  const payload: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    payload[key] = String(value);
  }
  return payload;
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
  .post(
    '/twilio/webhook',
    async (context: any) => {
      const { request, status } = context;
      const payload = stringRecord((context.body ?? {}) as Record<string, unknown>);
      const signature = request.headers.get('x-twilio-signature');

      try {
        const valid = validateTwilioWebhookRequest({
          requestUrl: request.url,
          signature,
          params: payload,
        });

        if (!valid) {
          return status(401, {
            error: {
              code: 'INVALID_TWILIO_SIGNATURE',
              message: 'Firma de webhook Twilio inválida',
            },
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'TWILIO_SIGNATURE_VALIDATION_FAILED';
        console.error('[whatsapp][twilio][signature-validation-failed]', {
          message,
          requestUrl: request.url,
          hasSignature: Boolean(signature),
          payloadKeys: Object.keys(payload),
        });
        return status(500, {
          error: {
            code: 'TWILIO_SIGNATURE_VALIDATION_FAILED',
            message,
          },
        });
      }

      const messageId = payload.MessageSid ?? payload.SmsMessageSid;
      if (!messageId) {
        return status(400, {
          error: {
            code: 'INVALID_TWILIO_PAYLOAD',
            message: 'Falta MessageSid en el webhook',
          },
        });
      }

      const [existing] = (await db
        .select()
        .from(whatsappMessages)
        .where(
          and(eq(whatsappMessages.provider, 'twilio'), eq(whatsappMessages.externalMessageId, messageId)),
        )) as MessageRow[];

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
            messageId,
            status: 'replayed',
            replayed: true,
          },
        };
      }

      await db.insert(whatsappMessages).values({
        provider: 'twilio',
        externalMessageId: messageId,
        direction: 'inbound',
        fromPhone: payload.From ?? payload.WaId ?? '',
        toPhone: payload.To ?? '',
        textBody: payload.Body ?? null,
        payload: JSON.stringify(payload),
        status: 'processed',
        processedAt: new Date(),
      });

      try {
        const result = await processWhatsappMessage({
          messageSid: messageId,
          from: payload.From ?? payload.WaId ?? '',
          body: payload.Body ?? null,
        });

        const outbound = await sendTwilioWhatsappMessage({
          to: payload.From ?? payload.WaId ?? '',
          body: result.replyBody,
          mediaUrl: result.mediaUrl,
        });

        await attachWhatsappOutboundMessageToSession(payload.From ?? payload.WaId ?? '', outbound.sid);

        return status(201, {
          data: {
            messageId,
            status: 'processed',
            replayed: false,
            sessionState: result.sessionState,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'WHATSAPP_PROCESSING_FAILED';
        console.error('[whatsapp][twilio][processing-failed]', {
          messageId,
          from: payload.From ?? payload.WaId ?? '',
          to: payload.To ?? '',
          body: payload.Body ?? null,
          error: message,
        });
        await markInboundWhatsappMessageError(messageId, message);

        return status(500, {
          error: {
            code: 'WHATSAPP_PROCESSING_FAILED',
            message,
          },
        });
      }
    },
    {
      headers: twilioWebhookHeader,
      parse: 'urlencoded',
      response: {
        200: twilioWhatsappWebhookResponse,
        201: twilioWhatsappWebhookResponse,
      },
      detail: {
        summary: 'Recibir webhook Twilio de WhatsApp',
      },
    },
  )
  .get(
    '/cards/:cardId/qr-image',
    async (context: any) => {
      const { params, query, status } = context;
      if (
        !verifyWhatsappCardQrImageSignature({
          cardId: params.cardId,
          expires: query.expires,
          signature: query.signature,
        })
      ) {
        return status(401, {
          error: {
            code: 'INVALID_QR_IMAGE_SIGNATURE',
            message: 'La URL del QR no es válida o expiró',
          },
        });
      }

      const [card] = (await db.select({ code: cards.code }).from(cards).where(eq(cards.id, params.cardId))) as Array<{
        code: string;
      }>;

      if (!card) {
        return status(404, {
          error: {
            code: 'CARD_NOT_FOUND',
            message: 'Tarjeta no encontrada',
          },
        });
      }

      const png = await QRCode.toBuffer(card.code, {
        type: 'png',
        width: 512,
        margin: 2,
        color: {
          dark: '#111111',
          light: '#FFFFFF',
        },
      });

      return new Response(new Uint8Array(png), {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'cache-control': 'private, max-age=300',
        },
      });
    },
    {
      query: whatsappQrImageQuery,
      detail: {
        summary: 'Obtener imagen QR firmada para WhatsApp',
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
