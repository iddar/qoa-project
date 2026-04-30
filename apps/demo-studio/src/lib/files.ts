import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { generatedDir, outDir, recordingsDir, statePath, type DemoState } from "../config";
import { scenarioIds, type ScenarioId } from "../scenarios";

export const ensureBaseDirs = async () => {
  await mkdir(generatedDir, { recursive: true });
  await mkdir(recordingsDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  await Promise.all(scenarioIds.map((id) => mkdir(path.join(recordingsDir, id), { recursive: true })));
};

export const writeJson = async (filePath: string, value: unknown) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

export const readJson = async <T>(filePath: string) =>
  JSON.parse(await readFile(filePath, "utf8")) as T;

export const loadDemoState = async () => readJson<DemoState>(statePath);

export const fileExists = async (filePath: string) => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};

export const scenarioRecordingDir = (scenarioId: ScenarioId) => path.join(recordingsDir, scenarioId);

export const publicAssetPath = (absolutePath: string) => {
  const marker = `${path.sep}public${path.sep}`;
  const index = absolutePath.indexOf(marker);
  return index >= 0 ? absolutePath.slice(index + marker.length) : absolutePath;
};
