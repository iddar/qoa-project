"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type Brand = {
  id: string;
  name: string;
  status: "active" | "inactive";
};

type Product = {
  id: string;
  brandId: string;
  name: string;
  sku: string;
  status: "active" | "inactive";
  createdAt: string;
};

type FormState = {
  brandId: string;
  name: string;
  sku: string;
  status: "active" | "inactive";
};

const emptyForm: FormState = {
  brandId: "",
  name: "",
  sku: "",
  status: "active",
};

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const token = getAccessToken();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [filterBrand, setFilterBrand] = useState<string>("");

  // Get user's tenantId (cpgId)
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

  // Fetch brands for the select
  const { data: brandsData } = useQuery({
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

  const brands: Brand[] = brandsData?.data ?? [];
  const activeBrands = brands.filter((b) => b.status === "active");

  // Fetch products
  const { data: productsData, isLoading, error } = useQuery({
    queryKey: ["products", cpgId, filterBrand],
    queryFn: async () => {
      const query: Record<string, string> = {};
      if (cpgId) query.cpgId = cpgId;
      if (filterBrand) query.brandId = filterBrand;
      const { data, error } = await api.v1.products.get({
        headers: { authorization: `Bearer ${token}` },
        query,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!cpgId,
  });

  const createProduct = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.v1.products.post(
        {
          brandId: form.brandId,
          name: form.name,
          sku: form.sku,
          status: form.status,
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const products: Product[] = productsData?.data ?? [];
  const filtered = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const activeProducts = products.filter((p) => p.status === "active").length;
  const inactiveProducts = products.filter((p) => p.status === "inactive").length;

  const getBrandName = (brandId: string) =>
    brands.find((b) => b.id === brandId)?.name ?? "—";

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Productos</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Gestiona el catálogo de productos asociados a tus marcas.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total", value: products.length },
          { label: "Activos", value: activeProducts },
          { label: "Inactivos", value: inactiveProducts },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{s.label}</p>
            {isLoading ? (
              <div className="mt-1 h-7 w-10 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            ) : (
              <p className="mt-0.5 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{s.value}</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Product list */}
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
          {/* Filters */}
          <div className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  placeholder="Buscar por nombre o SKU..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-8 pr-3 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder:text-zinc-600 dark:focus:border-zinc-600"
                />
              </div>
              <select
                value={filterBrand}
                onChange={(e) => setFilterBrand(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-7 text-sm text-zinc-600 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
              >
                <option value="">Todas las marcas</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          {isLoading && (
            <div className="space-y-3 p-5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                    <div className="h-3 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="p-5">
              <p className="text-sm text-red-500">No se pudo cargar los productos.</p>
            </div>
          )}

          {!isLoading && !error && brands.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/40">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Necesitas crear marcas primero
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Los productos deben estar asociados a una marca.{" "}
                <a href="/brands" className="font-medium text-zinc-600 hover:underline dark:text-zinc-400">
                  Ir a Marcas
                </a>
              </p>
            </div>
          )}

          {!isLoading && !error && brands.length > 0 && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                  <path d="m7.5 4.27 9 5.15" />
                  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                  <path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
                </svg>
              </div>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                {search ? "Sin resultados" : "Aún no tienes productos"}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {search
                  ? `No se encontraron productos con "${search}"`
                  : "Crea tu primer producto usando el formulario."}
              </p>
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {filtered.map((product) => (
                <li key={product.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 dark:text-zinc-400">
                      <path d="m7.5 4.27 9 5.15" />
                      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                      <path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {product.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-zinc-400 font-mono">SKU: {product.sku}</span>
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                      <span className="text-xs text-zinc-400">{getBrandName(product.brandId)}</span>
                    </div>
                  </div>
                  <span className={`inline-flex flex-shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    product.status === "active"
                      ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
                  }`}>
                    {product.status === "active" ? "Activo" : "Inactivo"}
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
              Nuevo producto
            </h2>

            {brands.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Crea una marca antes de agregar productos.
                </p>
                <a
                  href="/brands"
                  className="mt-2 inline-block text-xs font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                >
                  Ir a Marcas
                </a>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  createProduct.mutate();
                }}
              >
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Marca <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={form.brandId}
                    onChange={(e) => setForm((p) => ({ ...p, brandId: e.target.value }))}
                    required
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">Selecciona una marca...</option>
                    {activeBrands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  {activeBrands.length === 0 && brands.length > 0 && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      Todas tus marcas están inactivas.
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Nombre del producto <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    required
                    minLength={2}
                    maxLength={200}
                    placeholder="Ej: Coca-Cola 600ml"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    SKU <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={form.sku}
                    onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value.toUpperCase() }))}
                    required
                    minLength={2}
                    maxLength={50}
                    placeholder="Ej: CC-600-PET"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 placeholder:font-sans focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                  />
                  <p className="mt-1 text-xs text-zinc-400">El SKU debe ser único en toda la plataforma.</p>
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
                          name="product-status"
                          value={s}
                          checked={form.status === s}
                          onChange={() => setForm((p) => ({ ...p, status: s }))}
                          className="accent-zinc-900"
                        />
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">
                          {s === "active" ? "Activo" : "Inactivo"}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={createProduct.isPending || !form.brandId}
                  className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {createProduct.isPending ? "Creando..." : "Crear producto"}
                </button>

                {createProduct.isError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
                    <p className="text-xs text-red-700 dark:text-red-400">
                      No se pudo crear el producto. El SKU podría estar duplicado.
                    </p>
                  </div>
                )}
                {createProduct.isSuccess && (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900 dark:bg-green-950/40">
                    <p className="text-xs text-green-700 dark:text-green-400">
                      Producto creado correctamente.
                    </p>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
