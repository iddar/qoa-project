"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";
import { Trash2 } from "lucide-react";

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

type CartItem = {
  storeProduct: StoreProduct;
  quantity: number;
  lineTotal: number;
};

type TransactionResult = {
  id: string;
  userId?: string;
  storeId: string;
  cardId?: string;
  items: Array<{
    id: string;
    storeProductId: string;
    productId?: string;
    name: string;
    quantity: number;
    amount: number;
  }>;
  totalAmount: number;
  guestFlag: boolean;
  createdAt: string;
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

export default function StorePOSPage() {
  const token = getAccessToken();
  const { tenantId, tenantType } = useAuth();
  const queryClient = useQueryClient();

  const storeId = tenantType === "store" ? (tenantId ?? "") : "";

  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cardIdInput, setCardIdInput] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<TransactionResult | null>(null);

  const productsQuery = useQuery({
    queryKey: ["store-products", storeId, "active"],
    enabled: Boolean(token) && Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await api.v1.stores[storeId].products.get({
        query: { status: "active", limit: "100" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return (data?.data ?? []) as StoreProduct[];
    },
  });

  const searchQueryFn = useQuery({
    queryKey: ["store-products-search", storeId, searchQuery],
    enabled: Boolean(token) && Boolean(storeId) && searchQuery.length >= 2,
    queryFn: async () => {
      const { data, error } = await api.v1.stores[storeId]["products-search"].get({
        query: { q: searchQuery, limit: "20" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data?.data ?? { storeProducts: [], globalProducts: [] };
    },
  });

  const createTransaction = useMutation({
    mutationFn: async () => {
      if (!token || !storeId) throw new Error("No auth");

      const items = cart.map((item) => ({
        storeProductId: item.storeProduct.id,
        quantity: item.quantity,
        amount: item.lineTotal,
      }));

      const body: { userId?: string; cardId?: string; items: typeof items; idempotencyKey?: string } = {
        items,
      };

      if (cardIdInput.trim()) {
        body.cardId = cardIdInput.trim();
      }

      const { data, error } = await api.v1.stores[storeId].transactions.post(
        body,
        { headers: { authorization: `Bearer ${token}` } },
      );

      if (error) throw error;
      if (!data?.data) throw new Error("No data");
      return data.data as TransactionResult;
    },
    onSuccess: () => {
      setCart([]);
      setCardIdInput("");
      setShowCheckout(false);
      queryClient.invalidateQueries({ queryKey: ["store-sales"] });
    },
  });

  const products = productsQuery.data ?? [];
  const searchResults = searchQueryFn.data;

  const displayProducts = useMemo((): StoreProduct[] => {
    if (searchQuery.length >= 2 && searchResults) {
      return searchResults.storeProducts;
    }
    return products;
  }, [searchQuery, searchResults, products]);

  const addToCart = useCallback((product: StoreProduct) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.storeProduct.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.storeProduct.id === product.id
            ? { ...item, quantity: item.quantity + 1, lineTotal: (item.quantity + 1) * Number(item.storeProduct.price) }
            : item,
        );
      }
      return [
        ...prev,
        {
          storeProduct: product,
          quantity: 1,
          lineTotal: Number(product.price),
        },
      ];
    });
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((item) => item.storeProduct.id !== productId));
    } else {
      setCart((prev) =>
        prev.map((item) =>
          item.storeProduct.id === productId
            ? { ...item, quantity, lineTotal: quantity * Number(item.storeProduct.price) }
            : item,
        ),
      );
    }
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((item) => item.storeProduct.id !== productId));
  }, []);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.lineTotal, 0),
    [cart],
  );

  const cartItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  const handleCheckout = async () => {
    try {
      const result = await createTransaction.mutateAsync();
      setLastTransaction(result);
    } catch (err) {
      console.error("Transaction failed:", err);
    }
  };

  if (!storeId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500">No se ha identificado la tienda. Por favor inicia sesión nuevamente.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-6">
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Punto de Venta</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Registra ventas y genera transacciones
          </p>
        </header>

        <div className="mb-4">
          <input
            type="text"
            placeholder="Buscar producto por nombre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        {productsQuery.isLoading && <p className="text-sm text-zinc-500">Cargando productos...</p>}

        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {displayProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addToCart(product)}
                className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{product.name}</span>
                {product.sku && (
                  <span className="mt-1 text-xs text-zinc-400">SKU: {product.sku}</span>
                )}
                <span className="mt-2 text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {formatMoney(Number(product.price))}
                </span>
                <span className="mt-1 text-xs text-zinc-400 capitalize">{product.unitType}</span>
              </button>
            ))}
          </div>

          {displayProducts.length === 0 && !productsQuery.isLoading && (
            <p className="py-8 text-center text-sm text-zinc-500">
              {searchQuery.length >= 2
                ? "No se encontraron productos"
                : "No hay productos en el catálogo de esta tienda"}
            </p>
          )}
        </div>
      </div>

      <aside className="w-80 flex-shrink-0 flex flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-4 dark:border-zinc-800">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Carrito</h2>
          <div className="flex items-center gap-2">
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-500 transition hover:border-red-200 hover:text-red-500 dark:border-zinc-700 dark:hover:border-red-800 dark:hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpiar
              </button>
            )}
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {cartItemCount} items
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4">
          {cart.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">El carrito está vacío</p>
          ) : (
            <ul className="space-y-3">
              {cart.map((item) => (
                <li key={item.storeProduct.id} className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {item.storeProduct.name}
                    </p>
                    <p className="text-xs text-zinc-500">{formatMoney(Number(item.storeProduct.price))} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.storeProduct.id, item.quantity - 1)}
                      className="h-7 w-7 rounded border border-zinc-200 text-center text-sm dark:border-zinc-700"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-sm">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.storeProduct.id, item.quantity + 1)}
                      className="h-7 w-7 rounded border border-zinc-200 text-center text-sm dark:border-zinc-700"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.storeProduct.id)}
                    className="h-7 w-7 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-zinc-100 p-4 dark:border-zinc-800">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Total</span>
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatMoney(cartTotal)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowCheckout(true)}
            disabled={cart.length === 0}
            className="w-full rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Cobrar
          </button>
        </footer>
      </aside>

      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Confirmar Venta</h3>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  ID de Tarjeta (opcional)
                </label>
                <input
                  type="text"
                  value={cardIdInput}
                  onChange={(e) => setCardIdInput(e.target.value)}
                  placeholder="Para registrar puntos del cliente"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
                <p className="mt-1 text-xs text-zinc-400">Sin ID, la venta se registra como transacción de invitado</p>
              </div>

              <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Artículos</span>
                  <span>{cartItemCount}</span>
                </div>
                <div className="mt-2 flex justify-between font-semibold">
                  <span>Total a pagar</span>
                  <span className="text-emerald-600 dark:text-emerald-400">{formatMoney(cartTotal)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowCheckout(false)}
                className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium dark:border-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={createTransaction.isPending}
                className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {createTransaction.isPending ? "Procesando..." : "Confirmar Venta"}
              </button>
            </div>

            {createTransaction.isError && (
              <p className="mt-3 text-sm text-red-500">Error al procesar la venta. Intenta de nuevo.</p>
            )}
          </div>
        </div>
      )}

      {lastTransaction && !createTransaction.isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 dark:bg-zinc-900">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Venta Registrada</h3>
              <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatMoney(lastTransaction.totalAmount)}
              </p>
              {lastTransaction.guestFlag ? (
                <p className="mt-2 text-sm text-zinc-500">Transacción de invitado (sin acumulación)</p>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">
                  {lastTransaction.cardId ? `Tarjeta: ${lastTransaction.cardId.slice(0, 8)}...` : "Puntos registrados"}
                </p>
              )}
              <p className="mt-1 text-xs text-zinc-400">ID: {lastTransaction.id.slice(0, 8)}...</p>
            </div>
            <button
              type="button"
              onClick={() => setLastTransaction(null)}
              className="mt-6 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Nueva Venta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}