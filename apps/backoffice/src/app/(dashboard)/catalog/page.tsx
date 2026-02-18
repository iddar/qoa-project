"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type CpgRow = { id: string; name: string; status: string };
type BrandRow = { id: string; cpgId: string; name: string; status: string };
type ProductRow = {
  id: string;
  brandId: string;
  sku: string;
  name: string;
  status: string;
};

export default function CatalogPage() {
  const queryClient = useQueryClient();
  const [cpgName, setCpgName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandCpgId, setBrandCpgId] = useState("");
  const [productName, setProductName] = useState("");
  const [productSku, setProductSku] = useState("");
  const [productBrandId, setProductBrandId] = useState("");
  const [brandFilterCpgId, setBrandFilterCpgId] = useState("");
  const [productFilterBrandId, setProductFilterBrandId] = useState("");

  const token = getAccessToken();

  const { data: cpgData } = useQuery({
    queryKey: ["catalog-cpgs"],
    queryFn: async () => {
      const { data, error } = await api.v1.cpgs.get({
        query: { limit: "50" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const brandsQuery = useMemo(
    () => ({
      limit: "50",
      cpgId: brandFilterCpgId || undefined,
    }),
    [brandFilterCpgId],
  );

  const { data: brandData } = useQuery({
    queryKey: ["catalog-brands", brandsQuery],
    queryFn: async () => {
      const { data, error } = await api.v1.brands.get({
        query: brandsQuery,
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const productsQuery = useMemo(
    () => ({
      limit: "50",
      brandId: productFilterBrandId || undefined,
    }),
    [productFilterBrandId],
  );

  const { data: productData } = useQuery({
    queryKey: ["catalog-products", productsQuery],
    queryFn: async () => {
      const { data, error } = await api.v1.products.get({
        query: productsQuery,
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const createCpg = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.v1.cpgs.post(
        { name: cpgName },
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setCpgName("");
      queryClient.invalidateQueries({ queryKey: ["catalog-cpgs"] });
    },
  });

  const createBrand = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.v1.brands.post(
        {
          cpgId: brandCpgId,
          name: brandName,
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setBrandName("");
      queryClient.invalidateQueries({ queryKey: ["catalog-brands"] });
    },
  });

  const createProduct = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.v1.products.post(
        {
          brandId: productBrandId,
          sku: productSku,
          name: productName,
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setProductName("");
      setProductSku("");
      queryClient.invalidateQueries({ queryKey: ["catalog-products"] });
    },
  });

  const cpgs = (cpgData?.data ?? []) as CpgRow[];
  const brands = (brandData?.data ?? []) as BrandRow[];
  const products = (productData?.data ?? []) as ProductRow[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Catálogo base</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-300">
          Esta sección alimenta la jerarquía del modelo de datos: CPG → Brand →
          Product. Campañas y reglas dependen de este catálogo para tomar forma.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <p className="font-semibold">Guía rápida</p>
        <p className="mt-1">
          1) Crea un CPG. 2) Crea brands asociadas a ese CPG. 3) Crea productos
          asociados a una brand. Sin este flujo, no podrás definir bien campañas
          por marca/producto.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">CPGs</h2>
          <form
            className="mt-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              createCpg.mutate();
            }}
          >
            <input
              placeholder="Nombre del CPG"
              value={cpgName}
              onChange={(event) => setCpgName(event.target.value)}
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              disabled={createCpg.isPending}
            >
              Crear CPG
            </button>
          </form>

          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {cpgs.map((cpg) => (
              <li key={cpg.id} className="py-2 text-xs">
                <p className="font-medium">{cpg.name}</p>
                <p className="text-zinc-500 dark:text-zinc-300">{cpg.id}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">Brands</h2>
          <form
            className="mt-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              createBrand.mutate();
            }}
          >
            <input
              placeholder="CPG ID"
              value={brandCpgId}
              onChange={(event) => setBrandCpgId(event.target.value)}
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              placeholder="Nombre de la brand"
              value={brandName}
              onChange={(event) => setBrandName(event.target.value)}
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              disabled={createBrand.isPending}
            >
              Crear brand
            </button>
          </form>

          <input
            placeholder="Filtrar por CPG ID"
            value={brandFilterCpgId}
            onChange={(event) => setBrandFilterCpgId(event.target.value)}
            className="mt-3 w-full rounded-md border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />

          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {brands.map((brand) => (
              <li key={brand.id} className="py-2 text-xs">
                <p className="font-medium">{brand.name}</p>
                <p className="text-zinc-500 dark:text-zinc-300">
                  cpg: {brand.cpgId}
                </p>
                <p className="text-zinc-500 dark:text-zinc-300">{brand.id}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">Products</h2>
          <form
            className="mt-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              createProduct.mutate();
            }}
          >
            <input
              placeholder="Brand ID"
              value={productBrandId}
              onChange={(event) => setProductBrandId(event.target.value)}
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              placeholder="SKU"
              value={productSku}
              onChange={(event) => setProductSku(event.target.value)}
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <input
              placeholder="Nombre del producto"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              disabled={createProduct.isPending}
            >
              Crear producto
            </button>
          </form>

          <input
            placeholder="Filtrar por Brand ID"
            value={productFilterBrandId}
            onChange={(event) => setProductFilterBrandId(event.target.value)}
            className="mt-3 w-full rounded-md border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />

          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {products.map((product) => (
              <li key={product.id} className="py-2 text-xs">
                <p className="font-medium">{product.name}</p>
                <p className="text-zinc-500 dark:text-zinc-300">sku: {product.sku}</p>
                <p className="text-zinc-500 dark:text-zinc-300">
                  brand: {product.brandId}
                </p>
                <p className="text-zinc-500 dark:text-zinc-300">{product.id}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
