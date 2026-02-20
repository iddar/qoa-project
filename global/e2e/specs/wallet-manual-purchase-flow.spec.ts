import { expect, test } from "@playwright/test";
import { apiLogin, loginWallet } from "../support/auth";
import {
  findCampaignByKey,
  findProductBySku,
  findStoreByCode,
  getMyWalletCard,
  listTransactionsByCard,
  waitForTransactionIncrease,
} from "../support/api";
import { env } from "../support/env";

test("wallet manual purchase payload flow", async ({ page, request }) => {
  const adminToken = await apiLogin(request, env.creds.admin);
  const consumerToken = await apiLogin(request, env.creds.consumer);

  const store = await findStoreByCode(request, adminToken, "seed_store_development");
  const product = await findProductBySku(request, adminToken, "SEED-DEVELOPMENT-001");
  const campaign = await findCampaignByKey(request, adminToken, "qoa_seed_reto_development");

  expect(store?.id).toBeTruthy();
  expect(product?.id).toBeTruthy();
  expect(campaign?.id).toBeTruthy();

  const card = await getMyWalletCard(request, consumerToken);
  const beforeTransactions = await listTransactionsByCard(request, consumerToken, card.id);

  await loginWallet(page, env.creds.consumer);

  await page.goto(`${env.walletUrl}/campaigns`);
  const campaignCard = page.locator("article", { hasText: campaign?.name ?? "Reto Seed (development)" }).first();
  await expect(campaignCard).toBeVisible();
  const subscribeButton = campaignCard.getByRole("button", { name: "Suscribirme" });
  if (await subscribeButton.isVisible()) {
    await subscribeButton.click();
  }

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

  await page.locator("textarea").first().fill(JSON.stringify(payload, null, 2));
  await page.getByRole("button", { name: "Registrar compra" }).click();
  await expect(page.getByText(/Compra registrada/)).toBeVisible();

  const afterTransactions = await waitForTransactionIncrease(request, consumerToken, card.id, beforeTransactions.length);
  expect(afterTransactions.length).toBeGreaterThan(beforeTransactions.length);
});
