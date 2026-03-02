"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

type StoreItem = { id: string; name: string; code: string };

type TransactionRow = {
  id: string;
  userId: string;
  cardId?: string;
  totalAmount: number;
  createdAt: string;
};

type CustomerAggregate = {
  userId: string;
  cardId?: string;
  visits: number;
  spent: number;
  lastVisit: string;
  avgTicket: number;
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

export default function StoreCustomersPage() {
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

  const transactionsQuery = useQuery({
    queryKey: ["store-transactions", activeStoreId],
    enabled: Boolean(activeStoreId) && Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.transactions.get({
        query: {
          storeId: activeStoreId,
          limit: "200",
        },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const customers = useMemo(() => {
    const rows = (transactionsQuery.data?.data ?? []) as TransactionRow[];
    const map = new Map<string, CustomerAggregate>();

    for (const row of rows) {
      const existing = map.get(row.userId);
      if (!existing) {
        map.set(row.userId, {
          userId: row.userId,
          cardId: row.cardId,
          visits: 1,
          spent: row.totalAmount,
          lastVisit: row.createdAt,
          avgTicket: row.totalAmount,
        });
      } else {
        existing.visits += 1;
        existing.spent += row.totalAmount;
        existing.avgTicket = existing.spent / existing.visits;
        if (new Date(row.createdAt).getTime() > new Date(existing.lastVisit).getTime()) {
          existing.lastVisit = row.createdAt;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.visits - a.visits || b.spent - a.spent);
  }, [transactionsQuery.data?.data]);

  const customerKpis = useMemo(
    () => ({
      totalCustomers: customers.length,
      repeatCustomers: customers.filter((entry) => entry.visits >= 2).length,
      avgSpendPerCustomer: customers.length > 0 ? Math.round(customers.reduce((sum, entry) => sum + entry.spent, 0) / customers.length) : 0,
    }),
    [customers],
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Clientes frecuentes</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Ranking por recurrencia y consumo en la tienda seleccionada.</p>
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

      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="grid grid-cols-3 gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-[11px] text-zinc-500">Clientes activos</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{customerKpis.totalCustomers}</p>
          </article>
          <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-[11px] text-zinc-500">Recurrentes</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{customerKpis.repeatCustomers}</p>
          </article>
          <article className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-[11px] text-zinc-500">Prom. por cliente</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{formatMoney(customerKpis.avgSpendPerCustomer)}</p>
          </article>
        </div>

        <header className="border-b border-zinc-100 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          {customers.length} cliente(s) con actividad reciente
        </header>

        {transactionsQuery.isLoading && <p className="px-4 py-5 text-sm text-zinc-500">Cargando clientes...</p>}

        {!transactionsQuery.isLoading && customers.length === 0 && (
          <p className="px-4 py-5 text-sm text-zinc-500">Sin actividad para esta tienda.</p>
        )}

        {customers.length > 0 && (
          <>
            <div className="grid grid-cols-[1.35fr_0.35fr_0.5fr_0.5fr] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              <span>Cliente</span>
              <span>Visitas</span>
              <span>Consumo</span>
              <span>Ticket prom.</span>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {customers.map((customer) => (
              <li key={customer.userId} className="grid grid-cols-[1.35fr_0.35fr_0.5fr_0.5fr] gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{customer.userId.slice(0, 12)}...</p>
                  <p className="text-xs text-zinc-400">Card: {customer.cardId ? `${customer.cardId.slice(0, 10)}...` : "sin cardId"}</p>
                  <p className="mt-1 text-[11px] text-zinc-400">Última visita: {new Date(customer.lastVisit).toLocaleDateString("es-MX")}</p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-800 dark:text-zinc-200">{customer.visits}</p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-800 dark:text-zinc-200">{formatMoney(customer.spent)}</p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-800 dark:text-zinc-200">{formatMoney(customer.avgTicket)}</p>
                </div>
              </li>
            ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
