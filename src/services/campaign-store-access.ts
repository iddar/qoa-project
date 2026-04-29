import { and, eq, or } from 'drizzle-orm';
import { db } from '../db/client';
import { campaignStoreEnrollments, campaigns } from '../db/schema';
import { isStoreRelatedToCpg } from './store-cpg-relations';

export type CampaignStoreEnrollmentStatus = 'visible' | 'invited' | 'enrolled' | 'declined' | 'removed' | 'suspended';

export const STORE_VISIBLE_STATUSES = ['visible', 'invited', 'enrolled'] as const;
export const STORE_PARTICIPATING_STATUSES = ['enrolled'] as const;

export const isStoreVisibleForCampaign = async (payload: { campaignId: string; storeId: string }) => {
  const [campaign] = (await db
    .select({
      id: campaigns.id,
      cpgId: campaigns.cpgId,
      status: campaigns.status,
      storeAccessMode: campaigns.storeAccessMode,
    })
    .from(campaigns)
    .where(eq(campaigns.id, payload.campaignId))
    .limit(1)) as Array<{
    id: string;
    cpgId: string | null;
    status: string;
    storeAccessMode: 'all_related_stores' | 'selected_stores';
  }>;

  if (!campaign || campaign.status !== 'active' || !campaign.cpgId) {
    return false;
  }

  if (campaign.storeAccessMode === 'all_related_stores') {
    return isStoreRelatedToCpg(payload.storeId, campaign.cpgId);
  }

  const [enrollment] = (await db
    .select({ id: campaignStoreEnrollments.id })
    .from(campaignStoreEnrollments)
    .where(
      and(
        eq(campaignStoreEnrollments.campaignId, payload.campaignId),
        eq(campaignStoreEnrollments.storeId, payload.storeId),
        or(...STORE_VISIBLE_STATUSES.map((status) => eq(campaignStoreEnrollments.status, status))),
      ),
    )
    .limit(1)) as Array<{ id: string }>;

  return Boolean(enrollment);
};

export const getStoreEnrollmentForCampaign = async (payload: { campaignId: string; storeId: string }) => {
  const [row] = (await db
    .select()
    .from(campaignStoreEnrollments)
    .where(
      and(
        eq(campaignStoreEnrollments.campaignId, payload.campaignId),
        eq(campaignStoreEnrollments.storeId, payload.storeId),
      ),
    )
    .limit(1)) as Array<{
    id: string;
    campaignId: string;
    storeId: string;
    status: CampaignStoreEnrollmentStatus;
    visibilitySource: 'manual' | 'zone' | 'import' | 'auto_related';
    enrollmentSource: 'cpg_managed' | 'store_opt_in' | 'auto_enroll' | null;
    invitedByUserId: string | null;
    enrolledByUserId: string | null;
    invitedAt: Date | null;
    enrolledAt: Date | null;
    declinedAt: Date | null;
    removedAt: Date | null;
    createdAt: Date;
    updatedAt: Date | null;
  }>;

  return row ?? null;
};

export const isStoreParticipatingInCampaign = async (payload: { campaignId: string; storeId: string }) => {
  const [campaign] = (await db
    .select({
      id: campaigns.id,
      cpgId: campaigns.cpgId,
      status: campaigns.status,
      storeAccessMode: campaigns.storeAccessMode,
      storeEnrollmentMode: campaigns.storeEnrollmentMode,
    })
    .from(campaigns)
    .where(eq(campaigns.id, payload.campaignId))
    .limit(1)) as Array<{
    id: string;
    cpgId: string | null;
    status: string;
    storeAccessMode: 'all_related_stores' | 'selected_stores';
    storeEnrollmentMode: 'store_opt_in' | 'cpg_managed' | 'auto_enroll';
  }>;

  if (!campaign || campaign.status !== 'active') {
    return false;
  }

  if (!campaign.cpgId) {
    return true;
  }

  if (campaign.storeAccessMode === 'all_related_stores') {
    const related = await isStoreRelatedToCpg(payload.storeId, campaign.cpgId);
    if (!related) {
      return false;
    }

    if (campaign.storeEnrollmentMode === 'auto_enroll') {
      return true;
    }
  }

  const [enrollment] = (await db
    .select({ id: campaignStoreEnrollments.id })
    .from(campaignStoreEnrollments)
    .where(
      and(
        eq(campaignStoreEnrollments.campaignId, payload.campaignId),
        eq(campaignStoreEnrollments.storeId, payload.storeId),
        eq(campaignStoreEnrollments.status, 'enrolled'),
      ),
    )
    .limit(1)) as Array<{ id: string }>;

  return Boolean(enrollment);
};
