import { and, eq, isNull, sql } from 'drizzle-orm';
import { generateCode } from '../app/utils/generateCode';
import { db, type Database } from '../db/client';
import { campaignSubscriptions, campaigns, cards } from '../db/schema';

export const UNIVERSAL_CAMPAIGN_KEY = 'qoa_universal_wallet';

const generateCardCode = () => generateCode('card', 18);

const ensureSubscription = async (userId: string, campaignId: string, database: Database = db): Promise<void> => {
  const [existing] = (await database
    .select({ id: campaignSubscriptions.id })
    .from(campaignSubscriptions)
    .where(and(eq(campaignSubscriptions.userId, userId), eq(campaignSubscriptions.campaignId, campaignId)))) as Array<{
    id: string;
  }>;

  if (!existing) {
    await database.insert(campaignSubscriptions).values({
      userId,
      campaignId,
      status: 'subscribed',
      subscribedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
};

export const ensureUniversalCampaign = async (database: Database = db) => {
  await database.execute(sql`select pg_advisory_xact_lock(hashtext(${UNIVERSAL_CAMPAIGN_KEY}))`);

  const [existing] = (await database
    .select({ id: campaigns.id, status: campaigns.status })
    .from(campaigns)
    .where(eq(campaigns.key, UNIVERSAL_CAMPAIGN_KEY))) as Array<{ id: string; status: string }>;

  if (existing) {
    if (existing.status !== 'active') {
      await database
        .update(campaigns)
        .set({
          status: 'active',
          enrollmentMode: 'system_universal',
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, existing.id));
    }

    return existing.id;
  }

  const [created] = (await database
    .insert(campaigns)
    .values({
      key: UNIVERSAL_CAMPAIGN_KEY,
      name: 'Qoa Universal Wallet',
      description: 'Campaña base para acumulación universal de onboarding wallet.',
      status: 'active',
      enrollmentMode: 'system_universal',
      startsAt: new Date(),
    })
    .returning({ id: campaigns.id })) as Array<{ id: string }>;

  if (!created) {
    throw new Error('UNIVERSAL_CAMPAIGN_CREATE_FAILED');
  }

  return created.id;
};

export const ensureUserUniversalWalletCard = async (userId: string, database: Database = db) => {
  const ensure = async (tx: Database) => {
    const universalCampaignId = await ensureUniversalCampaign(tx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${userId}:${universalCampaignId}`.toString()}))`);

    const [existingCard] = (await tx
      .select({ id: cards.id, campaignId: cards.campaignId })
      .from(cards)
      .where(and(eq(cards.userId, userId), isNull(cards.storeId), eq(cards.campaignId, universalCampaignId)))
      .orderBy(cards.createdAt)
      .limit(1)) as Array<{ id: string; campaignId: string }>;

    if (existingCard) {
      await ensureSubscription(userId, universalCampaignId, tx);
      return {
        cardId: existingCard.id,
        campaignId: universalCampaignId,
        created: false,
      };
    }

    const [createdCard] = (await tx
      .insert(cards)
      .values({
        userId,
        campaignId: universalCampaignId,
        code: generateCardCode(),
        status: 'active',
      })
      .returning({ id: cards.id })) as Array<{ id: string }>;

    if (!createdCard) {
      throw new Error('UNIVERSAL_CARD_CREATE_FAILED');
    }

    await ensureSubscription(userId, universalCampaignId, tx);

    return {
      cardId: createdCard.id,
      campaignId: universalCampaignId,
      created: true,
    };
  };

  return database === db ? database.transaction(ensure) : ensure(database);
};
