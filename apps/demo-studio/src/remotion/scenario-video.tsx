import {
  AbsoluteFill,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type React from "react";
import type { Scenario, SceneMedia } from "../scenarios";

const titleStyle: React.CSSProperties = {
  fontFamily: "Inter, Arial, sans-serif",
  fontWeight: 760,
  letterSpacing: 0,
};

const TextBlock = ({ scenario }: { scenario: Scenario }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 18, stiffness: 90 } });

  return (
    <div
      style={{
        width: 650,
        transform: `translateY(${interpolate(progress, [0, 1], [36, 0])}px)`,
        opacity: progress,
      }}
    >
      <div style={{ color: scenario.accent, fontSize: 28, fontWeight: 700, marginBottom: 22 }}>
        QOA DEMO STUDIO
      </div>
      <h1 style={{ ...titleStyle, color: "#111827", fontSize: 72, lineHeight: 0.98, margin: 0 }}>
        {scenario.title}
      </h1>
      <p style={{ color: "#334155", fontSize: 30, lineHeight: 1.32, marginTop: 28 }}>
        {scenario.subtitle}
      </p>
      <div style={{ display: "grid", gap: 16, marginTop: 46 }}>
        {scenario.narrative.map((line, index) => (
          <div
            key={line}
            style={{
              display: "grid",
              gridTemplateColumns: "44px 1fr",
              gap: 16,
              alignItems: "start",
              color: "#1f2937",
              fontSize: 25,
              lineHeight: 1.24,
              opacity: interpolate(frame, [fps * (1 + index * 0.7), fps * (1.6 + index * 0.7)], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                background: scenario.accent,
                color: "white",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
              }}
            >
              {index + 1}
            </span>
            <span>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const DeviceFrame = ({ media, accent, compact = false }: { media: SceneMedia; accent: string; compact?: boolean }) => {
  const { fps } = useVideoConfig();
  const playbackRate = media.videoPlaybackRate ?? 0.72;
  const trimBefore = Math.round((media.videoStartSeconds ?? 0) * fps);
  const loopDuration = Math.max(1, Math.round((media.videoLoopSeconds ?? 22) * fps));
  const width = media.phone ? (compact ? 400 : 470) : compact ? 1040 : 1180;
  const height = media.phone ? (compact ? 850 : 1000) : compact ? 710 : 800;

  return (
    <div
      style={{
        width,
        height,
        borderRadius: media.phone ? 58 : 30,
        background: "#0f172a",
        padding: media.phone ? 12 : 14,
        boxShadow: "0 34px 90px rgba(15, 23, 42, 0.25)",
        border: `3px solid ${accent}33`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: media.phone ? 42 : 18,
          background: "#f8fafc",
          overflow: "hidden",
        }}
      >
        {media.video ? (
          <Loop durationInFrames={loopDuration}>
            <OffthreadVideo
              src={staticFile(media.video)}
              muted
              playbackRate={playbackRate}
              trimBefore={trimBefore}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                objectPosition: "center",
                background: "#f8fafc",
              }}
            />
          </Loop>
        ) : (
          <Img
            src={staticFile(media.screenshot)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition: "center",
              background: "#f8fafc",
            }}
          />
        )}
      </div>
    </div>
  );
};

const DeviceWithLabel = ({ media, accent, compact = false }: { media: SceneMedia; accent: string; compact?: boolean }) => (
  <div style={{ position: "relative", display: "inline-block" }}>
    <DeviceFrame media={media} accent={accent} compact={compact} />
    {media.label ? (
      <div
        style={{
          position: "absolute",
          top: 22,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          borderRadius: 999,
          background: "rgba(255, 255, 255, 0.9)",
          color: "#111827",
          border: `2px solid ${accent}55`,
          boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
          padding: "7px 15px",
          fontSize: 18,
          fontWeight: 800,
        }}
      >
        {media.label}
      </div>
    ) : null}
  </div>
);

const SceneSequence = ({
  scene,
  index,
  scenario,
}: {
  scene: Scenario["scenes"][number];
  index: number;
  scenario: Scenario;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const introSeconds = 8;
  const sceneSpacingSeconds = 22;
  const sceneDurationSeconds = 22;
  const localFrame = frame - fps * introSeconds - index * fps * sceneSpacingSeconds;
  const entrance = spring({ frame: Math.max(0, localFrame), fps, config: { damping: 22, stiffness: 100 } });
  const hasSecondary = Boolean(scene.secondary);

  return (
    <Sequence from={fps * introSeconds + index * fps * sceneSpacingSeconds} durationInFrames={fps * sceneDurationSeconds}>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          padding: scene.phone ? 40 : 54,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: hasSecondary
              ? "420px 420px minmax(0, 1fr)"
              : scene.phone
                ? "510px minmax(0, 1fr)"
                : "1210px minmax(0, 1fr)",
            gap: hasSecondary ? 32 : scene.phone ? 58 : 48,
            alignItems: "center",
            width: "100%",
            maxWidth: hasSecondary ? 1460 : scene.phone ? 1660 : 1810,
          }}
        >
          <div
            style={{
              transform: `translateY(${interpolate(entrance, [0, 1], [80, 0])}px) scale(${interpolate(entrance, [0, 1], [0.96, 1])})`,
              opacity: entrance,
            }}
          >
              <DeviceWithLabel media={scene} accent={scenario.accent} compact={hasSecondary} />
          </div>
          {scene.secondary ? (
            <div
              style={{
                transform: `translateY(${interpolate(entrance, [0, 1], [80, 0])}px) scale(${interpolate(entrance, [0, 1], [0.96, 1])})`,
                opacity: entrance,
              }}
            >
              <DeviceWithLabel media={scene.secondary} accent={scenario.accent} compact />
            </div>
          ) : null}
          <div style={{ maxWidth: hasSecondary ? 430 : scene.phone ? 620 : 500 }}>
            <div style={{ color: scenario.accent, fontSize: 30, fontWeight: 800, marginBottom: 20 }}>
              0{index + 1}
            </div>
            <h2 style={{ ...titleStyle, color: "#111827", fontSize: hasSecondary ? 54 : scene.phone ? 64 : 56, lineHeight: 1, margin: 0 }}>
              {scene.title}
            </h2>
            <p style={{ color: "#334155", fontSize: hasSecondary ? 27 : scene.phone ? 31 : 27, lineHeight: 1.26, marginTop: 28 }}>
              {scene.caption}
            </p>
            <div
              style={{
                marginTop: 54,
                width: 130,
                height: 8,
                borderRadius: 99,
                background: scenario.accent,
              }}
            />
          </div>
        </div>
      </AbsoluteFill>
    </Sequence>
  );
};

const Closing = ({ scenario }: { scenario: Scenario }) => (
  <AbsoluteFill
    style={{
      background: "#111827",
      color: "white",
      alignItems: "center",
      justifyContent: "center",
      padding: 120,
      textAlign: "center",
    }}
  >
    <div style={{ color: scenario.accent, fontSize: 30, fontWeight: 800, marginBottom: 28 }}>
      POTENCIADO CON IA OPERATIVA
    </div>
    <h2 style={{ ...titleStyle, maxWidth: 1200, fontSize: 84, lineHeight: 0.98, margin: 0 }}>
      Menos captura manual. Más señal accionable en cada tienda.
    </h2>
  </AbsoluteFill>
);

export const ScenarioVideo = ({ scenario }: { scenario: Scenario }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const closingSeconds = 12;
  const closingFrom = Math.min(durationInFrames - fps * closingSeconds, fps * (8 + scenario.scenes.length * 22 + 2));

  return (
    <AbsoluteFill style={{ background: "#f8fafc" }}>
      <Sequence durationInFrames={fps * 8}>
        <AbsoluteFill
          style={{
            padding: 92,
            justifyContent: "center",
            background: `linear-gradient(135deg, #ffffff 0%, #f8fafc 62%, ${scenario.accent}1f 100%)`,
          }}
        >
          <TextBlock scenario={scenario} />
        </AbsoluteFill>
      </Sequence>

      {scenario.scenes.map((scene, index) => (
        <SceneSequence key={scene.id} scene={scene} index={index} scenario={scenario} />
      ))}

      <Sequence from={closingFrom} durationInFrames={fps * closingSeconds}>
        <Closing scenario={scenario} />
      </Sequence>
    </AbsoluteFill>
  );
};
