"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

type StoreItem = {
  id: string;
  name: string;
  code: string;
};

type DailyPoint = {
  date: string;
  transactions: number;
  salesAmount: number;
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

export default function StoreHomePage() {
  const token = getAccessToken();
  const { tenantId, tenantType, role } = useAuth();
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  const storesQuery = useQuery({
    queryKey: ["stores", tenantId, tenantType, role],
    enabled: Boolean(token) && (tenantType !== "store" || !tenantId),
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
  const activeStoreId = tenantType === "store" && tenantId ? tenantId : resolvedStoreId;

  const summaryQuery = useQuery({
    queryKey: ["store-summary", activeStoreId],
    enabled: Boolean(activeStoreId) && Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.reports.stores({ storeId: activeStoreId }).summary.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const daily = (summaryQuery.data?.data.daily ?? []) as DailyPoint[];
  const dailyLastWeek = daily.slice(-7);
  const maxTx = Math.max(...dailyLastWeek.map((item) => item.transactions), 1);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString("es-MX", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }),
    [],
  );

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-amber-100 bg-gradient-to-r from-amber-100 via-orange-50 to-white p-5 dark:border-zinc-800 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950">
        <p className="text-xs uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">Operación diaria</p>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">Resumen de tienda</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 capitalize">{today}</p>
      </header>

      {tenantType !== "store" && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tienda activa</label>
          <select
            value={resolvedStoreId}
            onChange={(event) => setSelectedStoreId(event.target.value)}
            className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Selecciona una tienda</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name} ({store.code})
              </option>
            ))}
          </select>
        </section>
      )}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs text-zinc-500">Transacciones</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {summaryQuery.data?.data.kpis.transactions ?? 0}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs text-zinc-500">Ventas</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {formatMoney(summaryQuery.data?.data.kpis.salesAmount ?? 0)}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs text-zinc-500">Acumulaciones</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {summaryQuery.data?.data.kpis.accumulations ?? 0}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs text-zinc-500">Canjes</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {summaryQuery.data?.data.kpis.redemptions ?? 0}
          </p>
        </article>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Tendencia 7 días</h2>
        <p className="mt-1 text-xs text-zinc-500">Comparativo de volumen de transacciones por día.</p>
        <div className="mt-4 flex h-36 items-end gap-2">
          {dailyLastWeek.length === 0 && <p className="text-xs text-zinc-400">Sin datos aún.</p>}
          {dailyLastWeek.map((point) => (
            <div key={point.date} className="flex flex-1 flex-col items-center justify-end gap-2">
              <div className="w-full rounded bg-amber-300/70 dark:bg-amber-500/40" style={{ height: `${Math.max(8, Math.round((point.transactions / maxTx) * 100))}%` }} />
              <p className="text-[10px] text-zinc-400">{point.date.slice(5)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
