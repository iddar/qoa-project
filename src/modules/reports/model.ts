import { t } from 'elysia';

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
