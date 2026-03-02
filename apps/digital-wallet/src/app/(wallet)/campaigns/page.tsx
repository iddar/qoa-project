"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type PolicySummary = {
  policyType: "max_accumulations" | "min_amount" | "min_quantity" | "cooldown";
  scopeType: "campaign" | "brand" | "product";
  period: "transaction" | "day" | "week" | "month" | "lifetime";
  value: number;
  label: string;
};

type Campaign = {
  id: string;
  key?: string;
  name: string;
  description?: string;
  enrollmentMode: "open" | "opt_in" | "system_universal";
  status: string;
  startsAt?: string;
  endsAt?: string;
  daysRemaining?: number;
  policySummaries?: PolicySummary[];
};

type Subscription = {
  campaignId: string;
  campaignName: string;
  enrollmentMode: "open" | "opt_in" | "system_universal";
  status: string;
  subscribedAt?: string;
  startsAt?: string;
  endsAt?: string;
  daysRemaining?: number;
  policySummaries?: PolicySummary[];
};

const EMPTY_SUBSCRIPTIONS: Subscription[] = [];

const timingLabel = (campaign: { startsAt?: string; endsAt?: string; daysRemaining?: number }) => {
  const start = campaign.startsAt ? new Date(campaign.startsAt).toLocaleDateString("es-MX") : "Sin inicio";
  const end = campaign.endsAt ? new Date(campaign.endsAt).toLocaleDateString("es-MX") : "Sin fin";

  if (campaign.daysRemaining === undefined) {
    return `${start} · ${end}`;
  }

  if (campaign.daysRemaining < 0) {
    return `${start} · Finalizó hace ${Math.abs(campaign.daysRemaining)} día(s)`;
  }

  return `${start} · Restan ${campaign.daysRemaining} día(s)`;
};

export default function WalletCampaignsPage() {
  const token = getAccessToken();
  const queryClient = useQueryClient();

  const discoverQuery = useQuery({
    queryKey: ["wallet-campaign-discover"],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.campaigns.discover.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const subscriptionsQuery = useQuery({
    queryKey: ["wallet-campaign-subscriptions"],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data, error } = await api.v1.campaigns.subscriptions.me.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await api.v1.campaigns({ campaignId }).subscribe.post(undefined, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet-campaign-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-campaign-discover"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-summary-rewards"] });
    },
  });

  const campaigns = (discoverQuery.data?.data ?? []) as Campaign[];
  const subscriptions = (subscriptionsQuery.data?.data as Subscription[] | undefined) ?? EMPTY_SUBSCRIPTIONS;
  const subscribedIds = useMemo(
    () => new Set(subscriptions.filter((entry) => entry.status === "subscribed").map((entry) => entry.campaignId)),
    [subscriptions],
  );

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Promociones y campañas</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Consulta vigencia, reglas y requisitos antes de suscribirte.</p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Suscripciones activas</p>
        {subscriptions.length === 0 && !subscriptionsQuery.isLoading && (
          <p className="mt-2 text-sm text-zinc-500">Aún no tienes suscripciones activas.</p>
        )}
        <ul className="mt-2 space-y-2">
          {subscriptions.map((entry) => (
            <li key={entry.campaignId} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-800/70">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">{entry.campaignName}</p>
              <p className="mt-1 text-zinc-500 dark:text-zinc-400">{entry.status} · {timingLabel(entry)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        {discoverQuery.isLoading && <p className="text-sm text-zinc-500">Cargando campañas...</p>}
        {campaigns.map((campaign) => {
          const isSubscribed = subscribedIds.has(campaign.id);
          const policies = campaign.policySummaries ?? [];

          return (
            <article key={campaign.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{campaign.name}</h2>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{campaign.description ?? "Sin descripción"}</p>
                  <p className="mt-2 text-[11px] text-zinc-400">{timingLabel(campaign)}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-zinc-400">{campaign.enrollmentMode}</p>
                </div>
                <button
                  type="button"
                  disabled={isSubscribed || subscribeMutation.isPending || campaign.daysRemaining !== undefined && campaign.daysRemaining < 0}
                  onClick={() => subscribeMutation.mutate(campaign.id)}
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {isSubscribed ? "Suscrito" : "Suscribirme"}
                </button>
              </div>

              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Reglas de promoción</p>
                {policies.length === 0 ? (
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Sin reglas específicas cargadas.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {policies.map((policy, index) => (
                      <li key={`${campaign.id}-${policy.policyType}-${index}`} className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {policy.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
