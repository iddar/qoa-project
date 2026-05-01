import path from "node:path";
import { createInventoryPhoto, createQrPng, createToneWav } from "../lib/assets";
import {
  apiLogin,
  checkApiReachable,
  findStoreByCode,
  getCardQr,
  getStoreProducts,
  getWalletCard,
} from "../lib/api";
import { env, generatedDir, statePath, type DemoState } from "../config";
import { ensureBaseDirs, publicAssetPath, writeJson } from "../lib/files";

const pickDemoProducts = (products: DemoState["products"]) =>
  products
    .filter((product) =>
      ["QOA-COLA-600", "QOA-PAPAS-45", "QOA-GALLETA-90"].some((sku) => product.sku?.includes(sku)),
    )
    .slice(0, 6);

await ensureBaseDirs();
await checkApiReachable();

const [adminAuth, storeAuth, consumerAuth] = await Promise.all([
  apiLogin(env.creds.admin),
  apiLogin(env.creds.store),
  apiLogin(env.creds.consumer),
]);

const storeCode = `seed_store_${env.scope}`;
const store = await findStoreByCode(adminAuth.accessToken, storeCode);
if (!store?.id || !store.code || !store.name) {
  throw new Error(`Could not find seed store "${storeCode}". Run the ${env.scope} seed first.`);
}

const products = (await getStoreProducts(storeAuth.accessToken, store.id)).map((product) => ({
  id: product.id,
  name: product.name ?? "Producto",
  sku: product.sku,
  price: Number(product.price ?? 0),
  stock: Number(product.stock ?? 0),
}));
const demoProducts = pickDemoProducts(products);
if (demoProducts.length < 3) {
  throw new Error(`Expected at least 3 demo products in store ${store.code}. Found ${demoProducts.length}.`);
}

const card = await getWalletCard(consumerAuth.accessToken);
const qr = await getCardQr(consumerAuth.accessToken, card.id);
const qrText = JSON.stringify(qr.payload);

const qrPath = path.join(generatedDir, "wallet-card-qr.png");
const inventoryPhotoPath = path.join(generatedDir, "inventory-ticket.png");
const posVoicePath = path.join(generatedDir, "pos-voice.wav");
const inventoryVoicePath = path.join(generatedDir, "inventory-correction.wav");

await Promise.all([
  createQrPng(qrPath, qrText),
  createInventoryPhoto(inventoryPhotoPath),
  createToneWav(posVoicePath, { seconds: 2.2, frequency: 440 }),
  createToneWav(inventoryVoicePath, { seconds: 2.6, frequency: 330 }),
]);

const state: DemoState = {
  generatedAt: new Date().toISOString(),
  apiUrl: env.apiUrl,
  scope: env.scope,
  store: {
    id: store.id,
    code: store.code,
    name: store.name,
  },
  wallet: {
    cardId: card.id,
    cardCode: card.code,
    qrPayload: qr.payload,
    qrText,
    qrPng: publicAssetPath(qrPath),
  },
  products: demoProducts,
  assets: {
    inventoryPhoto: publicAssetPath(inventoryPhotoPath),
    posVoice: publicAssetPath(posVoicePath),
    inventoryVoice: publicAssetPath(inventoryVoicePath),
  },
};

await writeJson(statePath, state);

console.log(`Demo state ready: ${statePath}`);
console.log(`Store: ${state.store.name} (${state.store.code})`);
console.log(`Products: ${state.products.map((product) => product.sku).join(", ")}`);
