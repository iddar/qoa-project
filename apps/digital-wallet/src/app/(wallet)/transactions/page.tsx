"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatDateLabel, formatDateTime, formatMoney } from "@/lib/format";

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

const EMPTY_TRANSACTIONS: TxItem[] = [];

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

  const rows = (transactionsQuery.data?.data as TxItem[] | undefined) ?? EMPTY_TRANSACTIONS;
  const stats = useMemo(
    () => ({
      count: rows.length,
      total: rows.reduce((acc, row) => acc + row.totalAmount, 0),
      avg: rows.length > 0 ? Math.round(rows.reduce((acc, row) => acc + row.totalAmount, 0) / rows.length) : 0,
    }),
    [rows],
  );

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Historial de transacciones</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Seguimiento completo de compras por tarjeta.</p>

        {cards.length > 1 && (
          <select
            value={activeCardId}
            onChange={(event) => setSelectedCardId(event.target.value)}
            className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.code}
              </option>
            ))}
          </select>
        )}
      </header>

      <section className="grid grid-cols-3 gap-2">
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[11px] text-zinc-500">Movimientos</p>
          <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">{stats.count}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[11px] text-zinc-500">Total</p>
          <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">{formatMoney(stats.total)}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[11px] text-zinc-500">Promedio</p>
          <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">{formatMoney(stats.avg)}</p>
        </article>
      </section>

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
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Compra #{row.id.slice(0, 8)}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{formatDateLabel(row.createdAt)} · Tienda {row.storeId.slice(0, 8)}...</p>
                  </div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{formatMoney(row.totalAmount)}</p>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">{formatDateTime(row.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
