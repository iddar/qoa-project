"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

type CampaignStatus =
  | "draft"
  | "ready_for_review"
  | "in_review"
  | "rejected"
  | "confirmed"
  | "active"
  | "paused"
  | "ended";

type PolicyType = "max_accumulations" | "min_amount" | "min_quantity" | "cooldown";
type ScopeType = "campaign" | "brand" | "product";
type PeriodType = "transaction" | "day" | "week" | "month" | "lifetime";

type PolicyForm = {
  policyType: PolicyType;
  scopeType: ScopeType;
  scopeId: string;
  period: PeriodType;
  value: number;
};

type BrandOption = {
  id: string;
  name: string;
};

type ProductOption = {
  id: string;
  name: string;
  sku: string;
};

type CampaignPolicy = {
  id: string;
  policyType: PolicyType;
  scopeType: ScopeType;
  period: PeriodType;
  value: number;
};

type AuditItem = {
  id: string;
  action: string;
  notes?: string;
  createdAt: string;
};

type DailyPoint = {
  date: string;
  transactions: number;
  redemptions: number;
};

const emptyPolicyForm: PolicyForm = {
  policyType: "max_accumulations",
  scopeType: "campaign",
  scopeId: "",
  period: "day",
  value: 1,
};

const nextStatusAction: Partial<Record<CampaignStatus, { label: string; action: "ready" | "review" | "confirm" | "activate" }>> = {
  draft: { label: "Enviar a revisión", action: "ready" },
  rejected: { label: "Reenviar a revisión", action: "ready" },
  ready_for_review: { label: "Aprobar revisión", action: "review" },
  in_review: { label: "Confirmar", action: "confirm" },
  confirmed: { label: "Activar", action: "activate" },
};

export default function CampaignDetailPage() {
  const params = useParams<{ campaignId: string }>();
  const campaignId = params.campaignId;
  const { tenantId } = useAuth();
  const token = getAccessToken();
  const queryClient = useQueryClient();

  const [policyForm, setPolicyForm] = useState<PolicyForm>(emptyPolicyForm);

  const campaignQuery = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: async () => {
      const { data, error } = await api.v1.campaigns({ campaignId }).get({
        headers: { authorization: `Bearer ${token}` },
      });

      if (error) throw error;
      return data;
    },
  });

  const summaryQuery = useQuery({
    queryKey: ["campaign-summary", campaignId],
    queryFn: async () => {
      const { data, error } = await api.v1.reports.campaigns({ campaignId }).summary.get({
        headers: { authorization: `Bearer ${token}` },
      });

      if (error) throw error;
      return data;
    },
  });

  const policiesQuery = useQuery({
    queryKey: ["campaign-policies", campaignId],
    queryFn: async () => {
      const { data, error } = await api.v1.campaigns({ campaignId }).policies.get({
        headers: { authorization: `Bearer ${token}` },
      });

      if (error) throw error;
      return data;
    },
  });

  const auditQuery = useQuery({
    queryKey: ["campaign-audit", campaignId],
    queryFn: async () => {
      const { data, error } = await api.v1.campaigns({ campaignId })["audit-logs"].get({
        query: {
          limit: "20",
        },
        headers: { authorization: `Bearer ${token}` },
      });

      if (error) throw error;
      return data;
    },
  });

  const brandsQuery = useQuery({
    queryKey: ["campaign-policy-brands", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await api.v1.brands.get({
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

  const productsQuery = useQuery({
    queryKey: ["campaign-policy-products", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await api.v1.products.get({
        query: {
          cpgId: tenantId ?? undefined,
          limit: "300",
        },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const rewardsQuery = useQuery({
    queryKey: ["campaign-rewards", campaignId],
    queryFn: async () => {
      const { data, error } = await api.v1.rewards.get({
        query: {
          campaignId,
          limit: "200",
        },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const transitionMutation = useMutation({
    mutationFn: async (action: "ready" | "review" | "confirm" | "activate") => {
      if (action === "ready") {
        const { data, error } = await api.v1.campaigns({ campaignId })["ready-for-review"].post(
          {},
          { headers: { authorization: `Bearer ${token}` } },
        );
        if (error) throw error;
        return data;
      }

      if (action === "review") {
        const { data, error } = await api.v1.campaigns({ campaignId }).review.post(
          { approved: true },
          { headers: { authorization: `Bearer ${token}` } },
        );
        if (error) throw error;
        return data;
      }

      if (action === "confirm") {
        const { data, error } = await api.v1.campaigns({ campaignId }).confirm.post(
          {},
          { headers: { authorization: `Bearer ${token}` } },
        );
        if (error) throw error;
        return data;
      }

      const { data, error } = await api.v1.campaigns({ campaignId }).activate.post(undefined, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-audit", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaigns", tenantId] });
    },
  });

  const createPolicyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.v1.campaigns({ campaignId }).policies.post(
        {
          policyType: policyForm.policyType,
          scopeType: policyForm.scopeType,
          scopeId: policyForm.scopeType === "campaign" ? undefined : policyForm.scopeId,
          period: policyForm.period,
          value: policyForm.value,
          active: true,
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setPolicyForm(emptyPolicyForm);
      queryClient.invalidateQueries({ queryKey: ["campaign-policies", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-audit", campaignId] });
    },
  });

  const campaign = campaignQuery.data?.data;
  const currentStatus = campaign?.status as CampaignStatus | undefined;
  const transitionInfo = currentStatus ? nextStatusAction[currentStatus] : undefined;

  const policies = (policiesQuery.data?.data ?? []) as CampaignPolicy[];
  const auditItems = (auditQuery.data?.data ?? []) as AuditItem[];
  const rewards = (rewardsQuery.data?.data ?? []) as Array<{ status: string; stock?: number }>;
  const activeRewards = rewards.filter((reward) => reward.status === "active").length;
  const rewardEffectiveness = activeRewards > 0 ? (summaryQuery.data?.data.kpis.redemptions ?? 0) / activeRewards : 0;

  const scopeOptions = useMemo(() => {
    if (policyForm.scopeType === "brand") {
      const brands = (brandsQuery.data?.data ?? []) as BrandOption[];
      return brands.map((item: BrandOption) => ({ id: item.id, label: item.name }));
    }

    if (policyForm.scopeType === "product") {
      const products = (productsQuery.data?.data ?? []) as ProductOption[];
      return products.map((item: ProductOption) => ({ id: item.id, label: `${item.name} (${item.sku})` }));
    }

    return [];
  }, [brandsQuery.data?.data, policyForm.scopeType, productsQuery.data?.data]);

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {campaign?.name ?? "Campaña"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Gestiona el ciclo de vida, reglas y resultados de la campaña.
          </p>
        </div>

        {transitionInfo && (
          <button
            type="button"
            onClick={() => transitionMutation.mutate(transitionInfo.action)}
            disabled={transitionMutation.isPending}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {transitionMutation.isPending ? "Aplicando..." : transitionInfo.label}
          </button>
        )}
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Transacciones</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {summaryQuery.data?.data.kpis.transactions ?? 0}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Ventas</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            ${(summaryQuery.data?.data.kpis.salesAmount ?? 0).toLocaleString("es-MX")}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Acumulaciones</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {summaryQuery.data?.data.kpis.accumulations ?? 0}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Canjes</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {summaryQuery.data?.data.kpis.redemptions ?? 0}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Tasa canje</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {((summaryQuery.data?.data.kpis.redemptionRate ?? 0) * 100).toFixed(1)}%
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Efectividad rewards</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{rewardEffectiveness.toFixed(2)}</p>
          <p className="mt-1 text-[11px] text-zinc-400">canjes / recompensa activa</p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Tendencia diaria</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Volumen de transacciones y canjes en los ultimos 30 dias.
          </p>

          <div className="mt-4 grid gap-2">
            {((summaryQuery.data?.data.daily ?? []) as DailyPoint[]).slice(-12).map((point: DailyPoint) => {
              const txHeight = Math.min(100, point.transactions * 8);
              const redemptionsHeight = Math.min(100, point.redemptions * 12);
              return (
                <div key={point.date} className="grid grid-cols-[64px_1fr_1fr] items-center gap-3 text-xs">
                  <span className="text-zinc-400">{point.date.slice(5)}</span>
                  <div className="h-2 rounded bg-blue-100 dark:bg-blue-950/40">
                    <div className="h-full rounded bg-blue-500" style={{ width: `${txHeight}%` }} />
                  </div>
                  <div className="h-2 rounded bg-emerald-100 dark:bg-emerald-950/40">
                    <div className="h-full rounded bg-emerald-500" style={{ width: `${redemptionsHeight}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Politicas activas</h2>
            <ul className="mt-3 space-y-2">
              {policies.length === 0 && <li className="text-xs text-zinc-500 dark:text-zinc-400">Sin politicas.</li>}
              {policies.map((policy: CampaignPolicy) => (
                <li
                  key={policy.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <p className="font-medium text-zinc-800 dark:text-zinc-200">
                    {policy.policyType} · {policy.scopeType}
                  </p>
                  <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">
                    periodo {policy.period} · valor {policy.value}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Nueva politica</h2>
            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                createPolicyMutation.mutate();
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Tipo
                  <select
                    value={policyForm.policyType}
                    onChange={(event) =>
                      setPolicyForm((prev) => ({ ...prev, policyType: event.target.value as PolicyType }))
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="max_accumulations">max_accumulations</option>
                    <option value="min_amount">min_amount</option>
                    <option value="min_quantity">min_quantity</option>
                    <option value="cooldown">cooldown</option>
                  </select>
                </label>

                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Scope
                  <select
                    value={policyForm.scopeType}
                    onChange={(event) =>
                      setPolicyForm((prev) => ({
                        ...prev,
                        scopeType: event.target.value as ScopeType,
                        scopeId: "",
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="campaign">campaign</option>
                    <option value="brand">brand</option>
                    <option value="product">product</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Periodo
                  <select
                    value={policyForm.period}
                    onChange={(event) =>
                      setPolicyForm((prev) => ({ ...prev, period: event.target.value as PeriodType }))
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="transaction">transaction</option>
                    <option value="day">day</option>
                    <option value="week">week</option>
                    <option value="month">month</option>
                    <option value="lifetime">lifetime</option>
                  </select>
                </label>

                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Valor
                  <input
                    type="number"
                    min={1}
                    value={policyForm.value}
                    onChange={(event) =>
                      setPolicyForm((prev) => ({ ...prev, value: Number(event.target.value) }))
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
              </div>

              {policyForm.scopeType !== "campaign" && (
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {policyForm.scopeType === "brand" ? "Marca" : "Producto"}
                  <select
                    required
                    value={policyForm.scopeId}
                    onChange={(event) => setPolicyForm((prev) => ({ ...prev, scopeId: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="">Selecciona</option>
                    {scopeOptions.map((option: { id: string; label: string }) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <button
                type="submit"
                disabled={createPolicyMutation.isPending}
                className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {createPolicyMutation.isPending ? "Guardando..." : "Agregar politica"}
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Auditoria</h2>
        <ul className="mt-3 space-y-2">
          {auditItems.length === 0 && <li className="text-xs text-zinc-500 dark:text-zinc-400">Sin eventos.</li>}
          {auditItems.map((entry: AuditItem) => (
            <li key={entry.id} className="rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800">
              <p className="font-medium text-zinc-700 dark:text-zinc-200">{entry.action}</p>
              <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">
                {new Date(entry.createdAt).toLocaleString("es-MX")}
                {entry.notes ? ` · ${entry.notes}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
