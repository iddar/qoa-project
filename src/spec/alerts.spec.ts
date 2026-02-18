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

describe('Alerts module', () => {
  it('lists alerts and dispatches mocked notifications', async () => {
    const listResult = await api.v1.alerts.get({
      headers: adminHeaders,
    });

    if (listResult.error) {
      throw listResult.error.value;
    }
    if (!listResult.data) {
      throw new Error('Alerts response missing');
    }

    expect(listResult.status).toBe(200);
    expect(Array.isArray(listResult.data.data)).toBe(true);

    const notifyResult = await api.v1.alerts.notify.post(
      {
        recipient: 'ops@qoa.local',
        minSeverity: 'high',
      },
      {
        headers: adminHeaders,
      },
    );

    if (notifyResult.error) {
      throw notifyResult.error.value;
    }
    if (!notifyResult.data) {
      throw new Error('Notify response missing');
    }

    expect(notifyResult.status).toBe(200);
    expect(notifyResult.data.data.mocked).toBe(true);
  });
});
