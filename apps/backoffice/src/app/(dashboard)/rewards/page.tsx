"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type RewardForm = {
  campaignId: string;
  name: string;
  description: string;
  cost: number;
  stock: string;
};

type CampaignOption = {
  id: string;
  name: string;
};

type RewardItem = {
  id: string;
  campaignId: string;
  name: string;
  cost: number;
  stock?: number | null;
  status: string;
};

const emptyForm: RewardForm = {
  campaignId: "",
  name: "",
  description: "",
  cost: 1,
  stock: "",
};

export default function RewardsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RewardForm>(emptyForm);

  const { data: campaignsData } = useQuery({
    queryKey: ["rewards-campaigns"],
    queryFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.campaigns.get({
        query: { limit: "100" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const { data: rewardsData, isLoading, error } = useQuery({
    queryKey: ["rewards"],
    queryFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.rewards.get({
        query: { limit: "100" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const createReward = useMutation({
    mutationFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.rewards.post(
        {
          campaignId: form.campaignId,
          name: form.name,
          description: form.description || undefined,
          cost: form.cost,
          stock: form.stock === "" ? undefined : Number(form.stock),
          status: "active",
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["rewards"] });
      queryClient.invalidateQueries({ queryKey: ["reports-overview"] });
    },
  });

  const campaigns = (campaignsData?.data ?? []) as CampaignOption[];
  const rewards = (rewardsData?.data ?? []) as RewardItem[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Recompensas</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-300">
          Administra el catálogo de premios por campaña y su costo en puntos.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,_2fr)_minmax(0,_1fr)]">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">Listado</h2>
          {isLoading && (
            <p className="mt-4 text-sm text-zinc-400 dark:text-zinc-400">
              Cargando recompensas...
            </p>
          )}
          {error && (
            <p className="mt-4 text-sm text-red-500">
              No se pudieron cargar las recompensas.
            </p>
          )}

          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {rewards.map((reward) => (
              <li key={reward.id} className="py-3 text-sm">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {reward.name}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-300">
                  Campaña: {reward.campaignId}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-300">
                  Costo: {reward.cost} · Stock: {reward.stock ?? "ilimitado"} ·
                  Estado: {reward.status}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">Crear recompensa</h2>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              createReward.mutate();
            }}
          >
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-300">
              Campaña
              <select
                required
                value={form.campaignId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, campaignId: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">Selecciona campaña</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-300">
              Nombre
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-300">
              Descripción
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-300">
              Costo
              <input
                required
                min={1}
                type="number"
                value={form.cost}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, cost: Number(event.target.value) }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-300">
              Stock (vacío = ilimitado)
              <input
                min={0}
                type="number"
                value={form.stock}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, stock: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              disabled={createReward.isPending}
            >
              {createReward.isPending ? "Creando..." : "Crear recompensa"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
