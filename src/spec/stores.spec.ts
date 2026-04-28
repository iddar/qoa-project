import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { and, eq } from 'drizzle-orm';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import { accumulations, balances, brands, campaignBalances, campaigns, cards, cpgs, inventoryMovements, products, storeProducts, stores, transactionItems, transactions, userStoreEnrollments, users, whatsappMessages } from '../db/schema';

process.env.AUTH_DEV_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.TWILIO_ACCOUNT = 'ACtesttwilioaccount';
process.env.TWILIO_AUTH = 'test_twilio_auth';
process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886';

const app = createApp();
const api = treaty<App>(app);

const createUser = async () => {
  const phone = `+52155${Math.floor(Math.random() * 10_000_000)
    .toString()
    .padStart(7, '0')}`;
  const email = `store_${crypto.randomUUID()}@qoa.test`;
  const password = 'Password123!';

  const [created] = (await db
    .insert(users)
    .values({
      phone,
      email,
      passwordHash: await Bun.password.hash(password),
      role: 'consumer',
    })
    .returning({ id: users.id, email: users.email, phone: users.phone })) as Array<{
    id: string;
    email: string | null;
    phone: string;
  }>;

  if (!created) {
    throw new Error('Failed to create test user');
  }

  if (!created.email) {
    throw new Error('Failed to create test user email');
  }

  return {
    ...created,
    email: created.email,
    password,
  };
};

const buildAuthHeaders = (accessToken: string) => ({
  authorization: `Bearer ${accessToken}`,
});

const buildStoreDevHeaders = (storeId: string) => ({
  authorization: 'Bearer dev-token',
  'x-dev-user-id': 'dev-store-pos',
  'x-dev-user-role': 'store_admin',
  'x-dev-tenant-type': 'store',
  'x-dev-tenant-id': storeId,
});

const createCatalogProduct = async () => {
  const [cpg] = (await db
    .insert(cpgs)
    .values({
      name: `CPG Store ${crypto.randomUUID().slice(0, 6)}`,
    })
    .returning({ id: cpgs.id })) as Array<{ id: string }>;

  if (!cpg) {
    throw new Error('Failed to create test cpg');
  }

  const [brand] = (await db
    .insert(brands)
    .values({
      cpgId: cpg.id,
      name: `Brand Store ${crypto.randomUUID().slice(0, 6)}`,
    })
    .returning({ id: brands.id })) as Array<{ id: string }>;

  if (!brand) {
    throw new Error('Failed to create test brand');
  }

  const [product] = (await db
    .insert(products)
    .values({
      brandId: brand.id,
      sku: `SKU-STORE-${crypto.randomUUID().slice(0, 8)}`,
      name: `Product Store ${crypto.randomUUID().slice(0, 6)}`,
    })
    .returning({ id: products.id })) as Array<{ id: string }>;

  if (!product) {
    throw new Error('Failed to create test product');
  }

  return {
    cpgId: cpg.id,
    brandId: brand.id,
    productId: product.id,
  };
};

describe('Stores module', () => {
  it('creates, fetches, and returns QR payload for stores', async () => {
    const user = await createUser();
    const {
      data: loginData,
      error: loginError,
      status: loginStatus,
    } = await api.v1.auth.login.post({
      email: user.email,
      password: user.password,
    });

    if (loginError) {
      throw loginError.value;
    }

    if (!loginData) {
      throw new Error('Login response missing');
    }

    expect(loginStatus).toBe(200);
    const authHeaders = buildAuthHeaders(loginData.data.accessToken);

    const {
      data: created,
      error: createError,
      status: createStatus,
    } = await api.v1.stores.post(
      {
        name: 'Tienda Central',
        type: 'tiendita',
        address: 'Calle 123',
      },
      {
        headers: authHeaders,
      },
    );

    if (createError) {
      throw createError.value;
    }

    if (!created) {
      throw new Error('Store response missing');
    }

    expect(createStatus).toBe(201);
    expect(created.data.code).toContain('sto_');

    const storeId = created.data.id;

    const {
      data: listed,
      error: listError,
      status: listStatus,
    } = await api.v1.stores.get({
      query: {
        limit: '20',
      },
      headers: authHeaders,
    });

    if (listError) {
      throw listError.value;
    }

    if (!listed) {
      throw new Error('Store list missing');
    }

    expect(listStatus).toBe(200);
    expect(listed.data.some((store: { id: string }) => store.id === storeId)).toBe(true);

    const {
      data: fetched,
      error: fetchError,
      status: fetchStatus,
    } = await api.v1.stores({ storeId }).get({
      headers: authHeaders,
    });

    if (fetchError) {
      throw fetchError.value;
    }

    if (!fetched) {
      throw new Error('Store fetch missing');
    }

    expect(fetchStatus).toBe(200);
    expect(fetched.data.id).toBe(storeId);

    const {
      data: qrData,
      error: qrError,
      status: qrStatus,
    } = await api.v1.stores({ storeId }).qr.get({
      headers: authHeaders,
    });

    if (qrError) {
      throw qrError.value;
    }

    if (!qrData) {
      throw new Error('QR payload missing');
    }

    expect(qrStatus).toBe(200);
    expect(qrData.data.payload.entityType).toBe('store');
    expect(qrData.data.payload.entityId).toBe(storeId);
    expect(qrData.data.code).toBe(created.data.code);
    expect(qrData.data.registrationUrl).toBe(`https://wa.me/14155238886?text=${created.data.code}`);

    await db.delete(stores).where(eq(stores.id, storeId));
    await db.delete(users).where(eq(users.id, user.id));
  });

  it('restricts store users to their own tenant store', async () => {
    const [storeA] = (await db
      .insert(stores)
      .values({
        name: `Store A ${crypto.randomUUID().slice(0, 6)}`,
        code: `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
        type: 'tiendita',
      })
      .returning({ id: stores.id })) as Array<{ id: string }>;

    const [storeB] = (await db
      .insert(stores)
      .values({
        name: `Store B ${crypto.randomUUID().slice(0, 6)}`,
        code: `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
        type: 'superette',
      })
      .returning({ id: stores.id })) as Array<{ id: string }>;

    if (!storeA || !storeB) {
      throw new Error('Failed to create stores for tenant-scope test');
    }

    const password = 'Password123!';
    const email = `store_scope_${crypto.randomUUID()}@qoa.test`;
    const [storeUser] = (await db
      .insert(users)
      .values({
        phone: `+52155${Math.floor(Math.random() * 10_000_000)
          .toString()
          .padStart(7, '0')}`,
        email,
        passwordHash: await Bun.password.hash(password),
        role: 'store_admin',
        tenantId: storeA.id,
        tenantType: 'store',
      })
      .returning({ id: users.id })) as Array<{ id: string }>;

    if (!storeUser) {
      throw new Error('Failed to create store user');
    }

    const login = await api.v1.auth.login.post({ email, password });
    if (login.error || !login.data) {
      throw login.error?.value ?? new Error('Login response missing');
    }

    const authHeaders = buildAuthHeaders(login.data.data.accessToken);

    const storeList = await api.v1.stores.get({
      query: { limit: '20' },
      headers: authHeaders,
    });

    if (storeList.error || !storeList.data) {
      throw storeList.error?.value ?? new Error('Store list missing');
    }

    expect(storeList.status).toBe(200);
    expect(storeList.data.data.length).toBe(1);
    expect(storeList.data.data[0]?.id).toBe(storeA.id);

    const forbiddenStore = await api.v1.stores({ storeId: storeB.id }).get({ headers: authHeaders });
    expect(forbiddenStore.status).toBe(403);
    expect(forbiddenStore.error).toBeDefined();

    const forbiddenQr = await api.v1.stores({ storeId: storeB.id }).qr.get({ headers: authHeaders });
    expect(forbiddenQr.status).toBe(403);
    expect(forbiddenQr.error).toBeDefined();

    await db.delete(users).where(eq(users.id, storeUser.id));
    await db.delete(stores).where(eq(stores.id, storeB.id));
    await db.delete(stores).where(eq(stores.id, storeA.id));
  });

  it('resolves customers and registers POS transactions with loyalty using the store flow', async () => {
    const user = await createUser();
    const [store] = (await db
      .insert(stores)
      .values({
        name: `POS Store ${crypto.randomUUID().slice(0, 6)}`,
        code: `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
        type: 'tiendita',
      })
      .returning({ id: stores.id })) as Array<{ id: string }>;

    if (!store) {
      throw new Error('Failed to create POS test store');
    }

    const catalog = await createCatalogProduct();

    const [storeProduct] = (await db
      .insert(storeProducts)
      .values({
        storeId: store.id,
        productId: catalog.productId,
        cpgId: catalog.cpgId,
        name: 'Refresco 600ml',
        sku: `POS-${crypto.randomUUID().slice(0, 8)}`,
        unitType: 'piece',
        price: 25,
        stock: 10,
      })
      .returning({ id: storeProducts.id })) as Array<{ id: string }>;

    if (!storeProduct) {
      throw new Error('Failed to create POS store product');
    }

    const [campaign] = (await db
      .insert(campaigns)
      .values({
        name: `Campaign POS ${crypto.randomUUID().slice(0, 6)}`,
        status: 'active',
      })
      .returning({ id: campaigns.id })) as Array<{ id: string }>;

    if (!campaign) {
      throw new Error('Failed to create POS campaign');
    }

    const [card] = (await db
      .insert(cards)
      .values({
        userId: user.id,
        campaignId: campaign.id,
        storeId: store.id,
        code: `card_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
      })
      .returning({ id: cards.id, code: cards.code })) as Array<{ id: string; code: string }>;

    if (!card) {
      throw new Error('Failed to create POS card');
    }

    const storeHeaders = buildStoreDevHeaders(store.id);

    const resolvedByQr = await api.v1.stores({ storeId: store.id })['customer-resolve'].post(
      { input: JSON.stringify({ entityType: 'card', entityId: card.id, code: card.code }) },
      { headers: storeHeaders },
    );

    if (resolvedByQr.error || !resolvedByQr.data) {
      throw resolvedByQr.error?.value ?? new Error('Customer resolve failed');
    }

    expect(resolvedByQr.status).toBe(200);
    expect(resolvedByQr.data.data.userId).toBe(user.id);
    expect(resolvedByQr.data.data.cardId).toBe(card.id);

    const created = await api.v1.stores({ storeId: store.id }).transactions.post(
      {
        cardId: card.id,
        items: [
          {
            storeProductId: storeProduct.id,
            quantity: 2,
            amount: 25,
          },
        ],
        idempotencyKey: `store-pos-${crypto.randomUUID()}`,
      },
      { headers: storeHeaders },
    );

    if (created.error || !created.data) {
      throw created.error?.value ?? new Error('Store POS transaction failed');
    }

    expect(created.status).toBe(201);
    expect(created.data.data.userId).toBe(user.id);
    expect(created.data.data.guestFlag).toBe(false);
    expect(created.data.data.customer?.cardId).toBe(card.id);
    expect(created.data.data.accumulations.length).toBeGreaterThanOrEqual(1);
    expect(created.data.data.items[0]?.storeProductId).toBe(storeProduct.id);
    expect(created.data.data.totalAmount).toBe(50);

    const txId = created.data.data.id;

    const [storedTransaction] = (await db
      .select({ userId: transactions.userId, cardId: transactions.cardId })
      .from(transactions)
      .where(eq(transactions.id, txId))) as Array<{ userId: string | null; cardId: string | null }>;
    expect(storedTransaction?.userId).toBe(user.id);
    expect(storedTransaction?.cardId).toBe(card.id);

    const [storedItem] = (await db
      .select({ metadata: transactionItems.metadata })
      .from(transactionItems)
      .where(eq(transactionItems.transactionId, txId))) as Array<{ metadata: string | null }>;
    expect(storedItem?.metadata).toContain(storeProduct.id);

    const [balance] = (await db
      .select({ current: balances.current })
      .from(balances)
      .where(eq(balances.cardId, card.id))) as Array<{ current: number }>;
    expect(balance?.current).toBeGreaterThanOrEqual(2);

    await db.delete(campaignBalances).where(eq(campaignBalances.cardId, card.id));
    await db.delete(accumulations).where(eq(accumulations.cardId, card.id));
    await db.delete(balances).where(eq(balances.cardId, card.id));
    await db.delete(cards).where(eq(cards.id, card.id));
    await db.delete(campaigns).where(eq(campaigns.id, campaign.id));
    await db.delete(inventoryMovements).where(eq(inventoryMovements.referenceId, txId));
    await db.delete(transactionItems).where(eq(transactionItems.transactionId, txId));
    await db.delete(transactions).where(eq(transactions.id, txId));
    await db.delete(storeProducts).where(eq(storeProducts.id, storeProduct.id));
    await db.delete(products).where(eq(products.id, catalog.productId));
    await db.delete(brands).where(eq(brands.id, catalog.brandId));
    await db.delete(cpgs).where(eq(cpgs.id, catalog.cpgId));
    await db.delete(stores).where(eq(stores.id, store.id));
    await db.delete(users).where(eq(users.id, user.id));
  });

  it('resolves customer by phone, creates user and sends welcome WhatsApp', async () => {
    const [store] = (await db
      .insert(stores)
      .values({
        name: `Phone Resolve Store ${crypto.randomUUID().slice(0, 6)}`,
        code: `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
        type: 'tiendita',
      })
      .returning({ id: stores.id })) as Array<{ id: string }>;

    if (!store) {
      throw new Error('Failed to create phone resolve test store');
    }

    const storeHeaders = buildStoreDevHeaders(store.id);
    const phoneNumber = `55123${Math.floor(Math.random() * 100_000).toString().padStart(5, '0')}`;

    // Resolve by phone (no existing user)
    const resolvedByPhone = await api.v1.stores({ storeId: store.id })['customer-resolve'].post(
      { input: phoneNumber },
      { headers: storeHeaders },
    );

    if (resolvedByPhone.error || !resolvedByPhone.data) {
      throw resolvedByPhone.error?.value ?? new Error('Phone customer resolve failed');
    }

    expect(resolvedByPhone.status).toBe(200);
    expect(resolvedByPhone.data.data.phone).toBe(`+52${phoneNumber}`);
    expect(resolvedByPhone.data.data.cardCode).toBeDefined();
    expect(resolvedByPhone.data.data.userId).toBeDefined();

    const createdUserId = resolvedByPhone.data.data.userId;

    // Verify user was created
    const [user] = (await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.phone, `+52${phoneNumber}`))) as Array<{ id: string; role: string }>;
    expect(user).toBeDefined();
    expect(user!.role).toBe('consumer');

    // Verify enrollment
    const [enrollment] = (await db
      .select({ source: userStoreEnrollments.source })
      .from(userStoreEnrollments)
      .where(and(eq(userStoreEnrollments.userId, createdUserId), eq(userStoreEnrollments.storeId, store.id)))) as Array<{
      source: string;
    }>;
    expect(enrollment).toBeDefined();
    expect(enrollment!.source).toBe('pos_phone');

    // Verify card was created
    const [card] = await db.select().from(cards).where(eq(cards.userId, createdUserId));
    expect(card).toBeDefined();

    // Verify WhatsApp welcome message was sent
    const [whatsappMessage] = (await db
      .select({ direction: whatsappMessages.direction, textBody: whatsappMessages.textBody })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.toPhone, `whatsapp:+52${phoneNumber}`))
      .orderBy(whatsappMessages.processedAt)) as Array<{
      direction: string;
      textBody: string | null;
    }>;
    expect(whatsappMessage).toBeDefined();
    expect(whatsappMessage!.direction).toBe('outbound');
    expect(whatsappMessage!.textBody).toContain('Bienvenido a Qoa');

    // Second call with same phone should return same user
    const resolvedAgain = await api.v1.stores({ storeId: store.id })['customer-resolve'].post(
      { input: `+52 ${phoneNumber.slice(0, 2)} ${phoneNumber.slice(2, 6)} ${phoneNumber.slice(6)}` },
      { headers: storeHeaders },
    );

    expect(resolvedAgain.data?.data.userId).toBe(createdUserId);

    // Cleanup
    await db.delete(whatsappMessages).where(eq(whatsappMessages.toPhone, `whatsapp:+52${phoneNumber}`));
    await db.delete(userStoreEnrollments).where(eq(userStoreEnrollments.userId, createdUserId));
    await db.delete(cards).where(eq(cards.userId, createdUserId));
    await db.delete(users).where(eq(users.id, createdUserId));
    await db.delete(stores).where(eq(stores.id, store.id));
  });

  it('previews and confirms inventory intake with idempotent replay', async () => {
    const [store] = (await db
      .insert(stores)
      .values({
        name: `Inventory Store ${crypto.randomUUID().slice(0, 6)}`,
        code: `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
        type: 'tiendita',
      })
      .returning({ id: stores.id })) as Array<{ id: string }>;

    if (!store) {
      throw new Error('Failed to create inventory test store');
    }

    const catalog = await createCatalogProduct();
    const [existingProduct] = (await db
      .insert(storeProducts)
      .values({
        storeId: store.id,
        productId: catalog.productId,
        cpgId: catalog.cpgId,
        name: 'Refresco 600ml',
        sku: `INV-${crypto.randomUUID().slice(0, 8)}`,
        unitType: 'piece',
        price: 25,
        stock: 3,
      })
      .returning({ id: storeProducts.id, sku: storeProducts.sku })) as Array<{ id: string; sku: string | null }>;

    if (!existingProduct) {
      throw new Error('Failed to create inventory store product');
    }

    const headers = buildStoreDevHeaders(store.id);
    const preview = await api.v1.stores({ storeId: store.id }).inventory.intake.preview.post(
      {
        text: `2 Refresco 600ml\nGalletas Mantequilla, GAL-001, 6, 30\nSolo texto roto`,
      },
      { headers },
    );

    if (preview.error || !preview.data) {
      throw preview.error?.value ?? new Error('Inventory preview failed');
    }

    expect(preview.status).toBe(200);
    expect(preview.data.data.rows).toHaveLength(3);
    expect(preview.data.data.rows[0]?.status).toBe('matched');
    expect(preview.data.data.rows[0]?.matchedStoreProductId).toBe(existingProduct.id);
    expect(preview.data.data.rows[1]?.status).toBe('new');
    expect(preview.data.data.rows[2]?.status).toBe('invalid');

    const idempotencyKey = `inventory-intake-${crypto.randomUUID()}`;
    const confirmed = await api.v1.stores({ storeId: store.id }).inventory.intake.confirm.post(
      {
        idempotencyKey,
        rows: [
          {
            lineNumber: 1,
            rawText: '2 Refresco 600ml',
            name: 'Refresco 600ml',
            quantity: 2,
            action: 'match_existing',
            storeProductId: existingProduct.id,
          },
          {
            lineNumber: 2,
            rawText: 'Galletas Mantequilla, GAL-001, 6, 30',
            name: 'Galletas Mantequilla',
            sku: 'GAL-001',
            quantity: 6,
            price: 30,
            action: 'create_new',
          },
        ],
      },
      { headers },
    );

    if (confirmed.error || !confirmed.data) {
      throw confirmed.error?.value ?? new Error('Inventory confirm failed');
    }

    expect(confirmed.status).toBe(200);
    expect(confirmed.data.data.replayed).toBe(false);
    expect(confirmed.data.data.summary.totalRows).toBe(2);
    expect(confirmed.data.data.summary.totalQuantity).toBe(8);
    expect(confirmed.data.data.summary.createdProducts).toBe(1);
    expect(confirmed.data.data.summary.updatedProducts).toBe(1);

    const storeProductsAfter = (await db
      .select({ id: storeProducts.id, name: storeProducts.name, stock: storeProducts.stock, sku: storeProducts.sku })
      .from(storeProducts)
      .where(eq(storeProducts.storeId, store.id))) as Array<{ id: string; name: string; stock: number; sku: string | null }>;
    const existingAfter = storeProductsAfter.find((entry) => entry.id === existingProduct.id);
    const createdAfter = storeProductsAfter.find((entry) => entry.name === 'Galletas Mantequilla');

    expect(existingAfter?.stock).toBe(5);
    expect(createdAfter?.stock).toBe(6);
    expect(createdAfter?.sku).toBe('GAL-001');

    const movements = (await db
      .select({ id: inventoryMovements.id, referenceId: inventoryMovements.referenceId, quantityDelta: inventoryMovements.quantityDelta })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.referenceId, idempotencyKey))) as Array<{ id: string; referenceId: string | null; quantityDelta: number }>;
    expect(movements).toHaveLength(2);
    expect(movements.reduce((sum, entry) => sum + entry.quantityDelta, 0)).toBe(8);

    const replay = await api.v1.stores({ storeId: store.id }).inventory.intake.confirm.post(
      {
        idempotencyKey,
        rows: [
          {
            lineNumber: 1,
            rawText: '2 Refresco 600ml',
            name: 'Refresco 600ml',
            quantity: 2,
            action: 'match_existing',
            storeProductId: existingProduct.id,
          },
        ],
      },
      { headers },
    );

    if (replay.error || !replay.data) {
      throw replay.error?.value ?? new Error('Inventory replay failed');
    }

    expect(replay.status).toBe(200);
    expect(replay.data.data.replayed).toBe(true);
    expect(replay.data.data.rows).toHaveLength(2);

    await db.delete(inventoryMovements).where(eq(inventoryMovements.referenceId, idempotencyKey));
    if (createdAfter) {
      await db.delete(storeProducts).where(eq(storeProducts.id, createdAfter.id));
    }
    await db.delete(storeProducts).where(eq(storeProducts.id, existingProduct.id));
    await db.delete(products).where(eq(products.id, catalog.productId));
    await db.delete(brands).where(eq(brands.id, catalog.brandId));
    await db.delete(cpgs).where(eq(cpgs.id, catalog.cpgId));
    await db.delete(stores).where(eq(stores.id, store.id));
  });

  it('blocks out-of-stock sales and decrements stock on successful POS transactions', async () => {
    const [store] = (await db
      .insert(stores)
      .values({
        name: `Stock Guard Store ${crypto.randomUUID().slice(0, 6)}`,
        code: `sto_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
        type: 'tiendita',
      })
      .returning({ id: stores.id })) as Array<{ id: string }>;

    if (!store) {
      throw new Error('Failed to create stock-guard store');
    }

    const catalog = await createCatalogProduct();
    const [storeProduct] = (await db
      .insert(storeProducts)
      .values({
        storeId: store.id,
        productId: catalog.productId,
        cpgId: catalog.cpgId,
        name: 'Agua 1L',
        sku: `WATER-${crypto.randomUUID().slice(0, 8)}`,
        unitType: 'piece',
        price: 18,
        stock: 2,
      })
      .returning({ id: storeProducts.id })) as Array<{ id: string }>;

    if (!storeProduct) {
      throw new Error('Failed to create guarded stock product');
    }

    const headers = buildStoreDevHeaders(store.id);
    const rejected = await api.v1.stores({ storeId: store.id }).transactions.post(
      {
        items: [
          {
            storeProductId: storeProduct.id,
            quantity: 3,
            amount: 18,
          },
        ],
        idempotencyKey: `store-pos-reject-${crypto.randomUUID()}`,
      },
      { headers },
    );

    expect(rejected.status).toBe(409);
    expect(rejected.error?.value.error.code).toBe('OUT_OF_STOCK');

    const accepted = await api.v1.stores({ storeId: store.id }).transactions.post(
      {
        items: [
          {
            storeProductId: storeProduct.id,
            quantity: 2,
            amount: 18,
          },
        ],
        idempotencyKey: `store-pos-accept-${crypto.randomUUID()}`,
      },
      { headers },
    );

    if (accepted.error || !accepted.data) {
      throw accepted.error?.value ?? new Error('Expected accepted stock transaction');
    }

    expect(accepted.status).toBe(201);
    expect(accepted.data.data.guestFlag).toBe(true);
    expect(accepted.data.data.totalAmount).toBe(36);

    const [productAfter] = (await db
      .select({ stock: storeProducts.stock })
      .from(storeProducts)
      .where(eq(storeProducts.id, storeProduct.id))) as Array<{ stock: number }>;
    expect(productAfter?.stock).toBe(0);

    const saleMovements = (await db
      .select({ type: inventoryMovements.type, quantityDelta: inventoryMovements.quantityDelta, referenceId: inventoryMovements.referenceId })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.storeProductId, storeProduct.id))) as Array<{ type: string; quantityDelta: number; referenceId: string | null }>;
    expect(saleMovements.some((entry) => entry.type === 'sale' && entry.quantityDelta === -2)).toBe(true);

    await db.delete(inventoryMovements).where(eq(inventoryMovements.storeProductId, storeProduct.id));
    await db.delete(transactionItems).where(eq(transactionItems.transactionId, accepted.data.data.id));
    await db.delete(transactions).where(eq(transactions.id, accepted.data.data.id));
    await db.delete(storeProducts).where(eq(storeProducts.id, storeProduct.id));
    await db.delete(products).where(eq(products.id, catalog.productId));
    await db.delete(brands).where(eq(brands.id, catalog.brandId));
    await db.delete(cpgs).where(eq(cpgs.id, catalog.cpgId));
    await db.delete(stores).where(eq(stores.id, store.id));
  });
});
