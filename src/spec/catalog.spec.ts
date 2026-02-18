import { describe, expect, it } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { eq } from 'drizzle-orm';
import { createApp, type App } from '../app';
import { db } from '../db/client';
import { brands, cpgs, products } from '../db/schema';

process.env.AUTH_DEV_MODE = 'true';
process.env.NODE_ENV = 'test';

const app = createApp();
const api = treaty<App>(app);

const adminHeaders = {
  authorization: 'Bearer dev-token',
  'x-dev-user-id': 'dev-admin',
  'x-dev-user-role': 'qoa_admin',
};

describe('Catalog module', () => {
  it('creates CPG, brand and product and lists catalog filters', async () => {
    const {
      data: cpgData,
      error: cpgError,
      status: cpgStatus,
    } = await api.v1.cpgs.post(
      {
        name: `CPG ${crypto.randomUUID().slice(0, 8)}`,
      },
      {
        headers: adminHeaders,
      },
    );

    if (cpgError) {
      throw cpgError.value;
    }
    if (!cpgData) {
      throw new Error('CPG response missing');
    }

    expect(cpgStatus).toBe(201);
    const cpgId = cpgData.data.id;

    const {
      data: brandData,
      error: brandError,
      status: brandStatus,
    } = await api.v1.brands.post(
      {
        cpgId,
        name: `Brand ${crypto.randomUUID().slice(0, 6)}`,
      },
      {
        headers: adminHeaders,
      },
    );

    if (brandError) {
      throw brandError.value;
    }
    if (!brandData) {
      throw new Error('Brand response missing');
    }

    expect(brandStatus).toBe(201);
    const brandId = brandData.data.id;

    const sku = `SKU-${crypto.randomUUID().slice(0, 8)}`;
    const {
      data: productData,
      error: productError,
      status: productStatus,
    } = await api.v1.products.post(
      {
        brandId,
        sku,
        name: `Product ${crypto.randomUUID().slice(0, 6)}`,
      },
      {
        headers: adminHeaders,
      },
    );

    if (productError) {
      throw productError.value;
    }
    if (!productData) {
      throw new Error('Product response missing');
    }

    expect(productStatus).toBe(201);
    const productId = productData.data.id;

    const {
      data: brandsList,
      error: brandsListError,
      status: brandsListStatus,
    } = await api.v1.brands.get({
      query: {
        cpgId,
        limit: '10',
      },
      headers: adminHeaders,
    });

    if (brandsListError) {
      throw brandsListError.value;
    }
    if (!brandsList) {
      throw new Error('Brands list missing');
    }

    expect(brandsListStatus).toBe(200);
    expect(brandsList.data.some((row: { id: string }) => row.id === brandId)).toBe(true);

    const {
      data: productsList,
      error: productsListError,
      status: productsListStatus,
    } = await api.v1.products.get({
      query: {
        cpgId,
        brandId,
        status: 'active',
        q: sku,
        limit: '10',
      },
      headers: adminHeaders,
    });

    if (productsListError) {
      throw productsListError.value;
    }
    if (!productsList) {
      throw new Error('Products list missing');
    }

    expect(productsListStatus).toBe(200);
    expect(productsList.data.some((row: { id: string }) => row.id === productId)).toBe(true);

    await db.delete(products).where(eq(products.id, productId));
    await db.delete(brands).where(eq(brands.id, brandId));
    await db.delete(cpgs).where(eq(cpgs.id, cpgId));
  });

  it('enforces cpg_admin tenant scope in catalog queries', async () => {
    const [cpgOwned] = (await db
      .insert(cpgs)
      .values({
        name: `CPG Own ${crypto.randomUUID().slice(0, 6)}`,
      })
      .returning({ id: cpgs.id })) as Array<{ id: string }>;

    const [cpgOther] = (await db
      .insert(cpgs)
      .values({
        name: `CPG Other ${crypto.randomUUID().slice(0, 6)}`,
      })
      .returning({ id: cpgs.id })) as Array<{ id: string }>;

    if (!cpgOwned || !cpgOther) {
      throw new Error('Failed to create cpg records');
    }

    const [otherBrand] = (await db
      .insert(brands)
      .values({
        cpgId: cpgOther.id,
        name: `Brand Other ${crypto.randomUUID().slice(0, 6)}`,
      })
      .returning({ id: brands.id })) as Array<{ id: string }>;

    const cpgAdminHeaders = {
      authorization: 'Bearer dev-token',
      'x-dev-user-id': 'dev-cpg-admin',
      'x-dev-user-role': 'cpg_admin',
      'x-dev-tenant-id': cpgOwned.id,
      'x-dev-tenant-type': 'cpg',
    };

    const forbiddenList = await api.v1.brands.get({
      query: {
        cpgId: cpgOther.id,
      },
      headers: cpgAdminHeaders,
    });

    if (!forbiddenList.error) {
      throw new Error('Expected forbidden error when querying another cpg');
    }

    expect(forbiddenList.status).toBe(403);
    expect(forbiddenList.error.value.error.code).toBe('FORBIDDEN');

    const ownList = await api.v1.brands.get({
      headers: cpgAdminHeaders,
    });

    if (ownList.error) {
      throw ownList.error.value;
    }
    if (!ownList.data) {
      throw new Error('Own cpg list response missing');
    }

    expect(ownList.status).toBe(200);
    expect(ownList.data.data.every((row: { cpgId: string }) => row.cpgId === cpgOwned.id)).toBe(true);

    if (otherBrand) {
      await db.delete(brands).where(eq(brands.id, otherBrand.id));
    }
    await db.delete(cpgs).where(eq(cpgs.id, cpgOther.id));
    await db.delete(cpgs).where(eq(cpgs.id, cpgOwned.id));
  });
});
