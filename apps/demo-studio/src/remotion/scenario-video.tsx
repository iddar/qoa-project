import {
  AbsoluteFill,
  Freeze,
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

type DeviceFrameSize = "default" | "compact" | "split" | "wide";

const DeviceFrame = ({
  media,
  accent,
  compact = false,
  size,
}: {
  media: SceneMedia;
  accent: string;
  compact?: boolean;
  size?: DeviceFrameSize;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const playbackRate = media.videoPlaybackRate ?? 0.72;
  const trimBefore = Math.round((media.videoStartSeconds ?? 0) * fps);
  const freezeAtFrame = media.freezeAtSeconds === undefined ? null : Math.round(media.freezeAtSeconds * fps);
  const playForFrames = media.videoPlayForSeconds === undefined ? null : Math.round(media.videoPlayForSeconds * fps);
  const prerollFrames = media.video ? Math.round((media.videoPrerollSeconds ?? 0.4) * fps) : 0;
  const loopDuration = Math.max(1, Math.round((media.videoLoopSeconds ?? 22) * fps));
  const resolvedSize = size ?? (compact ? "compact" : "default");
  const width = media.phone
    ? resolvedSize === "split"
      ? 420
      : resolvedSize === "compact"
        ? 400
        : 470
    : resolvedSize === "compact"
      ? 1040
      : resolvedSize === "wide"
        ? 1350
      : 1180;
  const height = media.phone
    ? resolvedSize === "split"
      ? 910
      : resolvedSize === "compact"
        ? 850
        : 1000
    : resolvedSize === "compact"
      ? 710
      : resolvedSize === "wide"
        ? 900
      : 800;
  const videoNode = media.video ? (
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
  ) : null;
  const screenshotNode = (
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
  );
  const posterNode = (
    <Img
      src={staticFile(media.videoPoster ?? media.screenshot)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        objectPosition: "center",
        background: "#f8fafc",
      }}
    />
  );

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
        {media.video && videoNode ? (
          frame < prerollFrames ? (
            posterNode
          ) : playForFrames !== null ? (
            frame < prerollFrames + playForFrames ? (
              videoNode
            ) : (
              screenshotNode
            )
          ) : (
            <Loop durationInFrames={loopDuration}>
              {freezeAtFrame === null ? videoNode : <Freeze frame={freezeAtFrame}>{videoNode}</Freeze>}
            </Loop>
          )
        ) : (
          screenshotNode
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

const splitIntroSeconds = 5;
const splitSceneSeconds = 18;
const splitSceneSpacingSeconds = 18;
const splitClosingSeconds = 10;
const posClosingSeconds = 7;

type PosBeat = {
  id: string;
  durationSeconds: number;
  activeSide: "left" | "right";
  left: SceneMedia;
  right: SceneMedia;
  narrative: string;
};

const posBeats: PosBeat[] = [
  {
    id: "voice-order",
    durationSeconds: 11,
    activeSide: "left",
    narrative: "Tendero: dicta el pedido; la IA arma el carrito y deja el total listo para cobrar.",
    left: {
      label: "POS",
      screenshot: "recordings/pos-wallet/01-pos-order.png",
      video: "recordings/pos-wallet/01-pos-flow.webm",
      videoPoster: "recordings/pos-wallet/00-pos-agent-start.png",
      videoPlaybackRate: 0.55,
      videoPlayForSeconds: 7.4,
      videoStartSeconds: 0,
      phone: true,
      cursor: { x: 83, y: 93, label: "enviar voz" },
    },
    right: {
      label: "Wallet",
      screenshot: "recordings/pos-wallet/00-wallet-home.png",
      phone: true,
      cursor: { x: 53, y: 43, label: "progreso" },
    },
  },
  {
    id: "client-wallet",
    durationSeconds: 11,
    activeSide: "right",
    narrative: "Cliente: abre su wallet y muestra su QR de lealtad, sin formularios ni fricción.",
    left: {
      label: "POS",
      screenshot: "recordings/pos-wallet/01-pos-order.png",
      phone: true,
      cursor: { x: 39, y: 23, label: "pedido listo" },
    },
    right: {
      label: "Wallet",
      screenshot: "recordings/pos-wallet/00-wallet-card.png",
      video: "recordings/pos-wallet/02-wallet-card.webm",
      videoPlaybackRate: 0.74,
      videoPlayForSeconds: 5.5,
      videoStartSeconds: 0,
      phone: true,
      cursor: { x: 28, y: 44, label: "ver tarjeta" },
    },
  },
  {
    id: "qr-scan",
    durationSeconds: 12,
    activeSide: "left",
    narrative: "Tendero: escanea el QR desde el POS y liga la venta al cliente correcto.",
    left: {
      label: "POS",
      screenshot: "recordings/pos-wallet/02-pos-linked.png",
      video: "recordings/pos-wallet/01-pos-flow.webm",
      videoPoster: "recordings/pos-wallet/02-pos-scanner-start.png",
      videoPlaybackRate: 0.64,
      videoPlayForSeconds: 5,
      videoStartSeconds: 4.6,
      phone: true,
      cursor: { x: 50, y: 50, label: "leer QR" },
    },
    right: {
      label: "Wallet",
      screenshot: "recordings/pos-wallet/00-wallet-card.png",
      phone: true,
      cursor: { x: 51, y: 54, label: "QR activo" },
    },
  },
  {
    id: "sale-confirmation",
    durationSeconds: 11,
    activeSide: "left",
    narrative: "Tendero: confirma la venta; QOA calcula puntos y campañas en el mismo paso.",
    left: {
      label: "POS",
      screenshot: "recordings/pos-wallet/04-pos-success.png",
      video: "recordings/pos-wallet/01-pos-flow.webm",
      videoPoster: "recordings/pos-wallet/03-pos-confirm.png",
      videoPlaybackRate: 0.62,
      videoPlayForSeconds: 4.2,
      videoStartSeconds: 8.1,
      phone: true,
      cursor: { x: 52, y: 82, label: "confirmar venta" },
    },
    right: {
      label: "Wallet",
      screenshot: "recordings/pos-wallet/00-wallet-card.png",
      phone: true,
      cursor: { x: 51, y: 54, label: "QR ligado" },
    },
  },
  {
    id: "wallet-points",
    durationSeconds: 8,
    activeSide: "right",
    narrative: "Cliente: vuelve a su wallet y ve puntos, avance de campaña y saldo actualizados.",
    left: {
      label: "POS",
      screenshot: "recordings/pos-wallet/04-pos-success.png",
      phone: true,
      cursor: { x: 50, y: 66, label: "venta registrada" },
    },
    right: {
      label: "Wallet",
      screenshot: "recordings/pos-wallet/03-wallet-updated.png",
      phone: true,
      cursor: { x: 50, y: 16, label: "puntos" },
    },
  },
  {
    id: "wallet-history",
    durationSeconds: 10,
    activeSide: "right",
    narrative: "Cliente: revisa el historial y confirma que la compra de $75 quedó registrada.",
    left: {
      label: "POS",
      screenshot: "recordings/pos-wallet/04-pos-success.png",
      phone: true,
      cursor: { x: 50, y: 66, label: "venta registrada" },
    },
    right: {
      label: "Wallet",
      screenshot: "recordings/pos-wallet/03-wallet-history.png",
      video: "recordings/pos-wallet/03-wallet-flow.webm",
      videoPlaybackRate: 0.72,
      videoPlayForSeconds: 2.6,
      videoStartSeconds: 1.4,
      phone: true,
      cursor: { x: 70, y: 38, label: "última compra" },
    },
  },
];

const SplitIntro = ({ scenario }: { scenario: Scenario }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const leftProgress = spring({ frame, fps, config: { damping: 19, stiffness: 92 } });
  const rightProgress = spring({ frame: Math.max(0, frame - 7), fps, config: { damping: 19, stiffness: 92 } });

  return (
    <AbsoluteFill style={{ background: "#f8fafc", color: "#111827", fontFamily: "Inter, Arial, sans-serif" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", width: "100%", height: "100%" }}>
        <div
          style={{
            padding: "120px 86px",
            borderRight: "2px solid #111827",
            background: "#ffffff",
            transform: `translateX(${interpolate(leftProgress, [0, 1], [-42, 0])}px)`,
            opacity: leftProgress,
          }}
        >
          <div style={{ color: scenario.accent, fontSize: 24, fontWeight: 900, marginBottom: 30 }}>
            HISTORIA DEL TENDERO
          </div>
          <h1 style={{ ...titleStyle, fontSize: 82, lineHeight: 0.95, margin: 0 }}>
            La venta nace de una nota de voz.
          </h1>
          <p style={{ color: "#334155", fontSize: 30, lineHeight: 1.22, marginTop: 34, maxWidth: 700 }}>
            IA convierte intención en carrito, liga identidad y confirma puntos sin captura manual.
          </p>
        </div>

        <div
          style={{
            padding: "120px 86px",
            background: "#111827",
            color: "white",
            transform: `translateX(${interpolate(rightProgress, [0, 1], [42, 0])}px)`,
            opacity: rightProgress,
          }}
        >
          <div style={{ color: scenario.accent, fontSize: 24, fontWeight: 900, marginBottom: 30 }}>
            HISTORIA DEL CLIENTE
          </div>
          <h2 style={{ ...titleStyle, fontSize: 82, lineHeight: 0.95, margin: 0 }}>
            La wallet responde en tiempo real.
          </h2>
          <p style={{ color: "#d1d5db", fontSize: 30, lineHeight: 1.22, marginTop: 34, maxWidth: 700 }}>
            El QR identifica al usuario y la última transacción queda visible al terminar la compra.
          </p>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 44,
          transform: "translateX(-50%)",
          background: "#111827",
          color: "white",
          border: "2px solid #ffffff",
          boxShadow: "0 22px 60px rgba(15,23,42,0.22)",
          borderRadius: 12,
          padding: "14px 24px",
          fontSize: 20,
          fontWeight: 900,
          letterSpacing: 0,
        }}
      >
        QOA DEMO STUDIO · POS + WALLET · DOS USUARIOS
      </div>
    </AbsoluteFill>
  );
};

const FocusOverlay = ({
  media,
  accent,
  localFrame,
  durationFrames,
}: {
  media: SceneMedia;
  accent: string;
  localFrame: number;
  durationFrames: number;
}) => {
  const cursor = media.cursor;

  if (!cursor) {
    return null;
  }

  const cursorOpacity = interpolate(localFrame, [10, 18, durationFrames - 16, durationFrames - 8], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pulseScale = 1 + Math.sin(localFrame / 5) * 0.045;

  return (
    <div
      style={{
        position: "absolute",
        inset: media.phone ? 12 : 14,
        borderRadius: media.phone ? 42 : 18,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 8,
      }}
    >
      <>
        <div
          style={{
            position: "absolute",
            left: `${cursor.x}%`,
            top: `${cursor.y}%`,
            width: 58,
            height: 58,
            borderRadius: 999,
            border: `4px solid ${accent}`,
            opacity: cursorOpacity,
            transform: `translate(-50%, -50%) scale(${pulseScale})`,
            boxShadow: `0 0 28px ${accent}99`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${cursor.x}%`,
            top: `${cursor.y}%`,
            width: 31,
            height: 39,
            opacity: cursorOpacity,
            transform: "translate(8px, 8px) rotate(-12deg)",
            background: "#ffffff",
            clipPath: "polygon(0 0, 0 34px, 10px 25px, 16px 39px, 24px 35px, 18px 22px, 31px 22px)",
            filter: "drop-shadow(0 6px 8px rgba(15,23,42,0.45))",
          }}
        />
      </>
    </div>
  );
};

const TypewriterText = ({
  text,
  frame,
  startFrame = 0,
  charsPerSecond = 36,
}: {
  text: string;
  frame: number;
  startFrame?: number;
  charsPerSecond?: number;
}) => {
  const { fps } = useVideoConfig();
  const visibleCharacters = Math.min(
    text.length,
    Math.max(0, Math.floor(((frame - startFrame) / fps) * charsPerSecond)),
  );
  const isComplete = visibleCharacters >= text.length;
  const caretVisible = !isComplete && Math.floor(frame / 12) % 2 === 0;

  return (
    <>
      {text.slice(0, visibleCharacters)}
      <span style={{ opacity: caretVisible ? 0.85 : 0 }}>|</span>
    </>
  );
};

const NarrativeOverlay = ({
  scenario,
  label,
  text,
  localFrame,
  align = "center",
  maxWidth = 1080,
}: {
  scenario: Scenario;
  label: string;
  text: string;
  localFrame: number;
  align?: "center" | "left";
  maxWidth?: number;
}) => {
  const entrance = interpolate(localFrame, [4, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: align === "center" ? "50%" : 74,
        bottom: 34,
        width: `min(${maxWidth}px, calc(100% - 148px))`,
        transform:
          align === "center"
            ? `translateX(-50%) translateY(${interpolate(entrance, [0, 1], [26, 0])}px)`
            : `translateY(${interpolate(entrance, [0, 1], [26, 0])}px)`,
        opacity: entrance,
        zIndex: 50,
        borderRadius: 20,
        background: "rgba(255, 255, 255, 0.94)",
        border: "1px solid rgba(15, 23, 42, 0.09)",
        boxShadow: "0 26px 80px rgba(15,23,42,0.22)",
        padding: "18px 22px",
        color: "#111827",
      }}
    >
      <div style={{ color: scenario.accent, fontSize: 15, fontWeight: 900, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 25, lineHeight: 1.18, fontWeight: 780, overflowWrap: "break-word" }}>
        <TypewriterText text={text} frame={localFrame} startFrame={12} charsPerSecond={42} />
      </div>
    </div>
  );
};

const getSplitFocus = (sceneId: string, localFrame: number, durationFrames: number): "left" | "right" => {
  const midpoint = durationFrames * 0.52;

  if (sceneId === "pos-agent") {
    return localFrame < midpoint ? "left" : "right";
  }

  if (sceneId === "pos-success") {
    return localFrame < midpoint ? "right" : "left";
  }

  return localFrame < midpoint ? "left" : "right";
};

const SplitPanel = ({
  media,
  side,
  scenario,
  localFrame,
  durationFrames,
  active,
}: {
  media: SceneMedia;
  side: "left" | "right";
  scenario: Scenario;
  localFrame: number;
  durationFrames: number;
  active: boolean;
}) => {
  const { fps } = useVideoConfig();
  const isRight = side === "right";
  const delayedFrame = Math.max(0, localFrame + 8 - (isRight ? 3 : 0));
  const entrance = spring({ frame: delayedFrame, fps, config: { damping: 24, stiffness: 96 } });
  const panelBg = isRight ? "#111827" : "#ffffff";
  const foreground = isRight ? "#ffffff" : "#111827";
  const role = isRight ? "CLIENTE" : "TENDERO";
  const focusOpacity = active ? 1 : 0.5;
  const focusScale = active ? 1 : 0.965;

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        background: panelBg,
        color: foreground,
        height: "100%",
        transition: "opacity 160ms linear",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 44,
          left: 54,
          right: 54,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 12,
          opacity: entrance,
        }}
      >
        <div>
          <div style={{ color: scenario.accent, fontSize: 18, fontWeight: 900, marginBottom: 5 }}>{role}</div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{media.label ?? role}</div>
        </div>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            background: scenario.accent,
            boxShadow: `0 0 22px ${scenario.accent}`,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: 86,
          left: "50%",
          transform: `translateX(-50%) translateY(${interpolate(entrance, [0, 1], [46, 0])}px) scale(${interpolate(entrance, [0, 1], [0.975, focusScale])})`,
          opacity: entrance * focusOpacity,
          filter: active ? "saturate(1) brightness(1)" : "saturate(0.7) brightness(0.76)",
        }}
      >
        <div style={{ position: "relative" }}>
          <DeviceFrame media={media} accent={scenario.accent} size="split" />
          <FocusOverlay media={media} accent={scenario.accent} localFrame={localFrame} durationFrames={durationFrames} />
        </div>
      </div>
    </div>
  );
};

const getPosBeatStartSeconds = (index: number) =>
  splitIntroSeconds + posBeats.slice(0, index).reduce((total, beat) => total + beat.durationSeconds, 0);

const PosBeatSequence = ({ beat, index, scenario }: { beat: PosBeat; index: number; scenario: Scenario }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const from = fps * getPosBeatStartSeconds(index);
  const durationFrames = fps * beat.durationSeconds;
  const localFrame = frame - from;
  const activeLabel = beat.activeSide === "left" ? "TENDERO" : "CLIENTE";

  return (
    <Sequence from={from} durationInFrames={durationFrames}>
      <AbsoluteFill style={{ background: "#f8fafc" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", width: "100%", height: "100%" }}>
          <SplitPanel
            media={beat.left}
            side="left"
            scenario={scenario}
            localFrame={localFrame}
            durationFrames={durationFrames}
            active={beat.activeSide === "left"}
          />
          <SplitPanel
            media={beat.right}
            side="right"
            scenario={scenario}
            localFrame={localFrame}
            durationFrames={durationFrames}
            active={beat.activeSide === "right"}
          />
        </div>
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "50%",
            width: 3,
            transform: "translateX(-50%)",
            background: "#111827",
            zIndex: 28,
          }}
        />
        <NarrativeOverlay
          scenario={scenario}
          label={`${activeLabel} · ${index + 1}/${posBeats.length}`}
          text={beat.narrative}
          localFrame={localFrame}
          maxWidth={1040}
        />
      </AbsoluteFill>
    </Sequence>
  );
};

const SplitSceneSequence = ({
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
  const from = fps * splitIntroSeconds + index * fps * splitSceneSpacingSeconds;
  const durationFrames = fps * splitSceneSeconds;
  const localFrame = frame - from;
  const secondary = scene.secondary ?? scene;
  const activeSide = getSplitFocus(scene.id, localFrame, durationFrames);
  const activeMedia = activeSide === "left" ? scene : secondary;
  const activeLabel = activeSide === "left" ? "NARRATIVA DEL TENDERO" : "NARRATIVA DEL CLIENTE";
  const switchFrame = Math.round(durationFrames * 0.52);
  const narrativeFrame = localFrame >= switchFrame ? localFrame - switchFrame : localFrame;

  return (
    <Sequence from={from} durationInFrames={durationFrames}>
      <AbsoluteFill style={{ background: "#f8fafc" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", width: "100%", height: "100%" }}>
          <SplitPanel
            media={scene}
            side="left"
            scenario={scenario}
            localFrame={localFrame}
            durationFrames={durationFrames}
            active={activeSide === "left"}
          />
          <SplitPanel
            media={secondary}
            side="right"
            scenario={scenario}
            localFrame={localFrame}
            durationFrames={durationFrames}
            active={activeSide === "right"}
          />
        </div>
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "50%",
            width: 3,
            transform: "translateX(-50%)",
            background: "#111827",
            zIndex: 28,
          }}
        />
        <NarrativeOverlay
          scenario={scenario}
          label={activeLabel}
          text={activeMedia.narrative ?? scene.caption}
          localFrame={narrativeFrame}
          maxWidth={1040}
        />
      </AbsoluteFill>
    </Sequence>
  );
};

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
  const durationFrames = fps * sceneDurationSeconds;
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
            <div style={{ position: "relative", display: "inline-block" }}>
              <DeviceWithLabel media={scene} accent={scenario.accent} compact={hasSecondary} />
              <FocusOverlay
                media={scene}
                accent={scenario.accent}
                localFrame={localFrame}
                durationFrames={durationFrames}
              />
            </div>
          </div>
          {scene.secondary ? (
            <div
              style={{
                transform: `translateY(${interpolate(entrance, [0, 1], [80, 0])}px) scale(${interpolate(entrance, [0, 1], [0.96, 1])})`,
                opacity: entrance,
              }}
            >
              <div style={{ position: "relative", display: "inline-block" }}>
                <DeviceWithLabel media={scene.secondary} accent={scenario.accent} compact />
                <FocusOverlay
                  media={scene.secondary}
                  accent={scenario.accent}
                  localFrame={localFrame}
                  durationFrames={durationFrames}
                />
              </div>
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
              <TypewriterText text={scene.narrative ?? scene.caption} frame={localFrame} startFrame={14} charsPerSecond={38} />
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

const inventoryIntroSeconds = 6;
const inventoryClosingSeconds = 8;
const campaignIntroSeconds = 6;
const campaignClosingSeconds = 8;

type StudioBeat = {
  id: string;
  durationSeconds: number;
  stepLabel: string;
  title: string;
  narrative: string;
  media: SceneMedia;
};

const inventoryBeats: StudioBeat[] = [
  {
    id: "inventory-assistant-open",
    durationSeconds: 10,
    stepLabel: "Operador",
    title: "El asistente abre el flujo de inventario",
    narrative: "El operador parte de inventario real: abre el asistente y prepara la evidencia del proveedor.",
    media: {
      label: "Store Dashboard",
      screenshot: "recordings/inventory-intake/01-inventory-photo.png",
      video: "recordings/inventory-intake/01-inventory-flow.webm",
      videoPlaybackRate: 0.72,
      videoPlayForSeconds: 5.8,
      videoStartSeconds: 0,
      cursor: { x: 86, y: 40, label: "subir foto" },
    },
  },
  {
    id: "inventory-photo-capture",
    durationSeconds: 11,
    stepLabel: "Foto",
    title: "El ticket se captura dentro del flujo",
    narrative: "La foto del ticket entra como evidencia y el asistente la convierte en un borrador revisable.",
    media: {
      label: "Store Dashboard",
      screenshot: "recordings/inventory-intake/01-inventory-photo.png",
      video: "recordings/inventory-intake/01-inventory-flow.webm",
      videoPlaybackRate: 0.72,
      videoPlayForSeconds: 3.4,
      videoStartSeconds: 3,
      cursor: { x: 80, y: 51, label: "ticket detectado" },
    },
  },
  {
    id: "inventory-preview",
    durationSeconds: 10,
    stepLabel: "IA",
    title: "Vista previa antes de tocar stock",
    narrative: "El sistema propone productos, cantidades y coincidencias; el operador conserva el control.",
    media: {
      label: "Store Dashboard",
      screenshot: "recordings/inventory-intake/01-inventory-photo.png",
      cursor: { x: 64, y: 48, label: "vista previa" },
    },
  },
  {
    id: "inventory-voice-correction",
    durationSeconds: 11,
    stepLabel: "Corrección por voz",
    title: "Corrección natural por voz",
    narrative: "La voz corrige cantidades puntuales y deja claro qué cambió antes de aplicar la entrada.",
    media: {
      label: "Store Dashboard",
      screenshot: "recordings/inventory-intake/02-inventory-corrected.png",
      video: "recordings/inventory-intake/01-inventory-flow.webm",
      videoPlaybackRate: 0.72,
      videoPlayForSeconds: 2.6,
      videoStartSeconds: 6.6,
      cursor: { x: 84, y: 58, label: "corrección" },
    },
  },
  {
    id: "inventory-apply-stock",
    durationSeconds: 10,
    stepLabel: "Confirmación",
    title: "Confirmación con trazabilidad",
    narrative: "Al confirmar, QOA actualiza stock y conserva el origen de cada ajuste.",
    media: {
      label: "Store Dashboard",
      screenshot: "recordings/inventory-intake/03-inventory-stock.png",
      video: "recordings/inventory-intake/01-inventory-flow.webm",
      videoPlaybackRate: 0.72,
      videoPlayForSeconds: 2.2,
      videoStartSeconds: 8,
      cursor: { x: 70, y: 35, label: "stock actualizado" },
    },
  },
  {
    id: "inventory-audit",
    durationSeconds: 10,
    stepLabel: "Resultado",
    title: "Inventario listo para operar",
    narrative: "El equipo termina con existencias actualizadas, historial y menos captura manual.",
    media: {
      label: "Store Dashboard",
      screenshot: "recordings/inventory-intake/03-inventory-stock.png",
      cursor: { x: 38, y: 68, label: "historial" },
    },
  },
];

const campaignBeats: StudioBeat[] = [
  {
    id: "campaign-create",
    durationSeconds: 12,
    stepLabel: "Marketing",
    title: "La campaña nace con intención comercial",
    narrative: "Marketing define objetivo, vigencia y mecánica desde el portal.",
    media: {
      label: "CPG Portal",
      screenshot: "recordings/geo-campaigns/01-campaign-new.png",
      video: "recordings/geo-campaigns/01-campaign-flow.webm",
      videoPlaybackRate: 0.74,
      videoPlayForSeconds: 4,
      videoStartSeconds: 0,
      cursor: { x: 74, y: 36, label: "crear" },
    },
  },
  {
    id: "campaign-detail",
    durationSeconds: 12,
    stepLabel: "Campaña",
    title: "El borrador queda listo para avanzar",
    narrative: "La campaña queda en borrador con estado, métricas y configuración visibles para el equipo.",
    media: {
      label: "CPG Portal",
      screenshot: "recordings/geo-campaigns/01-campaign-new.png",
      video: "recordings/geo-campaigns/01-campaign-flow.webm",
      videoPlaybackRate: 0.74,
      videoPlayForSeconds: 2.4,
      videoStartSeconds: 3.2,
      cursor: { x: 90, y: 13, label: "detalle" },
    },
  },
  {
    id: "campaign-scope",
    durationSeconds: 13,
    stepLabel: "Alcance",
    title: "La zona convierte territorio en cobertura",
    narrative: "El equipo abre alcance, dibuja la zona y convierte territorio en tiendas accionables.",
    media: {
      label: "CPG Portal",
      screenshot: "recordings/geo-campaigns/02-campaign-map.png",
      video: "recordings/geo-campaigns/01-campaign-flow.webm",
      videoPlaybackRate: 0.74,
      videoPlayForSeconds: 3.2,
      videoStartSeconds: 4.7,
      cursor: { x: 80, y: 45, label: "mapa" },
    },
  },
  {
    id: "campaign-map-saved",
    durationSeconds: 12,
    stepLabel: "Cobertura",
    title: "Tiendas seleccionadas con claridad",
    narrative: "La cobertura queda guardada con tiendas seleccionadas y una vista fácil de auditar.",
    media: {
      label: "CPG Portal",
      screenshot: "recordings/geo-campaigns/02-campaign-map.png",
      cursor: { x: 76, y: 28, label: "tiendas" },
    },
  },
  {
    id: "campaign-rule",
    durationSeconds: 12,
    stepLabel: "Reglas",
    title: "Reglas comerciales medibles",
    narrative: "Las reglas traducen la estrategia comercial en incentivos medibles.",
    media: {
      label: "CPG Portal",
      screenshot: "recordings/geo-campaigns/03-campaign-rules.png",
      video: "recordings/geo-campaigns/01-campaign-flow.webm",
      videoPlaybackRate: 0.74,
      videoPlayForSeconds: 2.6,
      videoStartSeconds: 7.4,
      cursor: { x: 82, y: 63, label: "agregar regla" },
    },
  },
  {
    id: "campaign-ready",
    durationSeconds: 10,
    stepLabel: "Activación",
    title: "La campaña queda lista para operar",
    narrative: "Zona, tiendas y reglas quedan listas para revisión, activación y medición.",
    media: {
      label: "CPG Portal",
      screenshot: "recordings/geo-campaigns/03-campaign-rules.png",
      cursor: { x: 72, y: 26, label: "lista" },
    },
  },
];

const InventoryIntro = ({ scenario }: { scenario: Scenario }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 20, stiffness: 96 } });

  return (
    <AbsoluteFill
      style={{
        background: "#f8fafc",
        color: "#111827",
        fontFamily: "Inter, Arial, sans-serif",
        justifyContent: "center",
        padding: "96px 110px",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          transform: `translateY(${interpolate(progress, [0, 1], [34, 0])}px)`,
          opacity: progress,
        }}
      >
        <div style={{ color: scenario.accent, fontSize: 28, fontWeight: 900, marginBottom: 22 }}>
          ASISTENTE DE INVENTARIO EN VIVO
        </div>
        <h1 style={{ ...titleStyle, fontSize: 78, lineHeight: 0.96, margin: 0 }}>
          De evidencia de proveedor a inventario confiable.
        </h1>
        <p style={{ color: "#334155", fontSize: 31, lineHeight: 1.24, marginTop: 30, maxWidth: 1040 }}>
          QOA convierte foto y voz en una revisión guiada: el operador valida, corrige y confirma antes de mover stock.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const getStudioBeatStartSeconds = (introSeconds: number, beats: StudioBeat[], index: number) =>
  introSeconds + beats.slice(0, index).reduce((total, beat) => total + beat.durationSeconds, 0);

const StudioBeatSequence = ({
  beat,
  index,
  total,
  scenario,
  introSeconds,
  beats,
  accentLabel,
}: {
  beat: StudioBeat;
  index: number;
  total: number;
  scenario: Scenario;
  introSeconds: number;
  beats: StudioBeat[];
  accentLabel: string;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const from = fps * getStudioBeatStartSeconds(introSeconds, beats, index);
  const durationFrames = fps * beat.durationSeconds;
  const localFrame = frame - from;
  const entrance = spring({ frame: Math.max(0, localFrame + 10), fps, config: { damping: 24, stiffness: 104 } });

  return (
    <Sequence from={from} durationInFrames={durationFrames}>
      <AbsoluteFill
        style={{
          background: "#f8fafc",
          color: "#111827",
          fontFamily: "Inter, Arial, sans-serif",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 38,
            left: 70,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            gap: 18,
            opacity: interpolate(localFrame, [0, 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 999,
              background: scenario.accent,
              color: "white",
              display: "grid",
              placeItems: "center",
              fontSize: 21,
              fontWeight: 900,
            }}
          >
            {index + 1}
          </div>
          <div>
            <div style={{ color: scenario.accent, fontSize: 16, fontWeight: 900 }}>{accentLabel}</div>
            <div style={{ fontSize: 31, fontWeight: 900 }}>{beat.title}</div>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: 104,
            left: "50%",
            transform: `translateX(-50%) translateY(${interpolate(entrance, [0, 1], [50, 0])}px) scale(${interpolate(entrance, [0, 1], [0.965, 1])})`,
            opacity: entrance,
          }}
        >
          <div style={{ position: "relative", display: "inline-block" }}>
            <DeviceFrame media={beat.media} accent={scenario.accent} size="wide" />
            <FocusOverlay media={beat.media} accent={scenario.accent} localFrame={localFrame} durationFrames={durationFrames} />
          </div>
        </div>

        <NarrativeOverlay
          scenario={scenario}
          label={`${beat.stepLabel.toUpperCase()} · ${index + 1}/${total}`}
          text={beat.narrative}
          localFrame={localFrame}
          align="left"
          maxWidth={1160}
        />
      </AbsoluteFill>
    </Sequence>
  );
};

const Closing = ({ scenario }: { scenario: Scenario }) => (
  <AbsoluteFill
    style={{
      background: "#111827",
      color: "white",
      fontFamily: "Inter, Arial, sans-serif",
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

const SplitScenarioVideo = ({ scenario }: { scenario: Scenario }) => {
  const { fps } = useVideoConfig();
  const closingFrom = fps * (splitIntroSeconds + posBeats.reduce((total, beat) => total + beat.durationSeconds, 0));

  return (
    <AbsoluteFill style={{ background: "#f8fafc", fontFamily: "Inter, Arial, sans-serif" }}>
      <Sequence durationInFrames={fps * splitIntroSeconds}>
        <SplitIntro scenario={scenario} />
      </Sequence>

      {posBeats.map((beat, index) => (
        <PosBeatSequence key={beat.id} beat={beat} index={index} scenario={scenario} />
      ))}

      <Sequence from={closingFrom} durationInFrames={fps * posClosingSeconds}>
        <Closing scenario={scenario} />
      </Sequence>
    </AbsoluteFill>
  );
};

const CampaignIntro = ({ scenario }: { scenario: Scenario }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 20, stiffness: 96 } });

  return (
    <AbsoluteFill
      style={{
        background: "#f8fafc",
        color: "#111827",
        fontFamily: "Inter, Arial, sans-serif",
        justifyContent: "center",
        padding: "96px 110px",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          transform: `translateY(${interpolate(progress, [0, 1], [34, 0])}px)`,
          opacity: progress,
        }}
      >
        <div style={{ color: scenario.accent, fontSize: 28, fontWeight: 900, marginBottom: 22 }}>
          CPG PORTAL EN DESKTOP
        </div>
        <h1 style={{ ...titleStyle, fontSize: 78, lineHeight: 0.96, margin: 0 }}>
          De territorio comercial a campaña medible.
        </h1>
        <p style={{ color: "#334155", fontSize: 31, lineHeight: 1.24, marginTop: 30, maxWidth: 1040 }}>
          El portal conecta objetivo, cobertura y reglas para activar promociones con control operativo.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const InventoryScenarioVideo = ({ scenario }: { scenario: Scenario }) => {
  const { fps } = useVideoConfig();
  const closingFrom =
    fps * (inventoryIntroSeconds + inventoryBeats.reduce((total, beat) => total + beat.durationSeconds, 0));

  return (
    <AbsoluteFill style={{ background: "#f8fafc", fontFamily: "Inter, Arial, sans-serif" }}>
      <Sequence durationInFrames={fps * inventoryIntroSeconds}>
        <InventoryIntro scenario={scenario} />
      </Sequence>

      {inventoryBeats.map((beat, index) => (
        <StudioBeatSequence
          key={beat.id}
          beat={beat}
          index={index}
          total={inventoryBeats.length}
          scenario={scenario}
          introSeconds={inventoryIntroSeconds}
          beats={inventoryBeats}
          accentLabel="ASISTENTE PRESENTE"
        />
      ))}

      <Sequence from={closingFrom} durationInFrames={fps * inventoryClosingSeconds}>
        <Closing scenario={scenario} />
      </Sequence>
    </AbsoluteFill>
  );
};

const CampaignScenarioVideo = ({ scenario }: { scenario: Scenario }) => {
  const { fps } = useVideoConfig();
  const closingFrom =
    fps * (campaignIntroSeconds + campaignBeats.reduce((total, beat) => total + beat.durationSeconds, 0));

  return (
    <AbsoluteFill style={{ background: "#f8fafc", fontFamily: "Inter, Arial, sans-serif" }}>
      <Sequence durationInFrames={fps * campaignIntroSeconds}>
        <CampaignIntro scenario={scenario} />
      </Sequence>

      {campaignBeats.map((beat, index) => (
        <StudioBeatSequence
          key={beat.id}
          beat={beat}
          index={index}
          total={campaignBeats.length}
          scenario={scenario}
          introSeconds={campaignIntroSeconds}
          beats={campaignBeats}
          accentLabel="FLUJO COMERCIAL"
        />
      ))}

      <Sequence from={closingFrom} durationInFrames={fps * campaignClosingSeconds}>
        <Closing scenario={scenario} />
      </Sequence>
    </AbsoluteFill>
  );
};

export const ScenarioVideo = ({ scenario }: { scenario: Scenario }) => {
  const { fps, durationInFrames } = useVideoConfig();

  if (scenario.id === "pos-wallet") {
    return <SplitScenarioVideo scenario={scenario} />;
  }

  if (scenario.id === "inventory-intake") {
    return <InventoryScenarioVideo scenario={scenario} />;
  }

  if (scenario.id === "geo-campaigns") {
    return <CampaignScenarioVideo scenario={scenario} />;
  }

  const closingSeconds = 12;
  const closingFrom = Math.min(durationInFrames - fps * closingSeconds, fps * (8 + scenario.scenes.length * 22 + 2));

  return (
    <AbsoluteFill style={{ background: "#f8fafc", fontFamily: "Inter, Arial, sans-serif" }}>
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
