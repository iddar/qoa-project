"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

type Campaign = {
  id: string;
  name: string;
  description?: string;
  status: "draft" | "ready_for_review" | "in_review" | "rejected" | "confirmed" | "active" | "paused" | "ended";
  startsAt?: string;
  endsAt?: string;
  createdAt: string;
};

type FormState = {
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
};

const emptyForm: FormState = {
  name: "",
  description: "",
  startsAt: "",
  endsAt: "",
};

const statusLabel: Record<Campaign["status"], string> = {
  draft: "Borrador",
  ready_for_review: "Lista revisión",
  in_review: "En revisión",
  rejected: "Rechazada",
  confirmed: "Confirmada",
  active: "Activa",
  paused: "Pausada",
  ended: "Finalizada",
};

const statusClass: Record<Campaign["status"], string> = {
  draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  ready_for_review: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  in_review: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  rejected: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
  confirmed: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400",
  active: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  paused: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  ended: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  const token = getAccessToken();

  const [form, setForm] = useState<FormState>(emptyForm);

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

  const createCampaign = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("missing_cpg_scope");

      const { data, error } = await api.v1.campaigns.post(
        {
          name: form.name,
          description: form.description || undefined,
          cpgId: tenantId,
          startsAt: form.startsAt || undefined,
          endsAt: form.endsAt || undefined,
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
      queryClient.invalidateQueries({ queryKey: ["campaigns", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["cpg-summary", tenantId] });
    },
  });

  const campaigns = (campaignsQuery.data?.data ?? []) as Campaign[];
  const activeCampaigns = campaigns.filter((item) => item.status === "active").length;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Campañas</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Crea y administra tus programas de lealtad desde un solo lugar.
          </p>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Total campañas</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{campaigns.length}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Activas</p>
          <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">{activeCampaigns}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Transacciones (30d)</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {summaryQuery.data?.data.kpis.transactions ?? 0}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Canjes (30d)</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {summaryQuery.data?.data.kpis.redemptions ?? 0}
          </p>
        </article>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
          <header className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Listado de campañas</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Selecciona una campaña para editar reglas y visualizar performance.
            </p>
          </header>

          {campaignsQuery.isLoading && (
            <div className="space-y-3 p-5">
              {[1, 2, 3].map((entry) => (
                <div key={entry} className="h-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
              ))}
            </div>
          )}

          {campaignsQuery.error && (
            <div className="p-5">
              <p className="text-sm text-red-500">No se pudieron cargar las campañas.</p>
            </div>
          )}

          {!campaignsQuery.isLoading && !campaignsQuery.error && campaigns.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Aún no tienes campañas.</p>
            </div>
          )}

          {!campaignsQuery.isLoading && campaigns.length > 0 && (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
              {campaigns.map((campaign) => (
                <li key={campaign.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {campaign.name}
                      </p>
                      {campaign.description && (
                        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {campaign.description}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-zinc-400">
                        Creada: {new Date(campaign.createdAt).toLocaleDateString("es-MX")}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass[campaign.status]}`}
                      >
                        {statusLabel[campaign.status]}
                      </span>
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Abrir
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Nueva campaña</h2>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                createCampaign.mutate();
              }}
            >
              <label htmlFor="campaign-name" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Nombre
                <input
                  id="campaign-name"
                  required
                  minLength={3}
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>

              <label htmlFor="campaign-description" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Descripción
                <textarea
                  id="campaign-description"
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Inicio
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Fin
                  <input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(event) => setForm((prev) => ({ ...prev, endsAt: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={createCampaign.isPending || !tenantId}
                className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {createCampaign.isPending ? "Creando..." : "Crear campaña"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-300">
            <p className="font-semibold">Siguiente paso recomendado</p>
            <p className="mt-1">
              Abre la campaña recién creada para configurar políticas de acumulación,
              enviarla a revisión y monitorear su performance.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
