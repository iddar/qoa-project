"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

type StoreRelation = {
  storeId: string;
  storeName: string;
  storeCode: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  status: "active" | "inactive";
  source: "first_activity" | "manual" | "import";
  firstActivityAt?: string;
  lastActivityAt?: string;
};

const statusLabel: Record<StoreRelation["status"], string> = {
  active: "Activa",
  inactive: "Inactiva",
};

const statusClass: Record<StoreRelation["status"], string> = {
  active: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  inactive: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export default function StoresPage() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  const token = getAccessToken();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newStoreIds, setNewStoreIds] = useState<string[]>([]);

  // Get all stores in the platform (to add as relations)
  const allStoresQuery = useQuery({
    queryKey: ["all-stores-for-cpg", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await api.v1.stores.get({
        query: { limit: "500" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  // Get related stores for this CPG
  const relatedStoresQuery = useQuery({
    queryKey: ["cpg-stores", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await api.v1.stores({ storeId: tenantId! }).cpgs.get({
        // Note: this endpoint is for store perspective, we need CPG perspective
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  // Use the new endpoint for CPG perspective
  const cpgRelationsQuery = useQuery({
    queryKey: ["cpg-relations", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      if (!tenantId) return { data: [], pagination: { hasMore: false } };
      // Call the new endpoint: GET /stores/cpgs/:cpgId/stores
      const { data, error } = await (api.v1.stores as any).cpgs({ cpgId: tenantId }).stores.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data ?? { data: [], pagination: { hasMore: false } };
    },
  });

  const addRelationMutation = useMutation({
    mutationFn: async (storeIds: string[]) => {
      if (!tenantId) throw new Error("no cpg");
      const { data, error } = await (api.v1.stores as any).cpgs({ cpgId: tenantId }).stores.post(
        { storeIds },
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cpg-relations", tenantId] });
      setAddModalOpen(false);
      setNewStoreIds([]);
    },
  });

  const removeRelationMutation = useMutation({
    mutationFn: async (storeId: string) => {
      if (!tenantId) throw new Error("no cpg");
      const { data, error } = await (api.v1.stores as any).cpgs({ cpgId: tenantId }).stores({ storeId }).delete({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cpg-relations", tenantId] });
    },
  });

  const allStores = (allStoresQuery.data?.data ?? []) as Array<{ id: string; name: string; code: string; city?: string; state?: string }>;
  const relatedStoreIds = new Set((cpgRelationsQuery.data?.data ?? []).map((s: any) => s.storeId));
  const availableStores = allStores.filter(s => !relatedStoreIds.has(s.id));
  const relations = (cpgRelationsQuery.data?.data ?? []) as StoreRelation[];

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("es-MX", { 
      day: "2-digit", 
      month: "short", 
      year: "numeric" 
    });
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Tiendas</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Administra las tiendas relacionadas con tu CPG.
          </p>
        </div>
        <button
          onClick={() => setAddModalOpen(true)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          + Agregar tiendas
        </button>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Total tiendas</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{relations.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Activas</p>
          <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
            {relations.filter(r => r.status === "active").length}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Disponibles en plataforma</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{allStores.length}</p>
        </div>
      </section>

      {/* Relations List */}
      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
        <header className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Tiendas relacionadas</h2>
        </header>

        {cpgRelationsQuery.isLoading && (
          <div className="p-8 text-center text-zinc-500">Cargando tiendas...</div>
        )}

        {!cpgRelationsQuery.isLoading && relations.length === 0 && (
          <div className="p-8 text-center text-zinc-500">
            No hay tiendas relacionadas todavía.
          </div>
        )}

        {!cpgRelationsQuery.isLoading && relations.length > 0 && (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {relations.map(relation => (
              <li key={relation.storeId} className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{relation.storeName}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                      <span>Código: {relation.storeCode}</span>
                      <span>•</span>
                      <span>{relation.city && `${relation.city}, `}{relation.state}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400">
                      <span>Origen: {relation.source === 'first_activity' ? 'Primera actividad' : relation.source === 'manual' ? 'Manual' : 'Import'}</span>
                      <span>•</span>
                      <span>Primera: {formatDate(relation.firstActivityAt)}</span>
                      <span>•</span>
                      <span>Última: {formatDate(relation.lastActivityAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass[relation.status]}`}>
                      {statusLabel[relation.status]}
                    </span>
                    {relation.status === "active" && (
                      <button
                        onClick={() => removeRelationMutation.mutate(relation.storeId)}
                        disabled={removeRelationMutation.isPending}
                        className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                      >
                        {removeRelationMutation.isPending ? "..." : "Eliminar"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Add Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Agregar tiendas al CPG
            </h3>
            <p className="mt-2 text-sm text-zinc-500">
              Selecciona las tiendas que deseas relacionar con tu CPG. Estas podrán ver tus campañas cuando las agregues.
            </p>

            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
              {availableStores.length === 0 ? (
                <p className="py-4 text-center text-sm text-zinc-500">
                  No hay tiendas disponibles para agregar.
                </p>
              ) : (
                availableStores.map(store => (
                  <label 
                    key={store.id} 
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    <input
                      type="checkbox"
                      checked={newStoreIds.includes(store.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewStoreIds([...newStoreIds, store.id]);
                        } else {
                          setNewStoreIds(newStoreIds.filter(id => id !== store.id));
                        }
                      }}
                      className="rounded border-zinc-300"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{store.name}</p>
                      <p className="text-xs text-zinc-500">{store.city && `${store.city}, `}{store.state}</p>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setAddModalOpen(false);
                  setNewStoreIds([]);
                }}
                className="rounded-md border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => addRelationMutation.mutate(newStoreIds)}
                disabled={newStoreIds.length === 0 || addRelationMutation.isPending}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {addRelationMutation.isPending ? "Agregando..." : `Agregar ${newStoreIds.length} tienda(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
