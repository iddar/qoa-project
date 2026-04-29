import { expect, type APIRequestContext } from "@playwright/test";
import { env } from "./env";

type Entity = {
  id: string;
  name?: string;
  code?: string;
  sku?: string;
  campaignId?: string;
  userId?: string;
  status?: string;
};

const authHeaders = (token: string) => ({ authorization: `Bearer ${token}` });

export const findStoreByName = async (request: APIRequestContext, token: string, name: string) => {
  const response = await request.get(`${env.apiUrl}/v1/stores?limit=200`, {
    headers: authHeaders(token),
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data: Entity[] };
  return body.data.find((entry) => entry.name === name);
};

export const findStoreByCode = async (request: APIRequestContext, token: string, code: string) => {
  let cursor: string | undefined;

  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) {
      params.set("cursor", cursor);
    }

    const response = await request.get(`${env.apiUrl}/v1/stores?${params.toString()}`, {
      headers: authHeaders(token),
    });
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as {
      data: Entity[];
      pagination?: { hasMore?: boolean; nextCursor?: string };
    };
    const found = body.data.find((entry) => entry.code === code);
    if (found || !body.pagination?.hasMore || !body.pagination.nextCursor) {
      return found;
    }
    cursor = body.pagination.nextCursor;
  }

  return undefined;
};

export const findProductBySku = async (request: APIRequestContext, token: string, sku: string) => {
  const endpoints = ["/v1/products?limit=500", "/v1/catalog/products?limit=500"];

  for (const endpoint of endpoints) {
    const response = await request.get(`${env.apiUrl}${endpoint}`, {
      headers: authHeaders(token),
    });

    if (!response.ok()) {
      continue;
    }

    const body = (await response.json()) as { data: Entity[] };
    const found = body.data.find((entry) => entry.sku === sku);
    if (found) {
      return found;
    }
  }

  return undefined;
};

export const findCampaignByName = async (
  request: APIRequestContext,
  token: string,
  name: string,
) => {
  const response = await request.get(`${env.apiUrl}/v1/campaigns?limit=200`, {
    headers: authHeaders(token),
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data: Entity[] };
  return body.data.find((entry) => entry.name === name);
};

export const findCampaignByKey = async (request: APIRequestContext, token: string, key: string) => {
  const response = await request.get(`${env.apiUrl}/v1/campaigns?limit=200`, {
    headers: authHeaders(token),
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data: Array<Entity & { key?: string }> };
  return body.data.find((entry) => entry.key === key);
};

export const ensureCampaignActive = async (
  request: APIRequestContext,
  token: string,
  campaignId: string,
) => {
  const endpoints = [
    `/v1/campaigns/${campaignId}/ready-for-review`,
    `/v1/campaigns/${campaignId}/review`,
    `/v1/campaigns/${campaignId}/confirm`,
    `/v1/campaigns/${campaignId}/activate`,
  ];

  for (const endpoint of endpoints) {
    const body = endpoint.endsWith("/review") ? { approved: true } : {};
    const response = await request.post(`${env.apiUrl}${endpoint}`, {
      headers: authHeaders(token),
      data: body,
    });

    if (response.ok() || response.status() === 409 || response.status() === 400) {
      continue;
    }
  }
};

export const waitForCampaignActive = async (
  request: APIRequestContext,
  token: string,
  campaignName: string,
) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const campaign = await findCampaignByName(request, token, campaignName);
    if (campaign?.status === "active") {
      return campaign;
    }

    if (campaign?.id) {
      await ensureCampaignActive(request, token, campaign.id);
    }
  }

  return await findCampaignByName(request, token, campaignName);
};

export const getMyWalletCard = async (request: APIRequestContext, token: string) => {
  const cardsResponse = await request.get(`${env.apiUrl}/v1/users/me/wallet`, {
    headers: authHeaders(token),
  });
  expect(cardsResponse.ok()).toBeTruthy();
  const cardsBody = (await cardsResponse.json()) as {
    data: {
      card: { id: string; code: string };
    };
  };

  return cardsBody.data.card;
};

export const getMyWalletSummary = async (request: APIRequestContext, token: string) => {
  const response = await request.get(`${env.apiUrl}/v1/users/me/wallet`, {
    headers: authHeaders(token),
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    data: {
      card: { id: string; code: string };
      totals: { current: number; lifetime: number };
      storeBreakdown?: Array<{
        storeId: string;
        purchases: number;
        pointsTotal: number;
      }>;
    };
  };
  return body.data;
};

export const getCardQr = async (request: APIRequestContext, token: string, cardId: string) => {
  const response = await request.get(`${env.apiUrl}/v1/cards/${cardId}/qr`, {
    headers: authHeaders(token),
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    data: {
      code: string;
      payload: { entityType: string; entityId: string; code: string };
    };
  };
  return body.data;
};

export const findStoreProductBySku = async (
  request: APIRequestContext,
  token: string,
  storeId: string,
  sku: string,
) => {
  const response = await request.get(
    `${env.apiUrl}/v1/stores/${storeId}/products?status=active&limit=200`,
    {
      headers: authHeaders(token),
    },
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    data: Array<Entity & { storeId: string; productId?: string; price: number; stock: number }>;
  };
  return body.data.find((entry) => entry.sku === sku);
};

export const listTransactionsByCard = async (
  request: APIRequestContext,
  token: string,
  cardId: string,
) => {
  const response = await request.get(`${env.apiUrl}/v1/transactions?cardId=${cardId}&limit=200`, {
    headers: authHeaders(token),
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    data: Array<{ id: string }>;
  };
  return body.data;
};

export const waitForTransactionIncrease = async (
  request: APIRequestContext,
  token: string,
  cardId: string,
  baselineCount: number,
) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const transactions = await listTransactionsByCard(request, token, cardId);
    if (transactions.length > baselineCount) {
      return transactions;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return await listTransactionsByCard(request, token, cardId);
};
