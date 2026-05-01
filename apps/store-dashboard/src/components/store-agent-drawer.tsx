"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowDown, AudioLines, Bot, Camera, LoaderCircle, MessageSquarePlus, Mic, Paperclip, QrCode, ScanLine, SendHorizontal, Sparkles, Square, Trash2, X } from "lucide-react";
import { getAccessToken } from "@/lib/auth";
import { createClientId } from "@/lib/id";
import { getInitialCopilotActions } from "@/lib/store-copilot";
import { getDraftItemCount, getDraftTotal, type AgentAttachment, type AgentMessage, type StorePosDraft } from "@/lib/store-pos";
import { formatInventoryCount, getInventoryDraftSummary, type StoreInventoryDraft } from "@/lib/store-inventory";
import { useStoreInventory } from "@/providers/store-inventory-provider";
import { useStorePos } from "@/providers/store-pos-provider";

const AUDIO_PLACEHOLDER = "Adjunto una nota de voz.";
const INVENTORY_IMAGE_PLACEHOLDER = "Adjunto una foto de inventario.";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

const getInitialAssistantMessage = (mode: "pos" | "inventory"): AgentMessage =>
  mode === "inventory"
    ? {
        id: "store-agent-welcome-inventory",
        role: "assistant",
        content:
          "Hola, soy tu asistente de inventario. Puedo interpretar listas de proveedor o fotos de notas de entrega, preparar la vista previa de entrada y ayudarte a confirmar la carga al inventario.\n\nPrueba con:\n- 12 Refresco 600ml\n- Galletas Mantequilla, GAL-001, 6, 30\n- Adjunta una foto de la nota del proveedor\n- Confirma la entrada de inventario actual",
      }
    : {
        id: "store-agent-welcome-pos",
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

const logLiveQrDebug = (event: string, details?: Record<string, unknown>) => {
  if (typeof window === "undefined") {
    return;
  }

  const payload = {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  };

  console.info("[store-copilot][live-qr]", payload);
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

const getDemoAgentHeaders = (): Record<string, string> => {
  if (typeof window === "undefined") {
    return {};
  }

  const queryMode = new URLSearchParams(window.location.search).get("demoAgentMode");
  if (queryMode) {
    window.localStorage.setItem("qoa_demo_agent_mode", queryMode);
  }

  return (queryMode ?? window.localStorage.getItem("qoa_demo_agent_mode")) === "fixture"
    ? { "x-qoa-demo-agent-mode": "fixture" }
    : {};
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

const stripMessageAttachments = (message: AgentMessage): AgentMessage => ({
  ...message,
  attachments: undefined,
});

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
  const isInventoryMode = pathname.startsWith("/inventory");
  const agentMode = isInventoryMode ? "inventory" : "pos";
  const token = getAccessToken();
  const { draft, replaceDraft, isAgentOpen, setAgentOpen } = useStorePos();
  const { draft: inventoryDraft, replaceDraft: replaceInventoryDraft } = useStoreInventory();
  const [messages, setMessages] = useState<AgentMessage[]>([getInitialAssistantMessage(agentMode)]);
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
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const audioUploadInputRef = useRef<HTMLInputElement | null>(null);
  const qrScannerContainerRef = useRef<HTMLDivElement | null>(null);
  const qrVideoRef = useRef<HTMLVideoElement | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const qrStreamRef = useRef<MediaStream | null>(null);
  const qrScanFrameRef = useRef<number | null>(null);
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

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setMessages([getInitialAssistantMessage(agentMode)]);
    setAttachments((current) => {
      current.forEach(revokeAttachmentPreviewUrl);
      return [];
    });
    setInput("");
  }, [agentMode]);

  useEffect(() => {
    if (pathname.startsWith("/pos") || pathname.startsWith("/inventory")) {
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

  const removeAddedItem = async (storeProductId: string, name: string) => {
    if (isInventoryMode) {
      return;
    }

    await sendMessage(`Quita ${name} del pedido usando storeProductId ${storeProductId}.`, []);
  };

  const summary = useMemo(
    () => isInventoryMode
      ? {
          total: getInventoryDraftSummary(inventoryDraft).quantity,
          items: getInventoryDraftSummary(inventoryDraft).rows,
        }
      : {
          total: getDraftTotal(draft),
          items: getDraftItemCount(draft),
        },
    [draft, inventoryDraft, isInventoryMode],
  );

  const sendMessage = useCallback(async (content: string, outgoingAttachments: AgentAttachment[] = attachments) => {
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
        trimmed || (
          preparedAttachments.some((attachment) => attachment.kind === "audio")
            ? AUDIO_PLACEHOLDER
            : isInventoryMode
              ? INVENTORY_IMAGE_PLACEHOLDER
              : "Adjunto una imagen para escanear."
        ),
      attachments: preparedAttachments,
    };

    const requestMessages = isInventoryMode
      ? [...messages.map(stripMessageAttachments), userMessage]
      : [...messages, userMessage];

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
      const response = await fetch(isInventoryMode ? "/api/agent/inventory-chat" : "/api/agent/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          ...getDemoAgentHeaders(),
        },
        body: JSON.stringify({
          messages: requestMessages,
          draft: isInventoryMode ? inventoryDraft : draft,
        }),
      });

      if (!response.ok) {
        throw new Error("agent_request_failed");
      }

      const data = (await response.json()) as {
        message: AgentMessage;
        draft: StorePosDraft | StoreInventoryDraft;
        userMessage?: AgentMessage;
      };

      if (isInventoryMode) {
        replaceInventoryDraft(data.draft as StoreInventoryDraft);
      } else {
        replaceDraft(data.draft as StorePosDraft);
      }
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
  }, [attachments, draft, inventoryDraft, isInventoryMode, messages, replaceDraft, replaceInventoryDraft, token]);

  const removeAttachment = (attachmentId: string) => {
    setAttachments((current) => {
      const nextAttachments = current.filter((attachment) => attachment.id !== attachmentId);
      current
        .filter((attachment) => attachment.id === attachmentId)
        .forEach(revokeAttachmentPreviewUrl);
      return nextAttachments;
    });
  };

  const attachImageFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files ?? []);
    if (fileList.length === 0) {
      return;
    }

    const [primaryFile] = fileList;
    if (!primaryFile) {
      return;
    }

    if (!isInventoryMode) {
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

    await sendMessage(
      isInventoryMode
        ? "Quiero preparar una vista previa de inventario desde esta foto."
        : "Quiero ligar la tarjeta del cliente.",
      [
        ...attachments.filter((attachment) => attachment.kind !== "image"),
        ...nextAttachments,
      ],
    );
  };

  useEffect(() => {
    if (!showQrScanner || typeof window === "undefined") {
      return;
    }

    let isActive = true;
    let hasResolved = false;
    let scannerVideoElement: HTMLVideoElement | null = null;
    const scannerContainerElement = qrScannerContainerRef.current;

    logLiveQrDebug("effect-open", {
      regionId: qrScannerRegionIdRef.current,
      secureContext: window.isSecureContext,
      href: window.location.href,
      userAgent: navigator.userAgent,
      regionExists: Boolean(scannerContainerElement),
    });

    const bootScanner = async () => {
      try {
        setQrScannerState("starting");
        setQrScannerError(null);
        const containerElement = scannerContainerElement;
        const containerWidth = containerElement?.clientWidth ?? 0;
        const containerHeight = containerElement?.clientHeight ?? 0;
        logLiveQrDebug("boot-start", {
          regionId: qrScannerRegionIdRef.current,
          regionExists: Boolean(containerElement),
          regionClientWidth: containerElement?.clientWidth,
          regionClientHeight: containerElement?.clientHeight,
          containerClientWidth: containerWidth,
          containerClientHeight: containerHeight,
        });
        const { default: jsQR } = await import("jsqr");
        if (!isActive) {
          logLiveQrDebug("boot-abort-inactive");
          return;
        }

        const video = qrVideoRef.current;
        const canvas = qrCanvasRef.current;
        if (!video || !canvas) {
          throw new Error("QR_PREVIEW_NOT_READY");
        }
        scannerVideoElement = video;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (!isActive) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        qrStreamRef.current = stream;
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "true");
        video.setAttribute("autoplay", "true");
        await video.play();

        logLiveQrDebug("scanner-created", {
          regionId: qrScannerRegionIdRef.current,
          regionExists: Boolean(containerElement),
        });

        const onSuccess = async (decodedText: string) => {
          if (hasResolved) {
            logLiveQrDebug("decode-ignored-duplicate", { decodedText });
            return;
          }

          hasResolved = true;
          logLiveQrDebug("decode-success", {
            decodedText,
            regionExists: Boolean(containerElement),
          });

          if (qrScanFrameRef.current) {
            window.cancelAnimationFrame(qrScanFrameRef.current);
            qrScanFrameRef.current = null;
          }
          qrStreamRef.current?.getTracks().forEach((track) => track.stop());
          qrStreamRef.current = null;
          logLiveQrDebug("decode-stop-finished");
          setShowQrScanner(false);
          await sendMessage(`Quiero ligar la tarjeta del cliente con este QR: ${decodedText}`, []);
        };

        const scanFrame = () => {
          const activeVideo = qrVideoRef.current;
          const activeCanvas = qrCanvasRef.current;
          if (!isActive || !activeVideo || !activeCanvas) {
            return;
          }

          if (activeVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && activeVideo.videoWidth > 0 && activeVideo.videoHeight > 0) {
            const context = activeCanvas.getContext("2d", { willReadFrequently: true });
            if (context) {
              activeCanvas.width = activeVideo.videoWidth;
              activeCanvas.height = activeVideo.videoHeight;
              context.drawImage(activeVideo, 0, 0, activeCanvas.width, activeCanvas.height);
              const imageData = context.getImageData(0, 0, activeCanvas.width, activeCanvas.height);
              const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "attemptBoth",
              });
              if (decoded?.data) {
                void onSuccess(decoded.data);
                return;
              }
            }
          }

          qrScanFrameRef.current = window.requestAnimationFrame(scanFrame);
        };

        qrScanFrameRef.current = window.requestAnimationFrame(scanFrame);
        logLiveQrDebug("start-success", {
          regionExists: Boolean(containerElement),
        });

        window.setTimeout(() => {
          const activeVideo = qrVideoRef.current;
          const activeCanvas = qrCanvasRef.current;

          logLiveQrDebug("start-post-check", {
            regionClientWidth: containerElement?.clientWidth,
            regionClientHeight: containerElement?.clientHeight,
            hasVideo: Boolean(activeVideo),
            hasCanvas: Boolean(activeCanvas),
            videoReadyState: activeVideo?.readyState,
            videoPaused: activeVideo?.paused,
            videoClientWidth: activeVideo?.clientWidth,
            videoClientHeight: activeVideo?.clientHeight,
            videoWidth: activeVideo?.videoWidth,
            videoHeight: activeVideo?.videoHeight,
          });
        }, 500);

        if (isActive) {
          setQrScannerState("ready");
        }
      } catch (error) {
        logLiveQrDebug("boot-error", {
          errorName: error instanceof Error ? error.name : String(error),
          errorMessage: error instanceof Error ? error.message : String(error),
          regionExists: Boolean(scannerContainerElement),
        });
        setQrScannerState("error");
        setQrScannerError("No pude abrir la cámara para escanear. Usa foto del QR como alternativa.");
        setShowQrScanner(false);
        qrCaptureInputRef.current?.click();
      }
    };

    void bootScanner();

    return () => {
      isActive = false;
      logLiveQrDebug("effect-cleanup", {
        hasStream: Boolean(qrStreamRef.current),
        regionExists: Boolean(scannerContainerElement),
      });
      setQrScannerState("idle");
      setQrScannerError(null);
      if (qrScanFrameRef.current) {
        window.cancelAnimationFrame(qrScanFrameRef.current);
        qrScanFrameRef.current = null;
      }

      scannerVideoElement?.pause();
      if (scannerVideoElement) {
        scannerVideoElement.srcObject = null;
      }
      qrStreamRef.current?.getTracks().forEach((track) => track.stop());
      qrStreamRef.current = null;
      logLiveQrDebug("cleanup-stop-finished");
    };
  }, [sendMessage, showQrScanner]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleWindowError = (event: ErrorEvent) => {
      logLiveQrDebug("window-error", {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      logLiveQrDebug("unhandled-rejection", {
        reasonName: reason instanceof Error ? reason.name : String(reason),
        reasonMessage: reason instanceof Error ? reason.message : String(reason),
      });
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

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
    if (isInventoryMode) {
      qrCaptureInputRef.current?.click();
      return;
    }

    if (canUseLiveQrScanner) {
      setShowQrScanner(true);
      return;
    }

    qrCaptureInputRef.current?.click();
  };

  const handleImageUploadButtonClick = () => {
    imageUploadInputRef.current?.click();
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
      <header className="border-b border-zinc-200 bg-linear-to-br from-amber-50 via-white to-emerald-50 px-5 pt-3 pb-3 dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400">
              {isInventoryMode ? "Asistente de inventario" : "Asistente POS"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar panel del asistente"
            onClick={() => setAgentOpen(false)}
            className="rounded-full border border-zinc-200 p-2 text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:hover:text-zinc-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-2xl border border-zinc-200/80 bg-white/90 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/80">
            <p className="text-zinc-500 dark:text-zinc-400">{isInventoryMode ? "Filas" : "Items"}</p>
            <p className="mt-1 text-sm font-semibold text-zinc-950 dark:text-zinc-50">{summary.items}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200/80 bg-white/90 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/80">
            <p className="text-zinc-500 dark:text-zinc-400">{isInventoryMode ? "Piezas" : "Total"}</p>
            <p className="mt-1 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {isInventoryMode ? summary.total : formatMoney(summary.total)}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200/80 bg-white/90 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/80">
            <p className="text-zinc-500 dark:text-zinc-400">{isInventoryMode ? "Estado" : "Cliente"}</p>
            <p className="mt-1 truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {isInventoryMode
                ? inventoryDraft.rows.length > 0
                  ? formatInventoryCount(getInventoryDraftSummary(inventoryDraft).ambiguous + getInventoryDraftSummary(inventoryDraft).invalid, "pendiente", "pendientes")
                  : (inventoryDraft.lastReceipt?.replayed ? "Replay" : inventoryDraft.lastReceipt ? "Aplicado" : "Sin borrador")
                : (draft.customer?.name ?? draft.customer?.phone ?? "Sin ligar")}
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
        className="relative min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pt-5 pb-4 touch-pan-y"
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
                    {file.kind === "image" ? (
                      <Image src={file.previewUrl ?? file.dataUrl} alt={file.name} width={640} height={360} unoptimized className="mt-2 max-h-56 w-full rounded-xl object-cover" />
                    ) : null}
                    {file.status === "processing" ? <p>Procesando audio...</p> : null}
                    {file.status === "failed" ? <p>No se pudo procesar el audio.</p> : null}
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
            {message.role === "assistant" && message.addedItems?.length ? (
              <div className="mt-3 rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-100">
                <p className="font-semibold">Agregué al pedido</p>
                <div className="mt-3 space-y-2">
                  {message.addedItems.map((item) => (
                    <div key={`${message.id}-${item.storeProductId}`} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 px-3 py-2 dark:border-zinc-800">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.quantity} x {item.name}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">${item.unitPrice} c/u · ${item.lineTotal}</p>
                      </div>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void removeAddedItem(item.storeProductId, item.name)}
                        className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-900/60 dark:hover:text-red-300"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
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
            {isInventoryMode ? "Interpretando imagen y preparando vista previa..." : "Pensando y operando en caja..."}
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

      <div className="border-t border-zinc-200 px-4 pt-2 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] dark:border-zinc-800 sm:pb-4">
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
            <div ref={qrScannerContainerRef} className="relative h-[320px] w-full overflow-hidden rounded-2xl bg-black">
              <video
                ref={qrVideoRef}
                autoPlay
                muted
                playsInline
                className="h-[320px] w-full object-cover"
              />
              <canvas ref={qrCanvasRef} className="hidden" />
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
                <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Vista previa de nota de voz</p>
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

            {attachments.filter((attachment) => attachment.kind === "image").map((attachment) => (
              <div key={`${attachment.id}-image-preview`} className="rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Vista previa de imagen</p>
                <Image src={attachment.previewUrl ?? attachment.dataUrl} alt={attachment.name} width={640} height={360} unoptimized className="max-h-64 w-full rounded-2xl object-cover" />
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
              await attachImageFiles(input.files ?? []);
              input.value = "";
            }}
          />
          <input
            ref={imageUploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const input = event.currentTarget;
              await attachImageFiles(input.files ?? []);
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
              placeholder={isInventoryMode ? "Ej. 12 Refresco 600ml, sube una foto, graba una corrección o confirma la entrada" : "Ej. agrega 2 refrescos, escanea esta tarjeta o confirma la venta"}
              className="w-full resize-none rounded-3xl border border-zinc-200 bg-white px-4 py-3 pb-14 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:pb-12"
            />

            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
              <div className="pointer-events-auto flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleQrButtonClick}
                  disabled={pending || (!isInventoryMode && showQrScanner)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white/95 text-zinc-600 shadow-sm backdrop-blur transition hover:border-zinc-300 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-300 dark:hover:text-zinc-50 sm:h-9 sm:w-9"
                  aria-label={isInventoryMode ? "Adjuntar foto de inventario" : canUseLiveQrScanner ? "Escanear QR en vivo" : "Adjuntar foto del QR"}
                >
                  {isInventoryMode ? <Camera className="h-4 w-4" /> : canUseLiveQrScanner ? <ScanLine className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                </button>

                {isInventoryMode ? (
                  <button
                    type="button"
                    onClick={handleImageUploadButtonClick}
                    disabled={pending}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white/95 text-zinc-600 shadow-sm backdrop-blur transition hover:border-zinc-300 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-300 dark:hover:text-zinc-50 sm:h-9 sm:w-9"
                    aria-label="Subir foto de inventario desde fotos"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                ) : null}

                <>
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
                  </>
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
        aria-label={isInventoryMode ? "Abrir asistente de inventario" : "Abrir asistente POS"}
        onClick={() => setAgentOpen(true)}
        className={`fixed right-4 bottom-24 z-40 inline-flex items-center justify-center gap-2 rounded-full bg-zinc-950 px-3 py-3 text-sm font-semibold text-white shadow-lg shadow-zinc-950/20 transition hover:-translate-y-0.5 lg:right-5 lg:bottom-5 lg:px-4 dark:bg-white dark:text-zinc-950 ${
          isAgentOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden lg:inline">{isInventoryMode ? "Asistente Inventario" : "Asistente POS"}</span>
      </button>

      <aside
        className={`fixed inset-y-0 right-0 z-20 hidden min-h-0 border-l border-zinc-200 bg-white/95 shadow-2xl backdrop-blur transition-[width,opacity] duration-200 lg:block dark:border-zinc-800 dark:bg-zinc-950/95 ${
          isAgentOpen ? "w-[28rem] opacity-100" : "pointer-events-none w-0 overflow-hidden border-l-0 opacity-0"
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
