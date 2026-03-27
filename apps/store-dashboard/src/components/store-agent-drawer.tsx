"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowDown, AudioLines, Bot, LoaderCircle, MessageSquarePlus, Mic, Paperclip, SendHorizontal, Sparkles, Square, Trash2, X } from "lucide-react";
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

const AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
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
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const qrCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

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
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
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
      qrCaptureInputRef.current?.click();
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
    setAttachments([]);
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
        const withUpdatedUserMessage = data.userMessage
          ? current.map((message) => (message.id === data.userMessage?.id ? data.userMessage : message))
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
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  };

  const attachQrImages = async (files: FileList | File[]) => {
    const fileList = Array.from(files ?? []);
    if (fileList.length === 0) {
      return;
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

  const attachAudioBlob = async (blob: Blob, contentType: string, durationMs?: number) => {
    if (blob.size === 0) {
      setRecordingError("La nota de voz salió vacía. Intenta grabar otra vez.");
      return;
    }

    const dataUrl = await readFileAsDataUrl(blob);
    const attachment: AgentAttachment = {
      id: createClientId(),
      name: `nota-de-voz.${getAudioExtension(contentType)}`,
      contentType,
      dataUrl,
      kind: "audio",
      durationMs,
      status: "ready",
    };

    setAttachments((current) => [...current.filter((entry) => entry.kind !== "audio"), attachment]);
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = getSupportedAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      setRecordingDurationMs(0);
      setIsRecording(true);

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

        await attachAudioBlob(blob, contentType, durationMs);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      recordingTimerRef.current = window.setInterval(() => {
        if (recordingStartedAtRef.current) {
          setRecordingDurationMs(Date.now() - recordingStartedAtRef.current);
        }
      }, 250);
    } catch {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setIsRecording(false);
      setRecordingError("No pude acceder al micrófono. Revisa los permisos e intenta nuevamente.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
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
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.attachments?.length ? (
              <div className="mt-2 space-y-2 text-xs opacity-80">
                {message.attachments.map((file) => (
                  <div key={file.id} className="rounded-2xl border border-current/10 px-3 py-2">
                    <p>{file.kind === "audio" ? "Nota de voz" : "Adjunto"}: {file.name}</p>
                    {file.durationMs ? <p>Duración: {formatDuration(file.durationMs)}</p> : null}
                    {file.kind === "audio" ? (
                      <audio controls preload="metadata" src={file.dataUrl} className="mt-2 w-full max-w-full" />
                    ) : null}
                    {file.status === "processing" ? <p>Transcribiendo...</p> : null}
                    {file.status === "failed" ? <p>No se pudo transcribir.</p> : null}
                    {file.transcript ? <p className="mt-1 whitespace-pre-wrap">Transcripción: {file.transcript}</p> : null}
                  </div>
                ))}
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
                <audio controls preload="metadata" src={attachment.dataUrl} className="w-full max-w-full" />
              </div>
            ))}
          </div>
        ) : null}

        {recordingError ? <p className="mb-3 text-xs text-red-500">{recordingError}</p> : null}

        {isRecording ? (
          <div className="mb-3 flex items-center justify-between rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
              <span>Grabando nota de voz {formatDuration(recordingDurationMs)}</span>
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
                <label className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-zinc-200 bg-white/95 text-zinc-600 shadow-sm backdrop-blur transition hover:border-zinc-300 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-300 dark:hover:text-zinc-50 sm:h-9 sm:w-9">
                  <Paperclip className="h-4 w-4" />
                  <span className="sr-only">Adjuntar QR</span>
                  <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (event) => {
                      const input = event.currentTarget;
                      const files = input.files ?? [];
                      if (files.length === 0) {
                        return;
                      }

                      const nextAttachments = await Promise.all(
                        Array.from(files).map(async (file) => ({
                          id: createClientId(),
                          name: file.name,
                          contentType: file.type || "image/png",
                          dataUrl: await readFileAsDataUrl(file),
                          kind: "image" as const,
                          status: "ready" as const,
                        })),
                      );
                      setAttachments((current) => [...current.filter((attachment) => attachment.kind !== "image"), ...nextAttachments]);
                      input.value = "";
                    }}
                  />
                </label>

                <label className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-zinc-200 bg-white/95 text-zinc-600 shadow-sm backdrop-blur transition hover:border-zinc-300 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-300 dark:hover:text-zinc-50 sm:h-9 sm:w-9">
                  <AudioLines className="h-4 w-4" />
                  <span className="sr-only">Adjuntar audio</span>
                  <input
                    type="file"
                    accept="audio/*"
                    capture
                    className="hidden"
                    onChange={async (event) => {
                      const input = event.currentTarget;
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }

                      setRecordingError(null);
                      await attachAudioBlob(file, file.type || "audio/m4a");
                      input.value = "";
                    }}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void startRecording()}
                  disabled={pending || isRecording}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white/95 text-zinc-600 shadow-sm backdrop-blur transition hover:border-zinc-300 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-300 dark:hover:text-zinc-50 sm:h-9 sm:w-9"
                  aria-label="Grabar nota de voz"
                >
                  <Mic className="h-4 w-4" />
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
