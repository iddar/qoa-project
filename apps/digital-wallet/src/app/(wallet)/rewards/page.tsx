"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type WalletCampaign = {
  campaignId: string;
  campaignName: string;
  enrollmentMode: "open" | "opt_in" | "system_universal";
  current: number;
  lifetime: number;
};

type RewardItem = {
  id: string;
  name: string;
  description?: string;
  cost: number;
  stock?: number;
  status: "active" | "inactive";
};

type RewardView = RewardItem & {
  campaignId: string;
  campaignName: string;
  campaignPoints: number;
  missingPoints: number;
  available: boolean;
};

export default function WalletRewardsPage() {
  const token = getAccessToken();

  const walletQuery = useQuery({
    queryKey: ["wallet-summary-rewards"],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.users.me.wallet.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const walletCampaigns = ((walletQuery.data?.data.campaigns as WalletCampaign[] | undefined) ?? []).filter(
    (campaign) => campaign.enrollmentMode !== "system_universal",
  );

  const rewardQueries = useQueries({
    queries: walletCampaigns.map((campaign) => ({
      queryKey: ["wallet-rewards", campaign.campaignId],
      enabled: Boolean(token),
      queryFn: async () => {
        const { data, error } = await api.v1.rewards.get({
          query: {
            campaignId: campaign.campaignId,
            limit: "100",
          },
          headers: { authorization: `Bearer ${token}` },
        });
        if (error) throw error;
        return data;
      },
    })),
  });

  const allRewards = useMemo(() => {
    const merged: RewardView[] = [];

    walletCampaigns.forEach((campaign, index) => {
      const rewards = ((rewardQueries[index]?.data?.data as RewardItem[] | undefined) ?? []).filter(
        (entry) => entry.status === "active",
      );

      for (const reward of rewards) {
        const missingPoints = Math.max(0, reward.cost - campaign.current);
        merged.push({
          ...reward,
          campaignId: campaign.campaignId,
          campaignName: campaign.campaignName,
          campaignPoints: campaign.current,
          missingPoints,
          available: missingPoints === 0,
        });
      }
    });

    return merged;
  }, [walletCampaigns, rewardQueries]);

  const availableRewards = useMemo(
    () => allRewards.filter((reward) => reward.available).sort((a, b) => a.cost - b.cost),
    [allRewards],
  );
  const goalRewards = useMemo(
    () => allRewards.filter((reward) => !reward.available).sort((a, b) => a.missingPoints - b.missingPoints),
    [allRewards],
  );

  const totalWalletPoints = walletQuery.data?.data.totals.current ?? 0;
  const lowStockCount = allRewards.filter((reward) => typeof reward.stock === "number" && reward.stock <= 3).length;
  const isLoadingRewards = rewardQueries.some((query) => query.isLoading);

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Catálogo de recompensas</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Todo tu catálogo en un solo feed: disponibles ahora y objetivos por desbloquear.</p>
      </header>

      <section className="grid grid-cols-3 gap-2">
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[11px] text-zinc-500">Disponibles</p>
          <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{availableRewards.length}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[11px] text-zinc-500">Objetivos</p>
          <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{goalRewards.length}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[11px] text-zinc-500">Pts totales</p>
          <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">{totalWalletPoints}</p>
        </article>
      </section>

      {walletCampaigns.length === 0 && !walletQuery.isLoading && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-zinc-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-zinc-200">
          Aún no tienes campañas tipo reto suscritas.
          <Link href="/campaigns" className="ml-1 font-semibold underline decoration-amber-500 underline-offset-2">
            Explorar retos
          </Link>
        </section>
      )}

      <section className="space-y-3">
        {walletQuery.isLoading && <p className="text-sm text-zinc-500">Cargando tu wallet...</p>}
        {isLoadingRewards && <p className="text-sm text-zinc-500">Cargando recompensas...</p>}

        {availableRewards.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Disponibles para ti</h2>
            {availableRewards.map((reward) => (
              <article key={reward.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      {reward.campaignName}
                    </span>
                    <h3 className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{reward.name}</h3>
                    {reward.description && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{reward.description}</p>}
                  </div>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                    {reward.cost} pts
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>Stock: {typeof reward.stock === "number" ? reward.stock : "ilimitado"}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">Canje en caja</span>
                </div>
              </article>
            ))}
          </>
        )}

        {goalRewards.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Objetivos (¡consíguelos!)</h2>
            {goalRewards.slice(0, 8).map((reward) => {
              const progress = Math.min(100, Math.round((reward.campaignPoints / reward.cost) * 100));
              return (
                <article
                  key={`goal-${reward.id}`}
                  className="rounded-xl border border-zinc-200 bg-zinc-100/60 p-4 opacity-90 dark:border-zinc-800 dark:bg-zinc-900/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                        {reward.campaignName}
                      </span>
                      <h3 className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{reward.name}</h3>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Te faltan {reward.missingPoints} pts para desbloquearla.</p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                      {reward.cost} pts
                    </span>
                  </div>

                  <div className="mt-3">
                    <div className="h-2 rounded bg-zinc-200 dark:bg-zinc-800">
                      <div className="h-2 rounded bg-indigo-500" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span>{reward.campaignPoints} pts actuales</span>
                      <span>{progress}% progreso</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </>
        )}

        {!walletQuery.isLoading && !isLoadingRewards && allRewards.length === 0 && (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/70">
            No hay recompensas activas por ahora.
          </p>
        )}

        <p className="text-xs text-zinc-500 dark:text-zinc-400">Stock bajo en catálogo: {lowStockCount}</p>
      </section>
    </div>
  );
}
