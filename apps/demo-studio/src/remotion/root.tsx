import { Composition } from "remotion";
import { getScenario } from "../scenarios";
import { ScenarioVideo } from "./scenario-video";

const fps = 30;
const width = 1920;
const height = 1080;

const compositions = [
  { id: "PosWallet", scenario: getScenario("pos-wallet") },
  { id: "InventoryIntake", scenario: getScenario("inventory-intake") },
  { id: "GeoCampaigns", scenario: getScenario("geo-campaigns") },
];

export const RemotionRoot = () => (
  <>
    {compositions.map(({ id, scenario }) => (
      <Composition
        key={id}
        id={id}
        component={ScenarioVideo}
        durationInFrames={scenario.durationSeconds * fps}
        fps={fps}
        width={width}
        height={height}
        defaultProps={{ scenario }}
      />
    ))}
  </>
);
