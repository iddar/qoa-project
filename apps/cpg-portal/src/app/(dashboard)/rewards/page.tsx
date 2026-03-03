"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

type Campaign = {
  id: string;
  name: string;
  status: string;
};

type CampaignTier = {
  id: string;
  name: string;
  order: number;
};

type Reward = {
  id: string;
  campaignId: string;
  name: string;
  description?: string;
  cost: number;
  minTierId?: string;
  stock?: number;
  status: "active" | "inactive";
  createdAt: string;
};

type RewardForm = {
  campaignId: string;
  name: string;
  description: string;
  cost: number;
  minTierId: string;
  stock: number;
  status: "active" | "inactive";
};

const initialRewardForm: RewardForm = {
  campaignId: "",
  name: "",
  description: "",
  cost: 10,
  minTierId: "",
  stock: 10,
  status: "active",
};

const EMPTY_CAMPAIGNS: Campaign[] = [];
const EMPTY_REWARDS: Reward[] = [];

export default function RewardsPage() {
  const { tenantId } = useAuth();
  const token = getAccessToken();
  const queryClient = useQueryClient();

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("all");
  const [form, setForm] = useState<RewardForm>(initialRewardForm);
  const [search, setSearch] = useState("");

  const campaignsQuery = useQuery({
    queryKey: ["campaigns", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await api.v1.campaigns.get({
        query: {
          cpgId: tenantId ?? undefined,
          limit: "100",
        },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const rewardsQuery = useQuery({
    queryKey: ["rewards", tenantId, selectedCampaignId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await api.v1.rewards.get({
        query: {
          campaignId: selectedCampaignId === "all" ? undefined : selectedCampaignId,
          limit: "200",
        },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const summaryQuery = useQuery({
    queryKey: ["cpg-summary", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await api.v1.reports.cpgs({ cpgId: tenantId }).summary.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const selectedCampaignForTier = form.campaignId || campaignsQuery.data?.data?.[0]?.id;
  const tiersQuery = useQuery({
    queryKey: ["campaign-tiers-for-reward", selectedCampaignForTier],
    enabled: Boolean(selectedCampaignForTier),
    queryFn: async () => {
      const { data, error } = await api.v1.campaigns({ campaignId: selectedCampaignForTier as string }).tiers.get({
        headers: { authorization: `Bearer ${token}` },
      });

      if (error) throw error;
      return data;
    },
  });

  const createRewardMutation = useMutation({
    mutationFn: async () => {
      const payloadCampaignId = form.campaignId || campaigns[0]?.id;
      if (!payloadCampaignId) {
        throw new Error("missing_campaign");
      }

      const { data, error } = await api.v1.rewards.post(
        {
          campaignId: payloadCampaignId,
          name: form.name,
          description: form.description || undefined,
          cost: form.cost,
          minTierId: form.minTierId || undefined,
          stock: form.stock,
          status: form.status,
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setForm((prev) => ({ ...initialRewardForm, campaignId: prev.campaignId }));
      queryClient.invalidateQueries({ queryKey: ["rewards", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["cpg-summary", tenantId] });
    },
  });

  const campaigns = (campaignsQuery.data?.data as Campaign[] | undefined) ?? EMPTY_CAMPAIGNS;
  const rewards = (rewardsQuery.data?.data as Reward[] | undefined) ?? EMPTY_REWARDS;
  const tiers = (tiersQuery.data?.data as CampaignTier[] | undefined) ?? [];
  const formCampaignId = form.campaignId || campaigns[0]?.id || "";

  const campaignMap = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign.name])),
    [campaigns],
  );

  const activeRewards = rewards.filter((reward) => reward.status === "active");
  const outOfStockRewards = rewards.filter((reward) => typeof reward.stock === "number" && reward.stock <= 0);
  const redemptions = summaryQuery.data?.data.kpis.redemptions ?? 0;
  const effectiveness = activeRewards.length > 0 ? redemptions / activeRewards.length : 0;
  const visibleRewards = rewards.filter((reward) => {
    if (!search.trim()) {
      return true;
    }

    const needle = search.trim().toLowerCase();
    return reward.name.toLowerCase().includes(needle) || (reward.description ?? "").toLowerCase().includes(needle);
  });

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Recompensas</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Administra recompensas por campana y monitorea su efectividad.
          </p>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Recompensas totales</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{rewards.length}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Activas</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{activeRewards.length}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Sin stock</p>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{outOfStockRewards.length}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Efectividad</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{effectiveness.toFixed(2)}</p>
          <p className="mt-1 text-[11px] text-zinc-400">canjes por recompensa activa (30d)</p>
        </article>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
          <header className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Listado de recompensas</h2>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Filtra por campana para revisar stock y costos.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar recompensa"
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                />
                <select
                  value={selectedCampaignId}
                  onChange={(event) => setSelectedCampaignId(event.target.value)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="all">Todas las campanas</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-[1.2fr_0.6fr_0.4fr_0.4fr_0.35fr] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              <span>Recompensa</span>
              <span>Campana</span>
              <span>Costo</span>
              <span>Tier mín</span>
              <span>Stock</span>
            </div>
          </header>

          {rewardsQuery.isLoading && (
            <div className="space-y-3 p-5">
              {[1, 2, 3].map((entry) => (
                <div key={entry} className="h-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
              ))}
            </div>
          )}

          {rewardsQuery.error && (
            <div className="p-5">
              <p className="text-sm text-red-500">No se pudieron cargar las recompensas.</p>
            </div>
          )}

          {!rewardsQuery.isLoading && !rewardsQuery.error && rewards.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Aun no hay recompensas para este filtro.</p>
            </div>
          )}

          {!rewardsQuery.isLoading && rewards.length > 0 && (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {visibleRewards.map((reward) => (
                <li key={reward.id} className="px-5 py-3">
                  <div className="grid grid-cols-[1.2fr_0.6fr_0.4fr_0.4fr_0.35fr] items-start gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{reward.name}</p>
                      {reward.description && (
                        <p className="mt-1 truncate text-[11px] text-zinc-400">{reward.description}</p>
                      )}
                    </div>

                    <div>
                      <p className="truncate text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">{campaignMap.get(reward.campaignId) ?? "Campana"}</p>
                      <span
                        className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          reward.status === "active"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {reward.status === "active" ? "Activa" : "Inactiva"}
                      </span>
                    </div>

                    <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">{reward.cost} pts</p>

                    <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">{reward.minTierId ? reward.minTierId.slice(0, 8) : "-"}</p>

                    <p
                      className={`text-[11px] font-semibold ${
                        typeof reward.stock === "number" && reward.stock <= 5
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-zinc-700 dark:text-zinc-200"
                      }`}
                    >
                      {typeof reward.stock === "number" ? reward.stock : "Ilimitado"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Nueva recompensa</h2>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                createRewardMutation.mutate();
              }}
            >
              <label htmlFor="reward-campaign" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Campana
                <select
                  id="reward-campaign"
                  required
                  value={formCampaignId}
                  onChange={(event) => setForm((prev) => ({ ...prev, campaignId: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">Selecciona</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </label>

              <label htmlFor="reward-name" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Nombre
                <input
                  id="reward-name"
                  required
                  minLength={3}
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>

              <label htmlFor="reward-description" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Descripcion
                <textarea
                  id="reward-description"
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label htmlFor="reward-cost" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Costo (pts)
                  <input
                    id="reward-cost"
                    required
                    type="number"
                    min={1}
                    value={form.cost}
                    onChange={(event) => setForm((prev) => ({ ...prev, cost: Number(event.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
                <label htmlFor="reward-stock" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Stock
                  <input
                    id="reward-stock"
                    required
                    type="number"
                    min={0}
                    value={form.stock}
                    onChange={(event) => setForm((prev) => ({ ...prev, stock: Number(event.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
              </div>

              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Tier mínimo requerido (opcional)
                <select
                  value={form.minTierId}
                  onChange={(event) => setForm((prev) => ({ ...prev, minTierId: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">Sin requisito de tier</option>
                  {tiers.map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.order} - {tier.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Estado
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      status: event.target.value as "active" | "inactive",
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="active">Activa</option>
                  <option value="inactive">Inactiva</option>
                </select>
              </label>

              <button
                type="submit"
                disabled={createRewardMutation.isPending || campaigns.length === 0}
                className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {createRewardMutation.isPending ? "Creando..." : "Crear recompensa"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-300">
            <p className="font-semibold">Metrica sugerida</p>
            <p className="mt-1">
              Efectividad = canjes del periodo / recompensas activas. Te ayuda a medir si tu catalogo es atractivo.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
