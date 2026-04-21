import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { cards, stores, userStoreEnrollments, users, whatsappOnboardingSessions } from '../db/schema';
import { ensureUserUniversalWalletCard } from './wallet-onboarding';
import { buildSignedWhatsappCardQrImageUrl, normalizeWhatsappPhone } from './twilio-whatsapp';

type UserRow = {
  id: string;
  phone: string;
  name: string | null;
  birthDate: Date | null;
  role: string;
  status: string;
};

type StoreRow = {
  id: string;
  code: string;
  name: string;
};

type SessionRow = {
  id: string;
  phone: string;
  userId: string | null;
  pendingStoreId: string | null;
  state: 'awaiting_store' | 'awaiting_name' | 'awaiting_birth_date' | 'completed';
  lastInboundMessageId: string | null;
  lastOutboundMessageId: string | null;
  completedAt: Date | null;
};

export type ProcessWhatsappOnboardingInput = {
  messageSid: string;
  from: string;
  body?: string | null;
};

export type ProcessWhatsappOnboardingResult = {
  replyBody: string;
  mediaUrl?: string;
  sessionState: SessionRow['state'];
  userId?: string;
  storeId?: string;
};

const STORE_CODE_PATTERN = /\b[a-z0-9]+(?:[_-][a-z0-9]+)+\b/i;

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ').slice(0, 100);

const parseBirthDate = (value: string) => {
  const trimmed = value.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day ||
    candidate.getTime() > Date.now() ||
    year < 1900
  ) {
    return null;
  }

  return candidate;
};

const parseStoreCodeJson = (value: string) => {
  try {
    const normalized = value.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    const parsed = JSON.parse(normalized) as {
      code?: unknown;
      payload?: {
        entityType?: unknown;
        code?: unknown;
      };
    };

    if (parsed.payload?.entityType === 'store' && typeof parsed.payload.code === 'string') {
      return parsed.payload.code.toLowerCase();
    }

    if (typeof parsed.code === 'string') {
      return parsed.code.toLowerCase();
    }
  } catch {
    return null;
  }

  return null;
};

const extractStoreCodeFromText = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const jsonCode = parseStoreCodeJson(value);
  if (jsonCode) {
    return jsonCode;
  }

  const trimmed = value.trim();
  if (/^[a-z0-9]+(?:[_-][a-z0-9]+)+$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const match = value.match(STORE_CODE_PATTERN);
  return match ? match[0].toLowerCase() : null;
};

const findUserByPhone = async (phone: string) => {
  const [user] = (await db
    .select({
      id: users.id,
      phone: users.phone,
      name: users.name,
      birthDate: users.birthDate,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.phone, phone))) as UserRow[];

  return user ?? null;
};

const createConsumerUser = async (phone: string) => {
  const [created] = (await db
    .insert(users)
    .values({
      phone,
      role: 'consumer',
    })
    .returning({
      id: users.id,
      phone: users.phone,
      name: users.name,
      birthDate: users.birthDate,
      role: users.role,
      status: users.status,
    })) as UserRow[];

  if (!created) {
    throw new Error('WHATSAPP_USER_CREATE_FAILED');
  }

  return created;
};

const findStoreByCode = async (code: string) => {
  const [store] = (await db
    .select({
      id: stores.id,
      code: stores.code,
      name: stores.name,
    })
    .from(stores)
    .where(eq(stores.code, code))) as StoreRow[];

  return store ?? null;
};

const getSessionByPhone = async (phone: string) => {
  const [session] = (await db
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
    .where(eq(whatsappOnboardingSessions.phone, phone))) as SessionRow[];

  return session ?? null;
};

const ensureSession = async (phone: string, userId?: string | null) => {
  const existing = await getSessionByPhone(phone);
  if (existing) {
    if (userId && existing.userId !== userId) {
      await db
        .update(whatsappOnboardingSessions)
        .set({
          userId,
          updatedAt: new Date(),
        })
        .where(eq(whatsappOnboardingSessions.id, existing.id));
      return { ...existing, userId };
    }

    return existing;
  }

  const [created] = (await db
    .insert(whatsappOnboardingSessions)
    .values({
      phone,
      userId: userId ?? null,
      state: 'awaiting_store',
    })
    .returning({
      id: whatsappOnboardingSessions.id,
      phone: whatsappOnboardingSessions.phone,
      userId: whatsappOnboardingSessions.userId,
      pendingStoreId: whatsappOnboardingSessions.pendingStoreId,
      state: whatsappOnboardingSessions.state,
      lastInboundMessageId: whatsappOnboardingSessions.lastInboundMessageId,
      lastOutboundMessageId: whatsappOnboardingSessions.lastOutboundMessageId,
      completedAt: whatsappOnboardingSessions.completedAt,
    })) as SessionRow[];

  if (!created) {
    throw new Error('WHATSAPP_SESSION_CREATE_FAILED');
  }

  return created;
};

const updateSession = async (
  sessionId: string,
  patch: Partial<{
    userId: string | null;
    pendingStoreId: string | null;
    state: SessionRow['state'];
    lastInboundMessageId: string | null;
    lastOutboundMessageId: string | null;
    completedAt: Date | null;
  }>,
) => {
  await db
    .update(whatsappOnboardingSessions)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(whatsappOnboardingSessions.id, sessionId));
};

const recordStoreEnrollment = async (userId: string, storeId: string) => {
  const now = new Date();
  const [existing] = (await db
    .select({ id: userStoreEnrollments.id, enrollmentCount: userStoreEnrollments.enrollmentCount })
    .from(userStoreEnrollments)
    .where(and(eq(userStoreEnrollments.userId, userId), eq(userStoreEnrollments.storeId, storeId)))) as Array<{
    id: string;
    enrollmentCount: number;
  }>;

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
    source: 'whatsapp_qr',
    firstEnrolledAt: now,
    lastEnrolledAt: now,
    updatedAt: now,
  });
};

const getCardCode = async (cardId: string) => {
  const [card] = (await db.select({ code: cards.code }).from(cards).where(eq(cards.id, cardId))) as Array<{
    code: string;
  }>;

  return card?.code ?? null;
};

const getStoreName = async (storeId: string | null) => {
  if (!storeId) {
    return null;
  }

  const [store] = (await db.select({ name: stores.name }).from(stores).where(eq(stores.id, storeId))) as Array<{
    name: string;
  }>;

  return store?.name ?? null;
};

const buildCompletionMessage = async (payload: { userId: string; storeName: string | null }) => {
  const ensuredCard = await ensureUserUniversalWalletCard(payload.userId);
  const cardCode = await getCardCode(ensuredCard.cardId);
  if (!cardCode) {
    throw new Error('WHATSAPP_CARD_NOT_FOUND');
  }

  const storeFragment = payload.storeName ? ` ligada a ${payload.storeName}` : '';
  return {
    replyBody: `Listo, ya quedó tu tarjeta Qoa${storeFragment}. Este es tu QR de lealtad. Guárdalo y muéstralo cuando compres.\n\nCódigo: ${cardCode}`,
    mediaUrl: buildSignedWhatsappCardQrImageUrl(ensuredCard.cardId),
  };
};

export const processWhatsappOnboardingMessage = async (
  input: ProcessWhatsappOnboardingInput,
): Promise<ProcessWhatsappOnboardingResult> => {
  const phone = normalizeWhatsappPhone(input.from);
  const text = input.body?.trim() ?? '';
  const storeCode = extractStoreCodeFromText(text);

  let user = await findUserByPhone(phone);
  if (user && !['consumer', 'customer'].includes(user.role)) {
    return {
      replyBody:
        'Encontré una cuenta existente con este teléfono que no se puede enrolar por este canal. Escríbenos para apoyarte con el alta.',
      sessionState: 'awaiting_store',
      userId: user.id,
    };
  }

  let session = await ensureSession(phone, user?.id ?? null);

  if (storeCode) {
    const store = await findStoreByCode(storeCode);
    if (!store) {
      await updateSession(session.id, {
        lastInboundMessageId: input.messageSid,
      });
      return {
        replyBody:
          'No reconocí ese código de tienda. Escanea otra vez el QR de tu tiendita o envíame el código exacto de la tienda.',
        sessionState: session.state,
        userId: session.userId ?? undefined,
      };
    }

    if (!user) {
      user = await createConsumerUser(phone);
    }

    await recordStoreEnrollment(user.id, store.id);

    if (!user.name) {
      await updateSession(session.id, {
        userId: user.id,
        pendingStoreId: store.id,
        state: 'awaiting_name',
        lastInboundMessageId: input.messageSid,
        completedAt: null,
      });
      return {
        replyBody: `Te registré desde ${store.name}. Para crear tu wallet Qoa, compárteme tu nombre.`,
        sessionState: 'awaiting_name',
        userId: user.id,
        storeId: store.id,
      };
    }

    if (!user.birthDate) {
      await updateSession(session.id, {
        userId: user.id,
        pendingStoreId: store.id,
        state: 'awaiting_birth_date',
        lastInboundMessageId: input.messageSid,
        completedAt: null,
      });
      return {
        replyBody: `Gracias, ${user.name.split(' ')[0] ?? user.name}. Ahora compárteme tu fecha de nacimiento con formato DD/MM/YYYY.`,
        sessionState: 'awaiting_birth_date',
        userId: user.id,
        storeId: store.id,
      };
    }

    const completed = await buildCompletionMessage({ userId: user.id, storeName: store.name });
    await updateSession(session.id, {
      userId: user.id,
      pendingStoreId: store.id,
      state: 'completed',
      lastInboundMessageId: input.messageSid,
      completedAt: new Date(),
    });
    return {
      ...completed,
      sessionState: 'completed',
      userId: user.id,
      storeId: store.id,
    };
  }

  if (!session.userId) {
    await updateSession(session.id, {
      lastInboundMessageId: input.messageSid,
      state: 'awaiting_store',
    });
    return {
      replyBody:
        'Escanea el QR de tu tiendita o envíame el código exacto de la tienda para comenzar a crear tu wallet Qoa.',
      sessionState: 'awaiting_store',
    };
  }

  user = user ?? (await findUserByPhone(phone));
  if (!user) {
    throw new Error('WHATSAPP_SESSION_USER_NOT_FOUND');
  }

  if (session.state === 'awaiting_name') {
    const normalizedName = normalizeName(text);
    if (normalizedName.length < 2) {
      await updateSession(session.id, {
        lastInboundMessageId: input.messageSid,
      });
      return {
        replyBody: 'Necesito tu nombre para continuar. Envíamelo tal como quieres que aparezca en tu wallet.',
        sessionState: 'awaiting_name',
        userId: user.id,
        storeId: session.pendingStoreId ?? undefined,
      };
    }

    await db
      .update(users)
      .set({
        name: normalizedName,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await updateSession(session.id, {
      state: 'awaiting_birth_date',
      lastInboundMessageId: input.messageSid,
    });

    return {
      replyBody: `Gracias, ${normalizedName.split(' ')[0] ?? normalizedName}. Ahora compárteme tu fecha de nacimiento con formato DD/MM/YYYY.`,
      sessionState: 'awaiting_birth_date',
      userId: user.id,
      storeId: session.pendingStoreId ?? undefined,
    };
  }

  if (session.state === 'awaiting_birth_date') {
    const birthDate = parseBirthDate(text);
    if (!birthDate) {
      await updateSession(session.id, {
        lastInboundMessageId: input.messageSid,
      });
      return {
        replyBody: 'No pude entender la fecha. Envíamela con formato DD/MM/YYYY, por ejemplo 07/11/1994.',
        sessionState: 'awaiting_birth_date',
        userId: user.id,
        storeId: session.pendingStoreId ?? undefined,
      };
    }

    await db
      .update(users)
      .set({
        birthDate,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const storeName = await getStoreName(session.pendingStoreId);
    const completed = await buildCompletionMessage({ userId: user.id, storeName });

    await updateSession(session.id, {
      state: 'completed',
      lastInboundMessageId: input.messageSid,
      completedAt: new Date(),
    });

    return {
      ...completed,
      sessionState: 'completed',
      userId: user.id,
      storeId: session.pendingStoreId ?? undefined,
    };
  }

  const storeName = await getStoreName(session.pendingStoreId);
  const completed = await buildCompletionMessage({ userId: user.id, storeName });
  await updateSession(session.id, {
    lastInboundMessageId: input.messageSid,
    state: 'completed',
  });

  return {
    ...completed,
    sessionState: 'completed',
    userId: user.id,
    storeId: session.pendingStoreId ?? undefined,
  };
};

export const attachWhatsappOutboundMessageToSession = async (phone: string, outboundMessageId: string) => {
  const normalizedPhone = normalizeWhatsappPhone(phone);
  const session = await getSessionByPhone(normalizedPhone);
  if (!session) {
    return;
  }

  await updateSession(session.id, {
    lastOutboundMessageId: outboundMessageId,
  });
};
