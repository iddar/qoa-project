import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { createApp, type App } from '../app';

describe('Health module', () => {
  const app = createApp();
  const api = treaty<App>(app);

  it('returns ok status and uptime metadata', async () => {
    const { data, error, status } = await api.v1.health.get();

    if (error) {
      throw error.value;
    }

    if (!data) {
      throw new Error('Health response data missing');
    }

    expect(status).toBe(200);
    expect(data.status).toBe('ok');
    expect(typeof data.uptime).toBe('number');
    expect(() => new Date(data.timestamp)).not.toThrow();
  });
});
