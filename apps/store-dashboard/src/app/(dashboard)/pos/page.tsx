"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserRoundPlus } from "lucide-react";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { createClientId } from "@/lib/id";
import { getDraftItemCount, getDraftTotal, type DraftTransaction } from "@/lib/store-pos";
import { useAuth } from "@/providers/auth-provider";
import { useStorePos } from "@/providers/store-pos-provider";

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

type CustomerResolveResult = {
  userId: string;
  cardId: string;
  cardCode: string;
  name?: string;
  phone: string;
  email?: string;
};

type StoreCheckin = {
  id: string;
  userId: string;
  userName?: string;
  userPhone?: string;
  status: string;
  checkedInAt: string;
  expiresAt: string;
  matchedTransactionId?: string;
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

const formatRelativeCheckinTime = (value: string) => {
  const timestamp = new Date(value).getTime();
  const diffMs = Date.now() - timestamp;

  if (!Number.isFinite(timestamp) || diffMs < 60_000) {
    return "ahora";
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  return `hace ${hours} h`;
};

const formatPhoneForDisplay = (value?: string) => value?.replace(/^\+52/, "") ?? "Sin teléfono";

export default function StorePOSPage() {
  const token = getAccessToken();
  const { tenantId, tenantType } = useAuth();
  const { draft, addItem, updateItemQuantity, removeItem, clearItems, setCustomer, clearCustomer, replaceDraft } = useStorePos();
  const queryClient = useQueryClient();

  const storeId = tenantType === "store" ? (tenantId ?? "") : "";
  const [searchQuery, setSearchQuery] = useState("");
  const [customerInput, setCustomerInput] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);

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

  const searchResultsQuery = useQuery({
    queryKey: ["store-products-search", storeId, searchQuery],
    enabled: Boolean(token) && Boolean(storeId) && searchQuery.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await api.v1.stores[storeId]["products-search"].get({
        query: { q: searchQuery.trim(), limit: "20" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return (data?.data?.storeProducts ?? []) as StoreProduct[];
    },
  });

  const checkinsQuery = useQuery({
    queryKey: ["store-checkins", storeId, "pending"],
    enabled: Boolean(token) && Boolean(storeId),
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await api.v1.stores[storeId].checkins.get({
        query: { status: "pending", limit: "10" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return (data?.data ?? []) as StoreCheckin[];
    },
  });

  const resolveCustomer = useMutation({
    mutationFn: async (input?: string) => {
      const customerLookup = (input ?? customerInput).trim();
      if (!token || !storeId || !customerLookup) {
        throw new Error("CUSTOMER_INPUT_REQUIRED");
      }

      const { data, error } = await api.v1.stores[storeId]["customer-resolve"].post(
        { input: customerLookup },
        { headers: { authorization: `Bearer ${token}` } },
      );

      if (error) throw error;
      if (!data?.data) throw new Error("CUSTOMER_NOT_FOUND");
      return data.data as CustomerResolveResult;
    },
    onSuccess: (customer) => {
      setCustomer(customer);
      setCustomerInput("");
      queryClient.invalidateQueries({ queryKey: ["store-checkins", storeId, "pending"] });
    },
  });

  const confirmTransaction = useMutation({
    mutationFn: async () => {
      if (!token || !storeId || draft.items.length === 0) {
        throw new Error("EMPTY_DRAFT");
      }

      const { data, error } = await api.v1.stores[storeId].transactions.post(
        {
          userId: draft.customer?.userId,
          cardId: draft.customer?.cardId,
          idempotencyKey: `store-pos-${createClientId()}`,
          items: draft.items.map((item) => ({
            storeProductId: item.storeProductId,
            quantity: item.quantity,
            amount: item.price,
          })),
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      if (error) throw error;
      if (!data?.data) throw new Error("TRANSACTION_FAILED");
      return data.data as DraftTransaction;
    },
    onSuccess: (transaction) => {
      replaceDraft({
        items: [],
        customer: null,
        lastTransaction: transaction,
      });
      setShowCheckout(false);
      queryClient.invalidateQueries({ queryKey: ["store-sales"] });
      queryClient.invalidateQueries({ queryKey: ["store-checkins", storeId, "pending"] });
    },
  });

  const catalog = searchQuery.trim().length >= 2 ? searchResultsQuery.data ?? [] : productsQuery.data ?? [];
  const pendingCheckins = (checkinsQuery.data ?? []).filter((checkin) => checkin.userPhone && checkin.userId !== draft.customer?.userId);
  const cartTotal = getDraftTotal(draft);
  const cartItemCount = getDraftItemCount(draft);

  const errorMessage = useMemo(() => {
    const customerError = resolveCustomer.error;
    if (customerError) {
      return "No pudimos ligar esa tarjeta o teléfono. Revisa el dato e intenta otra vez.";
    }

    if (confirmTransaction.error) {
      return "No pudimos registrar la venta. Intenta de nuevo.";
    }

    return null;
  }, [confirmTransaction.error, resolveCustomer.error]);

  if (!storeId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-zinc-500">No se ha identificado la tienda. Por favor inicia sesión nuevamente.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 lg:h-[calc(100vh-4rem)] lg:flex-row lg:gap-6">
      <div className="flex min-h-0 flex-1 flex-col lg:overflow-hidden">
        <header className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Punto de Venta</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Arma el pedido, liga la tarjeta del cliente y confirma la venta al final.</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 xl:max-w-sm dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">
            El asistente IA comparte este mismo borrador en tiempo real.
          </div>
        </header>

        <div className="mb-4 flex flex-col gap-3 xl:flex-row">
          <input
            type="text"
            placeholder="Buscar producto por nombre o SKU..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />

          <div className="flex w-full flex-col gap-2 sm:max-w-xl sm:flex-row">
            <input
              type="text"
              value={customerInput}
              onChange={(event) => setCustomerInput(event.target.value)}
              placeholder='QR JSON, cardId, card code o teléfono'
              className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="button"
              onClick={() => resolveCustomer.mutate(undefined)}
              disabled={resolveCustomer.isPending || !customerInput.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <UserRoundPlus className="h-4 w-4" />
              {resolveCustomer.isPending ? "Ligando..." : "Ligar cliente"}
            </button>
          </div>
        </div>

        {pendingCheckins.length > 0 ? (
          <section className="mb-4 rounded-3xl border border-sky-200 bg-sky-50/80 px-4 py-3 dark:border-sky-900/60 dark:bg-sky-950/20">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">En tienda ahora</p>
                <p className="mt-1 text-sm text-sky-900 dark:text-sky-100">Clientes que hicieron check-in recientemente.</p>
              </div>
              {checkinsQuery.isFetching ? <p className="text-xs text-sky-600 dark:text-sky-300">Actualizando...</p> : null}
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {pendingCheckins.map((checkin) => (
                <div key={checkin.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-3 shadow-sm dark:bg-zinc-900">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{checkin.userName ?? formatPhoneForDisplay(checkin.userPhone)}</p>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {formatPhoneForDisplay(checkin.userPhone)} · {formatRelativeCheckinTime(checkin.checkedInAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => resolveCustomer.mutate(checkin.userPhone)}
                    disabled={resolveCustomer.isPending || !checkin.userPhone}
                    className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resolveCustomer.isPending ? "Ligando..." : "Ligar"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {draft.customer ? (
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
            <div>
              <p className="font-semibold">Cliente ligado</p>
              <p className="text-xs opacity-80">
                {draft.customer.name ?? draft.customer.phone} · Tarjeta {draft.customer.cardCode ?? draft.customer.cardId}
              </p>
            </div>
            <button type="button" onClick={clearCustomer} className="text-xs font-semibold uppercase tracking-wide">
              Quitar
            </button>
          </div>
        ) : null}

        {productsQuery.isLoading ? <p className="text-sm text-zinc-500">Cargando productos...</p> : null}

        <div className="min-h-0 flex-1 lg:overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {catalog.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() =>
                  addItem(
                    {
                      storeProductId: product.id,
                      productId: product.productId,
                      name: product.name,
                      sku: product.sku,
                      unitType: product.unitType,
                      price: Number(product.price),
                    },
                    1,
                  )
                }
                className="cursor-pointer rounded-3xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{product.name}</span>
                {product.sku ? <span className="mt-1 block text-xs text-zinc-400">SKU: {product.sku}</span> : null}
                <span className="mt-3 block text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(Number(product.price))}</span>
                <span className="mt-1 block text-xs text-zinc-400 capitalize">{product.unitType}</span>
              </button>
            ))}
          </div>

          {catalog.length === 0 && !productsQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              {searchQuery.trim().length >= 2 ? "No se encontraron productos" : "No hay productos en el catálogo de esta tienda"}
            </p>
          ) : null}
        </div>
      </div>

      <aside className="flex w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white lg:w-96 lg:min-w-[22rem] lg:flex-shrink-0 dark:border-zinc-800 dark:bg-zinc-900">
        <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-4 sm:px-5 dark:border-zinc-800">
          <div>
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Pedido en curso</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{cartItemCount} artículos preparados</p>
          </div>
          {draft.items.length > 0 ? (
            <button
              type="button"
              onClick={clearItems}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 transition hover:border-red-200 hover:text-red-500 dark:border-zinc-700 dark:hover:border-red-800 dark:hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpiar
            </button>
          ) : null}
        </header>

        <div className="space-y-4 border-b border-zinc-100 px-4 py-4 sm:px-5 dark:border-zinc-800">
          <div className="rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-zinc-950/70">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Cliente</p>
            <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {draft.customer?.name ?? draft.customer?.phone ?? "Invitado / sin tarjeta"}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {draft.customer?.cardCode ?? draft.customer?.cardId ?? "Puedes ligarlo aquí o desde el panel IA"}
            </p>
          </div>
        </div>

        <div className="max-h-[45vh] overflow-y-auto px-4 py-4 sm:px-5 lg:max-h-none lg:flex-1">
          {draft.items.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">El pedido está vacío. Agrega productos o pídeselo al asistente.</p>
          ) : (
            <ul className="space-y-3">
              {draft.items.map((item) => (
                <li key={item.storeProductId} className="rounded-2xl border border-zinc-100 px-4 py-3 dark:border-zinc-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.name}</p>
                      <p className="text-xs text-zinc-500">{formatMoney(item.price)} c/u</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.storeProductId)}
                      className="rounded-full p-1 text-red-500 transition hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateItemQuantity(item.storeProductId, item.quantity - 1)}
                        className="h-8 w-8 rounded-full border border-zinc-200 text-sm dark:border-zinc-700"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateItemQuantity(item.storeProductId, item.quantity + 1)}
                        className="h-8 w-8 rounded-full border border-zinc-200 text-sm dark:border-zinc-700"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{formatMoney(item.price * item.quantity)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-zinc-100 px-4 py-4 sm:px-5 dark:border-zinc-800">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Total</span>
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(cartTotal)}</span>
          </div>

          {errorMessage ? <p className="mb-3 text-sm text-red-500">{errorMessage}</p> : null}

          <button
            type="button"
            onClick={() => setShowCheckout(true)}
            disabled={draft.items.length === 0}
            className="w-full rounded-2xl bg-zinc-900 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Revisar y confirmar venta
          </button>
        </footer>
      </aside>

      {showCheckout ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl dark:bg-zinc-950">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Confirmar transacción</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Nada se registra hasta este paso final.</p>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Cliente</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{draft.customer?.name ?? draft.customer?.phone ?? "Invitado"}</span>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-zinc-500">Artículos</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{cartItemCount}</span>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-zinc-500">Total estimado</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatMoney(cartTotal)}</span>
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-zinc-500">Acumulación</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {draft.customer?.cardId ? "Se evaluará al confirmar" : "No aplica sin tarjeta"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowCheckout(false)}
                className="flex-1 rounded-2xl border border-zinc-200 py-3 text-sm font-medium dark:border-zinc-700"
              >
                Seguir editando
              </button>
              <button
                type="button"
                onClick={() => confirmTransaction.mutate()}
                disabled={confirmTransaction.isPending}
                className="flex-1 rounded-2xl bg-emerald-600 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {confirmTransaction.isPending ? "Registrando..." : "Confirmar venta"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {draft.lastTransaction ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 text-center shadow-2xl dark:bg-zinc-950">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Venta registrada</h3>
            <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(draft.lastTransaction.totalAmount)}</p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {draft.lastTransaction.customer?.name ?? draft.lastTransaction.customer?.phone ?? "Transacción de invitado"}
            </p>
            <p className="mt-1 text-xs text-zinc-400">Acumulaciones: {draft.lastTransaction.accumulations.length}</p>
            <button
              type="button"
              onClick={() =>
                replaceDraft({
                  items: [],
                  customer: null,
                  lastTransaction: null,
                })
              }
              className="mt-6 w-full rounded-2xl bg-zinc-900 py-3 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Nueva venta
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
