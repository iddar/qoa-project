"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
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

export default function WalletRewardsPage() {
  const token = getAccessToken();
  const [selectedCampaignId, setSelectedCampaignId] = useState("");

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

  const selectedCampaign = walletCampaigns.find((campaign) => campaign.campaignId === selectedCampaignId);
  const activeCampaign = selectedCampaign ?? walletCampaigns[0];
  const activeCampaignId = activeCampaign?.campaignId ?? "";

  const rewardsQuery = useQuery({
    queryKey: ["wallet-rewards", activeCampaignId],
    enabled: Boolean(activeCampaignId) && Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.rewards.get({
        query: {
          campaignId: activeCampaignId,
          available: "true",
          limit: "100",
        },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const rewards = useMemo(
    () =>
      (((rewardsQuery.data?.data as RewardItem[] | undefined) ?? [])
        .filter((item) => item.status === "active")
        .sort((a, b) => a.cost - b.cost)),
    [rewardsQuery.data?.data],
  );

  const lowStockCount = rewards.filter((reward) => typeof reward.stock === "number" && reward.stock <= 3).length;
  const totalWalletPoints = walletQuery.data?.data.totals.current ?? 0;
  const selectedCampaignPoints = activeCampaign?.current ?? 0;

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Catálogo de recompensas</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Tus recompensas se separan por campaña según tus suscripciones activas.</p>

        {walletCampaigns.length > 1 && (
          <select
            value={activeCampaignId}
            onChange={(event) => setSelectedCampaignId(event.target.value)}
            className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {walletCampaigns.map((campaign) => (
              <option key={campaign.campaignId} value={campaign.campaignId}>
                {campaign.campaignName}
              </option>
            ))}
          </select>
        )}
      </header>

      <section className="grid grid-cols-3 gap-2">
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[11px] text-zinc-500">Disponibles</p>
          <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{rewards.length}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-[11px] text-zinc-500">Pts campaña</p>
          <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">{selectedCampaignPoints}</p>
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
        {rewardsQuery.isLoading && <p className="text-sm text-zinc-500">Cargando recompensas...</p>}

        {!walletQuery.isLoading && activeCampaign && !rewardsQuery.isLoading && rewards.length === 0 && (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/70">
            No hay recompensas activas para esta campaña.
          </p>
        )}

        {activeCampaign && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Campaña activa: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{activeCampaign.campaignName}</span>
            {" · "}stock bajo: {lowStockCount}
          </p>
        )}

        {rewards.map((reward) => (
          <article key={reward.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{reward.name}</h2>
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
      </section>
    </div>
  );
}
