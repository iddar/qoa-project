"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

type StoreItem = { id: string; name: string; code: string };
type DailyPoint = { date: string; transactions: number; salesAmount: number; accumulations: number; redemptions: number };

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

export default function StoreReportsPage() {
  const token = getAccessToken();
  const { tenantId, tenantType, role } = useAuth();
  const [selectedStoreId, setSelectedStoreId] = useState("");

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
    queryKey: ["store-reports", activeStoreId],
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
  const last15 = daily.slice(-15);
  const maxSales = Math.max(...last15.map((row) => row.salesAmount), 1);
  const totals = useMemo(
    () => ({
      transactions: last15.reduce((acc, row) => acc + row.transactions, 0),
      sales: last15.reduce((acc, row) => acc + row.salesAmount, 0),
      accumulations: last15.reduce((acc, row) => acc + row.accumulations, 0),
      redemptions: last15.reduce((acc, row) => acc + row.redemptions, 0),
    }),
    [last15],
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Reportes de tienda</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Vista detallada de ventas, acumulaciones y canjes.</p>
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
          <p className="text-xs text-zinc-500">Tx (15d)</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{totals.transactions}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs text-zinc-500">Ventas (15d)</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{formatMoney(totals.sales)}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs text-zinc-500">Acumulaciones</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{totals.accumulations}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs text-zinc-500">Canjes</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{totals.redemptions}</p>
        </article>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Ventas diarias (últimos 15 días)</h2>
        <div className="mt-4 space-y-2">
          {last15.length === 0 && <p className="text-xs text-zinc-500">Sin datos para el periodo.</p>}
          {last15.map((day) => (
            <div key={day.date} className="grid grid-cols-[70px_1fr_90px] items-center gap-3 text-xs">
              <span className="text-zinc-500">{day.date.slice(5)}</span>
              <div className="h-2 rounded bg-zinc-100 dark:bg-zinc-800">
                <div className="h-2 rounded bg-amber-400 dark:bg-amber-500" style={{ width: `${Math.max(4, Math.round((day.salesAmount / maxSales) * 100))}%` }} />
              </div>
              <span className="text-right text-zinc-600 dark:text-zinc-300">{formatMoney(day.salesAmount)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
