import { eq, sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { authGuard, authPlugin, type AuthContext } from '../../app/plugins/auth';
import { backofficeRoles } from '../../app/plugins/roles';
import { authorizationHeader } from '../../app/plugins/schemas';
import { db } from '../../db/client';
import {
  brands,
  campaigns,
  cards,
  cpgs,
  products,
  redemptions,
  rewards,
  reminderJobs,
  stores,
  transactions,
  users,
  whatsappMessages,
} from '../../db/schema';
import type { StatusHandler } from '../../types/handlers';
import {
  campaignReportSummaryResponse,
  cpgReportSummaryResponse,
  platformOverviewResponse,
  reportSummaryQuery,
  storeReportSummaryResponse,
} from './model';

type OverviewContext = {
  auth: AuthContext | null;
  status: StatusHandler;
};

type SummaryQuery = {
  from?: string;
  to?: string;
};

type CpgSummaryContext = {
  auth: AuthContext | null;
  params: { cpgId: string };
  query: SummaryQuery;
  status: StatusHandler;
};

type CampaignSummaryContext = {
  auth: AuthContext | null;
  params: { campaignId: string };
  query: SummaryQuery;
  status: StatusHandler;
};

type StoreSummaryContext = {
  auth: AuthContext | null;
  params: { storeId: string };
  query: SummaryQuery;
  status: StatusHandler;
};

type CountRow = { count: number };

type KpiTransactionsRow = {
  count: number;
  amount: number;
  cards: number;
};

type KpiAccumulationsRow = {
  count: number;
  points: number;
};

type KpiRedemptionsRow = {
  count: number;
  cost: number;
};

type DailyRow = {
  date: string;
  transactions: number;
  salesAmount: number;
  accumulations: number;
  redemptions: number;
};

type CampaignAggregateRow = {
  campaignId: string;
  name: string;
  status: string;
  transactions: number;
  salesAmount: number;
  accumulations: number;
  redemptions: number;
};

const REPORT_TIMEZONE = 'America/Mexico_City';

const countTable = async (table: Record<string, unknown>, condition?: unknown) => {
  const query = db.select({ count: sql<number>`count(*)::int as "count"` }).from(table as never);
  const rows = condition ? await query.where(condition as never) : await query;
  return (rows as Array<{ count: number }>)[0]?.count ?? 0;
};

const canAccessCpg = (auth: AuthContext, cpgId: string) => {
  if (auth.type === 'jwt' || auth.type === 'dev') {
    if (auth.role === 'qoa_admin' || auth.role === 'qoa_support') {
      return true;
    }

    return auth.role === 'cpg_admin' && auth.tenantType === 'cpg' && auth.tenantId === cpgId;
  }

  return auth.tenantType === 'cpg' && auth.tenantId === cpgId;
};

const canAccessStore = (auth: AuthContext, storeId: string) => {
  if (auth.type === 'jwt' || auth.type === 'dev') {
    if (auth.role === 'qoa_admin' || auth.role === 'qoa_support') {
      return true;
    }

    return (
      (auth.role === 'store_admin' || auth.role === 'store_staff') &&
      auth.tenantType === 'store' &&
      auth.tenantId === storeId
    );
  }

  return auth.tenantType === 'store' && auth.tenantId === storeId;
};

const resolveRange = (query: SummaryQuery, status: StatusHandler) => {
  const to = query.to ? new Date(query.to) : new Date();
  if (Number.isNaN(to.getTime())) {
    return {
      error: status(400, {
        error: {
          code: 'INVALID_ARGUMENT',
          message: 'Parámetro to inválido',
        },
      }),
    };
  }

  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime())) {
    return {
      error: status(400, {
        error: {
          code: 'INVALID_ARGUMENT',
          message: 'Parámetro from inválido',
        },
      }),
    };
  }

  if (from.getTime() > to.getTime()) {
    return {
      error: status(400, {
        error: {
          code: 'INVALID_ARGUMENT',
          message: 'from no puede ser mayor a to',
        },
      }),
    };
  }

  const fromDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const toDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

  return {
    value: {
      from,
      to,
      fromDay,
      toDay,
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
      fromDayIso: fromDay.toISOString().slice(0, 10),
      toDayIso: toDay.toISOString().slice(0, 10),
    },
  };
};

const buildKpis = (
  transactionsRow: KpiTransactionsRow | undefined,
  accumulationsRow: KpiAccumulationsRow | undefined,
  redemptionsRow: KpiRedemptionsRow | undefined,
) => {
  const transactionCount = transactionsRow?.count ?? 0;
  const salesAmount = transactionsRow?.amount ?? 0;
  const cardsWithActivity = transactionsRow?.cards ?? 0;
  const accumulationsCount = accumulationsRow?.count ?? 0;
  const accumulatedPoints = accumulationsRow?.points ?? 0;
  const redemptionsCount = redemptionsRow?.count ?? 0;
  const redemptionCost = redemptionsRow?.cost ?? 0;

  return {
    transactions: transactionCount,
    salesAmount,
    cardsWithActivity,
    accumulations: accumulationsCount,
    accumulatedPoints,
    redemptions: redemptionsCount,
    redemptionCost,
    avgTicket: transactionCount > 0 ? Number((salesAmount / transactionCount).toFixed(2)) : 0,
    redemptionRate: accumulationsCount > 0 ? Number((redemptionsCount / accumulationsCount).toFixed(4)) : 0,
  };
};

export const reportsModule = new Elysia({
  prefix: '/reports',
  detail: {
    tags: ['Reports'],
  },
})
  .use(authPlugin)
  .get(
    '/overview',
    async ({ auth, status }: OverviewContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const [
        cpgTotal,
        cpgActive,
        brandTotal,
        brandActive,
        productTotal,
        productActive,
        campaignTotal,
        campaignActive,
        storeTotal,
        storeActive,
        cardTotal,
        cardActive,
        rewardTotal,
        rewardActive,
        userTotal,
        transactionTotal,
        redemptionTotal,
        reminderJobTotal,
        reminderQueued,
        reminderFailed,
        whatsappTotal,
        whatsappReplayed,
        whatsappErrors,
      ] = await Promise.all([
        countTable(cpgs),
        countTable(cpgs, eq(cpgs.status, 'active')),
        countTable(brands),
        countTable(brands, eq(brands.status, 'active')),
        countTable(products),
        countTable(products, eq(products.status, 'active')),
        countTable(campaigns),
        countTable(campaigns, eq(campaigns.status, 'active')),
        countTable(stores),
        countTable(stores, eq(stores.status, 'active')),
        countTable(cards),
        countTable(cards, eq(cards.status, 'active')),
        countTable(rewards),
        countTable(rewards, eq(rewards.status, 'active')),
        countTable(users),
        countTable(transactions),
        countTable(redemptions),
        countTable(reminderJobs),
        countTable(reminderJobs, eq(reminderJobs.status, 'queued')),
        countTable(reminderJobs, eq(reminderJobs.status, 'failed')),
        countTable(whatsappMessages),
        countTable(whatsappMessages, eq(whatsappMessages.status, 'replayed')),
        countTable(whatsappMessages, eq(whatsappMessages.status, 'error')),
      ]);

      return {
        data: {
          cpgs: { total: cpgTotal, active: cpgActive },
          brands: { total: brandTotal, active: brandActive },
          products: { total: productTotal, active: productActive },
          campaigns: { total: campaignTotal, active: campaignActive },
          stores: { total: storeTotal, active: storeActive },
          cards: { total: cardTotal, active: cardActive },
          rewards: { total: rewardTotal, active: rewardActive },
          users: { total: userTotal },
          transactions: { total: transactionTotal },
          redemptions: { total: redemptionTotal },
          reminderJobs: { total: reminderJobTotal, queued: reminderQueued, failed: reminderFailed },
          whatsappMessages: { total: whatsappTotal, replayed: whatsappReplayed, errors: whatsappErrors },
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: [...backofficeRoles], allowApiKey: false }),
      headers: authorizationHeader,
      response: {
        200: platformOverviewResponse,
      },
      detail: {
        summary: 'Resumen de plataforma para backoffice',
      },
    },
  )
  .get(
    '/stores/:storeId/summary',
    async ({ auth, params, query, status }: StoreSummaryContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      if (!canAccessStore(auth, params.storeId)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes acceso a esta tienda',
          },
        });
      }

      const [store] = (await db
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.id, params.storeId))) as Array<{ id: string }>;

      if (!store) {
        return status(404, {
          error: {
            code: 'STORE_NOT_FOUND',
            message: 'Tienda no encontrada',
          },
        });
      }

      const range = resolveRange(query, status);
      if (range.error) {
        return range.error;
      }

      const { from, to, fromIso, toIso } = range.value;

      const [transactionsRows, accumulationsRows, redemptionsRows, dailyRows] = await Promise.all([
        db.execute(sql`
          select
            count(*)::int as count,
            coalesce(sum(t.total_amount), 0)::int as amount,
            count(distinct t.card_id)::int as cards
          from transactions t
          where t.store_id = ${store.id}
            and t.created_at between ${fromIso} and ${toIso}
        `) as Promise<KpiTransactionsRow[]>,
        db.execute(sql`
          select
            count(*)::int as count,
            coalesce(sum(a.amount), 0)::int as points
          from accumulations a
          inner join transaction_items ti on ti.id = a.transaction_item_id
          inner join transactions t on t.id = ti.transaction_id
          where t.store_id = ${store.id}
            and a.created_at between ${fromIso} and ${toIso}
        `) as Promise<KpiAccumulationsRow[]>,
        db.execute(sql`
          select
            count(*)::int as count,
            coalesce(sum(r.cost), 0)::int as cost
          from redemptions r
          inner join cards ca on ca.id = r.card_id
          where ca.store_id = ${store.id}
            and r.created_at between ${fromIso} and ${toIso}
        `) as Promise<KpiRedemptionsRow[]>,
        db.execute(sql`
          with days as (
            select generate_series(
              timezone(${REPORT_TIMEZONE}, ${fromIso}::timestamptz)::date,
              timezone(${REPORT_TIMEZONE}, ${toIso}::timestamptz)::date,
              interval '1 day'
            )::date as day
          ),
          tx as (
            select date_trunc('day', timezone(${REPORT_TIMEZONE}, t.created_at))::date as day,
                   count(*)::int as transactions,
                   coalesce(sum(t.total_amount), 0)::int as sales_amount
            from transactions t
            where t.store_id = ${store.id}
              and t.created_at between ${fromIso} and ${toIso}
            group by 1
          ),
          acc as (
            select date_trunc('day', timezone(${REPORT_TIMEZONE}, a.created_at))::date as day,
                   count(*)::int as accumulations
            from accumulations a
            inner join transaction_items ti on ti.id = a.transaction_item_id
            inner join transactions t on t.id = ti.transaction_id
            where t.store_id = ${store.id}
              and a.created_at between ${fromIso} and ${toIso}
            group by 1
          ),
          red as (
            select date_trunc('day', timezone(${REPORT_TIMEZONE}, r.created_at))::date as day,
                   count(*)::int as redemptions
            from redemptions r
            inner join cards ca on ca.id = r.card_id
            where ca.store_id = ${store.id}
              and r.created_at between ${fromIso} and ${toIso}
            group by 1
          )
          select
            to_char(days.day, 'YYYY-MM-DD') as date,
            coalesce(tx.transactions, 0)::int as transactions,
            coalesce(tx.sales_amount, 0)::int as "salesAmount",
            coalesce(acc.accumulations, 0)::int as accumulations,
            coalesce(red.redemptions, 0)::int as redemptions
          from days
          left join tx on tx.day = days.day
          left join acc on acc.day = days.day
          left join red on red.day = days.day
          order by days.day asc
        `) as Promise<DailyRow[]>,
      ]);

      return {
        data: {
          storeId: store.id,
          from: from.toISOString(),
          to: to.toISOString(),
          kpis: buildKpis(transactionsRows[0], accumulationsRows[0], redemptionsRows[0]),
          daily: dailyRows,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: ['store_staff', 'store_admin', 'qoa_support', 'qoa_admin'], allowApiKey: true }),
      headers: authorizationHeader,
      query: reportSummaryQuery,
      response: {
        200: storeReportSummaryResponse,
      },
      detail: {
        summary: 'Resumen de performance por tienda',
      },
    },
  )
  .get(
    '/cpgs/:cpgId/summary',
    async ({ auth, params, query, status }: CpgSummaryContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      if (!canAccessCpg(auth, params.cpgId)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes acceso a este CPG',
          },
        });
      }

      const range = resolveRange(query, status);
      if (range.error) {
        return range.error;
      }

      const { from, to, fromDayIso, toDayIso, fromIso, toIso } = range.value;

      const [transactionsRows, accumulationsRows, redemptionsRows, dailyRows, campaignsRows] = await Promise.all([
        db.execute(sql`
          with campaign_tx as (
            select distinct ti.transaction_id
            from accumulations a
            inner join transaction_items ti on ti.id = a.transaction_item_id
            inner join campaigns cp on cp.id = a.campaign_id
            where cp.cpg_id = ${params.cpgId}
              and a.created_at between ${fromIso} and ${toIso}
          )
          select
            count(*)::int as count,
            coalesce(sum(t.total_amount), 0)::int as amount,
            count(distinct t.card_id)::int as cards
          from campaign_tx ctx
          inner join transactions t on t.id = ctx.transaction_id
        `) as Promise<KpiTransactionsRow[]>,
        db.execute(sql`
          select
            count(*)::int as count,
            coalesce(sum(a.amount), 0)::int as points
          from accumulations a
          inner join campaigns cp on cp.id = a.campaign_id
          where cp.cpg_id = ${params.cpgId}
            and a.created_at between ${fromIso} and ${toIso}
        `) as Promise<KpiAccumulationsRow[]>,
        db.execute(sql`
          select
            count(*)::int as count,
            coalesce(sum(r.cost), 0)::int as cost
          from redemptions r
          inner join rewards rw on rw.id = r.reward_id
          inner join campaigns cp on cp.id = rw.campaign_id
          where cp.cpg_id = ${params.cpgId}
            and r.created_at between ${fromIso} and ${toIso}
        `) as Promise<KpiRedemptionsRow[]>,
        db.execute(sql`
          with days as (
            select generate_series(${fromDayIso}::date, ${toDayIso}::date, interval '1 day')::date as day
          ),
          tx as (
            select date_trunc('day', a.created_at)::date as day,
                   count(*)::int as transactions,
                   coalesce(sum(t.total_amount), 0)::int as sales_amount
            from (
              select distinct a.id, a.created_at, ti.transaction_id
              from accumulations a
              inner join transaction_items ti on ti.id = a.transaction_item_id
              inner join campaigns cp on cp.id = a.campaign_id
              where cp.cpg_id = ${params.cpgId}
                and a.created_at between ${fromIso} and ${toIso}
            ) a
            inner join transactions t on t.id = a.transaction_id
            group by 1
          ),
          acc as (
            select date_trunc('day', a.created_at)::date as day,
                   count(*)::int as accumulations
            from accumulations a
            inner join campaigns cp on cp.id = a.campaign_id
            where cp.cpg_id = ${params.cpgId}
              and a.created_at between ${fromIso} and ${toIso}
            group by 1
          ),
          red as (
            select date_trunc('day', r.created_at)::date as day,
                   count(*)::int as redemptions
            from redemptions r
            inner join rewards rw on rw.id = r.reward_id
            inner join campaigns cp on cp.id = rw.campaign_id
            where cp.cpg_id = ${params.cpgId}
              and r.created_at between ${fromIso} and ${toIso}
            group by 1
          )
          select
            to_char(days.day, 'YYYY-MM-DD') as date,
            coalesce(tx.transactions, 0)::int as transactions,
            coalesce(tx.sales_amount, 0)::int as "salesAmount",
            coalesce(acc.accumulations, 0)::int as accumulations,
            coalesce(red.redemptions, 0)::int as redemptions
          from days
          left join tx on tx.day = days.day
          left join acc on acc.day = days.day
          left join red on red.day = days.day
          order by days.day asc
        `) as Promise<DailyRow[]>,
        db.execute(sql`
          select
            cp.id as "campaignId",
            cp.name,
            cp.status,
            coalesce(tx.transactions, 0)::int as transactions,
            coalesce(tx.sales_amount, 0)::int as "salesAmount",
            coalesce(acc.accumulations, 0)::int as accumulations,
            coalesce(red.redemptions, 0)::int as redemptions
          from campaigns cp
          left join lateral (
            with campaign_tx as (
              select distinct ti.transaction_id
              from accumulations a
              inner join transaction_items ti on ti.id = a.transaction_item_id
              where a.campaign_id = cp.id
                and a.created_at between ${fromIso} and ${toIso}
            )
            select
              count(*)::int as transactions,
              coalesce(sum(t.total_amount), 0)::int as sales_amount
            from campaign_tx ctx
            inner join transactions t on t.id = ctx.transaction_id
          ) tx on true
          left join lateral (
            select count(*)::int as accumulations
            from accumulations a
            where a.campaign_id = cp.id
              and a.created_at between ${fromIso} and ${toIso}
          ) acc on true
          left join lateral (
            select count(*)::int as redemptions
            from redemptions r
            inner join rewards rw on rw.id = r.reward_id
            where rw.campaign_id = cp.id
              and r.created_at between ${fromIso} and ${toIso}
          ) red on true
          where cp.cpg_id = ${params.cpgId}
          order by tx.transactions desc, tx.sales_amount desc, cp.created_at desc
          limit 20
        `) as Promise<CampaignAggregateRow[]>,
      ]);

      return {
        data: {
          cpgId: params.cpgId,
          from: from.toISOString(),
          to: to.toISOString(),
          kpis: buildKpis(transactionsRows[0], accumulationsRows[0], redemptionsRows[0]),
          daily: dailyRows,
          campaigns: campaignsRows,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: ['cpg_admin', 'qoa_support', 'qoa_admin'], allowApiKey: true }),
      headers: authorizationHeader,
      query: reportSummaryQuery,
      response: {
        200: cpgReportSummaryResponse,
      },
      detail: {
        summary: 'Resumen de performance por CPG',
      },
    },
  )
  .get(
    '/campaigns/:campaignId/summary',
    async ({ auth, params, query, status }: CampaignSummaryContext) => {
      if (!auth) {
        return status(401, {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Autenticación requerida',
          },
        });
      }

      const [campaign] = (await db
        .select({ id: campaigns.id, cpgId: campaigns.cpgId })
        .from(campaigns)
        .where(eq(campaigns.id, params.campaignId))) as Array<{ id: string; cpgId: string | null }>;

      if (!campaign) {
        return status(404, {
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            message: 'Campaña no encontrada',
          },
        });
      }

      if (!campaign.cpgId || !canAccessCpg(auth, campaign.cpgId)) {
        return status(403, {
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes acceso a esta campaña',
          },
        });
      }

      const range = resolveRange(query, status);
      if (range.error) {
        return range.error;
      }

      const { from, to, fromDayIso, toDayIso, fromIso, toIso } = range.value;

      const [transactionsRows, accumulationsRows, redemptionsRows, dailyRows] = await Promise.all([
        db.execute(sql`
          with campaign_tx as (
            select distinct ti.transaction_id
            from accumulations a
            inner join transaction_items ti on ti.id = a.transaction_item_id
            where a.campaign_id = ${campaign.id}
              and a.created_at between ${fromIso} and ${toIso}
          )
          select
            count(*)::int as count,
            coalesce(sum(t.total_amount), 0)::int as amount,
            count(distinct t.card_id)::int as cards
          from campaign_tx ctx
          inner join transactions t on t.id = ctx.transaction_id
        `) as Promise<KpiTransactionsRow[]>,
        db.execute(sql`
          select
            count(*)::int as count,
            coalesce(sum(a.amount), 0)::int as points
          from accumulations a
          where a.campaign_id = ${campaign.id}
            and a.created_at between ${fromIso} and ${toIso}
        `) as Promise<KpiAccumulationsRow[]>,
        db.execute(sql`
          select
            count(*)::int as count,
            coalesce(sum(r.cost), 0)::int as cost
          from redemptions r
          inner join rewards rw on rw.id = r.reward_id
          where rw.campaign_id = ${campaign.id}
            and r.created_at between ${fromIso} and ${toIso}
        `) as Promise<KpiRedemptionsRow[]>,
        db.execute(sql`
          with days as (
            select generate_series(${fromDayIso}::date, ${toDayIso}::date, interval '1 day')::date as day
          ),
          tx as (
            select date_trunc('day', a.created_at)::date as day,
                   count(*)::int as transactions,
                   coalesce(sum(t.total_amount), 0)::int as sales_amount
            from (
              select distinct a.id, a.created_at, ti.transaction_id
              from accumulations a
              inner join transaction_items ti on ti.id = a.transaction_item_id
              where a.campaign_id = ${campaign.id}
                and a.created_at between ${fromIso} and ${toIso}
            ) a
            inner join transactions t on t.id = a.transaction_id
            group by 1
          ),
          acc as (
            select date_trunc('day', a.created_at)::date as day,
                   count(*)::int as accumulations
            from accumulations a
            where a.campaign_id = ${campaign.id}
              and a.created_at between ${fromIso} and ${toIso}
            group by 1
          ),
          red as (
            select date_trunc('day', r.created_at)::date as day,
                   count(*)::int as redemptions
            from redemptions r
            inner join rewards rw on rw.id = r.reward_id
            where rw.campaign_id = ${campaign.id}
              and r.created_at between ${fromIso} and ${toIso}
            group by 1
          )
          select
            to_char(days.day, 'YYYY-MM-DD') as date,
            coalesce(tx.transactions, 0)::int as transactions,
            coalesce(tx.sales_amount, 0)::int as "salesAmount",
            coalesce(acc.accumulations, 0)::int as accumulations,
            coalesce(red.redemptions, 0)::int as redemptions
          from days
          left join tx on tx.day = days.day
          left join acc on acc.day = days.day
          left join red on red.day = days.day
          order by days.day asc
        `) as Promise<DailyRow[]>,
      ]);

      return {
        data: {
          campaignId: campaign.id,
          from: from.toISOString(),
          to: to.toISOString(),
          kpis: buildKpis(transactionsRows[0], accumulationsRows[0], redemptionsRows[0]),
          daily: dailyRows,
        },
      };
    },
    {
      beforeHandle: authGuard({ roles: ['cpg_admin', 'qoa_support', 'qoa_admin'], allowApiKey: true }),
      headers: authorizationHeader,
      query: reportSummaryQuery,
      response: {
        200: campaignReportSummaryResponse,
      },
      detail: {
        summary: 'Resumen de performance por campaña',
      },
    },
  );
