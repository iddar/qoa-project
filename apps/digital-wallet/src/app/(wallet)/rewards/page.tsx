"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type CardItem = {
  id: string;
  code: string;
  campaignId: string;
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
  const [selectedCardId, setSelectedCardId] = useState("");

  const cardsQuery = useQuery({
    queryKey: ["wallet-cards-rewards"],
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

  const rewardsQuery = useQuery({
    queryKey: ["wallet-rewards", activeCard?.campaignId],
    enabled: Boolean(activeCard?.campaignId) && Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.rewards.get({
        query: {
          campaignId: activeCard?.campaignId,
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
    () => ((rewardsQuery.data?.data as RewardItem[] | undefined) ?? []).filter((item) => item.status === "active"),
    [rewardsQuery.data?.data],
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Catálogo de recompensas</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Recompensas disponibles según tu tarjeta activa.</p>
      </header>

      {cards.length > 1 && (
        <select
          value={activeCardId}
          onChange={(event) => setSelectedCardId(event.target.value)}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {cards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.code}
            </option>
          ))}
        </select>
      )}

      <section className="space-y-3">
        {rewardsQuery.isLoading && <p className="text-sm text-zinc-500">Cargando recompensas...</p>}

        {!rewardsQuery.isLoading && rewards.length === 0 && (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/70">
            No hay recompensas activas para esta tarjeta.
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
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Stock: {typeof reward.stock === "number" ? reward.stock : "ilimitado"}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
