import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { env } from "./env";

type LoginCreds = { email: string; password: string };

const loginByForm = async (page: Page, baseUrl: string, creds: LoginCreds) => {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Contraseña").fill(creds.password);
  await page.getByRole("button", { name: /(entrar|iniciar sesión|iniciar sesion)/i }).click();
  await page.waitForURL((url) => url.origin === new URL(baseUrl).origin && url.pathname !== "/login", {
    timeout: 15_000,
  });
  await expect(page).toHaveURL(new RegExp(`^${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`));
};

export const loginBackoffice = async (page: Page) => {
  await loginByForm(page, env.backofficeUrl, env.creds.admin);
};

export const loginCpgPortal = async (page: Page) => {
  await loginByForm(page, env.cpgPortalUrl, env.creds.cpg);
};

export const loginStoreDashboard = async (page: Page) => {
  await loginByForm(page, env.storeDashboardUrl, env.creds.store);
};

export const loginWallet = async (page: Page, creds: LoginCreds) => {
  await loginByForm(page, env.walletUrl, creds);
};

export const apiLogin = async (request: APIRequestContext, creds: LoginCreds) => {
  const response = await request.post(`${env.apiUrl}/v1/auth/login`, {
    data: {
      email: creds.email,
      password: creds.password,
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    data: { accessToken: string };
  };
  return body.data.accessToken;
};
