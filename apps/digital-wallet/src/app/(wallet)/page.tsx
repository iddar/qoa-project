"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReactQRCode } from "@lglab/react-qr-code";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";

type CardItem = {
  id: string;
  campaignId: string;
  code: string;
  status: string;
  createdAt: string;
};

type TxItem = {
  id: string;
  totalAmount: number;
  createdAt: string;
};

export default function WalletHomePage() {
  const token = getAccessToken();
  const [selectedCardId, setSelectedCardId] = useState("");

  const cardsQuery = useQuery({
    queryKey: ["wallet-cards"],
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
  const activeCard = cards.find((card) => card.id === activeCardId);

  const qrQuery = useQuery({
    queryKey: ["wallet-card-qr", activeCardId],
    enabled: Boolean(activeCardId) && Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.cards({ cardId: activeCardId }).qr.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const txQuery = useQuery({
    queryKey: ["wallet-card-transactions", activeCardId],
    enabled: Boolean(activeCardId) && Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.transactions.get({
        query: {
          cardId: activeCardId,
          limit: "50",
        },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const txRows = ((txQuery.data?.data as TxItem[] | undefined) ?? []).slice(0, 5);
  const stats = useMemo(
    () => ({
      purchases: txRows.length,
      spent: txRows.reduce((acc, row) => acc + row.totalAmount, 0),
      avgTicket: txRows.length > 0 ? Math.round(txRows.reduce((acc, row) => acc + row.totalAmount, 0) / txRows.length) : 0,
    }),
    [txRows],
  );

  const qrValue = qrQuery.data
    ? JSON.stringify({
        code: qrQuery.data.data.code,
        payload: qrQuery.data.data.payload,
      })
    : "";

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-200 via-orange-100 to-white p-4 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950">
        <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-orange-200/60 blur-3xl dark:bg-orange-800/20" />
        <div className="relative z-10">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">Tarjeta activa</p>
          <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">Tu QR de lealtad</h1>

          {cards.length > 1 && (
            <select
              value={activeCardId}
              onChange={(event) => setSelectedCardId(event.target.value)}
              className="mt-3 w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900"
            >
              {cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.code} ({card.campaignId.slice(0, 8)}...)
                </option>
              ))}
            </select>
          )}

          {!activeCard && !cardsQuery.isLoading && (
            <div className="mt-4 rounded-xl border border-amber-200/80 bg-white/80 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300">
              Aún no tienes una tarjeta asignada. Realiza una compra en tienda para activarla.
            </div>
          )}

          {cardsQuery.isLoading && (
            <div className="mt-4 h-56 animate-pulse rounded-2xl bg-white/70 dark:bg-zinc-900/60" />
          )}

          {activeCard && qrValue && !cardsQuery.isLoading && (
            <div className="mt-4 grid gap-4">
              <div className="mx-auto rounded-2xl border border-amber-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                <ReactQRCode value={qrValue} size={220} />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900/70 dark:text-zinc-300">
                <span>Estado: {activeCard.status}</span>
                <span>Alta: {new Date(activeCard.createdAt).toLocaleDateString("es-MX")}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[11px] text-zinc-500">Compras</p>
          <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{stats.purchases}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[11px] text-zinc-500">Gasto</p>
          <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">{formatMoney(stats.spent)}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[11px] text-zinc-500">Ticket prom.</p>
          <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">{formatMoney(stats.avgTicket)}</p>
        </article>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Última actividad</h2>
        {txQuery.isLoading && <p className="mt-2 text-sm text-zinc-500">Cargando actividad...</p>}
        {!txQuery.isLoading && txRows.length === 0 && <p className="mt-2 text-sm text-zinc-500">Sin movimientos todavía.</p>}
        {txRows.length > 0 && (
          <ul className="mt-3 space-y-2">
            {txRows.map((tx) => (
              <li key={tx.id} className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Compra #{tx.id.slice(0, 8)}</p>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{formatMoney(tx.totalAmount)}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{formatDateTime(tx.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
