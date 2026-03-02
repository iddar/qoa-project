import { describe, expect, it } from 'bun:test';
import { generateStoreQrPayload } from '../services/stores';

describe('Stores service', () => {
  it('generates QR payload with store entity metadata', () => {
    const payload = generateStoreQrPayload({
      id: '11111111-1111-4111-8111-111111111111',
      code: 'sto_seed_123',
    });

    expect(payload.code).toBe('sto_seed_123');
    expect(payload.expiresAt).toBeUndefined();
    expect(payload.payload).toEqual({
      entityType: 'store',
      entityId: '11111111-1111-4111-8111-111111111111',
      code: 'sto_seed_123',
    });
  });
});
