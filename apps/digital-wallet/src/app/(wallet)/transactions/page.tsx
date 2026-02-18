"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type CardItem = {
  id: string;
  code: string;
};

type TxItem = {
  id: string;
  totalAmount: number;
  createdAt: string;
  storeId: string;
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

export default function WalletTransactionsPage() {
  const token = getAccessToken();
  const [selectedCardId, setSelectedCardId] = useState("");

  const cardsQuery = useQuery({
    queryKey: ["wallet-cards-transactions"],
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

  const cards = (cardsQuery.data?.data as CardItem[] | undefined) ?? [];
  const activeCardId = selectedCardId || cards[0]?.id || "";

  const transactionsQuery = useQuery({
    queryKey: ["wallet-transactions", activeCardId],
    enabled: Boolean(activeCardId) && Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.transactions.get({
        query: {
          cardId: activeCardId,
          limit: "100",
        },
        headers: { authorization: `Bearer ${token}` },
      });

      if (error) throw error;
      return data;
    },
  });

  const rows = (transactionsQuery.data?.data as TxItem[] | undefined) ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Historial de transacciones</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Consulta tus compras más recientes por tarjeta.</p>
      </header>

      {cards.length > 1 && (
        <select
          value={activeCardId}
          onChange={(event) => setSelectedCardId(event.target.value)}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {cards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.code}
            </option>
          ))}
        </select>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/70">
        {transactionsQuery.isLoading && <p className="px-4 py-4 text-sm text-zinc-500">Cargando historial...</p>}

        {!transactionsQuery.isLoading && rows.length === 0 && (
          <p className="px-4 py-4 text-sm text-zinc-500">No hay transacciones registradas aún.</p>
        )}

        {rows.length > 0 && (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Compra #{row.id.slice(0, 8)}</p>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{formatMoney(row.totalAmount)}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {new Date(row.createdAt).toLocaleString("es-MX")} · Tienda {row.storeId.slice(0, 8)}...
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
