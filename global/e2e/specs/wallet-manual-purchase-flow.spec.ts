import { expect, test } from "@playwright/test";
import { apiLogin, loginWallet } from "../support/auth";
import {
  findProductBySku,
  findStoreByCode,
  getMyWalletCard,
  getMyWalletSummary,
  listTransactionsByCard,
  waitForTransactionIncrease,
} from "../support/api";
import { env } from "../support/env";

test("wallet manual purchase payload flow", async ({ page, request }) => {
  const adminToken = await apiLogin(request, env.creds.admin);
  const consumerToken = await apiLogin(request, env.creds.consumer);

  const store = await findStoreByCode(request, adminToken, "seed_store_development");
  const product = await findProductBySku(request, adminToken, "QOA-COLA-600-DEVELOPMENT");

  expect(store?.id).toBeTruthy();
  expect(product?.id).toBeTruthy();

  const card = await getMyWalletCard(request, consumerToken);
  const beforeWallet = await getMyWalletSummary(request, consumerToken);
  const beforeTransactions = await listTransactionsByCard(request, consumerToken, card.id);

  await loginWallet(page, env.creds.consumer);

  await page.goto(`${env.walletUrl}/purchase`);
  const payload = {
    storeId: store!.id,
    items: [
      {
        productId: product!.id,
        quantity: 1,
        amount: 120,
      },
    ],
    metadata: "e2e wallet payload",
  };

  await page
    .locator("textarea")
    .first()
    .fill(JSON.stringify(payload, null, 2));
  await page.getByRole("button", { name: "Registrar compra" }).click();
  await expect(page.getByText(/Compra registrada/)).toBeVisible();

  const afterTransactions = await waitForTransactionIncrease(
    request,
    consumerToken,
    card.id,
    beforeTransactions.length,
  );
  expect(afterTransactions.length).toBeGreaterThan(beforeTransactions.length);
  const afterWallet = await getMyWalletSummary(request, consumerToken);
  expect(afterWallet.totals.current).toBeGreaterThan(beforeWallet.totals.current);
});
