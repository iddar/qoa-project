import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import { storeCheckins, stores, users, transactions } from '../db/schema';
import { matchCheckinWithTransaction } from '../services/store-checkin';

process.env.AUTH_DEV_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.WHATSAPP_WEBHOOK_SECRET = 'test_whatsapp_secret';
process.env.TWILIO_AUTH = 'test_twilio_auth';
process.env.TWILIO_ACCOUNT = 'ACtesttwilioaccount';
process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+12182204117';
process.env.PUBLIC_BASE_URL = 'https://qoacore-production.up.railway.app';

const app = createApp();
const api = treaty<App>(app);

const storeStaffHeaders = {
  authorization: 'Bearer dev-token',
  'x-dev-user-id': 'dev-staff',
  'x-dev-user-role': 'store_staff',
};

describe('Store checkin module', () => {
  it('creates a pending checkin and lists it for the store', async () => {
    const phone = `+52155${Date.now().toString().slice(-8)}`;
    const [user] = await db
      .insert(users)
      .values({ phone, name: 'Cliente Checkin', role: 'consumer' })
      .returning({ id: users.id });

    const storeCode = `chk_${Date.now().toString(36)}`;
    const [store] = await db
      .insert(stores)
      .values({ name: 'Tienda Checkin Test', code: storeCode, type: 'tiendita' })
      .returning({ id: stores.id });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await db.insert(storeCheckins).values({
      userId: user.id,
      storeId: store.id,
      status: 'pending',
      checkedInAt: now,
      expiresAt,
    });

    const list = await api.v1.stores[store.id].checkins.get({
      query: { status: 'pending' },
      headers: storeStaffHeaders,
    });

    if (list.error) throw list.error.value;
    expect(list.status).toBe(200);
    expect(list.data?.data.length).toBeGreaterThanOrEqual(1);
    expect(list.data?.data[0]?.userName).toBe('Cliente Checkin');

    // Cleanup
    await db.delete(storeCheckins).where(eq(storeCheckins.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
    await db.delete(stores).where(eq(stores.id, store.id));
  });

  it('matches a checkin with a transaction', async () => {
    const phone = `+52155${(Date.now() + 1).toString().slice(-8)}`;
    const [user] = await db
      .insert(users)
      .values({ phone, name: 'Cliente Match', role: 'consumer' })
      .returning({ id: users.id });

    const storeCode = `mtc_${(Date.now() + 1).toString(36)}`;
    const [store] = await db
      .insert(stores)
      .values({ name: 'Tienda Match Test', code: storeCode, type: 'tiendita' })
      .returning({ id: stores.id });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const [checkin] = await db
      .insert(storeCheckins)
      .values({
        userId: user.id,
        storeId: store.id,
        status: 'pending',
        checkedInAt: now,
        expiresAt,
      })
      .returning({ id: storeCheckins.id });

    const [tx] = await db
      .insert(transactions)
      .values({
        userId: user.id,
        storeId: store.id,
        totalAmount: 100,
      })
      .returning({ id: transactions.id });

    await matchCheckinWithTransaction(checkin.id, tx.id);

    const [matched] = await db
      .select({ status: storeCheckins.status, matchedTransactionId: storeCheckins.matchedTransactionId })
      .from(storeCheckins)
      .where(eq(storeCheckins.id, checkin.id));

    expect(matched.status).toBe('matched');
    expect(matched.matchedTransactionId).toBe(tx.id);

    // Cleanup
    await db.delete(storeCheckins).where(eq(storeCheckins.id, checkin.id));
    await db.delete(transactions).where(eq(transactions.id, tx.id));
    await db.delete(users).where(eq(users.id, user.id));
    await db.delete(stores).where(eq(stores.id, store.id));
  });
});
