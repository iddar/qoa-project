import { and, eq, isNull } from 'drizzle-orm';
import { generateCode } from '../app/utils/generateCode';
import { db } from '../db/client';
import { campaignSubscriptions, campaigns, cards } from '../db/schema';

export const UNIVERSAL_CAMPAIGN_KEY = 'qoa_universal_wallet';

const generateCardCode = () => generateCode('card', 18);

const ensureSubscription = async (userId: string, campaignId: string): Promise<void> => {
  const [existing] = (await db
    .select({ id: campaignSubscriptions.id })
    .from(campaignSubscriptions)
    .where(and(eq(campaignSubscriptions.userId, userId), eq(campaignSubscriptions.campaignId, campaignId)))) as Array<{
    id: string;
  }>;

  if (!existing) {
    await db.insert(campaignSubscriptions).values({
      userId,
      campaignId,
      status: 'subscribed',
      subscribedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
};

export const ensureUniversalCampaign = async () => {
  const [existing] = (await db
    .select({ id: campaigns.id, status: campaigns.status })
    .from(campaigns)
    .where(eq(campaigns.key, UNIVERSAL_CAMPAIGN_KEY))) as Array<{ id: string; status: string }>;

  if (existing) {
    if (existing.status !== 'active') {
      await db
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

  const [created] = (await db
    .insert(campaigns)
    .values({
      key: UNIVERSAL_CAMPAIGN_KEY,
      name: 'Puntos base de lealtad',
      description: 'Acumulación base para compras elegibles en tiendas participantes.',
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

export const ensureUserUniversalWalletCard = async (userId: string) => {
  const universalCampaignId = await ensureUniversalCampaign();

  const [existingCard] = (await db
    .select({ id: cards.id, campaignId: cards.campaignId })
    .from(cards)
    .where(and(eq(cards.userId, userId), isNull(cards.storeId), eq(cards.campaignId, universalCampaignId)))
    .orderBy(cards.createdAt)
    .limit(1)) as Array<{ id: string; campaignId: string }>;

  if (existingCard) {
    await ensureSubscription(userId, universalCampaignId);
    return {
      cardId: existingCard.id,
      campaignId: universalCampaignId,
      created: false,
    };
  }

  const [createdCard] = (await db
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

  await ensureSubscription(userId, universalCampaignId);

  return {
    cardId: createdCard.id,
    campaignId: universalCampaignId,
    created: true,
  };
};
