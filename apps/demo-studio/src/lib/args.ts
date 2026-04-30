import { scenarioIds, type ScenarioId } from "../scenarios";

export const parseScenarioArg = () => {
  const scenarioIndex = Bun.argv.findIndex((arg) => arg === "--scenario");
  const value = scenarioIndex >= 0 ? Bun.argv[scenarioIndex + 1] : "all";
  if (!value || value === "all") {
    return [...scenarioIds] as ScenarioId[];
  }

  if (!scenarioIds.includes(value as ScenarioId)) {
    throw new Error(`Invalid --scenario "${value}". Use one of: all, ${scenarioIds.join(", ")}`);
  }

  return [value as ScenarioId];
};

export const hasFlag = (flag: string) => Bun.argv.includes(flag);
