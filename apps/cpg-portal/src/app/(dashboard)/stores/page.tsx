"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";
import { StoresMap } from "@/components/stores-map";

type StoreRelation = {
    storeId: string;
    storeName: string;
    storeCode: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    address?: string;
    type?: string;
    latitude?: number;
    longitude?: number;
    status: "active" | "inactive";
    source: "first_activity" | "manual" | "import";
    firstActivityAt?: string;
    lastActivityAt?: string;
};

type PlatformStore = {
    id: string;
    name: string;
    code: string;
    city?: string;
    state?: string;
};

const statusLabel: Record<StoreRelation["status"], string> = {
    active: "Activa",
    inactive: "Inactiva",
};

const sourceLabel: Record<StoreRelation["source"], string> = {
    first_activity: "Primera actividad",
    manual: "Curada por CPG",
    import: "Importada",
};

const formatDate = (dateStr?: string) =>
    dateStr
        ? new Date(dateStr).toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
              year: "numeric",
          })
        : "Sin movimiento";

export default function StoresPage() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    const token = getAccessToken();

    const [addModalOpen, setAddModalOpen] = useState(false);
    const [newStoreIds, setNewStoreIds] = useState<string[]>([]);
    const [search, setSearch] = useState("");
    const [selectedStoreId, setSelectedStoreId] = useState<string>("");
    const deferredSearch = useDeferredValue(search);

    const allStoresQuery = useQuery({
        queryKey: ["all-stores-for-cpg", tenantId],
        enabled: Boolean(tenantId),
        queryFn: async () => {
            const { data, error } = await api.v1.stores.get({
                query: { limit: "500" },
                headers: { authorization: `Bearer ${token}` },
            });
            if (error) {
                throw error;
            }
            return data;
        },
    });

    const cpgRelationsQuery = useQuery({
        queryKey: ["cpg-relations", tenantId],
        enabled: Boolean(tenantId),
        queryFn: async () => {
            if (!tenantId) {
                return { data: [], pagination: { hasMore: false } };
            }
            const { data, error } = await (api.v1.stores as any)
                .cpgs({ cpgId: tenantId })
                .stores.get({
                    query: { limit: "500" },
                    headers: { authorization: `Bearer ${token}` },
                });
            if (error) {
                throw error;
            }
            return data ?? { data: [], pagination: { hasMore: false } };
        },
    });

    const addRelationMutation = useMutation({
        mutationFn: async (storeIds: string[]) => {
            if (!tenantId) {
                throw new Error("missing_cpg");
            }
            const { data, error } = await (api.v1.stores as any)
                .cpgs({ cpgId: tenantId })
                .stores.post({ storeIds }, { headers: { authorization: `Bearer ${token}` } });
            if (error) {
                throw error;
            }
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
            if (!tenantId) {
                throw new Error("missing_cpg");
            }
            const { data, error } = await (api.v1.stores as any)
                .cpgs({ cpgId: tenantId })
                .stores({ storeId })
                .delete({
                    headers: { authorization: `Bearer ${token}` },
                });
            if (error) {
                throw error;
            }
            return data;
        },
        onSuccess: (_, storeId) => {
            queryClient.invalidateQueries({ queryKey: ["cpg-relations", tenantId] });
            setSelectedStoreId((current) => (current === storeId ? "" : current));
        },
    });

    const allStores = ((allStoresQuery.data?.data ?? []) as PlatformStore[]).sort((a, b) =>
        a.name.localeCompare(b.name, "es"),
    );
    const relations = (cpgRelationsQuery.data?.data ?? []) as StoreRelation[];
    const relatedStoreIds = new Set(
        relations
            .filter((relation) => relation.status === "active")
            .map((relation) => relation.storeId),
    );
    const availableStores = allStores.filter((store) => !relatedStoreIds.has(store.id));

    const normalizedSearch = deferredSearch.trim().toLowerCase();
    const filteredRelations = !normalizedSearch
        ? relations
        : relations.filter((relation) =>
              [
                  relation.storeName,
                  relation.storeCode,
                  relation.city,
                  relation.state,
                  relation.neighborhood,
                  relation.type,
              ]
                  .filter(Boolean)
                  .some((value) => value!.toLowerCase().includes(normalizedSearch)),
          );

    const geoStores = filteredRelations.filter(
        (relation): relation is StoreRelation & { latitude: number; longitude: number } =>
            typeof relation.latitude === "number" && typeof relation.longitude === "number",
    );

    useEffect(() => {
        if (!filteredRelations.length) {
            setSelectedStoreId("");
            return;
        }

        if (!filteredRelations.some((relation) => relation.storeId === selectedStoreId)) {
            setSelectedStoreId(filteredRelations[0]!.storeId);
        }
    }, [filteredRelations, selectedStoreId]);

    const selectedStore =
        filteredRelations.find((relation) => relation.storeId === selectedStoreId) ??
        filteredRelations[0] ??
        null;
    const activeRelations = relations.filter((relation) => relation.status === "active");
    const geoCoverage = activeRelations.filter(
        (relation) =>
            typeof relation.latitude === "number" && typeof relation.longitude === "number",
    ).length;
    const cityCoverage = new Set(activeRelations.map((relation) => relation.city).filter(Boolean))
        .size;
    const recentlyActive = [...activeRelations]
        .sort(
            (left, right) =>
                new Date(right.lastActivityAt ?? 0).getTime() -
                new Date(left.lastActivityAt ?? 0).getTime(),
        )
        .slice(0, 5);

    return (
        <div className="space-y-6 pb-8">
            <section className="overflow-hidden rounded-xl border border-cyan-100 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.22),_transparent_35%),linear-gradient(135deg,_#082f49_0%,_#0f172a_58%,_#111827_100%)] p-6 text-white shadow-[0_30px_80px_-40px_rgba(8,47,73,0.85)]">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                            Cobertura retail
                        </p>
                        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                            Mapa vivo de tiendas relacionadas
                        </h1>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/80">
                            La seed de desarrollo deja 100 tiendas disponibles y 50 asignadas al
                            tenant
                            <span className="font-semibold text-white">
                                {" "}
                                cpg.development@qoa.local
                            </span>
                            . Desde aquí puedes inspeccionar cobertura geográfica, actividad y
                            relación por tienda.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => setAddModalOpen(true)}
                            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-cyan-50"
                        >
                            Agregar tiendas
                        </button>
                        <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-cyan-50/90">
                            {geoCoverage} con coordenadas listas para mapa
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    label="Tiendas activas"
                    value={String(activeRelations.length)}
                    hint="portfolio actual del CPG"
                />
                <MetricCard
                    label="Tiendas en plataforma"
                    value={String(allStores.length)}
                    hint="universo total disponible"
                />
                <MetricCard
                    label="Ciudades cubiertas"
                    value={String(cityCoverage)}
                    hint="nodos con relación activa"
                />
                <MetricCard
                    label="Geo readiness"
                    value={`${geoCoverage}/${activeRelations.length || 0}`}
                    hint="tiendas activas con lat/lng"
                />
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
                <div className="flex h-full min-h-[680px] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
                    <div className="flex flex-col gap-4 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                Mapa OpenStreetMap
                            </h2>
                            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                                Selecciona una tienda en el mapa o en la lista para inspeccionar su
                                ficha.
                            </p>
                        </div>
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Buscar por nombre, código o ciudad"
                            className="w-full rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm outline-none transition focus:border-cyan-500 focus:bg-white md:max-w-xs dark:border-zinc-700 dark:bg-zinc-950 dark:focus:bg-zinc-900"
                        />
                    </div>
                    <div className="flex-1 p-4">
                        <StoresMap
                            stores={geoStores}
                            selectedStoreId={selectedStore?.storeId}
                            onSelectStore={(storeId) => setSelectedStoreId(storeId)}
                        />
                    </div>
                </div>

                <aside className="space-y-6">
                    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
                        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-zinc-400">
                            Store dossier
                        </p>
                        {selectedStore ? (
                            <div className="mt-4 space-y-4">
                                <div>
                                    <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                                        {selectedStore.storeName}
                                    </p>
                                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                                        {selectedStore.storeCode} ·{" "}
                                        {selectedStore.type ?? "sin tipo"}
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <DetailPill
                                        label="Estatus"
                                        value={statusLabel[selectedStore.status]}
                                    />
                                    <DetailPill
                                        label="Origen"
                                        value={sourceLabel[selectedStore.source]}
                                    />
                                    <DetailPill
                                        label="Primera"
                                        value={formatDate(selectedStore.firstActivityAt)}
                                    />
                                    <DetailPill
                                        label="Última"
                                        value={formatDate(selectedStore.lastActivityAt)}
                                    />
                                </div>
                                <div className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">
                                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                                        Ubicación
                                    </p>
                                    <p className="mt-2">
                                        {selectedStore.address ??
                                            ([selectedStore.city, selectedStore.state]
                                                .filter(Boolean)
                                                .join(", ") ||
                                                "Sin dirección")}
                                    </p>
                                    {typeof selectedStore.latitude === "number" &&
                                        typeof selectedStore.longitude === "number" && (
                                            <p className="mt-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                                                {selectedStore.latitude.toFixed(5)},{" "}
                                                {selectedStore.longitude.toFixed(5)}
                                            </p>
                                        )}
                                </div>
                                {selectedStore.status === "active" && (
                                    <button
                                        onClick={() =>
                                            removeRelationMutation.mutate(selectedStore.storeId)
                                        }
                                        disabled={removeRelationMutation.isPending}
                                        className="w-full rounded-full border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/30"
                                    >
                                        {removeRelationMutation.isPending
                                            ? "Actualizando..."
                                            : "Quitar del portfolio"}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                                No hay tiendas para mostrar con el filtro actual.
                            </p>
                        )}
                    </section>

                    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
                        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-zinc-400">
                            Última actividad
                        </p>
                        <div className="mt-4 space-y-3">
                            {recentlyActive.length === 0 && (
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                    Todavía no hay actividad registrada.
                                </p>
                            )}
                            {recentlyActive.map((relation) => (
                                <button
                                    key={relation.storeId}
                                    onClick={() => setSelectedStoreId(relation.storeId)}
                                    className="flex w-full items-start justify-between rounded-2xl bg-zinc-50 px-4 py-3 text-left transition hover:bg-cyan-50 dark:bg-zinc-950 dark:hover:bg-zinc-800"
                                >
                                    <div>
                                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                            {relation.storeName}
                                        </p>
                                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                            {relation.city ?? "Sin ciudad"} ·{" "}
                                            {formatDate(relation.lastActivityAt)}
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600 shadow-sm dark:bg-zinc-900 dark:text-zinc-300">
                                        {relation.storeCode}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                </aside>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                            Relaciones de tiendas
                        </h2>
                        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                            {filteredRelations.length} resultado(s) visibles para el filtro actual.
                        </p>
                    </div>
                    <div className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                        {activeRelations.length} activas
                    </div>
                </div>

                {cpgRelationsQuery.isLoading ? (
                    <div className="p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        Cargando portfolio de tiendas...
                    </div>
                ) : filteredRelations.length === 0 ? (
                    <div className="p-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        No hay tiendas relacionadas con el criterio actual.
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {filteredRelations.map((relation) => (
                            <button
                                key={relation.storeId}
                                onClick={() => setSelectedStoreId(relation.storeId)}
                                className={`grid w-full gap-4 px-5 py-4 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-950/60 lg:grid-cols-[minmax(0,1.5fr)_190px_160px] ${
                                    selectedStore?.storeId === relation.storeId
                                        ? "bg-cyan-50/60 dark:bg-cyan-950/10"
                                        : ""
                                }`}
                            >
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                            {relation.storeName}
                                        </p>
                                        <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                            {relation.storeCode}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                                        {[relation.neighborhood, relation.city, relation.state]
                                            .filter(Boolean)
                                            .join(", ") || "Sin ubicación textual"}
                                    </p>
                                </div>
                                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                                    <p className="font-medium text-zinc-800 dark:text-zinc-200">
                                        {sourceLabel[relation.source]}
                                    </p>
                                    <p className="mt-2">
                                        Primera: {formatDate(relation.firstActivityAt)}
                                    </p>
                                    <p>Última: {formatDate(relation.lastActivityAt)}</p>
                                </div>
                                <div className="flex items-center justify-between gap-4 lg:justify-end">
                                    <div
                                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                                            relation.status === "active"
                                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                                                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                                        }`}
                                    >
                                        {statusLabel[relation.status]}
                                    </div>
                                    {typeof relation.latitude === "number" &&
                                        typeof relation.longitude === "number" && (
                                            <div className="rounded-full border border-cyan-200 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:border-cyan-900/60 dark:text-cyan-300">
                                                Mapeada
                                            </div>
                                        )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </section>

            {addModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                                    Agregar tiendas al CPG
                                </h3>
                                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                                    Selecciona tiendas disponibles en la plataforma para agregarlas
                                    a tu cobertura activa.
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setAddModalOpen(false);
                                    setNewStoreIds([]);
                                }}
                                className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
                            >
                                Cerrar
                            </button>
                        </div>

                        <div className="mt-5 max-h-96 space-y-2 overflow-y-auto pr-1">
                            {availableStores.length === 0 ? (
                                <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                                    No hay tiendas disponibles para agregar.
                                </p>
                            ) : (
                                availableStores.map((store) => (
                                    <label
                                        key={store.id}
                                        className="flex cursor-pointer items-center gap-3 rounded-2xl border border-zinc-200 p-4 transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={newStoreIds.includes(store.id)}
                                            onChange={(event) => {
                                                if (event.target.checked) {
                                                    setNewStoreIds((current) => [
                                                        ...current,
                                                        store.id,
                                                    ]);
                                                    return;
                                                }
                                                setNewStoreIds((current) =>
                                                    current.filter((value) => value !== store.id),
                                                );
                                            }}
                                            className="rounded border-zinc-300"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                                {store.name}
                                            </p>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                                {store.code} ·{" "}
                                                {[store.city, store.state]
                                                    .filter(Boolean)
                                                    .join(", ") || "Sin ciudad"}
                                            </p>
                                        </div>
                                    </label>
                                ))
                            )}
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setAddModalOpen(false);
                                    setNewStoreIds([]);
                                }}
                                className="rounded-full border border-zinc-200 px-4 py-2.5 text-sm dark:border-zinc-700"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => addRelationMutation.mutate(newStoreIds)}
                                disabled={newStoreIds.length === 0 || addRelationMutation.isPending}
                                className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                            >
                                {addRelationMutation.isPending
                                    ? "Agregando..."
                                    : `Agregar ${newStoreIds.length} tienda(s)`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-400">
                {label}
            </p>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {value}
            </p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{hint}</p>
        </div>
    );
}

function DetailPill({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-zinc-950">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                {label}
            </p>
            <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">{value}</p>
        </div>
    );
}
