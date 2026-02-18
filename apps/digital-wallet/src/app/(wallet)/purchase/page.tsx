"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { normalizePurchasePayload, purchasePayloadTemplate } from "@/lib/purchase";

const getFriendlyError = (code: string) => {
  switch (code) {
    case "invalid_json":
      return "El payload no es JSON válido.";
    case "invalid_payload":
      return "El payload debe ser un objeto JSON.";
    case "missing_store":
      return "Debes incluir storeId en el payload.";
    case "missing_items":
      return "Debes incluir al menos un item en items[].";
    case "invalid_item_product":
      return "Cada item debe incluir productId válido.";
    case "invalid_item_quantity":
      return "Cada item debe incluir quantity mayor a 0.";
    case "invalid_item_amount":
      return "Cada item debe incluir amount numérico (>= 0).";
    default:
      return "No se pudo registrar la compra.";
  }
};

export default function WalletPurchasePage() {
  const token = getAccessToken();
  const queryClient = useQueryClient();
  const [payloadInput, setPayloadInput] = useState(purchasePayloadTemplate);
  const [feedback, setFeedback] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ["wallet-me"],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.users.me.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const cardsQuery = useQuery({
    queryKey: ["wallet-cards-purchase"],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.users.me.cards.get({
        query: { limit: "100" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const cardIds = useMemo(
    () => new Set(((cardsQuery.data?.data as Array<{ id: string }> | undefined) ?? []).map((item) => item.id)),
    [cardsQuery.data?.data],
  );

  const registerPurchase = useMutation({
    mutationFn: async () => {
      const me = meQuery.data?.data;
      if (!me?.id) {
        throw new Error("missing_user");
      }

      const normalized = normalizePurchasePayload(payloadInput);
      if (normalized.cardId && !cardIds.has(normalized.cardId)) {
        throw new Error("card_not_owned");
      }

      const { data, error } = await api.v1.transactions.post(
        {
          userId: me.id,
          storeId: normalized.storeId,
          cardId: normalized.cardId,
          items: normalized.items,
          metadata: normalized.metadata,
          idempotencyKey: `wallet-purchase-${crypto.randomUUID()}`,
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      if (error) throw error;
      return data;
    },
    onSuccess: (response) => {
      setFeedback(`Compra registrada (${response.data.id.slice(0, 8)}). Acumulaciones: ${response.data.accumulations.length}.`);
      queryClient.invalidateQueries({ queryKey: ["wallet-card-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-cards"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-cards-transactions"] });
    },
    onError: (error) => {
      if (error instanceof Error) {
        if (error.message === "missing_user") {
          setFeedback("No pudimos resolver tu usuario. Recarga la sesión.");
          return;
        }

        if (error.message === "card_not_owned") {
          setFeedback("La tarjeta enviada no pertenece a tu cuenta.");
          return;
        }

        setFeedback(getFriendlyError(error.message));
        return;
      }

      setFeedback("No se pudo registrar la compra.");
    },
  });

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Registrar compra</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Flujo manual para pruebas funcionales. Pega el payload JSON sin necesidad de escanear QR.
        </p>
      </header>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Payload de compra</p>
          <button
            type="button"
            onClick={() => setPayloadInput(purchasePayloadTemplate)}
            className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Usar plantilla
          </button>
        </div>
        <textarea
          value={payloadInput}
          onChange={(event) => setPayloadInput(event.target.value)}
          rows={14}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
        />

        <button
          type="button"
          onClick={() => {
            setFeedback(null);
            registerPurchase.mutate();
          }}
          disabled={registerPurchase.isPending || meQuery.isLoading}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {registerPurchase.isPending ? "Registrando..." : "Registrar compra"}
        </button>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
        <p className="font-semibold">Tips para probar el flujo completo</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Usa un `storeId` y `productId` existentes.</li>
          <li>Usa `cardId` de tus tarjetas (desde Mi tarjeta).</li>
          <li>Después de registrar, revisa Historial y Home para confirmar reflejo.</li>
        </ol>
      </section>

      {feedback && (
        <section className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-200">
          {feedback}
        </section>
      )}
    </div>
  );
}
