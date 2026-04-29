import { expect, test } from "@playwright/test";
import {
  apiLogin,
  loginBackoffice,
  loginCpgPortal,
  loginStoreDashboard,
  loginWallet,
} from "../support/auth";
import {
  ensureCampaignActive,
  findCampaignByName,
  findProductBySku,
  findStoreByName,
  getMyWalletCard,
  listTransactionsByCard,
  waitForCampaignActive,
} from "../support/api";
import { phoneForSuffix, uniqueSuffix } from "../support/data";
import { env } from "../support/env";

test.describe.serial("Full platform flow", () => {
  const suffix = uniqueSuffix();
  const storeName = `E2E Store ${suffix}`;
  const brandName = `E2E Brand ${suffix}`;
  const productName = `E2E Product ${suffix}`;
  const productSku = `E2E-${suffix}`
    .replace(/[^A-Za-z0-9-]/g, "")
    .toUpperCase()
    .slice(0, 30);
  const campaignName = `E2E Campaign ${suffix}`;
  const rewardName = `E2E Reward ${suffix}`;
  const consumerEmail = `e2e.consumer.${suffix}@qoa.local`;
  const consumerPhone = phoneForSuffix(suffix);
  const consumerPassword = "Password123!";

  const state: {
    storeId?: string;
    productId?: string;
    campaignId?: string;
    cardId?: string;
  } = {};

  test("backoffice creates a store", async ({ page, request }) => {
    await loginBackoffice(page);
    await page.goto(`${env.backofficeUrl}/stores`);

    await page.getByLabel("Nombre").fill(storeName);
    await page.getByLabel(/Tipo/).fill("e2e");
    await page.getByRole("button", { name: "Crear tienda" }).click();
    await expect(page.getByText("Tienda creada correctamente.")).toBeVisible();
    await expect(page.getByText(storeName)).toBeVisible();

    const token = await apiLogin(request, env.creds.admin);
    const createdStore = await findStoreByName(request, token, storeName);
    expect(createdStore?.id).toBeTruthy();
    state.storeId = createdStore?.id;
  });

  test("cpg creates catalog, campaign and reward", async ({ page, request }) => {
    await loginCpgPortal(page);

    await page.goto(`${env.cpgPortalUrl}/brands`);
    await page.getByLabel(/^Nombre/).fill(brandName);
    await page.getByRole("button", { name: "Crear marca" }).click();
    await expect(page.getByText("Marca creada correctamente.")).toBeVisible();

    await page.goto(`${env.cpgPortalUrl}/products`);
    await page.getByLabel("Marca *").selectOption({ label: brandName });
    await page.getByLabel("Nombre del producto *").fill(productName);
    await page.getByLabel(/^SKU/).fill(productSku);
    await page.getByRole("button", { name: "Crear producto" }).click();
    await expect(page.getByText("Producto creado correctamente.")).toBeVisible();

    await page.goto(`${env.cpgPortalUrl}/campaigns`);
    await page.getByLabel("Nombre").fill(campaignName);
    await page.getByLabel("Descripción").fill("Campaign creada por E2E");
    await page.getByRole("button", { name: "Crear campaña" }).click();
    await expect(page.getByText(campaignName)).toBeVisible();

    await page.getByRole("link", { name: "Abrir" }).first().click();

    const addPolicyButton = page.getByRole("button", { name: "Agregar politica" });
    if (await addPolicyButton.isVisible()) {
      await addPolicyButton.click();
    }

    const transitionLabels = ["Enviar a revisión", "Aprobar revisión", "Confirmar", "Activar"];
    for (const label of transitionLabels) {
      const button = page.getByRole("button", { name: label });
      if (await button.isVisible()) {
        await button.click();
      }
    }

    await page.goto(`${env.cpgPortalUrl}/rewards`);
    await page.getByLabel("Campana").selectOption({ label: campaignName });
    await page.getByLabel("Nombre").fill(rewardName);
    await page.getByLabel("Descripcion").fill("Reward creada por E2E");
    await page.getByLabel("Costo (pts)").fill("5");
    await page.getByLabel("Stock").fill("25");
    await page.getByRole("button", { name: "Crear recompensa" }).click();
    await expect(page.getByText(rewardName)).toBeVisible();

    const token = await apiLogin(request, env.creds.cpg);
    const product = await findProductBySku(request, token, productSku);
    const campaign = await findCampaignByName(request, token, campaignName);

    expect(product?.id).toBeTruthy();
    expect(campaign?.id).toBeTruthy();

    if (campaign?.id) {
      await ensureCampaignActive(request, token, campaign.id);
    }

    const activatedCampaign = await waitForCampaignActive(request, token, campaignName);
    expect(activatedCampaign?.status).toBe("active");

    state.productId = product?.id;
    state.campaignId = activatedCampaign?.id ?? campaign?.id;
  });

  test("wallet signup subscribes and sees reward", async ({ page, request }) => {
    await page.goto(`${env.walletUrl}/signup`);
    await page.getByLabel(/Nombre/).fill("E2E Consumer");
    await page.getByLabel("Teléfono").fill(consumerPhone);
    await page.getByLabel("Email").fill(consumerEmail);
    await page.getByLabel("Contraseña").fill(consumerPassword);
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    await expect(page.getByText("Tu QR de lealtad")).toBeVisible();

    await page.goto(`${env.walletUrl}/campaigns`);
    const card = page.locator("article", { hasText: campaignName }).first();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await card.isVisible()) {
        break;
      }
      await page.reload();
    }
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Suscribirme" }).click();
    await expect(card.getByRole("button", { name: "Suscrito" })).toBeVisible();

    await page.goto(`${env.walletUrl}/rewards`);
    await expect(page.getByText(rewardName)).toBeVisible();

    const consumerToken = await apiLogin(request, {
      email: consumerEmail,
      password: consumerPassword,
    });
    const cardData = await getMyWalletCard(request, consumerToken);
    expect(cardData?.id).toBeTruthy();
    state.cardId = cardData?.id;
  });

  test("store registers purchase and wallet sees history", async ({ page }) => {
    expect(state.productId).toBeTruthy();
    expect(state.cardId).toBeTruthy();

    await loginStoreDashboard(page);
    await page.goto(`${env.storeDashboardUrl}/scan`);

    await page.getByLabel("Card payload / Card ID / código").fill(state.cardId!);
    await page.getByLabel("Product ID").fill(state.productId!);
    await page.getByLabel("Cantidad").fill("1");
    await page.getByLabel("Monto").fill("150");
    await page.getByRole("button", { name: "Registrar transacción" }).click();
    await expect(page.getByText(/Transacción .* registrada/)).toBeVisible();

    await loginWallet(page, {
      email: consumerEmail,
      password: consumerPassword,
    });

    await page.goto(`${env.walletUrl}/transactions`);
    await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();

    const consumerToken = await apiLogin(page.request, {
      email: consumerEmail,
      password: consumerPassword,
    });
    const transactions = await listTransactionsByCard(page.request, consumerToken, state.cardId!);
    expect(transactions.length).toBeGreaterThan(0);
  });
});
