"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

type StoreItem = { id: string; name: string; code: string };

type TransactionRow = {
  id: string;
  totalAmount: number;
  createdAt: string;
  items: Array<{ productId: string; quantity: number; amount: number }>;
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

const toInputDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const startOfWeekMonday = (date: Date) => {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
};

const shortId = (value: string) => `${value.slice(0, 8)}...`;

export default function StoreSalesPage() {
  const token = getAccessToken();
  const { tenantId, tenantType, role } = useAuth();
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [anchorDate, setAnchorDate] = useState(toInputDate(new Date()));

  const storesQuery = useQuery({
    queryKey: ["stores", tenantId, tenantType, role],
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

  const { fromIso, toIso, label } = useMemo(() => {
    const parsed = new Date(anchorDate);
    const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

    if (viewMode === "week") {
      const from = startOfWeekMonday(base);
      const to = endOfDay(new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6));
      return {
        fromIso: from.toISOString(),
        toIso: to.toISOString(),
        label: `${from.toLocaleDateString("es-MX")} - ${to.toLocaleDateString("es-MX")}`,
      };
    }

    const from = startOfDay(base);
    const to = endOfDay(base);
    return {
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
      label: from.toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }),
    };
  }, [anchorDate, viewMode]);

  const transactionsQuery = useQuery({
    queryKey: ["store-sales", activeStoreId, viewMode, fromIso, toIso],
    enabled: Boolean(activeStoreId) && Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.transactions.get({
        query: {
          storeId: activeStoreId,
          from: fromIso,
          to: toIso,
          limit: "500",
        },
        headers: { authorization: `Bearer ${token}` },
      });

      if (error) throw error;
      return data;
    },
  });

  const rows = ((transactionsQuery.data?.data ?? []) as TransactionRow[]).slice().sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );

  const summary = useMemo(() => {
    const totalSales = rows.reduce((acc, row) => acc + row.totalAmount, 0);
    const transactionCount = rows.length;
    const avgTicket = transactionCount > 0 ? totalSales / transactionCount : 0;
    const totalUnits = rows.reduce((acc, row) => acc + row.items.reduce((itemAcc, item) => itemAcc + item.quantity, 0), 0);

    return {
      totalSales,
      transactionCount,
      avgTicket,
      totalUnits,
    };
  }, [rows]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { sales: number; transactions: number }>();
    for (const row of rows) {
      const date = new Date(row.createdAt);
      const key = date.toLocaleDateString("es-MX");
      const current = groups.get(key) ?? { sales: 0, transactions: 0 };
      current.sales += row.totalAmount;
      current.transactions += 1;
      groups.set(key, current);
    }

    return Array.from(groups.entries()).map(([date, values]) => ({ date, ...values }));
  }, [rows]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Ventas</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Detalle de transacciones por día o semana para auditar operación y tickets.</p>
      </header>

      <section className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40 md:grid-cols-[1fr_auto_auto]">
        {tenantType !== "store" && (
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Tienda</span>
            <select
              value={resolvedStoreId}
              onChange={(event) => setSelectedStoreId(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
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

        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Vista</span>
          <select
            value={viewMode}
            onChange={(event) => setViewMode(event.target.value as "day" | "week")}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="day">Por día</option>
            <option value="week">Por semana</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Fecha base</span>
          <input
            type="date"
            value={anchorDate}
            onChange={(event) => setAnchorDate(event.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs text-zinc-500">Ventas ({viewMode === "day" ? "día" : "semana"})</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{formatMoney(summary.totalSales)}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs text-zinc-500">Transacciones</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{summary.transactionCount}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs text-zinc-500">Ticket promedio</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{formatMoney(summary.avgTicket)}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-xs text-zinc-500">Unidades vendidas</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{summary.totalUnits}</p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Totales por fecha</h2>
          <p className="mt-1 text-xs text-zinc-500">Rango activo: {label}</p>
          <ul className="mt-3 space-y-2 text-sm">
            {grouped.length === 0 && <li className="text-zinc-500">Sin movimientos en el rango.</li>}
            {grouped.map((row) => (
              <li key={row.date} className="rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{row.date}</p>
                <p className="text-xs text-zinc-500">{row.transactions} tx - {formatMoney(row.sales)}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
          <header className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Listado de ventas</h2>
            <p className="mt-1 text-xs text-zinc-500">{label}</p>
          </header>

          {transactionsQuery.isLoading && <p className="px-4 py-5 text-sm text-zinc-500">Cargando ventas...</p>}

          {!transactionsQuery.isLoading && rows.length === 0 && (
            <p className="px-4 py-5 text-sm text-zinc-500">No hay ventas registradas en este rango.</p>
          )}

          {rows.length > 0 && (
            <>
              <div className="grid grid-cols-[120px_120px_120px_100px_1fr] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                <span>Fecha</span>
                <span>Hora</span>
                <span>Ticket</span>
                <span>Items</span>
                <span>Productos</span>
              </div>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.map((row) => {
                  const date = new Date(row.createdAt);
                  return (
                    <li key={row.id} className="grid grid-cols-[120px_120px_120px_100px_1fr] gap-3 px-4 py-3 text-sm">
                      <span className="text-zinc-700 dark:text-zinc-300">{date.toLocaleDateString("es-MX")}</span>
                      <span className="text-zinc-500 dark:text-zinc-400">{date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatMoney(row.totalAmount)}</span>
                      <span className="text-zinc-700 dark:text-zinc-300">{row.items.length}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">Tx {shortId(row.id)} - {row.items.map((item) => shortId(item.productId)).join(", ")}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </article>
      </section>
    </div>
  );
}
