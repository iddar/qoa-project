import { t } from 'elysia';

const reportDailyPoint = t.Object({
  date: t.String(),
  transactions: t.Number(),
  salesAmount: t.Number(),
  accumulations: t.Number(),
  redemptions: t.Number(),
});

const reportKpis = t.Object({
  transactions: t.Number(),
  salesAmount: t.Number(),
  cardsWithActivity: t.Number(),
  accumulations: t.Number(),
  accumulatedPoints: t.Number(),
  redemptions: t.Number(),
  redemptionCost: t.Number(),
  avgTicket: t.Number(),
  redemptionRate: t.Number(),
});

const topCampaignItem = t.Object({
  campaignId: t.String(),
  name: t.String(),
  status: t.String(),
  transactions: t.Number(),
  salesAmount: t.Number(),
  accumulations: t.Number(),
  redemptions: t.Number(),
});

export const platformOverviewResponse = t.Object({
  data: t.Object({
    cpgs: t.Object({ total: t.Number(), active: t.Number() }),
    brands: t.Object({ total: t.Number(), active: t.Number() }),
    products: t.Object({ total: t.Number(), active: t.Number() }),
    campaigns: t.Object({ total: t.Number(), active: t.Number() }),
    stores: t.Object({ total: t.Number(), active: t.Number() }),
    cards: t.Object({ total: t.Number(), active: t.Number() }),
    rewards: t.Object({ total: t.Number(), active: t.Number() }),
    users: t.Object({ total: t.Number() }),
    transactions: t.Object({ total: t.Number() }),
    redemptions: t.Object({ total: t.Number() }),
    reminderJobs: t.Object({ total: t.Number(), queued: t.Number(), failed: t.Number() }),
    whatsappMessages: t.Object({ total: t.Number(), replayed: t.Number(), errors: t.Number() }),
  }),
});

export const reportSummaryQuery = t.Object({
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
});

export const cpgReportSummaryResponse = t.Object({
  data: t.Object({
    cpgId: t.String(),
    from: t.String(),
    to: t.String(),
    kpis: reportKpis,
    daily: t.Array(reportDailyPoint),
    campaigns: t.Array(topCampaignItem),
  }),
});

export const campaignReportSummaryResponse = t.Object({
  data: t.Object({
    campaignId: t.String(),
    from: t.String(),
    to: t.String(),
    kpis: reportKpis,
    daily: t.Array(reportDailyPoint),
    transactionsWithoutAccumulations: t.Number(),
  }),
});

export const storeReportSummaryResponse = t.Object({
  data: t.Object({
    storeId: t.String(),
    from: t.String(),
    to: t.String(),
    kpis: reportKpis,
    daily: t.Array(reportDailyPoint),
  }),
});
