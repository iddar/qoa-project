"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ReactQRCode } from "@lglab/react-qr-code";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";

type WalletCampaign = {
  campaignId: string;
  campaignName: string;
  enrollmentMode: "open" | "opt_in" | "system_universal";
  current: number;
};

type TxItem = {
  id: string;
  totalAmount: number;
  createdAt: string;
};

type RewardItem = {
  id: string;
  name: string;
  cost: number;
  status: "active" | "inactive";
};

export default function WalletHomePage() {
  const token = getAccessToken();

  const walletQuery = useQuery({
    queryKey: ["wallet-home-summary"],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.users.me.wallet.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const cardId = walletQuery.data?.data.card.id ?? "";

  const qrQuery = useQuery({
    queryKey: ["wallet-card-qr", cardId],
    enabled: Boolean(cardId) && Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.cards({ cardId }).qr.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const txQuery = useQuery({
    queryKey: ["wallet-home-transactions", cardId],
    enabled: Boolean(cardId) && Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.transactions.get({
        query: {
          cardId,
          limit: "20",
        },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const campaigns = ((walletQuery.data?.data.campaigns as WalletCampaign[] | undefined) ?? []).filter(
    (entry) => entry.enrollmentMode !== "system_universal",
  );

  const rewardQueries = useQueries({
    queries: campaigns.map((campaign) => ({
      queryKey: ["wallet-home-rewards", campaign.campaignId],
      enabled: Boolean(token),
      queryFn: async () => {
        const { data, error } = await api.v1.rewards.get({
          query: {
            campaignId: campaign.campaignId,
            limit: "50",
          },
          headers: { authorization: `Bearer ${token}` },
        });
        if (error) throw error;
        return data;
      },
    })),
  });

  const rows = ((txQuery.data?.data as TxItem[] | undefined) ?? []).slice(0, 5);
  const stats = useMemo(
    () => ({
      purchases: rows.length,
      spent: rows.reduce((acc, row) => acc + row.totalAmount, 0),
    }),
    [rows],
  );

  const nextGoal = useMemo(() => {
    let selected: { name: string; missing: number; progress: number } | null = null;

    campaigns.forEach((campaign, index) => {
      const rewards = ((rewardQueries[index]?.data?.data as RewardItem[] | undefined) ?? []).filter((entry) => entry.status === "active");
      rewards.forEach((reward) => {
        const missing = reward.cost - campaign.current;
        if (missing <= 0) {
          return;
        }

        const progress = Math.min(100, Math.round((campaign.current / reward.cost) * 100));
        if (!selected || missing < selected.missing) {
          selected = { name: reward.name, missing, progress };
        }
      });
    });

    return selected;
  }, [campaigns, rewardQueries]);

  const qrValue = qrQuery.data
    ? JSON.stringify({
        code: qrQuery.data.data.code,
        payload: qrQuery.data.data.payload,
      })
    : "";

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-amber-300/70 bg-gradient-to-br from-amber-200 via-amber-100 to-amber-300 p-5 shadow-sm dark:border-amber-800/60 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-800">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/40 blur-2xl dark:bg-amber-700/20" />
        <div className="relative z-10 grid grid-cols-[1fr_auto] gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-amber-800 dark:text-amber-300">Tarjeta de lealtad</p>
            <p className="mt-2 text-6xl font-extrabold leading-none text-zinc-900 dark:text-zinc-100">{walletQuery.data?.data.totals.current ?? 0}</p>
            <p className="mt-1 text-4xl font-bold text-zinc-900 dark:text-zinc-100">Mis puntos</p>
            <p className="mt-6 text-sm text-zinc-700 dark:text-zinc-300">Estado: <b>{walletQuery.data?.data.card.status ?? "active"}</b></p>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
              Alta: {walletQuery.data?.data.card.createdAt ? new Date(walletQuery.data.data.card.createdAt).toLocaleDateString("es-MX") : "--"}
            </p>
          </div>

          {qrValue && (
            <div className="self-center rounded-2xl border border-white/60 bg-white p-3 shadow">
              <ReactQRCode value={qrValue} size={170} bgColor="#FFFFFF" fgColor="#111111" />
            </div>
          )}
        </div>
      </section>

      {nextGoal && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Tu próxima meta</h2>
          <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{nextGoal.name} ({nextGoal.progress}%) - ¡Casi la tienes!</p>
          <div className="mt-3 h-3 rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className="h-3 rounded-full bg-amber-500" style={{ width: `${nextGoal.progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Te faltan {nextGoal.missing} puntos para canjear.</p>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[12px] text-zinc-500">Compras</p>
          <p className="mt-1 text-4xl font-bold text-zinc-900 dark:text-zinc-100">{stats.purchases}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[12px] text-zinc-500">Gasto</p>
          <p className="mt-1 text-4xl font-bold text-zinc-900 dark:text-zinc-100">{formatMoney(stats.spent)}</p>
        </article>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Actividad reciente</h2>
        {txQuery.isLoading && <p className="mt-3 text-sm text-zinc-500">Cargando actividad...</p>}
        {!txQuery.isLoading && rows.length === 0 && <p className="mt-3 text-sm text-zinc-500">Sin movimientos todavía.</p>}
        {rows.length > 0 && (
          <ul className="mt-3 space-y-2">
            {rows.map((tx) => (
              <li key={tx.id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-800/60">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Compra #{tx.id.slice(0, 8)}</p>
                  <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">- {formatMoney(tx.totalAmount)}</p>
                </div>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{formatDateTime(tx.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Link href="/rewards" className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
            Ver recompensas
          </Link>
          <Link href="/purchase" className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
            Registrar compra
          </Link>
        </div>
      </section>
    </div>
  );
}
