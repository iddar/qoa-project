import { and, desc, eq, gt, lt, or } from 'drizzle-orm';
import { Elysia, t } from 'elysia';
import { authGuard, authPlugin, type AuthContext } from '../../app/plugins/auth';
import { parseCursor, parseLimit } from '../../app/utils/pagination';
import { db } from '../../db/client';
import { balances, campaigns, cards, reminderJobs } from '../../db/schema';
import type { StatusHandler } from '../../types/handlers';
import { reminderListQuery, reminderListResponse, reminderRunRequest, reminderRunResponse } from './model';

const adminRoles = ['qoa_support', 'qoa_admin'] as const;

const authHeader = t.Object({
  authorization: t.Optional(
    t.String({
      description: 'Bearer <accessToken>',
    }),
  ),
});

type ReminderJobRow = {
  id: string;
  cardId: string;
  campaignId: string;
  channel: 'whatsapp';
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  scheduledFor: Date;
  createdAt: Date;
  processedAt: Date | null;
  error: string | null;
};

type RunContext = {
  auth: AuthContext | null;
  body: {
    limit?: number;
  };
  status: StatusHandler;
};

type ListContext = {
  auth: AuthContext | null;
  query: {
    status?: string;
    limit?: string;
    cursor?: string;
  };
  status: StatusHandler;
};

const toDayKey = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const serializeReminderJob = (job: ReminderJobRow) => ({
  id: job.id,
  cardId: job.cardId,
  campaignId: job.campaignId,
  channel: job.channel,
  status: job.status,
  scheduledFor: job.scheduledFor.toISOString(),
  createdAt: job.createdAt.toISOString(),
  processedAt: job.processedAt ? job.processedAt.toISOString() : undefined,
  error: job.error ?? undefined,
});

export const jobsModule = new Elysia({
  prefix: '/jobs',
  detail: {
    tags: ['Jobs'],
  },
})
  .use(authPlugin)
  .post(
    '/reminders/run',
    async ({ auth, body, status }: RunContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const runAt = new Date();
      const runDayKey = toDayKey(runAt);
      const hardLimit = Math.min(Math.max(body.limit ?? 100, 1), 500);

      const candidateCards = (await db
        .select({
          id: cards.id,
          campaignId: cards.campaignId,
        })
        .from(cards)
        .where(eq(cards.status, 'active'))
        .limit(hardLimit)) as Array<{ id: string; campaignId: string }>;

      if (candidateCards.length === 0) {
        return {
          data: {
            checked: 0,
            queued: 0,
            skipped: 0,
            runAt: runAt.toISOString(),
          },
        };
      }

      const campaignIds = [...new Set(candidateCards.map((entry) => entry.campaignId))];
      const activeCampaignRows = (await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(or(...campaignIds.map((id) => and(eq(campaigns.id, id), eq(campaigns.status, 'active')))))) as Array<{
        id: string;
      }>;
      const activeCampaignSet = new Set(activeCampaignRows.map((entry) => entry.id));

      const cardIds = candidateCards.map((entry) => entry.id);
      const balanceRows = (await db
        .select({ cardId: balances.cardId, current: balances.current })
        .from(balances)
        .where(or(...cardIds.map((id) => and(eq(balances.cardId, id), gt(balances.current, 0)))))) as Array<{
        cardId: string;
        current: number;
      }>;
      const positiveBalanceSet = new Set(balanceRows.map((entry) => entry.cardId));

      let queued = 0;
      let skipped = 0;
      for (const card of candidateCards) {
        if (!activeCampaignSet.has(card.campaignId) || !positiveBalanceSet.has(card.id)) {
          skipped += 1;
          continue;
        }

        const idempotencyKey = `reminder:${card.id}:${runDayKey}`;
        const [existing] = (await db
          .select({ id: reminderJobs.id })
          .from(reminderJobs)
          .where(eq(reminderJobs.idempotencyKey, idempotencyKey))) as Array<{ id: string }>;

        if (existing) {
          skipped += 1;
          continue;
        }

        await db.insert(reminderJobs).values({
          cardId: card.id,
          campaignId: card.campaignId,
          channel: 'whatsapp',
          status: 'queued',
          scheduledFor: runAt,
          payload: JSON.stringify({ reason: 'daily_reminder', runDayKey }),
          idempotencyKey,
          updatedAt: runAt,
        });

        queued += 1;
      }

      return {
        data: {
          checked: candidateCards.length,
          queued,
          skipped,
          runAt: runAt.toISOString(),
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...adminRoles] }),
      headers: authHeader,
      body: reminderRunRequest,
      response: {
        200: reminderRunResponse,
      },
      detail: {
        summary: 'Ejecutar job de reminders',
      },
    },
  )
  .get(
    '/reminders',
    async ({ auth, query, status }: ListContext) => {
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
        conditions.push(eq(reminderJobs.status, query.status as ReminderJobRow['status']));
      }
      if (cursorDate) {
        conditions.push(lt(reminderJobs.createdAt, cursorDate));
      }

      const limit = parseLimit(query.limit);
      let queryBuilder = db.select().from(reminderJobs);
      if (conditions.length > 0) {
        queryBuilder = queryBuilder.where(and(...conditions));
      }

      const rows = (await queryBuilder
        .orderBy(desc(reminderJobs.createdAt), desc(reminderJobs.id))
        .limit(limit + 1)) as ReminderJobRow[];

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : null;

      return {
        data: items.map(serializeReminderJob),
        pagination: {
          hasMore,
          nextCursor: nextCursor ?? undefined,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...adminRoles] }),
      headers: authHeader,
      query: reminderListQuery,
      response: {
        200: reminderListResponse,
      },
      detail: {
        summary: 'Listar jobs de reminders',
      },
    },
  );
