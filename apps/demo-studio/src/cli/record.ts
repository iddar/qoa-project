import { copyFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { chromium, expect, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";
import { env, publicDir } from "../config";
import { parseScenarioArg } from "../lib/args";
import { apiLogin } from "../lib/api";
import { waitForApp } from "../lib/browser";
import { ensureBaseDirs, fileExists, loadDemoState, publicAssetPath, scenarioRecordingDir, writeJson } from "../lib/files";
import type { ScenarioId } from "../scenarios";

const stateRequiredMessage = "Demo state is missing. Run `bun run demo:prepare` first.";
type RecordingResult = { screenshots: string[]; videos: string[] };
type AppPrefix = "store" | "wallet" | "cpg";

const tokenKeys: Record<AppPrefix, { access: string; refresh: string }> = {
  store: { access: "store_access_token", refresh: "store_refresh_token" },
  wallet: { access: "wallet_access_token", refresh: "wallet_refresh_token" },
  cpg: { access: "cpg_access_token", refresh: "cpg_refresh_token" },
};

const screenshot = async (page: Page, scenarioId: ScenarioId, fileName: string) => {
  const filePath = path.join(scenarioRecordingDir(scenarioId), fileName);
  await page.screenshot({ path: filePath, fullPage: false });
  return publicAssetPath(filePath);
};

const imageDataUrl = async (relativePublicPath: string) => {
  const filePath = path.join(publicDir, relativePublicPath);
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
  const content = await readFile(filePath, "base64");
  return `data:${mimeType};base64,${content}`;
};

const installAuthInitScript = async (context: BrowserContext, prefix: AppPrefix) => {
  const creds = prefix === "store" ? env.creds.store : prefix === "wallet" ? env.creds.consumer : env.creds.cpg;
  const tokens = await apiLogin(creds);
  const keys = tokenKeys[prefix];

  await context.addInitScript(
    ({ accessKey, refreshKey, accessToken, refreshToken }) => {
      window.localStorage.setItem(accessKey, accessToken);
      window.localStorage.setItem(refreshKey, refreshToken);
      window.localStorage.setItem("qoa_demo_agent_mode", "fixture");
    },
    {
      accessKey: keys.access,
      refreshKey: keys.refresh,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  );
};

const installCursorInitScript = async (context: BrowserContext) => {
  await context.addInitScript(() => {
    const install = () => {
      if (document.getElementById("qoa-demo-cursor")) return;

      const cursor = document.createElement("div");
      cursor.id = "qoa-demo-cursor";
      cursor.style.cssText = [
        "position:fixed",
        "left:0",
        "top:0",
        "width:26px",
        "height:26px",
        "border-radius:999px",
        "border:3px solid #10b981",
        "background:rgba(16,185,129,0.16)",
        "box-shadow:0 0 0 8px rgba(16,185,129,0.12)",
        "transform:translate(-50%,-50%)",
        "z-index:2147483647",
        "pointer-events:none",
        "opacity:0",
        "transition:opacity 160ms ease, width 120ms ease, height 120ms ease, background 120ms ease",
      ].join(";");
      document.documentElement.appendChild(cursor);

      const move = (event: MouseEvent) => {
        cursor.style.opacity = "1";
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
      };
      const press = () => {
        cursor.style.width = "42px";
        cursor.style.height = "42px";
        cursor.style.background = "rgba(16,185,129,0.28)";
      };
      const release = () => {
        cursor.style.width = "26px";
        cursor.style.height = "26px";
        cursor.style.background = "rgba(16,185,129,0.16)";
      };

      window.addEventListener("mousemove", move, { passive: true });
      window.addEventListener("mousedown", press, { passive: true });
      window.addEventListener("mouseup", release, { passive: true });
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", install, { once: true });
    } else {
      install();
    }
  });
};

const installCleanCaptureInitScript = async (context: BrowserContext) => {
  await context.addInitScript(() => {
    const css = [
      "nextjs-portal",
      "[data-nextjs-toast]",
      "[data-nextjs-dialog]",
      "[data-nextjs-dialog-overlay]",
      "[data-nextjs-devtools]",
      "[data-nextjs-devtools-button]",
      "[data-nextjs-build-indicator]",
      "[data-vercel-toolbar]",
      "#__next-build-watcher",
      ".__next-build-watcher",
      ".vercel-toolbar",
      "#vercel-live-feedback",
    ].join(",");

    const install = () => {
      if (document.getElementById("qoa-demo-clean-capture-style")) return;
      const style = document.createElement("style");
      style.id = "qoa-demo-clean-capture-style";
      style.textContent = `${css}{display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;}`;
      document.documentElement.appendChild(style);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", install, { once: true });
    } else {
      install();
    }
  });
};

const installQrCameraInitScript = async (context: BrowserContext, qrImageSrc: string) => {
  await context.addInitScript(({ qrImageSrc: src }) => {
    const originalMediaDevices = navigator.mediaDevices;

    const makeQrCameraStream = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      const qrImage = new Image();
      qrImage.src = src;
      const startedAt = performance.now();

      const drawRoundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
        if (!context) return;
        context.beginPath();
        context.moveTo(x + radius, y);
        context.lineTo(x + width - radius, y);
        context.quadraticCurveTo(x + width, y, x + width, y + radius);
        context.lineTo(x + width, y + height - radius);
        context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        context.lineTo(x + radius, y + height);
        context.quadraticCurveTo(x, y + height, x, y + height - radius);
        context.lineTo(x, y + radius);
        context.quadraticCurveTo(x, y, x + radius, y);
        context.closePath();
      };

      const drawFrame = () => {
        if (!context) return;
        const elapsed = performance.now() - startedAt;
        const reveal = Math.min(1, Math.max(0, (elapsed - 900) / 800));
        const float = Math.sin(elapsed / 540) * 10;

        const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, "#171717");
        gradient.addColorStop(0.52, "#27272a");
        gradient.addColorStop(1, "#111827");
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.globalAlpha = 0.2;
        for (let x = -80; x < canvas.width; x += 120) {
          context.fillStyle = x % 240 === 0 ? "#3f3f46" : "#52525b";
          context.fillRect(x + ((elapsed / 40) % 120), 0, 2, canvas.height);
        }
        context.globalAlpha = 1;

        context.save();
        context.translate(canvas.width / 2, canvas.height / 2 + float);
        context.rotate(Math.sin(elapsed / 900) * 0.018);

        const cardWidth = 360;
        const cardHeight = 460;
        drawRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 34);
        context.fillStyle = "rgba(255, 255, 255, 0.96)";
        context.fill();
        context.shadowColor = "rgba(0,0,0,0.35)";
        context.shadowBlur = 32;
        context.shadowOffsetY = 18;
        context.strokeStyle = "rgba(255,255,255,0.45)";
        context.lineWidth = 2;
        context.stroke();
        context.shadowColor = "transparent";

        context.fillStyle = "#18181b";
        context.font = "700 28px Inter, Arial, sans-serif";
        context.textAlign = "center";
        context.fillText("Wallet QOA", 0, -168);

        if (qrImage.complete && reveal > 0) {
          context.globalAlpha = reveal;
          context.drawImage(qrImage, -128, -128, 256, 256);
          context.globalAlpha = 1;
        } else {
          context.strokeStyle = "rgba(24,24,27,0.22)";
          context.lineWidth = 4;
          context.strokeRect(-128, -128, 256, 256);
        }

        context.fillStyle = "#52525b";
        context.font = "500 20px Inter, Arial, sans-serif";
        context.fillText("Muéstrala en caja", 0, 174);
        context.restore();

        context.strokeStyle = "rgba(16,185,129,0.58)";
        context.lineWidth = 4;
        context.strokeRect(424, 144, 432, 432);

        window.requestAnimationFrame(drawFrame);
      };

      drawFrame();
      return canvas.captureStream(24);
    };

    const mediaDevices = originalMediaDevices ?? ({} as MediaDevices);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        ...mediaDevices,
        getUserMedia: async () => makeQrCameraStream(),
      },
    });
  }, { qrImageSrc });
};

const showCameraOverlay = async (
  page: Page,
  options: {
    mode: "qr" | "document";
    title: string;
    subtitle: string;
    imageSrc: string;
    successText: string;
    durationMs?: number;
  },
) => {
  await page.evaluate(
    ({ mode, title, subtitle, imageSrc, successText, durationMs = 3400 }) =>
      new Promise<void>((resolve) => {
        const previous = document.getElementById("qoa-demo-camera-overlay");
        previous?.remove();

        const overlay = document.createElement("div");
        overlay.id = "qoa-demo-camera-overlay";
        overlay.innerHTML = `
          <style>
            #qoa-demo-camera-overlay {
              position: fixed;
              inset: 0;
              z-index: 2147483600;
              display: grid;
              place-items: ${mode === "qr" ? "center" : "center end"};
              padding: ${mode === "qr" ? "0" : "28px 34px 28px 0"};
              background: ${mode === "qr" ? "rgba(2, 6, 23, 0.92)" : "rgba(15, 23, 42, 0.28)"};
              backdrop-filter: ${mode === "qr" ? "none" : "blur(1.5px)"};
              color: #f8fafc;
              font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              opacity: 0;
              transition: opacity 220ms ease;
            }
            #qoa-demo-camera-overlay.qoa-visible {
              opacity: 1;
            }
            .qoa-camera-shell {
              width: min(${mode === "qr" ? "88vw" : "42vw"}, ${mode === "qr" ? "340px" : "500px"});
              aspect-ratio: ${mode === "qr" ? "9 / 16" : "4 / 5"};
              border-radius: ${mode === "qr" ? "34px" : "26px"};
              overflow: hidden;
              position: relative;
              background:
                radial-gradient(circle at 28% 18%, rgba(255,255,255,0.16), transparent 24%),
                linear-gradient(140deg, #111827 0%, #020617 100%);
              border: 1px solid rgba(255,255,255,0.18);
              box-shadow: 0 34px 110px rgba(0,0,0,0.42);
            }
            .qoa-camera-top {
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 18px 22px;
              font-size: 14px;
              font-weight: 750;
              letter-spacing: 0;
              z-index: 3;
              background: linear-gradient(180deg, rgba(2,6,23,0.74), transparent);
            }
            .qoa-camera-stage {
              position: absolute;
              inset: ${mode === "qr" ? "86px 34px 118px" : "72px 30px 178px"};
              display: grid;
              place-items: center;
              border-radius: ${mode === "qr" ? "24px" : "18px"};
              overflow: hidden;
              background: rgba(15, 23, 42, 0.74);
            }
            .qoa-camera-stage::before {
              content: "";
              position: absolute;
              inset: 0;
              background-image:
                linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px);
              background-size: 34px 34px;
              opacity: 0.8;
            }
            .qoa-camera-target {
              width: ${mode === "qr" ? "190px" : "88%"};
              max-height: ${mode === "qr" ? "78%" : "88%"};
              object-fit: contain;
              border-radius: ${mode === "qr" ? "18px" : "12px"};
              box-shadow: 0 22px 70px rgba(0,0,0,0.45);
              position: relative;
              z-index: 2;
              transform: scale(0.94);
              transition: transform 420ms ease, filter 420ms ease;
              filter: saturate(0.92) brightness(0.9);
            }
            .qoa-visible .qoa-camera-target {
              transform: scale(1);
              filter: saturate(1.05) brightness(1);
            }
            .qoa-scan-frame {
              position: absolute;
              inset: ${mode === "qr" ? "54px" : "32px"};
              border: 2px solid rgba(16, 185, 129, 0.72);
              border-radius: ${mode === "qr" ? "22px" : "18px"};
              z-index: 3;
              opacity: 0.72;
            }
            .qoa-scan-frame::before,
            .qoa-scan-frame::after {
              content: "";
              position: absolute;
              left: 10%;
              right: 10%;
              height: 3px;
              background: #34d399;
              box-shadow: 0 0 24px rgba(52, 211, 153, 0.9);
              animation: qoaScanLine 1.2s ease-in-out infinite alternate;
            }
            .qoa-scan-frame::before {
              top: 16%;
            }
            .qoa-scan-frame::after {
              bottom: 16%;
              animation-delay: 240ms;
            }
            .qoa-camera-status {
              position: absolute;
              left: 22px;
              right: 22px;
              bottom: ${mode === "qr" ? "74px" : "88px"};
              z-index: 4;
              display: grid;
              gap: 6px;
              text-align: center;
            }
            .qoa-camera-title {
              font-size: ${mode === "qr" ? "20px" : "21px"};
              font-weight: 820;
            }
            .qoa-camera-subtitle {
              font-size: ${mode === "qr" ? "13px" : "14px"};
              color: rgba(248, 250, 252, 0.78);
              line-height: 1.25;
            }
            .qoa-camera-pill {
              justify-self: center;
              margin-top: 12px;
              border-radius: 999px;
              padding: 8px 14px;
              background: rgba(15, 23, 42, 0.82);
              border: 1px solid rgba(148, 163, 184, 0.34);
              color: #bbf7d0;
              font-size: ${mode === "qr" ? "12px" : "14px"};
              font-weight: 760;
            }
            .qoa-shutter {
              position: absolute;
              left: 50%;
              bottom: ${mode === "qr" ? "22px" : "18px"};
              width: ${mode === "qr" ? "52px" : "58px"};
              height: ${mode === "qr" ? "52px" : "58px"};
              border-radius: 999px;
              transform: translateX(-50%);
              background: #f8fafc;
              border: 7px solid rgba(255,255,255,0.28);
              box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.34);
              z-index: 4;
            }
            .qoa-found .qoa-scan-frame {
              border-color: #22c55e;
              box-shadow: 0 0 0 999px rgba(16, 185, 129, 0.04), 0 0 36px rgba(34, 197, 94, 0.36);
              opacity: 1;
            }
            .qoa-captured::after {
              content: "";
              position: absolute;
              inset: 0;
              background: rgba(255,255,255,0.82);
              animation: qoaFlash 520ms ease forwards;
              z-index: 5;
            }
            @keyframes qoaScanLine {
              from { transform: translateY(-34px); opacity: 0.45; }
              to { transform: translateY(34px); opacity: 1; }
            }
            @keyframes qoaFlash {
              from { opacity: 0.9; }
              to { opacity: 0; }
            }
          </style>
            <div class="qoa-camera-shell">
              <div class="qoa-camera-top">
              <span>${mode === "qr" ? "Cámara" : "Captura de inventario"}</span>
              <span>QOA</span>
            </div>
            <div class="qoa-camera-stage">
              <img class="qoa-camera-target" src="${imageSrc}" alt="" />
              <div class="qoa-scan-frame"></div>
            </div>
            <div class="qoa-camera-status">
              <div class="qoa-camera-title">${title}</div>
              <div class="qoa-camera-subtitle">${subtitle}</div>
              <div class="qoa-camera-pill">Buscando...</div>
            </div>
            <div class="qoa-shutter"></div>
          </div>
        `;

        document.body.appendChild(overlay);
        const pill = overlay.querySelector<HTMLElement>(".qoa-camera-pill");
        window.setTimeout(() => overlay.classList.add("qoa-visible"), 60);
        window.setTimeout(() => {
          overlay.classList.add("qoa-found");
          if (pill) pill.textContent = successText;
        }, Math.floor(durationMs * 0.48));
        window.setTimeout(() => overlay.classList.add("qoa-captured"), Math.floor(durationMs * 0.78));
        window.setTimeout(() => {
          overlay.remove();
          resolve();
        }, durationMs);
      }),
    options,
  );
};

const createRecordedContext = async (
  browser: Browser,
  scenarioId: ScenarioId,
  options: BrowserContextOptions & { viewport: { width: number; height: number } },
) => {
  const context = await browser.newContext({
    ...options,
    recordVideo: {
      dir: scenarioRecordingDir(scenarioId),
      size: options.viewport,
    },
  });
  await installCleanCaptureInitScript(context);
  await installCursorInitScript(context);
  return context;
};

const saveVideo = async (page: Page, scenarioId: ScenarioId, fileName: string) => {
  const video = page.video();
  if (!video) return null;

  const sourcePath = await video.path();
  const targetPath = path.join(scenarioRecordingDir(scenarioId), fileName);
  await rm(targetPath, { force: true });
  await copyFile(sourcePath, targetPath);
  if (sourcePath !== targetPath) {
    await rm(sourcePath, { force: true }).catch(() => undefined);
  }
  return publicAssetPath(targetPath);
};

const sendAgentText = async (page: Page, text: string) => {
  const box = page.locator("textarea, input").filter({ visible: true }).last();
  await box.fill("");
  await box.pressSequentially(text, { delay: 18 });
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: /enviar/i }).filter({ visible: true }).last().click();
  await page.waitForTimeout(650);
};

const expectTextVisible = async (page: Page, text: string | RegExp, timeout = 20_000) => {
  await expect(page.getByText(text).filter({ visible: true }).first()).toBeVisible({ timeout });
};

const openAgentDrawer = async (page: Page) => {
  const closeButton = page.getByRole("button", { name: "Cerrar panel del asistente" }).filter({ visible: true }).first();
  if (await closeButton.isVisible().catch(() => false)) {
    return;
  }

  await page.getByRole("button", { name: /Abrir asistente/i }).click();
  await expect(closeButton).toBeVisible({ timeout: 10_000 });
};

const closeAgentDrawer = async (page: Page) => {
  const closeButton = page.getByRole("button", { name: "Cerrar panel del asistente" }).filter({ visible: true }).first();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
    await expect(page.getByRole("button", { name: /Abrir asistente/i })).toBeVisible({ timeout: 10_000 });
  }
};

const recordPosWallet = async (browser: Browser) => {
  const state = await loadDemoState();
  const scenarioId: ScenarioId = "pos-wallet";

  const walletQrContext = await createRecordedContext(browser, scenarioId, {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await installAuthInitScript(walletQrContext, "wallet");
  const walletQr = await walletQrContext.newPage();
  await waitForApp(walletQr, env.walletUrl);
  await expect(walletQr.getByRole("button", { name: /Ver tarjeta/i })).toBeVisible({ timeout: 20_000 });
  await walletQr.waitForTimeout(1500);
  const walletHomeShot = await screenshot(walletQr, scenarioId, "00-wallet-home.png");
  await walletQr.getByRole("button", { name: /Ver tarjeta/i }).click();
  await expect(walletQr.getByRole("dialog", { name: "Tarjeta QR" })).toBeVisible({ timeout: 10_000 });
  await walletQr.waitForTimeout(1600);
  const walletQrShot = await screenshot(walletQr, scenarioId, "00-wallet-card.png");
  await walletQrContext.close();
  const walletQrVideo = await saveVideo(walletQr, scenarioId, "02-wallet-card.webm");

  const context = await createRecordedContext(browser, scenarioId, {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await installQrCameraInitScript(context, await imageDataUrl(state.wallet.qrPng));
  await installAuthInitScript(context, "store");
  const page = await context.newPage();

  await waitForApp(page, `${env.storeDashboardUrl}/pos?demoAgentMode=fixture`);
  await page.waitForTimeout(900);
  await openAgentDrawer(page);
  await page.waitForTimeout(700);
  const posAgentStartShot = await screenshot(page, scenarioId, "00-pos-agent-start.png");

  await page.locator('input[type="file"][accept="audio/*"]').last().setInputFiles(path.join(publicDir, state.assets.posVoice));
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Enviar mensaje" }).filter({ visible: true }).last().click();
  await expectTextVisible(page, /pedido listo para cobrar/i);
  await page.waitForTimeout(900);
  const posOrderShot = await screenshot(page, scenarioId, "01-pos-order.png");

  await page.getByRole("button", { name: /Escanear QR en vivo|Adjuntar foto del QR/i }).filter({ visible: true }).last().click();
  await expectTextVisible(page, /Escaneando QR/i, 12_000);
  await page.waitForTimeout(450);
  const posScannerShot = await screenshot(page, scenarioId, "02-pos-scanner-start.png");
  await expectTextVisible(page, /Cliente ligado/i);
  await page.waitForTimeout(900);
  const posLinkedShot = await screenshot(page, scenarioId, "02-pos-linked.png");
  await closeAgentDrawer(page);
  await page.waitForTimeout(700);

  await page.getByRole("main").getByRole("button", { name: "Revisar y confirmar venta" }).click();
  await page.waitForTimeout(500);
  const posConfirmShot = await screenshot(page, scenarioId, "03-pos-confirm.png");
  await page.getByRole("main").getByRole("button", { name: "Confirmar venta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Venta registrada" })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(900);
  const posSuccessShot = await screenshot(page, scenarioId, "04-pos-success.png");

  await context.close();
  const posVideo = await saveVideo(page, scenarioId, "01-pos-flow.webm");

  const walletContext = await createRecordedContext(browser, scenarioId, {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await installAuthInitScript(walletContext, "wallet");
  const wallet = await walletContext.newPage();
  await waitForApp(wallet, env.walletUrl);
  await expect(wallet.getByRole("button", { name: /Ver tarjeta/i })).toBeVisible({ timeout: 20_000 });
  await wallet.waitForTimeout(1100);
  const walletUpdatedShot = await screenshot(wallet, scenarioId, "03-wallet-updated.png");
  await wallet.getByRole("link", { name: "Historial", exact: true }).click();
  await expect(wallet.getByRole("heading", { name: "Historial" })).toBeVisible({ timeout: 20_000 });
  await wallet.getByRole("button", { name: "Por fecha" }).click();
  await expect(wallet.getByText("$75").first()).toBeVisible({ timeout: 20_000 });
  await wallet.waitForTimeout(1100);
  const walletHistoryShot = await screenshot(wallet, scenarioId, "03-wallet-history.png");
  await walletContext.close();
  const walletVideo = await saveVideo(wallet, scenarioId, "03-wallet-flow.webm");

  return {
    screenshots: [
      walletHomeShot,
      walletQrShot,
      posAgentStartShot,
      posOrderShot,
      posScannerShot,
      posLinkedShot,
      posConfirmShot,
      posSuccessShot,
      walletUpdatedShot,
      walletHistoryShot,
    ],
    videos: [walletQrVideo, posVideo, walletVideo].filter(Boolean) as string[],
  };
};

const recordInventory = async (browser: Browser) => {
  const state = await loadDemoState();
  const scenarioId: ScenarioId = "inventory-intake";
  const context = await createRecordedContext(browser, scenarioId, { viewport: { width: 1440, height: 960 } });
  await installAuthInitScript(context, "store");
  const page = await context.newPage();

  await waitForApp(page, `${env.storeDashboardUrl}/inventory?demoAgentMode=fixture`);
  await page.waitForTimeout(900);
  await openAgentDrawer(page);
  await page.waitForTimeout(700);
  const inventoryAgent = page.getByRole("complementary").filter({ hasText: "Inventory Agent" });

  const photoChooser = page.waitForEvent("filechooser");
  await inventoryAgent.getByRole("button", { name: "Subir foto de inventario desde fotos" }).click();
  const photoFileChooser = await photoChooser;
  await showCameraOverlay(page, {
    mode: "document",
    title: "Capturando ticket de proveedor",
    subtitle: "La captura queda dentro del flujo del asistente antes de generar el preview.",
    imageSrc: await imageDataUrl(state.assets.inventoryPhoto),
    successText: "Documento detectado",
    durationMs: 3200,
  });
  await photoFileChooser.setFiles(path.join(publicDir, state.assets.inventoryPhoto));
  await expectTextVisible(page, /preview de inventario desde la foto/i);
  await page.waitForTimeout(900);
  const shot1 = await screenshot(page, scenarioId, "01-inventory-photo.png");

  await inventoryAgent.locator('input[type="file"][accept="audio/*"]').setInputFiles(path.join(publicDir, state.assets.inventoryVoice));
  await page.waitForTimeout(700);
  await expect(inventoryAgent.getByRole("button", { name: "Enviar mensaje" })).toBeEnabled({ timeout: 10_000 });
  await inventoryAgent.getByRole("button", { name: "Enviar mensaje" }).click();
  await expectTextVisible(page, /corregí/i);
  await page.waitForTimeout(900);
  const shot2 = await screenshot(page, scenarioId, "02-inventory-corrected.png");
  await closeAgentDrawer(page);
  await page.waitForTimeout(700);

  await page.getByRole("main").getByRole("button", { name: /Confirmar entrada/i }).click();
  await expectTextVisible(page, /piezas cargadas al inventario/i);
  await page.waitForTimeout(900);
  const shot3 = await screenshot(page, scenarioId, "03-inventory-stock.png");

  await context.close();
  const flowVideo = await saveVideo(page, scenarioId, "01-inventory-flow.webm");
  return { screenshots: [shot1, shot2, shot3], videos: [flowVideo].filter(Boolean) as string[] };
};

const recordCampaigns = async (browser: Browser) => {
  const scenarioId: ScenarioId = "geo-campaigns";
  const context = await createRecordedContext(browser, scenarioId, { viewport: { width: 1440, height: 960 } });
  await installAuthInitScript(context, "cpg");
  const page = await context.newPage();
  const campaignName = `Demo Geo ${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 17)}`;

  await waitForApp(page, `${env.cpgPortalUrl}/campaigns`);
  await page.waitForTimeout(900);
  await page.getByLabel("Nombre").pressSequentially(campaignName, { delay: 14 });
  await page.getByLabel("Descripción").pressSequentially("Campaña demo delimitada por zona geográfica.", { delay: 10 });
  await page.getByLabel("Modo de acumulación").selectOption("amount");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Crear campaña" }).click();
  await expectTextVisible(page, campaignName);
  await page.waitForTimeout(900);
  const shot1 = await screenshot(page, scenarioId, "01-campaign-new.png");

  await page.locator("li", { hasText: campaignName }).getByRole("link", { name: "Abrir" }).click();
  await expect(page.getByRole("heading", { name: campaignName })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Modificar" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Mapa" }).click();
  await page.locator(".leaflet-marker-icon").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Área rectangular" }).click();
  const map = page.locator(".leaflet-container").last();
  const box = await map.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width * 0.12, box.y + box.height * 0.15);
    await page.mouse.click(box.x + box.width * 0.88, box.y + box.height * 0.85);
  }
  await expect(page.getByRole("button", { name: "Guardar alcance" })).toBeEnabled({ timeout: 10_000 });
  await page.waitForTimeout(900);
  const shot2 = await screenshot(page, scenarioId, "02-campaign-map.png");

  await page.getByRole("button", { name: "Guardar alcance" }).click();
  await expectTextVisible(page, /Mapa de tiendas participantes/i);
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /Agregar politica/i }).click();
  await page.getByLabel("Tipo").selectOption("min_amount");
  await page.getByLabel("Periodo").selectOption("transaction");
  await page.getByLabel("Valor").pressSequentially("120", { delay: 40 });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Agregar politica" }).last().click();
  await expectTextVisible(page, /Compra mínima/i);
  await page.waitForTimeout(900);
  const shot3 = await screenshot(page, scenarioId, "03-campaign-rules.png");

  await context.close();
  const flowVideo = await saveVideo(page, scenarioId, "01-campaign-flow.webm");
  return { screenshots: [shot1, shot2, shot3], videos: [flowVideo].filter(Boolean) as string[] };
};

await ensureBaseDirs();
if (!(await fileExists(path.join(publicDir, "generated", "demo-state.json")))) {
  throw new Error(stateRequiredMessage);
}

const scenarioIds = parseScenarioArg();
const browser = await chromium.launch({ headless: true });
const manifests: Record<string, RecordingResult> = {};

try {
  for (const scenarioId of scenarioIds) {
    console.log(`Recording ${scenarioId}...`);
    manifests[scenarioId] = scenarioId === "pos-wallet"
      ? await recordPosWallet(browser)
      : scenarioId === "inventory-intake"
        ? await recordInventory(browser)
        : await recordCampaigns(browser);
    await writeJson(path.join(scenarioRecordingDir(scenarioId), "manifest.json"), {
      scenarioId,
      generatedAt: new Date().toISOString(),
      screenshots: manifests[scenarioId].screenshots,
      videos: manifests[scenarioId].videos,
    });
  }
} finally {
  await browser.close();
}

console.log(`Recorded scenarios: ${scenarioIds.join(", ")}`);
