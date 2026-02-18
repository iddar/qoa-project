"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatDateLabel, formatDateTime, formatMoney } from "@/lib/format";

type GroupMode = "timeline" | "store" | "brand" | "campaign";

type CardItem = {
  id: string;
  code: string;
  campaignId: string;
};

type TxItem = {
  productId: string;
  quantity: number;
  amount: number;
};

type TransactionRow = {
  id: string;
  userId: string;
  storeId: string;
  cardId?: string;
  items: TxItem[];
  totalAmount: number;
  createdAt: string;
};

type ProductItem = {
  id: string;
  brandId: string;
  name: string;
};

type BrandItem = {
  id: string;
  name: string;
};

type StoreItem = {
  id: string;
  name: string;
};

type GroupBucket = {
  key: string;
  label: string;
  count: number;
  totalAmount: number;
  lastPurchaseAt: string;
};

const EMPTY_TRANSACTIONS: TransactionRow[] = [];
const EMPTY_CARDS: CardItem[] = [];

const groupLabels: Record<GroupMode, string> = {
  timeline: "Cronológico",
  store: "Por tienda",
  brand: "Por marca",
  campaign: "Por campaña",
};

const toGroupBuckets = (
  rows: TransactionRow[],
  mode: GroupMode,
  maps: {
    stores: Map<string, string>;
    products: Map<string, ProductItem>;
    brands: Map<string, BrandItem>;
    campaigns: Map<string, string>;
  },
) => {
  const buckets = new Map<string, GroupBucket>();

  const upsertBucket = (key: string, label: string, amount: number, createdAt: string) => {
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        key,
        label,
        count: 1,
        totalAmount: amount,
        lastPurchaseAt: createdAt,
      });
      return;
    }

    existing.count += 1;
    existing.totalAmount += amount;
    if (new Date(createdAt).getTime() > new Date(existing.lastPurchaseAt).getTime()) {
      existing.lastPurchaseAt = createdAt;
    }
  };

  for (const row of rows) {
    if (mode === "store") {
      const label = maps.stores.get(row.storeId) ?? `Tienda ${row.storeId.slice(0, 8)}...`;
      upsertBucket(row.storeId, label, row.totalAmount, row.createdAt);
      continue;
    }

    if (mode === "campaign") {
      const campaignId = row.cardId ? maps.campaigns.get(row.cardId) : undefined;
      const key = campaignId ?? "sin-campana";
      const label = campaignId ? `Campaña ${campaignId.slice(0, 8)}...` : "Sin campaña";
      upsertBucket(key, label, row.totalAmount, row.createdAt);
      continue;
    }

    if (mode === "brand") {
      const brandIds = new Set<string>();
      for (const item of row.items) {
        const product = maps.products.get(item.productId);
        if (product?.brandId) {
          brandIds.add(product.brandId);
        }
      }

      if (brandIds.size === 0) {
        upsertBucket("unknown-brand", "Marca no identificada", row.totalAmount, row.createdAt);
        continue;
      }

      const share = row.totalAmount / brandIds.size;
      for (const brandId of brandIds) {
        const label = maps.brands.get(brandId)?.name ?? `Marca ${brandId.slice(0, 8)}...`;
        upsertBucket(brandId, label, share, row.createdAt);
      }
    }
  }

  return Array.from(buckets.values()).sort(
    (a, b) => new Date(b.lastPurchaseAt).getTime() - new Date(a.lastPurchaseAt).getTime(),
  );
};

export default function WalletTransactionsPage() {
  const token = getAccessToken();
  const [selectedCardId, setSelectedCardId] = useState("");
  const [groupMode, setGroupMode] = useState<GroupMode>("timeline");

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

  const cards = (cardsQuery.data?.data as CardItem[] | undefined) ?? EMPTY_CARDS;
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

  const productsQuery = useQuery({
    queryKey: ["wallet-products-map"],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.products.get({
        query: { limit: "100" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const brandsQuery = useQuery({
    queryKey: ["wallet-brands-map"],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.brands.get({
        query: { limit: "100" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const rows = (transactionsQuery.data?.data as TransactionRow[] | undefined) ?? EMPTY_TRANSACTIONS;

  const lookupMaps = useMemo(() => {
    const stores = new Map<string, string>();
    const products = new Map<string, ProductItem>();
    const brands = new Map<string, BrandItem>();
    const campaigns = new Map<string, string>();

    const storeRows = (storesQuery.data?.data as StoreItem[] | undefined) ?? [];
    for (const store of storeRows) {
      stores.set(store.id, store.name);
    }

    const productRows = (productsQuery.data?.data as ProductItem[] | undefined) ?? [];
    for (const product of productRows) {
      products.set(product.id, product);
    }

    const brandRows = (brandsQuery.data?.data as BrandItem[] | undefined) ?? [];
    for (const brand of brandRows) {
      brands.set(brand.id, brand);
    }

    for (const card of cards) {
      campaigns.set(card.id, card.campaignId);
    }

    return { stores, products, brands, campaigns };
  }, [storesQuery.data?.data, productsQuery.data?.data, brandsQuery.data?.data, cards]);

  const groupedRows = useMemo(() => {
    if (groupMode === "timeline") {
      return [] as GroupBucket[];
    }

    return toGroupBuckets(rows, groupMode, lookupMaps);
  }, [rows, groupMode, lookupMaps]);

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
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Agrupa tus compras por tienda, marca o campaña según el análisis que necesites.</p>

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

        <div className="mt-3 grid grid-cols-2 gap-2">
          {(Object.keys(groupLabels) as GroupMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setGroupMode(mode)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                groupMode === mode
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
            >
              {groupLabels[mode]}
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

      {!transactionsQuery.isLoading && rows.length === 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/70">
          No hay transacciones registradas aún.
        </section>
      )}

      {!transactionsQuery.isLoading && rows.length > 0 && groupMode === "timeline" && (
        <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/70">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Compra #{row.id.slice(0, 8)}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{formatDateLabel(row.createdAt)} · Tienda {(lookupMaps.stores.get(row.storeId) ?? row.storeId).slice(0, 20)}</p>
                  </div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{formatMoney(row.totalAmount)}</p>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">{formatDateTime(row.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!transactionsQuery.isLoading && rows.length > 0 && groupMode !== "timeline" && (
        <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/70">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {groupedRows.map((bucket) => (
              <li key={bucket.key} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{bucket.label}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{bucket.count} compra(s) · última {formatDateLabel(bucket.lastPurchaseAt)}</p>
                  </div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{formatMoney(bucket.totalAmount)}</p>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">{formatDateTime(bucket.lastPurchaseAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
