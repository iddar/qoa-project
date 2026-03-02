"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

type StoreItem = { id: string; name: string; code: string };

const parseCardIdFromInput = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const payload = JSON.parse(trimmed) as { entityType?: string; entityId?: string };
      if (payload.entityType === "card" && typeof payload.entityId === "string") {
        return payload.entityId;
      }
    } catch {
      return null;
    }
  }

  return trimmed;
};

export default function StoreScanPage() {
  const token = getAccessToken();
  const { tenantId, tenantType } = useAuth();
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [cardInput, setCardInput] = useState("");
  const [productId, setProductId] = useState("");
  const [amount, setAmount] = useState(100);
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);

  const storesQuery = useQuery({
    queryKey: ["stores", tenantId, tenantType],
    enabled: Boolean(token) && tenantType !== "store",
    queryFn: async () => {
      const { data, error } = await api.v1.stores.get({
        query: { limit: "100" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const stores = (storesQuery.data?.data as StoreItem[] | undefined) ?? [];
  const resolvedStoreId = selectedStoreId || stores[0]?.id || "";
  const activeStoreId = tenantType === "store" ? (tenantId ?? "") : resolvedStoreId;

  const createTransaction = useMutation({
    mutationFn: async () => {
      const resolvedCardId = parseCardIdFromInput(cardInput);
      if (!resolvedCardId) {
        throw new Error("CARD_REQUIRED");
      }

      if (!activeStoreId) {
        throw new Error("STORE_REQUIRED");
      }

      if (!productId) {
        throw new Error("PRODUCT_REQUIRED");
      }

      const cardResponse = await api.v1.cards({ cardId: resolvedCardId }).get({
        headers: { authorization: `Bearer ${token}` },
      });

      if (cardResponse.error || !cardResponse.data?.data.userId) {
        throw new Error("CARD_NOT_FOUND");
      }

      const { data, error } = await api.v1.transactions.post(
        {
          userId: cardResponse.data.data.userId,
          storeId: activeStoreId,
          cardId: resolvedCardId,
          items: [
            {
              productId,
              quantity,
              amount,
            },
          ],
          idempotencyKey: `store-scan-${crypto.randomUUID()}`,
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      if (error) throw error;
      return data;
    },
    onSuccess: (response) => {
      setFeedback(
        `Transacción ${response.data.id.slice(0, 8)} registrada. Acumulaciones: ${response.data.accumulations.length}`,
      );
      setCardInput("");
    },
    onError: (error) => {
      if (error instanceof Error) {
        switch (error.message) {
          case "CARD_REQUIRED":
            setFeedback("Ingresa un cardId o payload QR válido.");
            return;
          case "STORE_REQUIRED":
            setFeedback("Selecciona una tienda para continuar.");
            return;
          case "PRODUCT_REQUIRED":
            setFeedback("Ingresa un productId válido.");
            return;
          case "CARD_NOT_FOUND":
            setFeedback("No se encontró la tarjeta indicada.");
            return;
          default:
            break;
        }
      }
      setFeedback("No se pudo registrar la transacción.");
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Escanear y registrar</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Pega un `cardId` o payload QR JSON y genera una transacción en segundos.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setFeedback(null);
            createTransaction.mutate();
          }}
        >
          {tenantType !== "store" && (
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Tienda</span>
              <select
                value={resolvedStoreId}
                onChange={(event) => setSelectedStoreId(event.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">Selecciona tienda</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name} ({store.code})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Card payload / Card ID</span>
            <textarea
              value={cardInput}
              onChange={(event) => setCardInput(event.target.value)}
              rows={4}
              placeholder='{"entityType":"card","entityId":"..."}'
              className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
              required
            />
          </label>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Product ID</span>
              <input
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                placeholder="UUID del producto"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Cantidad</span>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                required
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Monto</span>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              required
            />
          </label>

          <button
            type="submit"
            disabled={createTransaction.isPending}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {createTransaction.isPending ? "Registrando..." : "Registrar transacción"}
          </button>
        </form>
      </section>

      {feedback && (
        <section className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          {feedback}
        </section>
      )}
    </div>
  );
}
