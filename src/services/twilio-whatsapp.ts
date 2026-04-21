import { eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { validateRequest } from 'twilio/lib/webhooks/webhooks';
import { db } from '../db/client';
import { whatsappMessages } from '../db/schema';

const TWILIO_API_BASE_URL = 'https://api.twilio.com/2010-04-01';

type PersistOutboundPayload = {
  to: string;
  body?: string;
  mediaUrl?: string;
  sid: string;
  status?: string | null;
};

export type TwilioSendMessageInput = {
  to: string;
  body?: string;
  mediaUrl?: string;
};

export type TwilioSendMessageResult = {
  sid: string;
  status?: string | null;
};

const getTwilioConfig = () => {
  const account = process.env.TWILIO_ACCOUNT ?? null;
  const auth = process.env.TWILIO_AUTH ?? null;
  const from = process.env.TWILIO_WHATSAPP_FROM ?? null;

  if (!account || !auth || !from) {
    throw new Error('TWILIO_NOT_CONFIGURED');
  }

  return { account, auth, from };
};

const buildBasicAuthHeader = (account: string, auth: string) =>
  `Basic ${Buffer.from(`${account}:${auth}`).toString('base64')}`;

const normalizePhoneDigits = (value: string) => value.replace(/[^\d+]/g, '');

export const normalizeWhatsappPhone = (value: string) => {
  const normalized = value.startsWith('whatsapp:') ? value.slice('whatsapp:'.length) : value;
  const digits = normalizePhoneDigits(normalized);
  return digits.startsWith('+') ? digits : `+${digits}`;
};

export const formatWhatsappAddress = (phone: string) => `whatsapp:${normalizeWhatsappPhone(phone)}`;

const buildPublicUrl = (requestUrl: string) => {
  const current = new URL(requestUrl);
  const base = process.env.PUBLIC_BASE_URL ?? current.origin;
  return new URL(`${current.pathname}${current.search}`, base).toString();
};

export const validateTwilioWebhookRequest = (payload: {
  requestUrl: string;
  signature: string | null;
  params: Record<string, string>;
}) => {
  const auth = process.env.TWILIO_AUTH ?? null;
  if (!auth) {
    throw new Error('TWILIO_NOT_CONFIGURED');
  }

  if (!payload.signature) {
    return false;
  }

  return validateRequest(auth, payload.signature, buildPublicUrl(payload.requestUrl), payload.params);
};

const persistOutboundMessage = async (payload: PersistOutboundPayload) => {
  await db.insert(whatsappMessages).values({
    provider: 'twilio',
    externalMessageId: payload.sid,
    direction: 'outbound',
    fromPhone: process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:unknown',
    toPhone: payload.to,
    textBody: payload.body ?? null,
    payload: JSON.stringify({
      to: payload.to,
      body: payload.body,
      mediaUrl: payload.mediaUrl,
      sid: payload.sid,
      status: payload.status ?? undefined,
    }),
    status: 'processed',
    processedAt: new Date(),
  });
};

export const sendTwilioWhatsappMessage = async (input: TwilioSendMessageInput): Promise<TwilioSendMessageResult> => {
  const { account, auth, from } = getTwilioConfig();
  const to = formatWhatsappAddress(input.to);

  if (process.env.NODE_ENV === 'test') {
    const sid = `SM${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`;
    await persistOutboundMessage({
      to,
      body: input.body,
      mediaUrl: input.mediaUrl,
      sid,
      status: 'queued',
    });
    return { sid, status: 'queued' };
  }

  const params = new URLSearchParams();
  params.set('To', to);
  params.set('From', from);
  if (input.body) {
    params.set('Body', input.body);
  }
  if (input.mediaUrl) {
    params.set('MediaUrl', input.mediaUrl);
  }

  const response = await fetch(`${TWILIO_API_BASE_URL}/Accounts/${account}/Messages.json`, {
    method: 'POST',
    headers: {
      authorization: buildBasicAuthHeader(account, auth),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = (await response.json()) as {
    sid?: string;
    status?: string;
    message?: string;
    code?: number;
  };

  if (!response.ok || !data.sid) {
    throw new Error(data.message ? `TWILIO_SEND_FAILED:${data.message}` : 'TWILIO_SEND_FAILED');
  }

  await persistOutboundMessage({
    to,
    body: input.body,
    mediaUrl: input.mediaUrl,
    sid: data.sid,
    status: data.status ?? null,
  });

  return {
    sid: data.sid,
    status: data.status ?? null,
  };
};

const getMediaSigningSecret = () => process.env.TWILIO_MEDIA_SIGNING_SECRET ?? process.env.JWT_SECRET ?? null;

export const signWhatsappCardQrImage = (cardId: string, expires: string) => {
  const secret = getMediaSigningSecret();
  if (!secret) {
    throw new Error('TWILIO_MEDIA_SIGNING_SECRET_MISSING');
  }

  return createHmac('sha256', secret).update(`${cardId}:${expires}`).digest('hex');
};

export const verifyWhatsappCardQrImageSignature = (payload: { cardId: string; expires: string; signature: string }) => {
  if (!payload.expires || !payload.signature) {
    return false;
  }

  const expiresAt = Number(payload.expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return false;
  }

  return signWhatsappCardQrImage(payload.cardId, payload.expires) === payload.signature;
};

export const buildSignedWhatsappCardQrImageUrl = (cardId: string) => {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? null;
  if (!publicBaseUrl) {
    throw new Error('PUBLIC_BASE_URL_MISSING');
  }

  const expires = String(Date.now() + 5 * 60 * 1000);
  const signature = signWhatsappCardQrImage(cardId, expires);
  const url = new URL(`/v1/whatsapp/cards/${cardId}/qr-image`, publicBaseUrl);
  url.searchParams.set('expires', expires);
  url.searchParams.set('signature', signature);
  return url.toString();
};

export const markInboundWhatsappMessageError = async (messageSid: string, error: string) => {
  const [existing] = (await db
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.externalMessageId, messageSid))) as Array<{ id: string }>;

  if (!existing) {
    return;
  }

  await db
    .update(whatsappMessages)
    .set({
      status: 'error',
      error,
      processedAt: new Date(),
    })
    .where(eq(whatsappMessages.id, existing.id));
};
