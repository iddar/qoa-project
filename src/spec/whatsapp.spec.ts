import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { and, desc, eq, or } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { getExpectedTwilioSignature } from 'twilio/lib/webhooks/webhooks';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import {
  cards,
  stores,
  userStoreEnrollments,
  users,
  whatsappMessages,
  whatsappOnboardingSessions,
  balances,
  transactions,
  transactionItems,
  accumulations,
  campaigns,
} from '../db/schema';
import { buildSignedWhatsappCardQrImageUrl } from '../services/twilio-whatsapp';

process.env.AUTH_DEV_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.WHATSAPP_WEBHOOK_SECRET = 'test_whatsapp_secret';
process.env.TWILIO_AUTH = 'test_twilio_auth';
process.env.TWILIO_ACCOUNT = 'ACtesttwilioaccount';
process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+12182204117';
process.env.PUBLIC_BASE_URL = 'https://qoacore-production.up.railway.app';
process.env.TWILIO_MEDIA_SIGNING_SECRET = 'test_media_secret';

const app = createApp();
const api = treaty<App>(app);

const adminHeaders = {
  authorization: 'Bearer dev-token',
  'x-dev-user-id': 'dev-admin',
  'x-dev-user-role': 'qoa_admin',
};

const signatureFor = (payload: unknown) =>
  createHmac('sha256', process.env.WHATSAPP_WEBHOOK_SECRET ?? '')
    .update(JSON.stringify(payload))
    .digest('hex');

const buildTwilioPayload = (overrides: Partial<Record<string, string>> = {}) => {
  const messageSid = overrides.MessageSid ?? `SM${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`;
  return {
    SmsMessageSid: messageSid,
    MessageSid: messageSid,
    AccountSid: process.env.TWILIO_ACCOUNT ?? 'ACtesttwilioaccount',
    From: overrides.From ?? 'whatsapp:+5215512345678',
    To: overrides.To ?? process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+12182204117',
    Body: overrides.Body ?? '',
    WaId: overrides.WaId ?? '5215512345678',
    ProfileName: overrides.ProfileName ?? 'Cliente WhatsApp',
    MessageType: 'text',
    SmsStatus: 'received',
    NumMedia: '0',
    NumSegments: '1',
    ApiVersion: '2010-04-01',
    ...overrides,
  };
};

const buildTwilioRequest = (payload: Record<string, string>, invalidSignature = false) => {
  const webhookUrl = `${process.env.PUBLIC_BASE_URL}/v1/whatsapp/twilio/webhook`;
  const signature = invalidSignature
    ? 'bad-signature'
    : getExpectedTwilioSignature(process.env.TWILIO_AUTH ?? '', webhookUrl, payload);

  return new Request(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: new URLSearchParams(payload).toString(),
  });
};

const createStore = async (name: string, code?: string) => {
  const [store] = (await db
    .insert(stores)
    .values({
      name,
      code: code ?? `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
      type: 'tiendita',
    })
    .returning({ id: stores.id, code: stores.code, name: stores.name })) as Array<{
    id: string;
    code: string;
    name: string;
  }>;

  if (!store) {
    throw new Error('Failed to create store');
  }

  return store;
};

const cleanupPhoneData = async (phone: string) => {
  const normalizedPhone = phone.startsWith('whatsapp:') ? phone.slice('whatsapp:'.length) : phone;
  const whatsappPhone = `whatsapp:${normalizedPhone}`;

  const userRows = (await db.select({ id: users.id }).from(users).where(eq(users.phone, normalizedPhone))) as Array<{
    id: string;
  }>;
  for (const row of userRows) {
    await db.delete(users).where(eq(users.id, row.id));
  }

  await db.delete(whatsappOnboardingSessions).where(eq(whatsappOnboardingSessions.phone, normalizedPhone));
  await db
    .delete(whatsappMessages)
    .where(
      or(
        eq(whatsappMessages.fromPhone, normalizedPhone),
        eq(whatsappMessages.toPhone, normalizedPhone),
        eq(whatsappMessages.fromPhone, whatsappPhone),
        eq(whatsappMessages.toPhone, whatsappPhone),
      ),
    );
};

describe('WhatsApp module', () => {
  it('ingests webhook and handles replay idempotently', async () => {
    const payload = {
      provider: 'meta',
      messageId: `wamid.${crypto.randomUUID()}`,
      from: '+5215512345678',
      to: '+5215598765432',
      text: 'Hola mundo',
    };

    const signature = signatureFor(payload);

    const first = await api.v1.whatsapp.webhook.post(payload, {
      headers: {
        'x-whatsapp-signature': signature,
      },
    });

    if (first.error) {
      throw first.error.value;
    }
    if (!first.data) {
      throw new Error('First webhook response missing');
    }

    expect(first.status).toBe(201);
    expect(first.data.data.replayed).toBe(false);

    const second = await api.v1.whatsapp.webhook.post(payload, {
      headers: {
        'x-whatsapp-signature': signature,
      },
    });

    if (second.error) {
      throw second.error.value;
    }
    if (!second.data) {
      throw new Error('Second webhook response missing');
    }

    expect(second.status).toBe(200);
    expect(second.data.data.replayed).toBe(true);

    const listed = await api.v1.whatsapp.messages.get({
      query: {
        limit: '10',
      },
      headers: adminHeaders,
    });

    if (listed.error) {
      throw listed.error.value;
    }
    if (!listed.data) {
      throw new Error('WhatsApp list response missing');
    }

    expect(listed.status).toBe(200);
    expect(listed.data.data.some((entry: { messageId: string }) => entry.messageId === payload.messageId)).toBe(true);

    await db.delete(whatsappMessages).where(eq(whatsappMessages.externalMessageId, payload.messageId));
  });

  it('rejects webhook when signature is invalid', async () => {
    const payload = {
      provider: 'meta',
      messageId: `wamid.${crypto.randomUUID()}`,
      from: '+5215512345678',
      to: '+5215598765432',
    };

    const response = await api.v1.whatsapp.webhook.post(payload, {
      headers: {
        'x-whatsapp-signature': 'bad-signature',
      },
    });

    if (!response.error) {
      throw new Error('Expected invalid signature error');
    }

    expect(response.status).toBe(401);
    expect(response.error.value.error.code).toBe('INVALID_WHATSAPP_SIGNATURE');
  });

  it('rejects Twilio webhook when signature is invalid', async () => {
    const payload = buildTwilioPayload();
    const response = await app.handle(buildTwilioRequest(payload, true));
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('INVALID_TWILIO_SIGNATURE');
  });

  it('processes Twilio onboarding and reuses the same universal card across stores', async () => {
    const phone = '+5215512000001';
    const waPhone = `whatsapp:${phone}`;
    const firstStore = await createStore('Tienda WhatsApp Uno');
    const secondStore = await createStore('Tienda WhatsApp Dos');

    try {
      const startPayload = buildTwilioPayload({ From: waPhone, Body: firstStore.code, WaId: phone.slice(1) });
      const startResponse = await app.handle(buildTwilioRequest(startPayload));
      const startBody = (await startResponse.json()) as { data: { sessionState?: string } };

      expect(startResponse.status).toBe(201);
      expect(startBody.data.sessionState).toBe('awaiting_name');

      const namePayload = buildTwilioPayload({ From: waPhone, Body: 'Iddar Cliente', WaId: phone.slice(1) });
      const nameResponse = await app.handle(buildTwilioRequest(namePayload));
      const nameBody = (await nameResponse.json()) as { data: { sessionState?: string } };

      expect(nameResponse.status).toBe(201);
      expect(nameBody.data.sessionState).toBe('completed');

      const [createdUser] = (await db
        .select({ id: users.id, name: users.name, birthDate: users.birthDate })
        .from(users)
        .where(eq(users.phone, phone))) as Array<{ id: string; name: string | null; birthDate: Date | null }>;

      expect(createdUser?.name).toBe('Iddar Cliente');
      expect(createdUser?.birthDate).toBeNull();

      const [completionMessage] = (await db
        .select({ textBody: whatsappMessages.textBody, payload: whatsappMessages.payload })
        .from(whatsappMessages)
        .where(and(eq(whatsappMessages.direction, 'outbound'), eq(whatsappMessages.toPhone, waPhone)))
        .orderBy(desc(whatsappMessages.receivedAt))
        .limit(1)) as Array<{ textBody: string | null; payload: string | null }>;

      expect(completionMessage?.textBody).toContain('Ya estás enrolado en el esquema de lealtad de Tienda WhatsApp Uno');
      expect(completionMessage?.textBody).toContain('https://digital-wallet-production-93fb.up.railway.app');
      expect(completionMessage?.payload ?? '').toContain('/v1/whatsapp/cards/');

      const initialCards = (await db
        .select({ id: cards.id, code: cards.code })
        .from(cards)
        .where(eq(cards.userId, createdUser?.id ?? ''))) as Array<{ id: string; code: string }>;

      expect(initialCards.length).toBe(1);

      const secondStorePayload = buildTwilioPayload({ From: waPhone, Body: secondStore.code, WaId: phone.slice(1) });
      const secondStoreResponse = await app.handle(buildTwilioRequest(secondStorePayload));
      const secondStoreBody = (await secondStoreResponse.json()) as { data: { sessionState?: string } };

      expect(secondStoreResponse.status).toBe(201);
      expect(secondStoreBody.data.sessionState).toBe('completed');

      const [checkinMessage] = (await db
        .select({ textBody: whatsappMessages.textBody, payload: whatsappMessages.payload })
        .from(whatsappMessages)
        .where(and(eq(whatsappMessages.direction, 'outbound'), eq(whatsappMessages.toPhone, waPhone)))
        .orderBy(desc(whatsappMessages.receivedAt))
        .limit(1)) as Array<{ textBody: string | null; payload: string | null }>;

      expect(checkinMessage?.textBody).toBe('Gracias por tu visita, comentale a tu tendero que confirma tu visita.');
      expect(checkinMessage?.payload ?? '').not.toContain('/v1/whatsapp/cards/');

      const cardsAfterSecondStore = (await db
        .select({ id: cards.id, code: cards.code })
        .from(cards)
        .where(eq(cards.userId, createdUser?.id ?? ''))) as Array<{ id: string; code: string }>;

      expect(cardsAfterSecondStore.length).toBe(1);
      expect(cardsAfterSecondStore[0]?.id).toBe(initialCards[0]?.id);

      const enrollments = (await db
        .select({ storeId: userStoreEnrollments.storeId })
        .from(userStoreEnrollments)
        .where(eq(userStoreEnrollments.userId, createdUser?.id ?? ''))) as Array<{ storeId: string }>;

      expect(enrollments).toHaveLength(2);
      expect(new Set(enrollments.map((entry) => entry.storeId))).toEqual(new Set([firstStore.id, secondStore.id]));
    } finally {
      await cleanupPhoneData(phone);
      await db.delete(stores).where(and(eq(stores.id, firstStore.id), eq(stores.code, firstStore.code)));
      await db.delete(stores).where(and(eq(stores.id, secondStore.id), eq(stores.code, secondStore.code)));
    }
  });

  it('keeps birth date request when WHATSAPP_REQUIRE_BIRTH_DATE is enabled', async () => {
    const previousFlag = process.env.WHATSAPP_REQUIRE_BIRTH_DATE;
    process.env.WHATSAPP_REQUIRE_BIRTH_DATE = 'true';
    const phone = '+5215512000091';
    const waPhone = `whatsapp:${phone}`;
    const store = await createStore('Tienda Fecha Requerida');

    try {
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: store.code, WaId: phone.slice(1) })),
      );

      const nameResponse = await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: 'Cliente Fecha', WaId: phone.slice(1) })),
      );
      const nameBody = (await nameResponse.json()) as { data: { sessionState?: string } };

      expect(nameResponse.status).toBe(201);
      expect(nameBody.data.sessionState).toBe('awaiting_birth_date');
    } finally {
      if (previousFlag === undefined) {
        delete process.env.WHATSAPP_REQUIRE_BIRTH_DATE;
      } else {
        process.env.WHATSAPP_REQUIRE_BIRTH_DATE = previousFlag;
      }
      await cleanupPhoneData(phone);
      await db.delete(stores).where(eq(stores.id, store.id));
    }
  });

  it('handles Twilio webhook replay idempotently', async () => {
    const phone = '+5215512000002';
    const waPhone = `whatsapp:${phone}`;
    const store = await createStore('Tienda Replay Twilio');
    const payload = buildTwilioPayload({ From: waPhone, Body: store.code, WaId: phone.slice(1) });

    try {
      const firstResponse = await app.handle(buildTwilioRequest(payload));
      const firstBody = (await firstResponse.json()) as { data: { replayed: boolean } };
      expect(firstResponse.status).toBe(201);
      expect(firstBody.data.replayed).toBe(false);

      const secondResponse = await app.handle(buildTwilioRequest(payload));
      const secondBody = (await secondResponse.json()) as { data: { replayed: boolean } };
      expect(secondResponse.status).toBe(200);
      expect(secondBody.data.replayed).toBe(true);
    } finally {
      await cleanupPhoneData(phone);
      await db.delete(stores).where(eq(stores.id, store.id));
    }
  });

  it('serves signed QR image for WhatsApp cards', async () => {
    const phone = '+5215512000003';
    const waPhone = `whatsapp:${phone}`;
    const store = await createStore('Tienda QR Twilio');

    try {
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: store.code, WaId: phone.slice(1) })),
      );
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: 'Cliente QR', WaId: phone.slice(1) })),
      );
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: '01/01/1990', WaId: phone.slice(1) })),
      );

      const [createdUser] = (await db.select({ id: users.id }).from(users).where(eq(users.phone, phone))) as Array<{
        id: string;
      }>;
      const [card] = (await db
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.userId, createdUser?.id ?? ''))) as Array<{
        id: string;
      }>;

      if (!card) {
        throw new Error('Card was not created for QR image test');
      }

      const qrUrl = buildSignedWhatsappCardQrImageUrl(card.id);
      const qrResponse = await app.handle(new Request(qrUrl));

      expect(qrResponse.status).toBe(200);
      expect(qrResponse.headers.get('content-type')).toBe('image/png');
      const buffer = await qrResponse.arrayBuffer();
      expect(buffer.byteLength).toBeGreaterThan(0);
    } finally {
      await cleanupPhoneData(phone);
      await db.delete(stores).where(eq(stores.id, store.id));
    }
  });

  it('accepts store onboarding with alta plus existing store code', async () => {
    const phone = '+5215512000004';
    const waPhone = `whatsapp:${phone}`;
    const store = await createStore('Tienda Staging Bonita', 'JUANITA_STG');

    try {
      const response = await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: `alta ${store.code}`, WaId: phone.slice(1) })),
      );
      const body = (await response.json()) as { data: { sessionState?: string } };

      expect(response.status).toBe(201);
      expect(body.data.sessionState).toBe('awaiting_name');
    } finally {
      await cleanupPhoneData(phone);
      await db.delete(stores).where(eq(stores.id, store.id));
    }
  });

  it('accepts legacy JSON store QR payloads for onboarding', async () => {
    const phone = '+5215512000005';
    const waPhone = `whatsapp:${phone}`;
    const store = await createStore('Tienda JSON QR');
    const qrBody = JSON.stringify({
      code: store.code,
      payload: {
        entityType: 'store',
        entityId: store.id,
        code: store.code,
      },
    });

    try {
      const response = await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: qrBody, WaId: phone.slice(1) })),
      );
      const body = (await response.json()) as { data: { sessionState?: string } };

      expect(response.status).toBe(201);
      expect(body.data.sessionState).toBe('awaiting_name');
    } finally {
      await cleanupPhoneData(phone);
      await db.delete(stores).where(eq(stores.id, store.id));
    }
  });

  it('does not route completed user registration intent to the help menu', async () => {
    const phone = '+5215512000006';
    const waPhone = `whatsapp:${phone}`;
    const store = await createStore('Tienda Registro Intent');

    try {
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: store.code, WaId: phone.slice(1) })),
      );
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: 'Cliente Registro', WaId: phone.slice(1) })),
      );
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: '01/01/1990', WaId: phone.slice(1) })),
      );

      const response = await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: 'registrarme', WaId: phone.slice(1) })),
      );
      const body = (await response.json()) as { data: { sessionState?: string } };

      expect(response.status).toBe(201);
      expect(body.data.sessionState).toBe('completed');

      const [outbound] = (await db
        .select({ textBody: whatsappMessages.textBody })
        .from(whatsappMessages)
        .where(and(eq(whatsappMessages.direction, 'outbound'), eq(whatsappMessages.toPhone, waPhone)))
        .orderBy(desc(whatsappMessages.processedAt))
        .limit(1)) as Array<{ textBody: string | null }>;

      expect(outbound?.textBody).toContain('escanea el QR de la tienda');
      expect(outbound?.textBody).not.toContain('Estas son las opciones disponibles');
    } finally {
      await cleanupPhoneData(phone);
      await db.delete(stores).where(eq(stores.id, store.id));
    }
  });

  it('returns balance for a completed user', async () => {
    const phone = '+5215512000010';
    const waPhone = `whatsapp:${phone}`;
    const store = await createStore('Tienda Balance');

    try {
      // Complete onboarding
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: store.code, WaId: phone.slice(1) })),
      );
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: 'Cliente Balance', WaId: phone.slice(1) })),
      );
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: '01/01/1990', WaId: phone.slice(1) })),
      );

      const [createdUser] = (await db.select({ id: users.id }).from(users).where(eq(users.phone, phone))) as Array<{
        id: string;
      }>;
      const [card] = (await db
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.userId, createdUser?.id ?? ''))) as Array<{ id: string }>;

      // Seed balance
      await db.insert(balances).values({ cardId: card!.id, current: 150, lifetime: 150 });

      const response = await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: 'saldo', WaId: phone.slice(1) })),
      );
      const body = (await response.json()) as { data: { sessionState?: string } };

      expect(response.status).toBe(201);
      expect(body.data.sessionState).toBe('completed');
    } finally {
      await cleanupPhoneData(phone);
      await db.delete(stores).where(eq(stores.id, store.id));
    }
  });

  it('returns recent activity for a completed user', async () => {
    const phone = '+5215512000011';
    const waPhone = `whatsapp:${phone}`;
    const store = await createStore('Tienda Actividad');

    try {
      // Complete onboarding
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: store.code, WaId: phone.slice(1) })),
      );
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: 'Cliente Actividad', WaId: phone.slice(1) })),
      );
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: '01/01/1990', WaId: phone.slice(1) })),
      );

      const [createdUser] = (await db.select({ id: users.id }).from(users).where(eq(users.phone, phone))) as Array<{
        id: string;
      }>;
      const [card] = (await db
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.userId, createdUser?.id ?? ''))) as Array<{ id: string }>;

      // Seed a transaction
      const [tx] = (await db
        .insert(transactions)
        .values({
          userId: createdUser!.id,
          storeId: store.id,
          cardId: card!.id,
          totalAmount: 250,
        })
        .returning({ id: transactions.id })) as Array<{ id: string }>;

      const [item] = (await db
        .insert(transactionItems)
        .values({
          transactionId: tx!.id,
          productId: 'prod_test',
          quantity: 1,
          amount: 250,
        })
        .returning({ id: transactionItems.id })) as Array<{ id: string }>;

      // Seed campaign for accumulation
      const [campaign] = (await db
        .insert(campaigns)
        .values({
          name: 'Test Campaign',
          status: 'active',
          enrollmentMode: 'open',
          accumulationMode: 'amount',
        })
        .returning({ id: campaigns.id })) as Array<{ id: string }>;

      await db.insert(accumulations).values({
        transactionItemId: item!.id,
        cardId: card!.id,
        campaignId: campaign!.id,
        amount: 15,
        balanceAfter: 15,
        sourceType: 'transaction_item',
      });

      const response = await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: 'actividad', WaId: phone.slice(1) })),
      );
      const body = (await response.json()) as { data: { sessionState?: string } };

      expect(response.status).toBe(201);
      expect(body.data.sessionState).toBe('completed');
    } finally {
      await cleanupPhoneData(phone);
      await db.delete(stores).where(eq(stores.id, store.id));
    }
  });

  it('resends QR for a completed user', async () => {
    const phone = '+5215512000012';
    const waPhone = `whatsapp:${phone}`;
    const store = await createStore('Tienda QR Resend');

    try {
      // Complete onboarding
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: store.code, WaId: phone.slice(1) })),
      );
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: 'Cliente QR', WaId: phone.slice(1) })),
      );
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: '01/01/1990', WaId: phone.slice(1) })),
      );

      const response = await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: 'qr', WaId: phone.slice(1) })),
      );
      const body = (await response.json()) as { data: { sessionState?: string } };

      expect(response.status).toBe(201);
      expect(body.data.sessionState).toBe('completed');
    } finally {
      await cleanupPhoneData(phone);
      await db.delete(stores).where(eq(stores.id, store.id));
    }
  });

  it('shows help menu for a completed user', async () => {
    const phone = '+5215512000013';
    const waPhone = `whatsapp:${phone}`;
    const store = await createStore('Tienda Ayuda');

    try {
      // Complete onboarding
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: store.code, WaId: phone.slice(1) })),
      );
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: 'Cliente Ayuda', WaId: phone.slice(1) })),
      );
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: '01/01/1990', WaId: phone.slice(1) })),
      );

      const response = await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: 'ayuda', WaId: phone.slice(1) })),
      );
      const body = (await response.json()) as { data: { sessionState?: string } };

      expect(response.status).toBe(201);
      expect(body.data.sessionState).toBe('completed');
    } finally {
      await cleanupPhoneData(phone);
      await db.delete(stores).where(eq(stores.id, store.id));
    }
  });

  it('shows help for unknown command from completed user', async () => {
    const phone = '+5215512000014';
    const waPhone = `whatsapp:${phone}`;
    const store = await createStore('Tienda Unknown');

    try {
      // Complete onboarding
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: store.code, WaId: phone.slice(1) })),
      );
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: 'Cliente Unknown', WaId: phone.slice(1) })),
      );
      await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: '01/01/1990', WaId: phone.slice(1) })),
      );

      const response = await app.handle(
        buildTwilioRequest(buildTwilioPayload({ From: waPhone, Body: 'xyz nonsense', WaId: phone.slice(1) })),
      );
      const body = (await response.json()) as { data: { sessionState?: string } };

      expect(response.status).toBe(201);
      expect(body.data.sessionState).toBe('completed');
    } finally {
      await cleanupPhoneData(phone);
      await db.delete(stores).where(eq(stores.id, store.id));
    }
  });

  it('accepts check-in message with "quiero registrar mi compra en" format', async () => {
    const phone = '+5215512000015';
    const waPhone = `whatsapp:${phone}`;
    const store = await createStore('Tienda Checkin Natural');

    try {
      const response = await app.handle(
        buildTwilioRequest(
          buildTwilioPayload({
            From: waPhone,
            Body: `Quiero registrar mi compra en ${store.code}`,
            WaId: phone.slice(1),
          }),
        ),
      );
      const body = (await response.json()) as { data: { sessionState?: string } };

      expect(response.status).toBe(201);
      expect(body.data.sessionState).toBe('awaiting_name');
    } finally {
      await cleanupPhoneData(phone);
      await db.delete(stores).where(eq(stores.id, store.id));
    }
  });
});
