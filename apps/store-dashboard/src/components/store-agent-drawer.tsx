"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowDown, AudioLines, Bot, Camera, LoaderCircle, MessageSquarePlus, Mic, Paperclip, QrCode, ScanLine, SendHorizontal, Sparkles, Square, Trash2, X } from "lucide-react";
import { getAccessToken } from "@/lib/auth";
import { createClientId } from "@/lib/id";
import { getInitialCopilotActions } from "@/lib/store-copilot";
import { getDraftItemCount, getDraftTotal, type AgentAttachment, type AgentMessage, type StorePosDraft } from "@/lib/store-pos";
import { useStorePos } from "@/providers/store-pos-provider";

const AUDIO_PLACEHOLDER = "Adjunto una nota de voz.";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

const INITIAL_ASSISTANT_MESSAGE: AgentMessage = {
  id: "store-agent-welcome",
  role: "assistant",
  content:
    "Hola, soy tu asistente de caja. Puedo armar el pedido, ligar la tarjeta del cliente por QR y confirmar la venta cuando me lo pidas.\n\nPrueba con:\n- Agrega 2 refrescos al pedido\n- Busca unas papas para el carrito\n- Escanea la tarjeta del cliente\n- Confirma la venta actual",
  actions: getInitialCopilotActions(),
};

const readFileAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const isAppleWebKit = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent;
  return /Safari/i.test(userAgent) && !/Chrome|Chromium|Android/i.test(userAgent);
};

const AUDIO_MIME_CANDIDATES = isAppleWebKit()
  ? [
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
    ]
  : [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];

const getSupportedAudioMimeType = () => {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return null;
  }

  return AUDIO_MIME_CANDIDATES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null;
};

const getAudioExtension = (contentType: string) => {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("mp4") || contentType.includes("m4a") || contentType.includes("aac")) return "m4a";
  if (contentType.includes("mpeg")) return "mp3";
  if (contentType.includes("wav")) return "wav";
  return "webm";
};

const formatDuration = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const revokeAttachmentPreviewUrl = (attachment: AgentAttachment) => {
  if (attachment.previewUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
};

const mergeClientAttachmentFields = (serverMessage: AgentMessage, localMessages: AgentMessage[]) => {
  const localMessage = localMessages.find((message) => message.id === serverMessage.id);
  if (!localMessage?.attachments?.length || !serverMessage.attachments?.length) {
    return serverMessage;
  }

  return {
    ...serverMessage,
    attachments: serverMessage.attachments.map((attachment) => {
      const localAttachment = localMessage.attachments?.find((candidate) => candidate.id === attachment.id);
      return localAttachment?.previewUrl
        ? { ...attachment, previewUrl: localAttachment.previewUrl }
        : attachment;
    }),
  };
};

const getRecordingSupportMessage = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "La grabación solo está disponible en el navegador.";
  }

  if (!window.isSecureContext && window.location.hostname !== "localhost") {
    return "En iPhone Safari y otros navegadores móviles el micrófono en vivo solo funciona con HTTPS o localhost. Usa HTTPS o adjunta un audio.";
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return "Este navegador no expone acceso directo al micrófono. Adjunta un audio en su lugar.";
  }

  if (typeof MediaRecorder === "undefined") {
    return "Este navegador no soporta grabación directa con MediaRecorder. Adjunta un audio en su lugar.";
  }

  return null;
};

const decodeQrFile = async (file: File) => {
  const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
  const regionId = `store-agent-qr-reader-${createClientId()}`;
  const region = document.createElement("div");
  region.id = regionId;
  region.style.position = "fixed";
  region.style.left = "-99999px";
  region.style.top = "-99999px";
  region.style.width = "1px";
  region.style.height = "1px";
  document.body.appendChild(region);

  const scanner = new Html5Qrcode(regionId, {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    verbose: false,
  });

  try {
    return await scanner.scanFile(file, false);
  } finally {
    try {
      scanner.clear();
    } catch {
      // ignore cleanup failures
    }
    region.remove();
  }
};

export function StoreAgentDrawer() {
  const pathname = usePathname();
  const token = getAccessToken();
  const { draft, replaceDraft, isAgentOpen, setAgentOpen } = useStorePos();
  const [messages, setMessages] = useState<AgentMessage[]>([INITIAL_ASSISTANT_MESSAGE]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [recordingLiveLevel, setRecordingLiveLevel] = useState(0);
  const [canUseLiveQrScanner, setCanUseLiveQrScanner] = useState(false);
  const [canUseLiveAudio, setCanUseLiveAudio] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrScannerState, setQrScannerState] = useState<"idle" | "starting" | "ready" | "error">("idle");
  const [qrScannerError, setQrScannerError] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const qrCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const audioUploadInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const qrScannerRegionIdRef = useRef(`store-agent-live-qr-${createClientId()}`);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioLevelAnimationFrameRef = useRef<number | null>(null);
  const recordingPeakLevelRef = useRef(0);
  const recordingAverageAccumulatorRef = useRef(0);
  const recordingSampleCountRef = useRef(0);
  const attachmentsRef = useRef<AgentAttachment[]>([]);
  const messagesRef = useRef<AgentMessage[]>([]);
  const liveQrScannerRef = useRef<{
    start: (...args: unknown[]) => Promise<unknown>;
    stop: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (pathname.startsWith("/pos")) {
      setAgentOpen(true);
    }
  }, [pathname, setAgentOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const isMobileViewport = window.matchMedia("(max-width: 1023px)").matches;
    if (!isMobileViewport || !isAgentOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, [isAgentOpen]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
      }
      if (audioLevelAnimationFrameRef.current) {
        window.cancelAnimationFrame(audioLevelAnimationFrameRef.current);
      }
      messagesRef.current.forEach((message) => message.attachments?.forEach(revokeAttachmentPreviewUrl));
      attachmentsRef.current.forEach(revokeAttachmentPreviewUrl);
      analyserRef.current?.disconnect();
      audioContextRef.current?.close().catch(() => undefined);
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }

    const secureContext = window.isSecureContext || window.location.hostname === "localhost";
    setCanUseLiveQrScanner(secureContext && Boolean(navigator.mediaDevices?.getUserMedia));
    setCanUseLiveAudio(!getRecordingSupportMessage());
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      setShowScrollToLatest(false);
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [messages, pending]);

  const scrollToLatest = () => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    setShowScrollToLatest(false);
  };

  const triggerAction = async (action: NonNullable<AgentMessage["actions"]>[number]) => {
    if (action.kind === "capture-qr") {
      if (canUseLiveQrScanner) {
        setShowQrScanner(true);
      } else {
        qrCaptureInputRef.current?.click();
      }
      return;
    }

    await sendMessage(action.prompt, []);
  };

  const summary = useMemo(
    () => ({
      total: getDraftTotal(draft),
      items: getDraftItemCount(draft),
    }),
    [draft],
  );

  const sendMessage = async (content: string, outgoingAttachments: AgentAttachment[] = attachments) => {
    const trimmed = content.trim();
    if ((!trimmed && outgoingAttachments.length === 0) || !token) {
      return;
    }

    const preparedAttachments = outgoingAttachments.map((attachment) =>
      attachment.kind === "audio"
        ? { ...attachment, status: "processing" as const }
        : attachment,
    );

    const userMessage: AgentMessage = {
      id: createClientId(),
      role: "user",
      content:
        trimmed || (preparedAttachments.some((attachment) => attachment.kind === "audio") ? AUDIO_PLACEHOLDER : "Adjunto una imagen para escanear."),
      attachments: preparedAttachments,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setAttachments((current) => {
      current.forEach((attachment) => {
        if (!userMessage.attachments?.some((candidate) => candidate.id === attachment.id)) {
          revokeAttachmentPreviewUrl(attachment);
        }
      });
      return [];
    });
    setPending(true);

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          draft,
        }),
      });

      if (!response.ok) {
        throw new Error("agent_request_failed");
      }

      const data = (await response.json()) as {
        message: AgentMessage;
        draft: StorePosDraft;
        userMessage?: AgentMessage;
      };

      replaceDraft(data.draft);
      setMessages((current) => {
        const mergedUserMessage = data.userMessage ? mergeClientAttachmentFields(data.userMessage, current) : null;
        const withUpdatedUserMessage = data.userMessage
          ? current.map((message) => (message.id === data.userMessage?.id ? mergedUserMessage ?? data.userMessage : message))
          : current;
        return [...withUpdatedUserMessage, data.message];
      });
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: createClientId(),
          role: "assistant",
          content: "No pude completar esa acción. Revisa la conexión o intenta nuevamente.",
        },
      ]);
    } finally {
      setPending(false);
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((current) => {
      const nextAttachments = current.filter((attachment) => attachment.id !== attachmentId);
      current
        .filter((attachment) => attachment.id === attachmentId)
        .forEach(revokeAttachmentPreviewUrl);
      return nextAttachments;
    });
  };

  const attachQrImages = async (files: FileList | File[]) => {
    const fileList = Array.from(files ?? []);
    if (fileList.length === 0) {
      return;
    }

    const [primaryFile] = fileList;
    if (!primaryFile) {
      return;
    }

    try {
      setRecordingError(null);
      const decodedText = await decodeQrFile(primaryFile);
      if (decodedText) {
        await sendMessage(`Quiero ligar la tarjeta del cliente con este QR: ${decodedText}`, []);
        return;
      }
    } catch {
      // Fallback to server-side image decoding below.
    }

    const nextAttachments = await Promise.all(
      fileList.map(async (file) => ({
        id: createClientId(),
        name: file.name,
        contentType: file.type || "image/png",
        dataUrl: await readFileAsDataUrl(file),
        kind: "image" as const,
        status: "ready" as const,
      })),
    );

    await sendMessage("Quiero ligar la tarjeta del cliente.", [
      ...attachments.filter((attachment) => attachment.kind !== "image"),
      ...nextAttachments,
    ]);
  };

  useEffect(() => {
    if (!showQrScanner || typeof window === "undefined") {
      return;
    }

    let isActive = true;
    let hasResolved = false;
    let scannerStarted = false;

    const bootScanner = async () => {
      try {
        setQrScannerState("starting");
        setQrScannerError(null);
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (!isActive) {
          return;
        }

        const scanner = new Html5Qrcode(qrScannerRegionIdRef.current, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        liveQrScannerRef.current = scanner;

        const onSuccess = async (decodedText: string) => {
          if (hasResolved) {
            return;
          }

          hasResolved = true;
          if (scannerStarted) {
            await scanner.stop().catch(() => undefined);
            scannerStarted = false;
          }
          setShowQrScanner(false);
          await sendMessage(`Quiero ligar la tarjeta del cliente con este QR: ${decodedText}`, []);
        };

        const scannerConfig = {
          fps: 10,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1,
        };

        try {
          await scanner.start({ facingMode: { exact: "environment" } }, scannerConfig, onSuccess, () => undefined);
        } catch {
          await scanner.start({ facingMode: "environment" }, scannerConfig, onSuccess, () => undefined);
        }
        scannerStarted = true;

        if (isActive) {
          setQrScannerState("ready");
        }
      } catch {
        setQrScannerState("error");
        setQrScannerError("No pude abrir la cámara para escanear. Usa foto del QR como alternativa.");
        setShowQrScanner(false);
        qrCaptureInputRef.current?.click();
      }
    };

    void bootScanner();

    return () => {
      isActive = false;
      setQrScannerState("idle");
      setQrScannerError(null);
      const scanner = liveQrScannerRef.current;
      if (!scanner || !scannerStarted) {
        return;
      }

      liveQrScannerRef.current = null;
      void scanner.stop().catch(() => undefined);
    };
  }, [showQrScanner]);

  const attachAudioBlob = async (blob: Blob, contentType: string, durationMs?: number) => {
    const averageLevel = recordingSampleCountRef.current > 0
      ? recordingAverageAccumulatorRef.current / recordingSampleCountRef.current
      : 0;
    const peakLevel = recordingPeakLevelRef.current;
    const signalDetected = peakLevel > 0.015 || averageLevel > 0.008;

    if (blob.size === 0) {
      setRecordingError("La nota de voz salió vacía. Intenta grabar otra vez.");
      return;
    }

    if (!signalDetected && durationMs && durationMs > 1500) {
      setRecordingError("Grabé el archivo, pero casi no detecté señal del micrófono. Revisa permisos, volumen o intenta Adjuntar audio.");
    }

    const dataUrl = await readFileAsDataUrl(blob);
    const attachment: AgentAttachment = {
      id: createClientId(),
      name: `nota-de-voz.${getAudioExtension(contentType)}`,
      contentType,
      dataUrl,
      previewUrl: URL.createObjectURL(blob),
      kind: "audio",
      durationMs,
      status: "ready",
      debug: {
        source: "live",
        sizeBytes: blob.size,
        mimeType: contentType,
        averageLevel,
        peakLevel,
        signalDetected,
      },
    };

    setAttachments((current) => {
      current.filter((entry) => entry.kind === "audio").forEach(revokeAttachmentPreviewUrl);
      return [...current.filter((entry) => entry.kind !== "audio"), attachment];
    });
  };

  const startRecording = async () => {
    if (pending || isRecording || typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }

    const recordingSupportMessage = getRecordingSupportMessage();
    if (recordingSupportMessage) {
      setRecordingError(recordingSupportMessage);
      return;
    }

    try {
      setRecordingError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      const mimeType = getSupportedAudioMimeType();
      const recorderOptions = mimeType
        ? {
            mimeType,
            audioBitsPerSecond: 128000,
          }
        : undefined;
      const recorder = recorderOptions ? new MediaRecorder(stream, recorderOptions) : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      recordingPeakLevelRef.current = 0;
      recordingAverageAccumulatorRef.current = 0;
      recordingSampleCountRef.current = 0;
      setRecordingDurationMs(0);
      setRecordingLiveLevel(0);
      setIsRecording(true);

      const AudioContextCtor = window.AudioContext ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        const audioContext = new AudioContextCtor();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const sampleLevel = () => {
          const activeAnalyser = analyserRef.current;
          if (!activeAnalyser) {
            return;
          }

          const data = new Uint8Array(activeAnalyser.fftSize);
          activeAnalyser.getByteTimeDomainData(data);
          let sumSquares = 0;
          let peak = 0;
          for (const value of data) {
            const normalized = (value - 128) / 128;
            sumSquares += normalized * normalized;
            peak = Math.max(peak, Math.abs(normalized));
          }

          const rms = Math.sqrt(sumSquares / data.length);
          recordingPeakLevelRef.current = Math.max(recordingPeakLevelRef.current, peak);
          recordingAverageAccumulatorRef.current += rms;
          recordingSampleCountRef.current += 1;
          setRecordingLiveLevel(Math.min(1, peak * 2.6));
          audioLevelAnimationFrameRef.current = window.requestAnimationFrame(sampleLevel);
        };

        audioLevelAnimationFrameRef.current = window.requestAnimationFrame(sampleLevel);
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const contentType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: contentType });
        const durationMs = recordingStartedAtRef.current ? Date.now() - recordingStartedAtRef.current : recordingDurationMs;

        if (recordingTimerRef.current) {
          window.clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }

        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        recordingStartedAtRef.current = null;
        setIsRecording(false);
        if (audioLevelAnimationFrameRef.current) {
          window.cancelAnimationFrame(audioLevelAnimationFrameRef.current);
          audioLevelAnimationFrameRef.current = null;
        }
        analyserRef.current?.disconnect();
        analyserRef.current = null;
        audioContextRef.current?.close().catch(() => undefined);
        audioContextRef.current = null;
        setRecordingLiveLevel(0);

        await attachAudioBlob(blob, contentType, durationMs);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      recordingTimerRef.current = window.setInterval(() => {
        if (recordingStartedAtRef.current) {
          setRecordingDurationMs(Date.now() - recordingStartedAtRef.current);
        }
      }, 250);
    } catch {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setIsRecording(false);
      if (audioLevelAnimationFrameRef.current) {
        window.cancelAnimationFrame(audioLevelAnimationFrameRef.current);
        audioLevelAnimationFrameRef.current = null;
      }
      analyserRef.current?.disconnect();
      analyserRef.current = null;
      audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
      setRecordingLiveLevel(0);
      setRecordingError("No pude acceder al micrófono. Revisa los permisos e intenta nuevamente.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const handleQrButtonClick = () => {
    if (canUseLiveQrScanner) {
      setShowQrScanner(true);
      return;
    }

    qrCaptureInputRef.current?.click();
  };

  const handleAudioButtonClick = () => {
    if (canUseLiveAudio) {
      void startRecording();
      return;
    }

    audioUploadInputRef.current?.click();
  };

  const panelContent = (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-zinc-200 bg-linear-to-br from-amber-50 via-white to-emerald-50 px-5 py-4 dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400">Store Copilot</p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">Caja asistida por IA</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Arma el pedido, liga el QR del cliente y confirma la venta desde este panel.</p>
          </div>
          <button
            type="button"
            onClick={() => setAgentOpen(false)}
            className="rounded-full border border-zinc-200 p-2 text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:hover:text-zinc-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-2xl border border-zinc-200/80 bg-white/90 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/80">
            <p className="text-zinc-500 dark:text-zinc-400">Items</p>
            <p className="mt-1 text-sm font-semibold text-zinc-950 dark:text-zinc-50">{summary.items}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200/80 bg-white/90 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/80">
            <p className="text-zinc-500 dark:text-zinc-400">Total</p>
            <p className="mt-1 text-sm font-semibold text-zinc-950 dark:text-zinc-50">{formatMoney(summary.total)}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200/80 bg-white/90 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/80">
            <p className="text-zinc-500 dark:text-zinc-400">Cliente</p>
            <p className="mt-1 truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {draft.customer?.name ?? draft.customer?.phone ?? "Sin ligar"}
            </p>
          </div>
        </div>
      </header>

      <div
        ref={messagesContainerRef}
        onScroll={(event) => {
          const container = event.currentTarget;
          const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
          setShowScrollToLatest(distanceToBottom > 120);
        }}
        className="relative min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 touch-pan-y"
      >
        {messages.map((message) => (
          <article
            key={message.id}
            className={`rounded-3xl px-4 py-3 text-sm leading-6 ${
              message.role === "assistant"
                ? "mr-8 border border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                : "ml-8 bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950"
            }`}
          >
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] opacity-70">
              {message.role === "assistant" ? <Bot className="h-3.5 w-3.5" /> : <MessageSquarePlus className="h-3.5 w-3.5" />}
              {message.role === "assistant" ? "Asistente" : "Tu"}
            </div>
            {message.role === "assistant" && message.renderedHtml ? (
              <div
                className="whitespace-normal [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1.5 [&_code]:py-0.5 dark:[&_code]:bg-white/10"
                dangerouslySetInnerHTML={{ __html: message.renderedHtml }}
              />
            ) : (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )}
            {message.attachments?.length ? (
              <div className="mt-2 space-y-2 text-xs opacity-80">
                {message.attachments.map((file) => (
                  <div key={file.id} className="rounded-2xl border border-current/10 px-3 py-2">
                    <p>{file.kind === "audio" ? "Nota de voz" : "Adjunto"}: {file.name}</p>
                    {file.durationMs ? <p>Duración: {formatDuration(file.durationMs)}</p> : null}
                    {file.kind === "audio" ? (
                      <audio controls preload="metadata" src={file.previewUrl ?? file.dataUrl} className="mt-2 w-full max-w-full" />
                    ) : null}
                    {file.status === "processing" ? <p>Transcribiendo...</p> : null}
                    {file.status === "failed" ? <p>No se pudo transcribir.</p> : null}
                    {file.transcript ? <p className="mt-1 whitespace-pre-wrap">Transcripción: {file.transcript}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
            {message.role === "assistant" && message.customerCard ? (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-white/80 p-2 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <QrCode className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Cliente ligado al pedido</p>
                    <p className="mt-1 truncate">{message.customerCard.name ?? message.customerCard.phone}</p>
                    <p className="mt-1 text-xs opacity-80">Tarjeta {message.customerCard.cardCode ?? message.customerCard.cardId}</p>
                    {message.customerCard.email ? <p className="mt-1 text-xs opacity-80">{message.customerCard.email}</p> : null}
                  </div>
                </div>
              </div>
            ) : null}
            {message.role === "assistant" && message.actions?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={pending}
                    onClick={() => void triggerAction(action)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      action.variant === "primary"
                        ? "bg-emerald-600 text-white hover:bg-emerald-500"
                        : action.variant === "danger"
                          ? "border border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-950/20"
                          : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600"
                    }`}
                  >
                    {action.kind === "capture-qr" ? <ScanLine className="mr-1 inline h-3.5 w-3.5" /> : null}
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ))}

        {pending ? (
          <div className="mr-8 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Pensando y operando en caja...
          </div>
        ) : null}

        {showScrollToLatest ? (
          <button
            type="button"
            onClick={scrollToLatest}
            className="sticky bottom-0 ml-auto inline-flex items-center gap-2 rounded-full bg-zinc-950 px-3 py-2 text-xs font-semibold text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-950"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            Ir al final
          </button>
        ) : null}
      </div>

      <div className="border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <div className={`${showQrScanner ? "mb-3" : "hidden"}`}>
          <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Escaneando QR</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {qrScannerState === "starting"
                    ? "Solicitando acceso a la cámara..."
                    : "Apunta con la cámara trasera al código de la tarjeta."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQrScanner(false)}
                className="rounded-full border border-zinc-200 p-2 text-zinc-500 dark:border-zinc-700 dark:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div
              id={qrScannerRegionIdRef.current}
              className="relative min-h-[320px] overflow-hidden rounded-2xl bg-black [&_video]:h-[320px] [&_video]:w-full [&_video]:object-cover [&_canvas]:h-[320px] [&_canvas]:w-full [&_canvas]:object-cover"
            >
              {qrScannerState !== "ready" ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-white/80">
                  <ScanLine className="h-8 w-8" />
                  <p className="text-sm font-medium">Preparando scanner</p>
                </div>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Mueve el QR dentro del recuadro. La lectura se envía en cuanto se detecta.
            </p>
            {qrScannerError ? <p className="mt-2 text-xs text-red-500">{qrScannerError}</p> : null}
          </div>
        </div>

        {attachments.length ? (
          <div className="mb-3 space-y-3">
            <div className="flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                <Paperclip className="h-3 w-3" />
                <span>
                  {attachment.kind === "audio" ? `Nota de voz ${attachment.durationMs ? `(${formatDuration(attachment.durationMs)})` : ""}` : attachment.name}
                </span>
                <button type="button" onClick={() => removeAttachment(attachment.id)} className="rounded-full p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            </div>

            {attachments.filter((attachment) => attachment.kind === "audio").map((attachment) => (
              <div key={`${attachment.id}-preview`} className="rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Preview de nota de voz</p>
                <audio controls preload="metadata" src={attachment.previewUrl ?? attachment.dataUrl} className="mt-3 w-full max-w-full" />
                {attachment.debug ? (
                  <div className="mt-3 rounded-2xl bg-white/70 px-3 py-2 text-[11px] text-zinc-500 dark:bg-zinc-950/70 dark:text-zinc-400">
                    <p>
                      Formato: {attachment.debug.mimeType ?? attachment.contentType} · Tamaño: {attachment.debug.sizeBytes ? formatBytes(attachment.debug.sizeBytes) : "--"}
                    </p>
                    <p>
                      Señal: {attachment.debug.signalDetected ? "detectada" : "muy baja"}
                      {typeof attachment.debug.peakLevel === "number" ? ` · pico ${(attachment.debug.peakLevel * 100).toFixed(1)}%` : ""}
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {recordingError ? <p className="mb-3 text-xs text-red-500">{recordingError}</p> : null}

        {isRecording ? (
          <div className="mb-3 flex items-center justify-between rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
              <div className="min-w-0 flex-1">
                <span>Grabando nota de voz {formatDuration(recordingDurationMs)}</span>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-red-200/80 dark:bg-red-900/40">
                  <div
                    className="h-full rounded-full bg-red-500 transition-all"
                    style={{ width: `${Math.max(6, recordingLiveLevel * 100)}%` }}
                  />
                </div>
              </div>
            </div>
            <button type="button" onClick={stopRecording} className="inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">
              <Square className="h-3.5 w-3.5" />
              Detener
            </button>
          </div>
        ) : null}

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(input);
          }}
        >
          <input
            ref={qrCaptureInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (event) => {
              const input = event.currentTarget;
              await attachQrImages(input.files ?? []);
              input.value = "";
            }}
          />
          <input
            ref={audioUploadInputRef}
            type="file"
            accept="audio/*"
            capture
            className="hidden"
            onChange={async (event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (!file) {
                return;
              }

              setRecordingError(null);
              await attachAudioBlob(file, file.type || "audio/m4a");
              setAttachments((current) =>
                current.map((attachment) =>
                  attachment.kind === "audio"
                    ? {
                        ...attachment,
                        debug: {
                          source: "upload",
                          sizeBytes: file.size,
                          mimeType: file.type || "audio/m4a",
                        },
                      }
                    : attachment,
                ),
              );
              input.value = "";
            }}
          />

          <div className="relative">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={2}
              placeholder="Ej. agrega 2 refrescos, escanea esta tarjeta o confirma la venta"
              className="w-full resize-none rounded-3xl border border-zinc-200 bg-white px-4 py-3 pb-14 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:pb-12"
            />

            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
              <div className="pointer-events-auto flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleQrButtonClick}
                  disabled={pending || showQrScanner}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white/95 text-zinc-600 shadow-sm backdrop-blur transition hover:border-zinc-300 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-300 dark:hover:text-zinc-50 sm:h-9 sm:w-9"
                  aria-label={canUseLiveQrScanner ? "Escanear QR en vivo" : "Adjuntar foto del QR"}
                >
                  {canUseLiveQrScanner ? <ScanLine className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                </button>

                <button
                  type="button"
                  onClick={handleAudioButtonClick}
                  disabled={pending || isRecording}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white/95 text-zinc-600 shadow-sm backdrop-blur transition hover:border-zinc-300 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-300 dark:hover:text-zinc-50 sm:h-9 sm:w-9"
                  aria-label={canUseLiveAudio ? "Grabar nota de voz" : "Adjuntar audio"}
                >
                  {canUseLiveAudio ? <Mic className="h-4 w-4" /> : <AudioLines className="h-4 w-4" />}
                </button>

                {attachments.some((attachment) => attachment.kind === "audio") ? (
                  <button
                    type="button"
                    onClick={() => setAttachments((current) => current.filter((attachment) => attachment.kind !== "audio"))}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white/95 text-zinc-600 shadow-sm backdrop-blur transition hover:border-zinc-300 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-300 dark:hover:text-zinc-50 sm:h-9 sm:w-9"
                    aria-label="Cancelar nota de voz"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={pending || isRecording || (!input.trim() && attachments.length === 0)}
                className="pointer-events-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9"
                aria-label="Enviar mensaje"
              >
                <SendHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        aria-label="Abrir asistente POS"
        onClick={() => setAgentOpen(true)}
        className={`fixed right-4 bottom-24 z-40 inline-flex items-center justify-center gap-2 rounded-full bg-zinc-950 px-3 py-3 text-sm font-semibold text-white shadow-lg shadow-zinc-950/20 transition hover:-translate-y-0.5 lg:right-5 lg:bottom-5 lg:px-4 dark:bg-white dark:text-zinc-950 ${
          isAgentOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden lg:inline">Asistente POS</span>
      </button>

      <aside
        className={`hidden h-screen min-h-0 shrink-0 border-l border-zinc-200 bg-white/95 shadow-2xl backdrop-blur transition-[width,opacity] duration-200 lg:block dark:border-zinc-800 dark:bg-zinc-950/95 ${
          isAgentOpen ? "w-[28rem] opacity-100" : "w-0 overflow-hidden border-l-0 opacity-0"
        }`}
      >
        {panelContent}
      </aside>

      <button
        type="button"
        aria-label="Cerrar asistente"
        onClick={() => setAgentOpen(false)}
        className={`fixed inset-0 z-40 bg-black/30 transition lg:hidden ${isAgentOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <div
        className={`fixed inset-0 z-50 h-[100dvh] w-full min-h-0 transform bg-white/95 shadow-2xl backdrop-blur transition duration-200 lg:hidden dark:bg-zinc-950/95 ${
          isAgentOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {panelContent}
      </div>
    </>
  );
}
