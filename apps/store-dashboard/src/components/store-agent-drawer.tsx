"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowDown, Bot, LoaderCircle, MessageSquarePlus, Paperclip, SendHorizontal, Sparkles, X } from "lucide-react";
import { getAccessToken } from "@/lib/auth";
import { getDraftItemCount, getDraftTotal, type AgentAttachment, type AgentMessage, type StorePosDraft } from "@/lib/store-pos";
import { useStorePos } from "@/providers/store-pos-provider";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

const quickPrompts = [
  "Agrega 2 refrescos al pedido",
  "Busca unas papas para el carrito",
  "Escanea la tarjeta del cliente",
  "Confirma la venta actual",
];

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export function StoreAgentDrawer() {
  const pathname = usePathname();
  const token = getAccessToken();
  const { draft, replaceDraft, isAgentOpen, setAgentOpen } = useStorePos();
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content:
        "Hola, soy tu asistente de caja. Puedo armar el pedido, ligar la tarjeta del cliente por QR y confirmar la venta cuando me lo pidas.",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/pos")) {
      setAgentOpen(true);
    }
  }, [pathname, setAgentOpen]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 96;
    if (isNearBottom) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [messages, pending]);

  const scrollToLatest = () => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    setShowScrollToLatest(false);
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

    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed || "Adjunto una imagen para escanear.",
      attachments: outgoingAttachments,
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
      };

      replaceDraft(data.draft);
      setMessages((current) => [...current, data.message]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "No pude completar esa acción. Revisa la conexión o intenta nuevamente.",
        },
      ]);
    } finally {
      setPending(false);
    }
  };

  const panelContent = (
    <div className="flex h-full flex-col">
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

      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void sendMessage(prompt, [])}
              className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-zinc-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        onScroll={(event) => {
          const container = event.currentTarget;
          const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
          setShowScrollToLatest(distanceToBottom > 120);
        }}
        className="relative flex-1 space-y-3 overflow-y-auto px-4 py-4"
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
              <p className="mt-2 text-xs opacity-70">Adjuntos: {message.attachments.map((file) => file.name).join(", ")}</p>
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
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                <Paperclip className="h-3 w-3" />
                {attachment.name}
              </div>
            ))}
          </div>
        ) : null}

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(input);
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={4}
            placeholder="Ej. agrega 2 refrescos, escanea esta tarjeta o confirma la venta"
            className="w-full resize-none rounded-3xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />

          <div className="flex items-center justify-between gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-50">
              <Paperclip className="h-3.5 w-3.5" />
              Adjuntar QR
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (event) => {
                  const files = Array.from(event.target.files ?? []);
                  const nextAttachments = await Promise.all(
                    files.map(async (file) => ({
                      id: crypto.randomUUID(),
                      name: file.name,
                      contentType: file.type || "image/png",
                      dataUrl: await readFileAsDataUrl(file),
                    })),
                  );
                  setAttachments(nextAttachments);
                }}
              />
            </label>

            <button
              type="submit"
              disabled={pending || (!input.trim() && attachments.length === 0)}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SendHorizontal className="h-4 w-4" />
              Enviar
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setAgentOpen(true)}
        className={`fixed right-5 bottom-5 z-40 inline-flex items-center gap-2 rounded-full bg-zinc-950 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-zinc-950/20 transition hover:-translate-y-0.5 dark:bg-white dark:text-zinc-950 ${
          isAgentOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <Sparkles className="h-4 w-4" />
        Asistente POS
      </button>

      <aside
        className={`hidden h-screen shrink-0 border-l border-zinc-200 bg-white/95 shadow-2xl backdrop-blur transition-[width,opacity] duration-200 lg:block dark:border-zinc-800 dark:bg-zinc-950/95 ${
          isAgentOpen ? "w-[28rem] opacity-100" : "w-0 overflow-hidden border-l-0 opacity-0"
        }`}
      >
        {panelContent}
      </aside>

      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[28rem] transform border-l border-zinc-200 bg-white/95 shadow-2xl backdrop-blur transition duration-200 lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95 ${
          isAgentOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {panelContent}
      </div>
    </>
  );
}
