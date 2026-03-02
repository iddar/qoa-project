"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatDateLabel, formatDateTime, formatMoney } from "@/lib/format";

type RangeFilter = "7d" | "30d" | "all";

type TransactionRow = {
  id: string;
  storeId: string;
  totalAmount: number;
  createdAt: string;
};

type StoreItem = {
  id: string;
  name: string;
};

type WalletCard = {
  id: string;
};

export default function WalletTransactionsPage() {
  const token = getAccessToken();
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>("30d");

  const walletQuery = useQuery({
    queryKey: ["wallet-summary-transactions"],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.users.me.wallet.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const cardId = (walletQuery.data?.data.card as WalletCard | undefined)?.id ?? "";

  const transactionsQuery = useQuery({
    queryKey: ["wallet-transactions", cardId],
    enabled: Boolean(cardId) && Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.transactions.get({
        query: {
          cardId,
          limit: "200",
        },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const storesQuery = useQuery({
    queryKey: ["wallet-stores-map"],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.stores.get({
        query: { limit: "100" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const rows = useMemo(() => ((transactionsQuery.data?.data as TransactionRow[] | undefined) ?? []), [transactionsQuery.data?.data]);
  const filteredRows = useMemo(() => {
    if (rangeFilter === "all") {
      return rows;
    }

    const anchorTs = rows.length > 0 ? new Date(rows[0]!.createdAt).getTime() : 0;
    const windowMs = rangeFilter === "7d" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    return rows.filter((entry) => anchorTs - new Date(entry.createdAt).getTime() <= windowMs);
  }, [rows, rangeFilter]);

  const stores = new Map<string, string>();
  (((storesQuery.data?.data as StoreItem[] | undefined) ?? [])).forEach((store) => stores.set(store.id, store.name));

  const stats = useMemo(
    () => ({
      count: filteredRows.length,
      total: filteredRows.reduce((acc, row) => acc + row.totalAmount, 0),
      avg: filteredRows.length > 0 ? Math.round(filteredRows.reduce((acc, row) => acc + row.totalAmount, 0) / filteredRows.length) : 0,
    }),
    [filteredRows],
  );

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Historial</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Vista simple de movimientos con filtros rápidos por periodo.</p>

        <div className="mt-3 flex gap-2">
          {([
            ["7d", "7 días"],
            ["30d", "30 días"],
            ["all", "Todo"],
          ] as Array<[RangeFilter, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRangeFilter(value)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                rangeFilter === value
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
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

      {transactionsQuery.isLoading && (
        <section className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/70">
          Cargando historial...
        </section>
      )}

      {!transactionsQuery.isLoading && filteredRows.length === 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/70">
          No hay transacciones para este periodo.
        </section>
      )}

      {!transactionsQuery.isLoading && filteredRows.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/70">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filteredRows.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Compra #{row.id.slice(0, 8)}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDateLabel(row.createdAt)} · {stores.get(row.storeId) ?? `Tienda ${row.storeId.slice(0, 8)}...`}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{formatMoney(row.totalAmount)}</p>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">{formatDateTime(row.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
