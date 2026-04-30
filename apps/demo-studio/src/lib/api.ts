import { env } from "../config";

type LoginCreds = { email: string; password: string };

export type ApiEntity = {
  id: string;
  code?: string;
  name?: string;
  sku?: string;
  price?: number;
  stock?: number;
  status?: string;
};

const authHeaders = (token: string) => ({ authorization: `Bearer ${token}` });

const assertOk = async (response: Response, label: string) => {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${label} failed (${response.status}): ${body.slice(0, 400)}`);
  }
};

export const checkApiReachable = async () => {
  const responses = await Promise.all([
    fetch(`${env.apiUrl}/v1/health`).catch(() => null),
    fetch(`${env.apiUrl}/v1/health/`).catch(() => null),
  ]);
  if (!responses.some((response) => response?.ok)) {
    throw new Error(`Core API is not reachable at ${env.apiUrl}. Start the local environment before running demo scripts.`);
  }
};

export const apiLogin = async (creds: LoginCreds) => {
  const response = await fetch(`${env.apiUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(creds),
  });
  await assertOk(response, `login ${creds.email}`);
  const body = (await response.json()) as { data: { accessToken: string; refreshToken: string } };
  return body.data;
};

export const getJson = async <T>(path: string, token: string) => {
  const response = await fetch(`${env.apiUrl}${path}`, { headers: authHeaders(token) });
  await assertOk(response, `GET ${path}`);
  return (await response.json()) as T;
};

export const postJson = async <T>(path: string, token: string, data: unknown) => {
  const response = await fetch(`${env.apiUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(data),
  });
  await assertOk(response, `POST ${path}`);
  return (await response.json()) as T;
};

export const patchJson = async <T>(path: string, token: string, data: unknown) => {
  const response = await fetch(`${env.apiUrl}${path}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(data),
  });
  await assertOk(response, `PATCH ${path}`);
  return (await response.json()) as T;
};

export const findStoreByCode = async (token: string, code: string) => {
  const body = await getJson<{ data: ApiEntity[] }>("/v1/stores?limit=500", token);
  return body.data.find((entry) => entry.code === code);
};

export const getStoreProducts = async (token: string, storeId: string) => {
  const body = await getJson<{ data: ApiEntity[] }>(`/v1/stores/${storeId}/products?status=active&limit=300`, token);
  return body.data;
};

export const getWalletCard = async (token: string) => {
  const body = await getJson<{ data: { card: { id: string; code: string } } }>("/v1/users/me/wallet", token);
  return body.data.card;
};

export const getCardQr = async (token: string, cardId: string) => {
  const body = await getJson<{
    data: {
      code: string;
      payload: { entityType: string; entityId: string; code: string };
    };
  }>(`/v1/cards/${cardId}/qr`, token);
  return body.data;
};

export const findCampaignByName = async (token: string, name: string) => {
  const body = await getJson<{ data: ApiEntity[] }>("/v1/campaigns?limit=300", token);
  return body.data.find((entry) => entry.name === name);
};
