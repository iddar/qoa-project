import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users, whatsappOnboardingSessions } from '../db/schema';
import { normalizeWhatsappPhone } from './twilio-whatsapp';
import { processWhatsappOnboardingMessage } from './whatsapp-onboarding';
import { detectIntent, type WhatsappIntent } from './whatsapp-intent-router';
import { getUserBalanceSummary, getUserRecentActivity, resendUserQr, buildHelpMessage } from './whatsapp-queries';

export type ProcessWhatsappMessageInput = {
  messageSid: string;
  from: string;
  body?: string | null;
};

export type ProcessWhatsappMessageResult = {
  replyBody: string;
  mediaUrl?: string;
  sessionState: string;
  userId?: string;
  storeId?: string;
};

const findUserByPhone = async (phone: string) => {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.phone, phone));
  return user ?? null;
};

const getSessionByPhone = async (phone: string) => {
  const [session] = await db
    .select({
      id: whatsappOnboardingSessions.id,
      phone: whatsappOnboardingSessions.phone,
      userId: whatsappOnboardingSessions.userId,
      pendingStoreId: whatsappOnboardingSessions.pendingStoreId,
      state: whatsappOnboardingSessions.state,
      lastInboundMessageId: whatsappOnboardingSessions.lastInboundMessageId,
      lastOutboundMessageId: whatsappOnboardingSessions.lastOutboundMessageId,
      completedAt: whatsappOnboardingSessions.completedAt,
    })
    .from(whatsappOnboardingSessions)
    .where(eq(whatsappOnboardingSessions.phone, phone));
  return session ?? null;
};

export const processWhatsappMessage = async (
  input: ProcessWhatsappMessageInput,
): Promise<ProcessWhatsappMessageResult> => {
  const phone = normalizeWhatsappPhone(input.from);

  const user = await findUserByPhone(phone);
  const session = await getSessionByPhone(phone);

  // Route to onboarding if user doesn't exist, has no session,
  // or the session is not yet completed.
  const needsOnboarding =
    !user ||
    !session ||
    session.state !== 'completed' ||
    !['consumer', 'customer'].includes(user.role);

  if (needsOnboarding) {
    return processWhatsappOnboardingMessage(input);
  }

  // User is fully onboarded — detect intent and route
  const intent = detectIntent(input.body ?? '');

  switch (intent) {
    case 'balance': {
      const replyBody = await getUserBalanceSummary(phone);
      return { replyBody, sessionState: 'completed', userId: user.id };
    }

    case 'activity': {
      const replyBody = await getUserRecentActivity(phone);
      return { replyBody, sessionState: 'completed', userId: user.id };
    }

    case 'qr': {
      const { message, mediaUrl } = await resendUserQr(phone);
      return { replyBody: message, mediaUrl, sessionState: 'completed', userId: user.id };
    }

    case 'help': {
      const replyBody = buildHelpMessage(user.name);
      return { replyBody, sessionState: 'completed', userId: user.id };
    }

    case 'unknown':
    default: {
      const replyBody = buildHelpMessage(user.name);
      return { replyBody, sessionState: 'completed', userId: user.id };
    }
  }
};
