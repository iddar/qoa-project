import { expect, test } from "@playwright/test";
import { apiLogin, loginStoreDashboard, loginWallet } from "../support/auth";
import { findProductBySku, getMyWalletCard, listTransactionsByCard, waitForTransactionIncrease } from "../support/api";
import { env } from "../support/env";

test("store scan payload propagates into wallet history", async ({ page, request }) => {
  const adminToken = await apiLogin(request, env.creds.admin);
  const consumerToken = await apiLogin(request, env.creds.consumer);

  const product = await findProductBySku(request, adminToken, "SEED-DEVELOPMENT-001");
  expect(product?.id).toBeTruthy();

  const card = await getMyWalletCard(request, consumerToken);
  const beforeTransactions = await listTransactionsByCard(request, consumerToken, card.id);

  await loginStoreDashboard(page);
  await page.goto(`${env.storeDashboardUrl}/scan`);
  await page.getByLabel("Card payload / Card ID").fill(card.id);
  await page.getByLabel("Product ID").fill(product!.id);
  await page.getByLabel("Cantidad").fill("1");
  await page.getByLabel("Monto").fill("160");
  await page.getByRole("button", { name: "Registrar transacción" }).click();
  await expect(page.getByText(/Transacción .* registrada/)).toBeVisible();

  const afterTransactions = await waitForTransactionIncrease(request, consumerToken, card.id, beforeTransactions.length);
  expect(afterTransactions.length).toBeGreaterThan(beforeTransactions.length);

  await loginWallet(page, env.creds.consumer);
  await page.goto(`${env.walletUrl}/transactions`);
  await expect(page.getByText("Historial de transacciones")).toBeVisible();
});
