import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import { whatsappMessages } from '../db/schema';

process.env.AUTH_DEV_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.WHATSAPP_WEBHOOK_SECRET = 'test_whatsapp_secret';

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
});
