import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { createApp, type App } from '../app';

process.env.AUTH_DEV_MODE = 'true';
process.env.NODE_ENV = 'test';

const app = createApp();
const api = treaty<App>(app);

const adminHeaders = {
  authorization: 'Bearer dev-token',
  'x-dev-user-id': 'dev-admin',
  'x-dev-user-role': 'qoa_admin',
};

describe('Reports module', () => {
  it('returns platform overview metrics', async () => {
    const { data, error, status } = await api.v1.reports.overview.get({
      headers: adminHeaders,
    });

    if (error) {
      throw error.value;
    }
    if (!data) {
      throw new Error('Reports overview response missing');
    }

    expect(status).toBe(200);
    expect(typeof data.data.cpgs.total).toBe('number');
    expect(typeof data.data.campaigns.active).toBe('number');
    expect(typeof data.data.transactions.total).toBe('number');
    expect(typeof data.data.reminderJobs.queued).toBe('number');
    expect(typeof data.data.whatsappMessages.total).toBe('number');
  });
});
