import { expect, test } from "@playwright/test";
import { apiLogin, loginStoreDashboard, loginWallet } from "../support/auth";
import {
  findStoreByCode,
  findStoreProductBySku,
  getCardQr,
  getMyWalletCard,
  getMyWalletSummary,
  listTransactionsByCard,
  waitForTransactionIncrease,
} from "../support/api";
import { env } from "../support/env";

test("store POS sale with scanned wallet card updates wallet points and purchases", async ({
  page,
  request,
}) => {
  const adminToken = await apiLogin(request, env.creds.admin);
  const storeToken = await apiLogin(request, env.creds.store);
  const consumerToken = await apiLogin(request, env.creds.consumer);

  const store = await findStoreByCode(request, adminToken, "seed_store_development");
  expect(store?.id).toBeTruthy();

  const product = await findStoreProductBySku(
    request,
    storeToken,
    store!.id,
    "QOA-COLA-600-DEVELOPMENT",
  );
  expect(product?.id).toBeTruthy();
  expect(product?.stock ?? 0).toBeGreaterThan(0);

  const card = await getMyWalletCard(request, consumerToken);
  const cardQr = await getCardQr(request, consumerToken, card.id);
  const beforeWallet = await getMyWalletSummary(request, consumerToken);
  const beforeTransactions = await listTransactionsByCard(request, consumerToken, card.id);
  const beforeStoreBreakdown = beforeWallet.storeBreakdown?.find(
    (entry) => entry.storeId === store!.id,
  );

  await loginStoreDashboard(page);
  await page.goto(`${env.storeDashboardUrl}/pos`);

  await page.getByPlaceholder("QR JSON, cardId, card code o teléfono").fill(cardQr.code);
  await page.getByRole("button", { name: "Ligar cliente" }).click();
  await expect(page.getByText("Cliente ligado")).toBeVisible();

  await page.getByPlaceholder("Buscar producto por nombre o SKU...").fill(product!.sku!);
  await expect(page.locator("button", { hasText: product!.name! }).first()).toBeVisible();
  await page.locator("button", { hasText: product!.name! }).first().click();

  await page.getByRole("button", { name: "Revisar y confirmar venta" }).click();
  await page.getByRole("button", { name: "Confirmar venta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Venta registrada" })).toBeVisible();
  await expect(page.getByText(/\+\d+ punto\(s\)/)).toBeVisible();

  const afterTransactions = await waitForTransactionIncrease(
    request,
    consumerToken,
    card.id,
    beforeTransactions.length,
  );
  expect(afterTransactions.length).toBeGreaterThan(beforeTransactions.length);

  const afterWallet = await getMyWalletSummary(request, consumerToken);
  const afterStoreBreakdown = afterWallet.storeBreakdown?.find(
    (entry) => entry.storeId === store!.id,
  );

  expect(afterWallet.totals.current).toBeGreaterThan(beforeWallet.totals.current);
  expect(afterStoreBreakdown?.purchases ?? 0).toBeGreaterThan(beforeStoreBreakdown?.purchases ?? 0);
  expect(afterStoreBreakdown?.pointsTotal ?? 0).toBeGreaterThan(
    beforeStoreBreakdown?.pointsTotal ?? 0,
  );

  await loginWallet(page, env.creds.consumer);
  await page.goto(`${env.walletUrl}/transactions`);
  await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
  await expect(page.getByText("Tienda Seed (development)").first()).toBeVisible();
});
