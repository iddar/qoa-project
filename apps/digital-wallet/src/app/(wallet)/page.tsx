"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReactQRCode } from "@lglab/react-qr-code";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

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

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

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
      <section className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <p className="text-xs uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">Mi tarjeta</p>
        <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">Tarjeta digital activa</h1>

        {cards.length > 1 && (
          <select
            value={activeCardId}
            onChange={(event) => setSelectedCardId(event.target.value)}
            className="mt-3 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.code} ({card.campaignId.slice(0, 8)}...)
              </option>
            ))}
          </select>
        )}

        {!activeCard && <p className="mt-4 text-sm text-zinc-500">Aún no tienes tarjetas activas.</p>}

        {activeCard && qrValue && (
          <div className="mt-4 grid gap-4">
            <div className="mx-auto rounded-xl bg-white p-2">
              <ReactQRCode value={qrValue} size={220} />
            </div>
            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">Muestra este QR al registrar tu compra.</p>
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-xs text-zinc-500">Compras recientes</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.purchases}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-xs text-zinc-500">Gasto reciente</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{formatMoney(stats.spent)}</p>
        </article>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Últimas compras</h2>
        {txRows.length === 0 && <p className="mt-2 text-sm text-zinc-500">Sin movimientos aún.</p>}
        {txRows.length > 0 && (
          <ul className="mt-3 space-y-2">
            {txRows.map((tx) => (
              <li key={tx.id} className="rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/70">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-zinc-800 dark:text-zinc-200">Compra {tx.id.slice(0, 8)}</p>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{formatMoney(tx.totalAmount)}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{new Date(tx.createdAt).toLocaleString("es-MX")}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
