import path from "node:path";
import { $ } from "bun";
import { appRoot, outDir, publicDir } from "../config";
import { parseScenarioArg } from "../lib/args";
import { ensureBaseDirs, fileExists } from "../lib/files";
import { getScenario, type ScenarioId } from "../scenarios";

const compositionByScenario: Record<ScenarioId, string> = {
  "pos-wallet": "PosWallet",
  "inventory-intake": "InventoryIntake",
  "geo-campaigns": "GeoCampaigns",
};

await ensureBaseDirs();
const scenarioIds = parseScenarioArg();
const entry = path.join(appRoot, "src/remotion/index.tsx");
const remotionBin = path.join(appRoot, "node_modules/.bin/remotion");

for (const scenarioId of scenarioIds) {
  const scenario = getScenario(scenarioId);
  for (const scene of scenario.scenes) {
    const mediaEntries = [scene, scene.secondary].filter(Boolean);

    for (const media of mediaEntries) {
      if (!media) continue;
      const screenshotPath = path.join(publicDir, media.screenshot);
      if (!(await fileExists(screenshotPath))) {
        throw new Error(`Missing screenshot for ${scenarioId}: ${screenshotPath}. Run demo:record first.`);
      }
      if (media.video) {
        const videoPath = path.join(publicDir, media.video);
        if (!(await fileExists(videoPath))) {
          throw new Error(`Missing interaction video for ${scenarioId}: ${videoPath}. Run demo:record first.`);
        }
      }
    }
  }

  const output = path.join(outDir, `${scenarioId}.mp4`);
  console.log(`Rendering ${scenarioId} -> ${output}`);
  await $`${remotionBin} render ${entry} ${compositionByScenario[scenarioId]} ${output} --codec h264 --overwrite`;
}
