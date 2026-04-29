"use client";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatDateLabel, formatDateTime, formatMoney } from "@/lib/format";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

const PAGE_SIZE = 20;

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

type WalletStoreBreakdown = {
  storeId: string;
  storeName: string;
};

type StoreGroup = {
  storeId: string;
  storeName: string;
  count: number;
  total: number;
  lastAt: string;
  transactions: TransactionRow[];
  expanded: boolean;
};

type ViewMode = "store" | "date";

export default function WalletTransactionsPage() {
  const token = getAccessToken();
  const [viewMode, setViewMode] = useState<ViewMode>("store");
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());

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

  const stores = useMemo(() => {
    const map = new Map<string, string>();
    ((walletQuery.data?.data.storeBreakdown as WalletStoreBreakdown[] | undefined) ?? []).forEach(
      (store) => map.set(store.storeId, store.storeName),
    );
    ((storesQuery.data?.data as StoreItem[] | undefined) ?? []).forEach((store) =>
      map.set(store.id, store.name),
    );
    return map;
  }, [storesQuery.data, walletQuery.data]);

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

  // Build store groups sorted by most recent purchase
  const storeGroups = useMemo<StoreGroup[]>(() => {
    const groupMap = new Map<string, StoreGroup>();
    for (const row of rows) {
      const existing = groupMap.get(row.storeId);
      if (existing) {
        existing.count += 1;
        existing.total += row.totalAmount;
        if (row.createdAt > existing.lastAt) existing.lastAt = row.createdAt;
        existing.transactions.push(row);
      } else {
        groupMap.set(row.storeId, {
          storeId: row.storeId,
          storeName: stores.get(row.storeId) ?? `Tienda ${row.storeId.slice(0, 8)}…`,
          count: 1,
          total: row.totalAmount,
          lastAt: row.createdAt,
          transactions: [row],
          expanded: false,
        });
      }
    }
    // Sort groups by most recent transaction
    return [...groupMap.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  }, [rows, stores]);

  const toggleStore = (storeId: string) => {
    setExpandedStores((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  };

  const isLoading = transactionsQuery.isLoading || walletQuery.isLoading;
  const isFetchingMore = transactionsQuery.isFetchingNextPage;

  return (
    <div className="space-y-4">
      {/* Stats */}
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

      {/* Header + view toggle */}
      <header className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Historial</h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {viewMode === "store"
              ? `${storeGroups.length} tienda${storeGroups.length !== 1 ? "s" : ""}`
              : "Orden cronológico"}
          </p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-zinc-200 text-xs font-semibold dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setViewMode("store")}
            className={`px-3 py-1.5 transition ${
              viewMode === "store"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            Por tienda
          </button>
          <button
            type="button"
            onClick={() => setViewMode("date")}
            className={`px-3 py-1.5 transition ${
              viewMode === "date"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            Por fecha
          </button>
        </div>
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

      {/* View: by store */}
      {!isLoading && rows.length > 0 && viewMode === "store" && (
        <section className="space-y-2">
          {storeGroups.map((group) => {
            const isExpanded = expandedStores.has(group.storeId);
            return (
              <div
                key={group.storeId}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/70"
              >
                {/* Store header — tap to expand */}
                <button
                  type="button"
                  onClick={() => toggleStore(group.storeId)}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {group.storeName}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {group.count} {group.count === 1 ? "compra" : "compras"} · última{" "}
                      {formatDateLabel(group.lastAt)}
                    </p>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {formatMoney(group.total)}
                    </span>
                    <span
                      className={`text-zinc-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M4 6l4 4 4-4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                </button>

                {/* Transactions under this store */}
                {isExpanded && (
                  <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
                    {group.transactions
                      .slice()
                      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
                      .map((row) => (
                        <li key={row.id} className="flex items-center justify-between px-4 py-3">
                          <div>
                            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                              {formatDateLabel(row.createdAt)}
                            </p>
                            <p className="mt-0.5 text-[11px] text-zinc-400">
                              {formatDateTime(row.createdAt)}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {formatMoney(row.totalAmount)}
                          </p>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* View: by date */}
      {!isLoading && rows.length > 0 && viewMode === "date" && (
        <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/70">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {stores.get(row.storeId) ?? `Tienda ${row.storeId.slice(0, 8)}…`}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDateLabel(row.createdAt)}
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
        </section>
      )}

      {/* Load more — visible in both views */}
      {!isLoading && hasMore && (
        <div className="pb-1">
          <button
            type="button"
            disabled={isFetchingMore}
            onClick={() => transactionsQuery.fetchNextPage()}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {isFetchingMore ? "Cargando…" : "Ver más"}
          </button>
        </div>
      )}
    </div>
  );
}
