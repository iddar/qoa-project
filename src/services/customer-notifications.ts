import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  campaigns,
  notificationDeliveries,
  stores,
  userStoreEnrollments,
  users,
  whatsappOnboardingSessions,
} from '../db/schema';
import { sendTwilioWhatsappMessage } from './twilio-whatsapp';

export type CustomerNotificationStatus = 'sent' | 'skipped' | 'failed';

type AccumulationSummary = {
  campaignId: string;
  campaignName?: string;
  accumulated: number;
};

const executeRows = async <T>(query: unknown) => (await db.execute(query)) as T[];

const reserveNotificationDelivery = async (payload: {
  notificationKey: string;
  recipient: string;
  metadata?: Record<string, unknown>;
}) => {
  const [row] = await executeRows<{ id: string }>(sql`
    insert into notification_deliveries (notification_key, channel, recipient, status, metadata, updated_at)
    values (
      ${payload.notificationKey},
      'whatsapp',
      ${payload.recipient},
      'pending',
      ${payload.metadata ? JSON.stringify(payload.metadata) : null},
      ${new Date()}
    )
    on conflict (notification_key) do update
    set status = 'pending',
        recipient = excluded.recipient,
        metadata = excluded.metadata,
        error = null,
        updated_at = excluded.updated_at
    where notification_deliveries.status = 'failed'
    returning id
  `);

  return row?.id ?? null;
};

const markNotificationDeliverySent = async (id: string, providerMessageId?: string | null) => {
  await db
    .update(notificationDeliveries)
    .set({
      status: 'sent',
      providerMessageId: providerMessageId ?? null,
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(notificationDeliveries.id, id));
};

const markNotificationDeliveryFailed = async (id: string, error: unknown) => {
  await db
    .update(notificationDeliveries)
    .set({
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date(),
    })
    .where(eq(notificationDeliveries.id, id));
};

const isWhatsappContactable = async (phone: string) => {
  const [session] = (await db
    .select({ id: whatsappOnboardingSessions.id })
    .from(whatsappOnboardingSessions)
    .where(and(eq(whatsappOnboardingSessions.phone, phone), eq(whatsappOnboardingSessions.state, 'completed')))
    .limit(1)) as Array<{ id: string }>;

  return Boolean(session);
};

const summarizeCampaignPoints = (accumulations: AccumulationSummary[]) => {
  const byCampaign = new Map<string, { name: string; points: number }>();

  for (const entry of accumulations) {
    const current = byCampaign.get(entry.campaignId) ?? {
      name: entry.campaignName ?? 'Campaña',
      points: 0,
    };
    current.points += entry.accumulated;
    byCampaign.set(entry.campaignId, current);
  }

  return [...byCampaign.values()].filter((entry) => entry.points > 0);
};

export const sendPostTransactionThankYou = async (payload: {
  transactionId: string;
  phone?: string | null;
  storeName: string;
  totalAmount: number;
  accumulations: AccumulationSummary[];
}): Promise<CustomerNotificationStatus> => {
  if (!payload.phone) {
    return 'skipped';
  }

  const notificationKey = `transaction-thank-you:${payload.transactionId}`;
  if (!(await isWhatsappContactable(payload.phone))) {
    return 'skipped';
  }

  const deliveryId = await reserveNotificationDelivery({
    notificationKey,
    recipient: payload.phone,
    metadata: { transactionId: payload.transactionId },
  });
  if (!deliveryId) {
    return 'skipped';
  }

  const pointSummaries = summarizeCampaignPoints(payload.accumulations);
  const pointsTotal = pointSummaries.reduce((sum, entry) => sum + entry.points, 0);
  const pointsText =
    pointsTotal > 0
      ? ` Acumulaste ${pointsTotal} punto(s)${pointSummaries.length > 0 ? `: ${pointSummaries.map((entry) => `${entry.name} +${entry.points}`).join(', ')}` : ''}.`
      : '';

  try {
    const result = await sendTwilioWhatsappMessage({
      to: payload.phone,
      body: `Gracias por tu compra en ${payload.storeName}. Total registrado: $${payload.totalAmount}.${pointsText}`,
      metadata: { notificationKey, transactionId: payload.transactionId },
    });
    await markNotificationDeliverySent(deliveryId, result.sid);
    return 'sent';
  } catch (error) {
    await markNotificationDeliveryFailed(deliveryId, error);
    console.error('[customer-notifications][transaction-thank-you-failed]', error);
    return 'failed';
  }
};

export const notifyStoreUsersCampaignEnrollment = async (payload: {
  campaignId: string;
  storeId: string;
}): Promise<{ sent: number; skipped: number; failed: number }> => {
  const [campaign] = (await db
    .select({ name: campaigns.name })
    .from(campaigns)
    .where(eq(campaigns.id, payload.campaignId))
    .limit(1)) as Array<{ name: string }>;

  const [store] = (await db
    .select({ name: stores.name })
    .from(stores)
    .where(eq(stores.id, payload.storeId))
    .limit(1)) as Array<{ name: string }>;

  if (!campaign || !store) {
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const rows = (await db
    .select({ userId: users.id, phone: users.phone })
    .from(userStoreEnrollments)
    .innerJoin(users, eq(users.id, userStoreEnrollments.userId))
    .where(eq(userStoreEnrollments.storeId, payload.storeId))) as Array<{ userId: string; phone: string }>;

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const notificationKey = `campaign-store-enrolled:${payload.campaignId}:${payload.storeId}:${row.userId}`;
    if (!(await isWhatsappContactable(row.phone))) {
      skipped += 1;
      continue;
    }

    const deliveryId = await reserveNotificationDelivery({
      notificationKey,
      recipient: row.phone,
      metadata: {
        campaignId: payload.campaignId,
        storeId: payload.storeId,
        userId: row.userId,
      },
    });
    if (!deliveryId) {
      skipped += 1;
      continue;
    }

    try {
      const result = await sendTwilioWhatsappMessage({
        to: row.phone,
        body: `${store.name} ya participa en ${campaign.name}. Tus próximas compras elegibles en esta tienda podrán acumular puntos.`,
        metadata: {
          notificationKey,
          campaignId: payload.campaignId,
          storeId: payload.storeId,
          userId: row.userId,
        },
      });
      await markNotificationDeliverySent(deliveryId, result.sid);
      sent += 1;
    } catch (error) {
      await markNotificationDeliveryFailed(deliveryId, error);
      console.error('[customer-notifications][campaign-enrollment-failed]', error);
      failed += 1;
    }
  }

  return { sent, skipped, failed };
};
