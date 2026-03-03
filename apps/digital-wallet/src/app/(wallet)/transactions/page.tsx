"use client";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatDateLabel, formatDateTime, formatMoney } from "@/lib/format";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

const PAGE_SIZE = 5;

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

  const transactionsQuery = useInfiniteQuery({
    queryKey: ["wallet-transactions", cardId],
    enabled: Boolean(cardId) && Boolean(token),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: unknown) => {
      const page = lastPage as { pagination?: { hasMore?: boolean; nextCursor?: string } } | null;
      return page?.pagination?.hasMore ? (page.pagination.nextCursor ?? undefined) : undefined;
    },
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.v1.transactions.get({
        query: {
          cardId,
          limit: String(PAGE_SIZE),
          ...(pageParam ? { cursor: pageParam } : {}),
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

  const rows = useMemo(
    () =>
      transactionsQuery.data?.pages.flatMap(
        (page) => ((page as { data?: TransactionRow[] } | null)?.data ?? []),
      ) ?? [],
    [transactionsQuery.data],
  );

  const hasMore =
    ((transactionsQuery.data?.pages.at(-1) as { pagination?: { hasMore?: boolean } } | undefined)
      ?.pagination?.hasMore) ?? false;

  const stores = new Map<string, string>();
  ((storesQuery.data?.data as StoreItem[] | undefined) ?? []).forEach((store) =>
    stores.set(store.id, store.name),
  );

  const stats = useMemo(
    () => ({
      count: rows.length,
      total: rows.reduce((acc, row) => acc + row.totalAmount, 0),
      avg:
        rows.length > 0
          ? Math.round(rows.reduce((acc, row) => acc + row.totalAmount, 0) / rows.length)
          : 0,
    }),
    [rows],
  );

  const isLoading = transactionsQuery.isLoading || walletQuery.isLoading;
  const isFetchingMore = transactionsQuery.isFetchingNextPage;

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-3 gap-2">
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[11px] text-zinc-500">Movimientos</p>
          <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">{stats.count}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[11px] text-zinc-500">Total</p>
          <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {formatMoney(stats.total)}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[11px] text-zinc-500">Promedio</p>
          <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {formatMoney(stats.avg)}
          </p>
        </article>
      </section>

      <header className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Historial</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Últimos movimientos de tu billetera.
        </p>
      </header>

      {isLoading && (
        <section className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/70">
          Cargando historial...
        </section>
      )}

      {!isLoading && rows.length === 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/70">
          No hay transacciones registradas.
        </section>
      )}

      {!isLoading && rows.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/70">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Compra #{row.id.slice(0, 8)}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDateLabel(row.createdAt)} ·{" "}
                      {stores.get(row.storeId) ?? `Tienda ${row.storeId.slice(0, 8)}...`}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {formatMoney(row.totalAmount)}
                  </p>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">{formatDateTime(row.createdAt)}</p>
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
              <button
                type="button"
                disabled={isFetchingMore}
                onClick={() => transactionsQuery.fetchNextPage()}
                className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {isFetchingMore ? "Cargando..." : "Ver más"}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
