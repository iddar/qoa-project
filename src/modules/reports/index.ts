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
import { platformOverviewResponse } from './model';

type OverviewContext = {
  auth: AuthContext | null;
  status: StatusHandler;
};

const countTable = async (table: Record<string, unknown>, condition?: unknown) => {
  const query = db.select({ count: sql<number>`count(*)::int` }).from(table as never);
  const rows = condition ? await query.where(condition as never) : await query;
  return (rows as Array<{ count: number }>)[0]?.count ?? 0;
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
  );
