"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

type StoreProduct = {
  id: string;
  storeId: string;
  productId?: string;
  cpgId?: string;
  name: string;
  sku?: string;
  unitType: string;
  price: number;
  status: string;
  createdAt: string;
};

type Brand = {
  id: string;
  cpgId: string;
  name: string;
  logoUrl?: string;
  status: string;
};

type GlobalProduct = {
  id: string;
  name: string;
  sku?: string;
  brandId: string;
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (dateStr: string) =>
  new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));

export default function StoreProductsPage() {
  const token = getAccessToken();
  const { tenantId, tenantType } = useAuth();
  const queryClient = useQueryClient();

  const storeId = tenantType === "store" ? (tenantId ?? "") : "";

  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);

  const productsQuery = useQuery({
    queryKey: ["store-products", storeId, "list"],
    enabled: Boolean(token) && Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await api.v1.stores[storeId].products.get({
        query: { limit: "100" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return (data?.data ?? []) as StoreProduct[];
    },
  });

  const brandsQuery = useQuery({
    queryKey: ["store-brands", storeId],
    enabled: Boolean(token) && Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await api.v1.stores[storeId].brands.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return (data?.data ?? []) as Brand[];
    },
  });

  const products = productsQuery.data ?? [];
  const brands = brandsQuery.data ?? [];

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)),
    );
  }, [products, searchQuery]);

  const deleteProduct = useMutation({
    mutationFn: async (productId: string) => {
      if (!token) throw new Error("No auth");
      const { error } = await api.v1.stores[storeId].products[productId].delete({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-products", storeId] });
    },
  });

  const handleDelete = (product: StoreProduct) => {
    if (confirm(`¿Eliminar "${product.name}" del catálogo?`)) {
      deleteProduct.mutate(product.id);
    }
  };

  if (!storeId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500">No se ha identificado la tienda.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Mi Catálogo</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {products.length} producto{products.length !== 1 ? "s" : ""} en tu catálogo
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Agregar Producto
          </button>
        </div>

        <div className="mt-4">
          <input
            type="text"
            placeholder="Buscar por nombre o SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      </header>

      {productsQuery.isLoading && (
        <p className="text-sm text-zinc-500">Cargando productos...</p>
      )}

      <div className="flex-1 overflow-auto">
        {filteredProducts.length === 0 && !productsQuery.isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
              <svg className="h-8 w-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {searchQuery ? "No se encontraron productos" : "Aún no tienes productos"}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {searchQuery ? "Intenta con otra búsqueda" : "Agrega productos a tu catálogo para comenzar"}
            </p>
            {!searchQuery && (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Agregar tu primer producto
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-700">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Precio</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                          <svg className="h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {product.name}
                          </p>
                          {product.productId && (
                            <p className="text-xs text-zinc-400">Del catálogo global</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {product.sku ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      {formatMoney(product.price)}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 capitalize">
                      {product.unitType === "piece" ? "Pieza" : product.unitType}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          product.status === "active"
                            ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {product.status === "active" ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500">
                      {formatDate(product.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingProduct(product)}
                          className="rounded px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(product)}
                          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(showAddModal || editingProduct) && (
        <AddProductModal
          storeId={storeId}
          token={token ?? ""}
          brands={brands}
          product={editingProduct}
          onClose={() => {
            setShowAddModal(false);
            setEditingProduct(null);
          }}
          onSuccess={() => {
            setShowAddModal(false);
            setEditingProduct(null);
            queryClient.invalidateQueries({ queryKey: ["store-products", storeId] });
          }}
        />
      )}
    </div>
  );
}

type AddProductModalProps = {
  storeId: string;
  token: string;
  brands: Brand[];
  product?: StoreProduct | null;
  onClose: () => void;
  onSuccess: () => void;
};

function AddProductModal({ storeId, token, brands, product, onClose, onSuccess }: AddProductModalProps) {
  const [step, setStep] = useState<"brand" | "product">("brand");
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [createNewBrand, setCreateNewBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [globalProducts, setGlobalProducts] = useState<GlobalProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showNewProductForm, setShowNewProductForm] = useState(false);

  const [formData, setFormData] = useState({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    price: product?.price?.toString() ?? "",
  });

  const queryClient = useQueryClient();

  const searchProductsQuery = useQuery({
    queryKey: ["products-by-brand", selectedBrand?.id],
    enabled: Boolean(selectedBrand) && !createNewBrand && !showNewProductForm,
    queryFn: async () => {
      if (!selectedBrand) return [];
      const { data, error } = await api.v1.products.get({
        query: { brandId: selectedBrand.id, limit: "50" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return (data?.data ?? []) as GlobalProduct[];
    },
  });

  const createStoreProduct = useMutation({
    mutationFn: async () => {
      const price = Math.round(Number(formData.price));

      if (showNewProductForm) {
        const { error: createError } = await api.v1.stores[storeId].products.post(
          {
            name: formData.name,
            sku: formData.sku || undefined,
            price,
            ...(createNewBrand && newBrandName ? { name: formData.name } : {}),
            ...(selectedProductId ? { productId: selectedProductId } : {}),
          },
          { headers: { authorization: `Bearer ${token}` } },
        );
        if (createError) throw createError;
      } else {
        const { error: createError } = await api.v1.stores[storeId].products.post(
          {
            name: formData.name,
            sku: formData.sku || undefined,
            price,
            ...(selectedProductId ? { productId: selectedProductId } : {}),
          },
          { headers: { authorization: `Bearer ${token}` } },
        );
        if (createError) throw createError;
      }
    },
    onSuccess: () => {
      onSuccess();
    },
  });

  const updateStoreProduct = useMutation({
    mutationFn: async () => {
      if (!product) return;
      const price = Math.round(Number(formData.price));
      const { error: updateError } = await api.v1.stores[storeId].products[product.id].patch(
        {
          name: formData.name,
          sku: formData.sku || undefined,
          price,
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      onSuccess();
    },
  });

  const handleSubmit = async () => {
    try {
      if (product) {
        await updateStoreProduct.mutateAsync();
      } else {
        await createStoreProduct.mutateAsync();
      }
    } catch (err) {
      console.error("Error:", err);
    }
  };

  const handleBrandSelect = (brand: Brand) => {
    setSelectedBrand(brand);
    setShowNewProductForm(false);
    setSelectedProductId(null);
    setFormData({ name: "", sku: "", price: "" });
  };

  const handleCreateNewProduct = () => {
    setShowNewProductForm(true);
    setSelectedProductId(null);
    setFormData({ name: "", sku: "", price: "" });
  };

  const isEditing = Boolean(product);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 dark:bg-zinc-900">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {isEditing ? "Editar Producto" : "Agregar Producto"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <svg className="h-5 w-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Nombre del producto *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                SKU
              </label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Precio *
              </label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Marca *
              </label>
              <select
                value={selectedBrand?.id ?? ""}
                onChange={(e) => {
                  const brand = brands.find((b) => b.id === e.target.value);
                  if (brand) handleBrandSelect(brand);
                }}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Selecciona una marca</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>

              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createNewBrand}
                  onChange={(e) => {
                    setCreateNewBrand(e.target.checked);
                    if (e.target.checked) {
                      setSelectedBrand(null);
                      setShowNewProductForm(true);
                    } else {
                      setShowNewProductForm(false);
                    }
                    setFormData({ name: "", sku: "", price: "" });
                    setNewBrandName("");
                  }}
                  className="rounded border-zinc-300"
                />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Crear nueva marca
                </span>
              </label>
            </div>

            {createNewBrand && (
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Nombre de la nueva marca *
                </label>
                <input
                  type="text"
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  placeholder="Ej: Lala, Oxxo, Bimbo"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>
            )}

            {selectedBrand && !showNewProductForm && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Productos de esta marca
                  </label>
                  <button
                    type="button"
                    onClick={handleCreateNewProduct}
                    className="text-sm text-emerald-600 hover:text-emerald-700"
                  >
                    + Crear nuevo producto
                  </button>
                </div>

                {searchProductsQuery.isLoading ? (
                  <p className="text-sm text-zinc-500">Cargando productos...</p>
                ) : searchProductsQuery.data && searchProductsQuery.data.length > 0 ? (
                  <div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
                    {searchProductsQuery.data.map((prod) => (
                      <label
                        key={prod.id}
                        className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <input
                          type="radio"
                          name="product"
                          checked={selectedProductId === prod.id}
                          onChange={() => {
                            setSelectedProductId(prod.id);
                            setFormData({
                              ...formData,
                              name: prod.name,
                              sku: prod.sku ?? "",
                            });
                          }}
                          className="border-zinc-300"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{prod.name}</p>
                          {prod.sku && <p className="text-xs text-zinc-500">SKU: {prod.sku}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">
                    No hay productos para esta marca.{" "}
                    <button
                      type="button"
                      onClick={handleCreateNewProduct}
                      className="text-emerald-600 hover:text-emerald-700"
                    >
                      Crea uno nuevo
                    </button>
                  </p>
                )}
              </div>
            )}

            {(showNewProductForm || createNewBrand) && (
              <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Datos del producto
                </p>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Nombre del producto *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    SKU (opcional)
                  </label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Precio *
              </label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium dark:border-zinc-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              isEditing
                ? !formData.name || !formData.price
                : !formData.name || !formData.price || (!selectedBrand && !createNewBrand)
            }
            className="flex-1 rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isEditing ? "Guardar Cambios" : "Agregar Producto"}
          </button>
        </div>

        {(createStoreProduct.isError || updateStoreProduct.isError) && (
          <p className="mt-3 text-sm text-red-500">
            Error al {isEditing ? "guardar" : "agregar"} el producto. Intenta de nuevo.
          </p>
        )}
      </div>
    </div>
  );
}