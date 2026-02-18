"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type Brand = {
  id: string;
  name: string;
  logoUrl?: string | null;
  status: "active" | "inactive";
  createdAt: string;
};

type FormState = {
  name: string;
  logoUrl: string;
  status: "active" | "inactive";
};

const emptyForm: FormState = {
  name: "",
  logoUrl: "",
  status: "active",
};

function BrandInitial({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="h-10 w-10 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-sm font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      {name[0]?.toUpperCase()}
    </div>
  );
}

export default function BrandsPage() {
  const queryClient = useQueryClient();
  const token = getAccessToken();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState("");

  // Fetch user to get tenantId (cpgId)
  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data, error } = await api.v1.users.me.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const cpgId = meData?.data?.tenantId as string | undefined;

  const { data, isLoading, error } = useQuery({
    queryKey: ["brands", cpgId],
    queryFn: async () => {
      const { data, error } = await api.v1.brands.get({
        headers: { authorization: `Bearer ${token}` },
        query: cpgId ? { cpgId } : {},
      });
      if (error) throw error;
      return data;
    },
    enabled: !!cpgId,
  });

  const createBrand = useMutation({
    mutationFn: async () => {
      if (!cpgId) throw new Error("No CPG ID");
      const { data, error } = await api.v1.brands.post(
        {
          cpgId,
          name: form.name,
          logoUrl: form.logoUrl || undefined,
          status: form.status,
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["brands"] });
    },
  });

  const brands: Brand[] = data?.data ?? [];
  const filtered = brands.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()),
  );

  const activeBrands = brands.filter((b) => b.status === "active").length;
  const inactiveBrands = brands.filter((b) => b.status === "inactive").length;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Marcas</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Gestiona las marcas de tu empresa en el catálogo de Qoa.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total", value: brands.length, color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
          { label: "Activas", value: activeBrands, color: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400" },
          { label: "Inactivas", value: inactiveBrands, color: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{s.label}</p>
            {isLoading ? (
              <div className="mt-1 h-7 w-10 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            ) : (
              <p className={`mt-0.5 text-2xl font-bold ${s.color.split(" ").slice(1).join(" ")}`}>
                {s.value}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Brand list */}
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  placeholder="Buscar marcas..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-8 pr-3 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder:text-zinc-600 dark:focus:border-zinc-600"
                />
              </div>
            </div>
          </div>

          {isLoading && (
            <div className="space-y-3 p-5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                    <div className="h-3 w-20 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="p-5">
              <p className="text-sm text-red-500">No se pudo cargar las marcas.</p>
            </div>
          )}

          {!isLoading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                  <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                  <path d="M7 7h.01" />
                </svg>
              </div>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                {search ? "Sin resultados" : "Aún no tienes marcas"}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {search ? `No encontramos marcas con "${search}"` : "Crea tu primera marca usando el formulario."}
              </p>
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {filtered.map((brand) => (
                <li key={brand.id} className="flex items-center gap-3 px-5 py-3.5">
                  <BrandInitial name={brand.name} logoUrl={brand.logoUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {brand.name}
                    </p>
                    <p className="truncate text-xs text-zinc-400 dark:text-zinc-600 font-mono">
                      {brand.id}
                    </p>
                  </div>
                  <span className={`inline-flex flex-shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    brand.status === "active"
                      ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
                  }`}>
                    {brand.status === "active" ? "Activa" : "Inactiva"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Create form */}
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
            <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Nueva marca
            </h2>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                createBrand.mutate();
              }}
            >
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Nombre <span className="text-red-400">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  required
                  minLength={2}
                  maxLength={200}
                  placeholder="Ej: Coca-Cola"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  URL del logo <span className="text-zinc-400">(opcional)</span>
                </label>
                <input
                  value={form.logoUrl}
                  onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))}
                  type="url"
                  placeholder="https://..."
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                />
                {form.logoUrl && (
                  <div className="mt-2 flex items-center gap-2">
                    <img
                      src={form.logoUrl}
                      alt="preview"
                      className="h-8 w-8 rounded object-cover border border-zinc-200"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <span className="text-xs text-zinc-400">Vista previa</span>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Estado
                </label>
                <div className="flex gap-3">
                  {(["active", "inactive"] as const).map((s) => (
                    <label key={s} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="status"
                        value={s}
                        checked={form.status === s}
                        onChange={() => setForm((p) => ({ ...p, status: s }))}
                        className="accent-zinc-900"
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 capitalize">
                        {s === "active" ? "Activa" : "Inactiva"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={createBrand.isPending || !cpgId}
                className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {createBrand.isPending ? "Creando..." : "Crear marca"}
              </button>

              {createBrand.isError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
                  <p className="text-xs text-red-700 dark:text-red-400">
                    No se pudo crear la marca. Verifica que el nombre no esté duplicado.
                  </p>
                </div>
              )}
              {createBrand.isSuccess && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900 dark:bg-green-950/40">
                  <p className="text-xs text-green-700 dark:text-green-400">
                    Marca creada correctamente.
                  </p>
                </div>
              )}
            </form>
          </div>

          {/* Tip */}
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Tip
            </p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600 leading-relaxed">
              Una vez creada la marca puedes agregar productos desde la sección{" "}
              <a href="/products" className="font-medium text-zinc-600 hover:underline dark:text-zinc-400">
                Productos
              </a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
