"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

type StoreAssignment = {
  storeId: string;
  storeName: string;
  storeCode: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  status: "visible" | "invited" | "enrolled" | "declined" | "removed" | "suspended";
  visibilitySource?: string;
  enrollmentSource?: string;
  enrolledAt?: string;
  invitedAt?: string;
};

const statusLabel: Record<StoreAssignment["status"], string> = {
  visible: "Visible",
  invited: "Invitada",
  enrolled: "Participando",
  declined: "Rechazada",
  removed: "Eliminada",
  suspended: "Suspendida",
};

const statusClass: Record<StoreAssignment["status"], string> = {
  visible: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  invited: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  enrolled: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  declined: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  removed: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  suspended: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

export default function StoresPage() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  const token = getAccessToken();

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [targetModal, setTargetModal] = useState<{ open: boolean; campaignId: string }>({ open: false, campaignId: "" });

  // Get all stores (for now - in future should filter by CPG relation)
  const storesQuery = useQuery({
    queryKey: ["cpg-stores", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await api.v1.stores.get({
        query: { limit: "200" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  // Get campaigns for the CPG
  const campaignsQuery = useQuery({
    queryKey: ["cpg-campaigns", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await api.v1.campaigns.get({
        query: { cpgId: tenantId, limit: "50" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  // Get stores for selected campaign
  const campaignStoresQuery = useQuery({
    queryKey: ["campaign-stores", selectedCampaignId],
    enabled: Boolean(selectedCampaignId),
    queryFn: async () => {
      if (!selectedCampaignId) return null;
      const { data, error } = await api.v1.campaigns({ campaignId: selectedCampaignId }).stores.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const targetMutation = useMutation({
    mutationFn: async ({ campaignId, storeIds }: { campaignId: string; storeIds: string[] }) => {
      const { data, error } = await api.v1.campaigns({ campaignId })["stores/target"].post(
        { storeIds, status: "visible", source: "manual" },
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-stores", selectedCampaignId] });
      setTargetModal({ open: false, campaignId: "" });
    },
  });

  const stores = (storesQuery.data?.data ?? []) as Array<{ id: string; name: string; code: string; city?: string; state?: string; neighborhood?: string }>;
  const campaigns = (campaignsQuery.data?.data ?? []) as Array<{ id: string; name: string; status: string }>;
  const campaignStores = (campaignStoresQuery.data?.data ?? []) as StoreAssignment[];

  const activeCampaigns = campaigns.filter(c => c.status === "active");

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Tiendas</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Administra las tiendas relacionadas con tus campañas.
          </p>
        </div>
      </div>

      {/* Campaign Selector */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        <label className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Selecciona una campaña
        </label>
        <select
          value={selectedCampaignId ?? ""}
          onChange={(e) => setSelectedCampaignId(e.target.value || null)}
          className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">Selecciona una campaña...</option>
          {activeCampaigns.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </section>

      {selectedCampaignId && (
        <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
          <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Tiendas en la campaña
            </h2>
            <button
              onClick={() => setTargetModal({ open: true, campaignId: selectedCampaignId })}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              + Agregar tiendas
            </button>
          </header>

          {campaignStoresQuery.isLoading && (
            <div className="p-8 text-center text-zinc-500">Cargando tiendas...</div>
          )}

          {!campaignStoresQuery.isLoading && campaignStores.length === 0 && (
            <div className="p-8 text-center text-zinc-500">
              No hay tiendas en esta campaña todavía.
            </div>
          )}

          {!campaignStoresQuery.isLoading && campaignStores.length > 0 && (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {campaignStores.map(store => (
                <li key={store.storeId} className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">{store.storeName}</p>
                      <p className="text-xs text-zinc-500">
                        {store.city && `${store.city}, `}{store.state}
                      </p>
                      <p className="text-xs text-zinc-400">Código: {store.storeCode}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass[store.status]}`}>
                      {statusLabel[store.status]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* All Stores List */}
      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
        <header className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Todas las tiendas ({stores.length})
          </h2>
        </header>

        {storesQuery.isLoading && (
          <div className="p-8 text-center text-zinc-500">Cargando tiendas...</div>
        )}

        {!storesQuery.isLoading && stores.length > 0 && (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-96 overflow-y-auto">
            {stores.map(store => (
              <li key={store.id} className="px-5 py-3">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{store.name}</p>
                <p className="text-xs text-zinc-500">
                  {store.city && `${store.city}, `}{store.state}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Target Modal */}
      {targetModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Agregar tiendas a campaña
            </h3>
            <p className="mt-2 text-sm text-zinc-500">
              Selecciona las tiendas que podrán ver esta campaña.
            </p>
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {stores.map(store => (
                <label key={store.id} className="flex items-center gap-2">
                  <input type="checkbox" className="rounded border-zinc-300" />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{store.name}</span>
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setTargetModal({ open: false, campaignId: "" })}
                className="rounded-md border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  // For demo, just close modal - real implementation would collect selected stores
                  setTargetModal({ open: false, campaignId: "" });
                }}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
