import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { cards, stores, userStoreEnrollments, users } from '../db/schema';
import { ensureUserUniversalWalletCard } from './wallet-onboarding';
import { sendTwilioWhatsappMessage } from './twilio-whatsapp';

const PHONE_CLEAN_PATTERN = /[^\d+]/g;

export const normalizePhoneInput = (value: string): string | null => {
  const cleaned = value.replace(PHONE_CLEAN_PATTERN, '');

  if (!cleaned) {
    return null;
  }

  // Si ya tiene +, validamos que tenga al menos 10 digitos despues
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    if (/^\d{10,15}$/.test(digits)) {
      return cleaned;
    }
    return null;
  }

  // Si son solo digitos
  if (/^\d+$/.test(cleaned)) {
    // Mexico: si empieza con 52 y tiene 12+ digitos, es internacional ya
    if (cleaned.startsWith('52') && cleaned.length >= 12) {
      return `+${cleaned}`;
    }
    // Mexico: si tiene 10 digitos, le agregamos +52
    if (cleaned.length === 10) {
      return `+52${cleaned}`;
    }
    // Otros: si tiene mas de 10 digitos, asumimos que incluye codigo de pais
    if (cleaned.length > 10) {
      return `+${cleaned}`;
    }
  }

  return null;
};

export type ResolveCustomerByPhoneResult = {
  userId: string;
  cardId: string;
  cardCode: string;
  name?: string;
  phone: string;
  email?: string;
  created: boolean;
};

type UserRow = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
};

type EnrollmentRow = {
  id: string;
  enrollmentCount: number;
};

const findUserByPhone = async (phone: string): Promise<UserRow | null> => {
  const [user] = (await db
    .select({
      id: users.id,
      phone: users.phone,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.phone, phone))) as UserRow[];

  return user ?? null;
};

const recordStoreEnrollment = async (userId: string, storeId: string) => {
  const now = new Date();
  const [existing] = (await db
    .select({ id: userStoreEnrollments.id, enrollmentCount: userStoreEnrollments.enrollmentCount })
    .from(userStoreEnrollments)
    .where(and(eq(userStoreEnrollments.userId, userId), eq(userStoreEnrollments.storeId, storeId)))) as EnrollmentRow[];

  if (existing) {
    await db
      .update(userStoreEnrollments)
      .set({
        lastEnrolledAt: now,
        enrollmentCount: existing.enrollmentCount + 1,
        updatedAt: now,
      })
      .where(eq(userStoreEnrollments.id, existing.id));
    return;
  }

  await db.insert(userStoreEnrollments).values({
    userId,
    storeId,
    source: 'pos_phone',
    firstEnrolledAt: now,
    lastEnrolledAt: now,
    updatedAt: now,
  });
};

const sendWelcomeWhatsapp = async (phone: string, storeName: string | null) => {
  try {
    const storeFragment = storeName ? ` en ${storeName}` : '';
    await sendTwilioWhatsappMessage({
      to: phone,
      body: `¡Bienvenido a Qoa${storeFragment}! Tu cuenta fue registrada desde la tienda. Responde a este mensaje con tu nombre para completar tu perfil y recibir tu tarjeta de lealtad digital.`,
    });
  } catch (error) {
    console.error('[phone-customer-resolve][whatsapp-failed]', error);
  }
};

export const resolveCustomerByPhone = async (
  phoneInput: string,
  storeId: string,
): Promise<ResolveCustomerByPhoneResult> => {
  const normalizedPhone = normalizePhoneInput(phoneInput);
  if (!normalizedPhone) {
    throw new Error('INVALID_PHONE_FORMAT');
  }

  let user = await findUserByPhone(normalizedPhone);
  let created = false;

  if (!user) {
    const [createdUser] = (await db
      .insert(users)
      .values({
        phone: normalizedPhone,
        role: 'consumer',
        status: 'active',
      })
      .returning({
        id: users.id,
        phone: users.phone,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
      })) as UserRow[];

    if (!createdUser) {
      throw new Error('USER_CREATE_FAILED');
    }

    user = createdUser;
    created = true;
  }

  if (!['consumer', 'customer'].includes(user.role)) {
    throw new Error('USER_ROLE_NOT_ALLOWED');
  }

  await recordStoreEnrollment(user.id, storeId);

  const ensuredCard = await ensureUserUniversalWalletCard(user.id);

  const [card] = (await db
    .select({ id: cards.id, code: cards.code })
    .from(cards)
    .where(eq(cards.id, ensuredCard.cardId))
    .limit(1)) as Array<{ id: string; code: string }>;

  if (!card) {
    throw new Error('CARD_NOT_FOUND');
  }

  if (created) {
    const storeName = await db
      .select({ name: stores.name })
      .from(stores)
      .where(eq(stores.id, storeId))
      .then((rows) => (rows[0] as { name: string } | undefined)?.name ?? null);

    await sendWelcomeWhatsapp(normalizedPhone, storeName);
  }

  return {
    userId: user.id,
    cardId: card.id,
    cardCode: card.code,
    name: user.name ?? undefined,
    phone: user.phone,
    email: user.email ?? undefined,
    created,
  };
};
