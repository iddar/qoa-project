"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ReactQRCode } from "@lglab/react-qr-code";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type WalletCampaign = {
  campaignId: string;
  campaignName: string;
  enrollmentMode: "open" | "opt_in" | "system_universal";
  current: number;
};

type RewardItem = {
  id: string;
  name: string;
  cost: number;
  status: "active" | "inactive";
};

type WalletCurrentTier = {
  id: string;
  name: string;
  order: number;
  windowUnit: "day" | "month" | "year";
  windowValue: number;
  minPurchaseCount?: number;
  minPurchaseAmount?: number;
};

export default function WalletHomePage() {
  const token = getAccessToken();
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);

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
  const currentTier = walletQuery.data?.data.card.currentTier as WalletCurrentTier | undefined;
  const tierState = walletQuery.data?.data.card.tierState as "unqualified" | "qualified" | "at_risk" | undefined;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl border border-amber-300/70 bg-gradient-to-br from-amber-200 via-amber-100 to-amber-300 p-5 shadow-sm dark:border-amber-800/60 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-800">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/40 blur-2xl dark:bg-amber-700/20" />
        <div className="relative z-10">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-amber-800 dark:text-amber-300">Tarjeta de lealtad</p>
            <p className="mt-2 text-6xl font-extrabold leading-none text-zinc-900 dark:text-zinc-100">{walletQuery.data?.data.totals.current ?? 0}</p>
            <p className="mt-1 text-4xl font-bold text-zinc-900 dark:text-zinc-100">Mis puntos</p>
             <p className="mt-6 text-sm text-zinc-700 dark:text-zinc-300">Estado: <b>{walletQuery.data?.data.card.status ?? "active"}</b></p>
             <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
               Nivel: <b>{currentTier ? `${currentTier.order} · ${currentTier.name}` : "Base"}</b>
               {tierState === "at_risk" ? " (en riesgo)" : ""}
             </p>
             <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
               Alta: {walletQuery.data?.data.card.createdAt ? new Date(walletQuery.data.data.card.createdAt).toLocaleDateString("es-MX") : "--"}
             </p>

             {currentTier && (
               <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                 Ventana de mantenimiento: {currentTier.windowValue} {currentTier.windowUnit}(s)
               </p>
             )}

            {qrValue && (
              <button
                type="button"
                onClick={() => setIsCardModalOpen(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm backdrop-blur hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-800">
                  <span className="grid grid-cols-2 gap-[1px]">
                    <span className="h-[5px] w-[5px] rounded-[2px] bg-zinc-900 dark:bg-zinc-100" />
                    <span className="h-[5px] w-[5px] rounded-[2px] bg-zinc-900 dark:bg-zinc-100" />
                    <span className="h-[5px] w-[5px] rounded-[2px] bg-zinc-900 dark:bg-zinc-100" />
                    <span className="h-[5px] w-[5px] rounded-[2px] bg-zinc-900 dark:bg-zinc-100" />
                  </span>
                </span>
                Ver tarjeta
              </button>
            )}
          </div>
        </div>
      </section>

      {isCardModalOpen && qrValue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5" role="dialog" aria-modal="true" aria-label="Tarjeta QR">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Tu tarjeta QR</h2>
              <button
                type="button"
                onClick={() => setIsCardModalOpen(false)}
                className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
              >
                Cerrar
              </button>
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Muéstrala en caja para registrar tus compras.</p>
            <div className="mt-4 flex justify-center rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-700">
              <ReactQRCode value={qrValue} size={220} bgColor="#FFFFFF" fgColor="#111111" />
            </div>
          </div>
        </div>
      )}

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

      <div className="flex flex-col gap-3">
        <Link
          href="/rewards"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-center text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:bg-zinc-800/70"
        >
          Ver recompensas
        </Link>
        <Link
          href="/purchase"
          className="w-full rounded-xl bg-zinc-900 px-4 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Registrar compra
        </Link>
      </div>
    </div>
  );
}
