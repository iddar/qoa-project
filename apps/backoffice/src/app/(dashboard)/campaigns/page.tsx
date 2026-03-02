"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type CampaignForm = {
  name: string;
  description: string;
  cpgId: string;
};

type CampaignListItem = {
  id: string;
  name: string;
  status: string;
  cpgId?: string;
  startsAt?: string;
  endsAt?: string;
};

type CampaignAuditItem = {
  id: string;
  action: string;
  notes?: string;
  createdAt: string;
};

type CampaignPolicyItem = {
  id: string;
  policyType: "max_accumulations" | "min_amount" | "min_quantity" | "cooldown";
  scopeType: "campaign" | "brand" | "product";
  scopeId?: string;
  period: "transaction" | "day" | "week" | "month" | "lifetime";
  value: number;
  active: boolean;
};

type PolicyForm = {
  policyType: CampaignPolicyItem["policyType"];
  scopeType: CampaignPolicyItem["scopeType"];
  scopeId: string;
  period: CampaignPolicyItem["period"];
  value: number;
};

const emptyForm: CampaignForm = {
  name: "",
  description: "",
  cpgId: "",
};

const emptyPolicyForm: PolicyForm = {
  policyType: "max_accumulations",
  scopeType: "campaign",
  scopeId: "",
  period: "day",
  value: 1,
};

const actionLabel = (status: string) => {
  if (status === "draft" || status === "rejected") return "Enviar a revisión";
  if (status === "ready_for_review") return "Revisar";
  if (status === "in_review") return "Confirmar";
  if (status === "confirmed") return "Activar";
  return null;
};

const policyLabel = (policy: CampaignPolicyItem) => {
  if (policy.policyType === "min_amount") {
    return `Compra mínima de $${policy.value.toLocaleString("es-MX")} por ${policy.period}`;
  }

  if (policy.policyType === "min_quantity") {
    return `Compra mínima de ${policy.value} pieza(s) por ${policy.period}`;
  }

  if (policy.policyType === "max_accumulations") {
    return `Máximo ${policy.value} acumulaciones por ${policy.period}`;
  }

  return `Enfriamiento de ${policy.value} por ${policy.period}`;
};

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CampaignForm>(emptyForm);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [policyForm, setPolicyForm] = useState<PolicyForm>(emptyPolicyForm);

  const { data, isLoading, error } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.campaigns.get({
        query: {
          limit: "50",
        },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const { data: auditData } = useQuery({
    queryKey: ["campaign-audit", selectedCampaignId],
    enabled: Boolean(selectedCampaignId),
    queryFn: async () => {
      if (!selectedCampaignId) return null;
      const token = getAccessToken();
      const { data, error } = await api.v1.campaigns({
        campaignId: selectedCampaignId,
      })["audit-logs"].get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const { data: policiesData } = useQuery({
    queryKey: ["campaign-policies", selectedCampaignId],
    enabled: Boolean(selectedCampaignId),
    queryFn: async () => {
      if (!selectedCampaignId) return null;
      const token = getAccessToken();
      const { data, error } = await api.v1.campaigns({
        campaignId: selectedCampaignId,
      }).policies.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const createCampaign = useMutation({
    mutationFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.campaigns.post(
        {
          name: form.name,
          description: form.description || undefined,
          cpgId: form.cpgId || undefined,
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
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });

  const transitionCampaign = useMutation({
    mutationFn: async ({ campaignId, status }: { campaignId: string; status: string }) => {
      const token = getAccessToken();

      if (status === "draft" || status === "rejected") {
        const { data, error } = await api.v1.campaigns({ campaignId })[
          "ready-for-review"
        ].post(
          {
            reason: "Cambio de estado desde backoffice",
          },
          {
            headers: { authorization: `Bearer ${token}` },
          },
        );
        if (error) throw error;
        return data;
      }

      if (status === "ready_for_review") {
        const { data, error } = await api.v1.campaigns({ campaignId }).review.post(
          {
            approved: true,
            notes: "Revisión aprobada desde backoffice",
          },
          {
            headers: { authorization: `Bearer ${token}` },
          },
        );
        if (error) throw error;
        return data;
      }

      if (status === "in_review") {
        const { data, error } = await api.v1.campaigns({ campaignId }).confirm.post(
          {
            notes: "Confirmada desde backoffice",
          },
          {
            headers: { authorization: `Bearer ${token}` },
          },
        );
        if (error) throw error;
        return data;
      }

      if (status === "confirmed") {
        const { data, error } = await api.v1.campaigns({ campaignId }).activate.post(undefined, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (error) throw error;
        return data;
      }

      return null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      if (selectedCampaignId) {
        queryClient.invalidateQueries({
          queryKey: ["campaign-audit", selectedCampaignId],
        });
      }
    },
  });

  const createPolicy = useMutation({
    mutationFn: async () => {
      if (!selectedCampaignId) {
        throw new Error("campaign_not_selected");
      }

      const token = getAccessToken();
      const { data, error } = await api.v1.campaigns({
        campaignId: selectedCampaignId,
      }).policies.post(
        {
          policyType: policyForm.policyType,
          scopeType: policyForm.scopeType,
          scopeId:
            policyForm.scopeType === "campaign"
              ? undefined
              : policyForm.scopeId || undefined,
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
      if (selectedCampaignId) {
        queryClient.invalidateQueries({
          queryKey: ["campaign-policies", selectedCampaignId],
        });
        queryClient.invalidateQueries({
          queryKey: ["campaign-audit", selectedCampaignId],
        });
      }
    },
  });

  const campaigns = (data?.data ?? []) as CampaignListItem[];
  const logs = (auditData?.data ?? []) as CampaignAuditItem[];
  const policies = (policiesData?.data ?? []) as CampaignPolicyItem[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Campañas</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-300">
          Gestiona el ciclo de vida de campañas y revisa su auditoría.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <p className="font-semibold">Flujo recomendado</p>
        <p className="mt-1">
          Crea campaña en draft, envíala a revisión, aprueba, confirma y activa.
          El panel de auditoría te permite validar quién movió cada estado y en
          qué momento para mantener trazabilidad.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,_2fr)_minmax(0,_1fr)]">
        <div className="space-y-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold">Listado</h2>

            {isLoading && (
              <p className="mt-4 text-sm text-zinc-400 dark:text-zinc-400">
                Cargando campañas...
              </p>
            )}
            {error && (
              <p className="mt-4 text-sm text-red-500">
                No se pudieron cargar las campañas.
              </p>
            )}

            <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
              {campaigns.map((campaign: CampaignListItem) => {
                const action = actionLabel(campaign.status);

                return (
                  <li key={campaign.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedCampaignId(campaign.id)}
                        className="space-y-1 text-left"
                      >
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {campaign.name}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-300">
                          {campaign.id}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-300">
                          Estado: {campaign.status}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-300">
                          Vigencia: {campaign.startsAt ? new Date(campaign.startsAt).toLocaleDateString("es-MX") : "Sin inicio"}
                          {" · "}
                          {campaign.endsAt ? new Date(campaign.endsAt).toLocaleDateString("es-MX") : "Sin fin"}
                        </p>
                        {campaign.cpgId && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-300">
                            CPG: {campaign.cpgId}
                          </p>
                        )}
                      </button>

                      {action && (
                        <button
                          type="button"
                          onClick={() =>
                            transitionCampaign.mutate({
                              campaignId: campaign.id,
                              status: campaign.status,
                            })
                          }
                          className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          disabled={transitionCampaign.isPending}
                        >
                          {action}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold">Auditoría</h2>
            {!selectedCampaignId && (
              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-300">
                Selecciona una campaña para ver su historial.
              </p>
            )}

            {selectedCampaignId && logs.length === 0 && (
              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-300">
                No hay eventos de auditoría.
              </p>
            )}

            <ul className="mt-3 space-y-2">
              {logs.map((log: CampaignAuditItem) => (
                <li
                  key={log.id}
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <p className="font-medium text-zinc-700 dark:text-zinc-200">
                    {log.action}
                  </p>
                  {log.notes && (
                    <p className="text-zinc-500 dark:text-zinc-300">
                      {log.notes}
                    </p>
                  )}
                  <p className="text-zinc-500 dark:text-zinc-300">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold">Políticas de acumulación</h2>
            {!selectedCampaignId && (
              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-300">
                Selecciona una campaña para gestionar sus políticas.
              </p>
            )}

            {selectedCampaignId && (
              <>
                {policies.length === 0 && (
                  <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-300">
                    Esta campaña no tiene políticas configuradas.
                  </p>
                )}

                <ul className="mt-3 space-y-2">
                  {policies.map((policy) => (
                    <li
                      key={policy.id}
                      className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <p className="font-medium text-zinc-700 dark:text-zinc-200">{policyLabel(policy)}</p>
                      <p className="text-zinc-500 dark:text-zinc-300">
                        alcance: {policy.scopeType}
                        {policy.scopeId ? ` · scopeId: ${policy.scopeId}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>

                <form
                  className="mt-4 grid gap-3 md:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    createPolicy.mutate();
                  }}
                >
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                    Tipo
                    <select
                      value={policyForm.policyType}
                      onChange={(event) =>
                        setPolicyForm((prev) => ({
                          ...prev,
                          policyType: event.target.value as PolicyForm["policyType"],
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <option value="max_accumulations">max_accumulations</option>
                      <option value="min_amount">min_amount</option>
                      <option value="min_quantity">min_quantity</option>
                      <option value="cooldown">cooldown</option>
                    </select>
                  </label>

                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                    Scope
                    <select
                      value={policyForm.scopeType}
                      onChange={(event) =>
                        setPolicyForm((prev) => ({
                          ...prev,
                          scopeType: event.target.value as PolicyForm["scopeType"],
                          scopeId: event.target.value === "campaign" ? "" : prev.scopeId,
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <option value="campaign">campaign</option>
                      <option value="brand">brand</option>
                      <option value="product">product</option>
                    </select>
                  </label>

                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                    Periodo
                    <select
                      value={policyForm.period}
                      onChange={(event) =>
                        setPolicyForm((prev) => ({
                          ...prev,
                          period: event.target.value as PolicyForm["period"],
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <option value="transaction">transaction</option>
                      <option value="day">day</option>
                      <option value="week">week</option>
                      <option value="month">month</option>
                      <option value="lifetime">lifetime</option>
                    </select>
                  </label>

                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                    Valor
                    <input
                      required
                      min={1}
                      type="number"
                      value={policyForm.value}
                      onChange={(event) =>
                        setPolicyForm((prev) => ({
                          ...prev,
                          value: Number(event.target.value),
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </label>

                  {policyForm.scopeType !== "campaign" && (
                    <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300 md:col-span-2">
                      Scope ID (UUID)
                      <input
                        required
                        value={policyForm.scopeId}
                        onChange={(event) =>
                          setPolicyForm((prev) => ({
                            ...prev,
                            scopeId: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      />
                    </label>
                  )}

                  <button
                    type="submit"
                    className="md:col-span-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                    disabled={createPolicy.isPending}
                  >
                    {createPolicy.isPending ? "Guardando..." : "Agregar política"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">Crear campaña</h2>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              createCampaign.mutate();
            }}
          >
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                Nombre
              </label>
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                Descripción
              </label>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                CPG ID
              </label>
              <input
                value={form.cpgId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, cpgId: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="UUID del CPG"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              disabled={createCampaign.isPending}
            >
              {createCampaign.isPending ? "Creando..." : "Crear campaña"}
            </button>

            {createCampaign.isSuccess && (
              <p className="text-xs text-green-600">
                Campaña creada correctamente.
              </p>
            )}
            {createCampaign.isError && (
              <p className="text-xs text-red-500">
                No se pudo crear la campaña.
              </p>
            )}
          </form>
        </div>
      </section>
    </div>
  );
}
