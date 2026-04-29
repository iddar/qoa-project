import { describe, expect, it } from 'bun:test';
import { generateStoreQrPayload } from '../services/stores';

describe('Stores service', () => {
  it('generates QR payload with store entity metadata', () => {
    process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886';

    const payload = generateStoreQrPayload({
      id: '11111111-1111-4111-8111-111111111111',
      code: 'sto_seed_123',
    });

    expect(payload.code).toBe('sto_seed_123');
    expect(payload.registrationUrl).toBe('https://wa.me/14155238886?text=Quiero+registrar+mi+compra+en+sto_seed_123');
    expect(payload.expiresAt).toBeUndefined();
    expect(payload.payload).toEqual({
      entityType: 'store',
      entityId: '11111111-1111-4111-8111-111111111111',
      code: 'sto_seed_123',
    });
  });
});
