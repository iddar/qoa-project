import { expect, type Page } from "@playwright/test";
import { env } from "../config";
import { apiLogin } from "./api";

type AppPrefix = "store" | "wallet" | "cpg";

const tokenKeys: Record<AppPrefix, { access: string; refresh: string }> = {
  store: { access: "store_access_token", refresh: "store_refresh_token" },
  wallet: { access: "wallet_access_token", refresh: "wallet_refresh_token" },
  cpg: { access: "cpg_access_token", refresh: "cpg_refresh_token" },
};

export const installAuthTokens = async (page: Page, prefix: AppPrefix, baseUrl: string) => {
  const creds = prefix === "store" ? env.creds.store : prefix === "wallet" ? env.creds.consumer : env.creds.cpg;
  const tokens = await apiLogin(creds);
  const keys = tokenKeys[prefix];

  await page.goto(baseUrl);
  await page.evaluate(
    ({ accessKey, refreshKey, accessToken, refreshToken }) => {
      window.localStorage.setItem(accessKey, accessToken);
      window.localStorage.setItem(refreshKey, refreshToken);
    },
    {
      accessKey: keys.access,
      refreshKey: keys.refresh,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  );
};

export const waitForApp = async (page: Page, url: string) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
};

export const expectVisible = async (page: Page, text: string | RegExp) => {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 20_000 });
};
