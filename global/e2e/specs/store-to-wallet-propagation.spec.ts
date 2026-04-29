import { expect, test } from "@playwright/test";
import { apiLogin, loginStoreDashboard, loginWallet } from "../support/auth";
import {
  findProductBySku,
  getCardQr,
  getMyWalletCard,
  getMyWalletSummary,
  listTransactionsByCard,
  waitForTransactionIncrease,
} from "../support/api";
import { env } from "../support/env";

test("store scan purchase propagates into wallet points and history", async ({ page, request }) => {
  const adminToken = await apiLogin(request, env.creds.admin);
  const consumerToken = await apiLogin(request, env.creds.consumer);

  const product = await findProductBySku(request, adminToken, "QOA-COLA-600-DEVELOPMENT");
  expect(product?.id).toBeTruthy();

  const card = await getMyWalletCard(request, consumerToken);
  const cardQr = await getCardQr(request, consumerToken, card.id);
  const beforeWallet = await getMyWalletSummary(request, consumerToken);
  const beforeTransactions = await listTransactionsByCard(request, consumerToken, card.id);

  await loginStoreDashboard(page);
  await page.goto(`${env.storeDashboardUrl}/scan`);
  await page.getByLabel("Card payload / Card ID / código").fill(cardQr.code);
  await page.getByLabel("Product ID").fill(product!.id);
  await page.getByLabel("Cantidad").fill("1");
  await page.getByLabel("Monto").fill("160");
  await page.getByRole("button", { name: "Registrar transacción" }).click();
  await expect(page.getByText(/Transacción .* registrada/)).toBeVisible();

  const afterTransactions = await waitForTransactionIncrease(
    request,
    consumerToken,
    card.id,
    beforeTransactions.length,
  );
  expect(afterTransactions.length).toBeGreaterThan(beforeTransactions.length);
  const afterWallet = await getMyWalletSummary(request, consumerToken);
  expect(afterWallet.totals.current).toBeGreaterThan(beforeWallet.totals.current);

  await loginWallet(page, env.creds.consumer);
  await page.goto(`${env.walletUrl}/transactions`);
  await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
  await expect(page.getByText("Tienda Seed (development)").first()).toBeVisible();
});
