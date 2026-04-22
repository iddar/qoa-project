"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Eraser, PackagePlus, RefreshCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { createClientId } from "@/lib/id";
import { canConfirmInventoryDraft, getInventoryDraftSummary, type InventoryDraftMatchedProduct, type InventoryDraftRow } from "@/lib/store-inventory";
import { useAuth } from "@/providers/auth-provider";
import { useStoreInventory } from "@/providers/store-inventory-provider";

type StoreProduct = InventoryDraftMatchedProduct;

type InventoryPreviewResponse = {
  data: {
    rows: Array<{
      lineNumber: number;
      rawText: string;
      name: string;
      sku?: string;
      quantity: number;
      price?: number;
      status: "matched" | "new" | "ambiguous" | "invalid";
      matchedStoreProductId?: string;
      matchedProduct?: StoreProduct;
      candidates?: InventoryDraftRow["candidates"];
      errors?: string[];
    }>;
  };
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);

const toDraftRows = (rows: InventoryPreviewResponse["data"]["rows"]): InventoryDraftRow[] =>
  rows.map((row) => ({
    id: createClientId(),
    lineNumber: row.lineNumber,
    rawText: row.rawText,
    name: row.name,
    sku: row.sku,
    quantity: row.quantity,
    price: row.price,
    status: row.status,
    action:
      row.status === "matched"
        ? "match_existing"
        : row.status === "new" && row.price !== undefined
          ? "create_new"
          : undefined,
    matchedStoreProductId: row.matchedStoreProductId,
    matchedProduct: row.matchedProduct,
    candidates: row.candidates,
    errors: row.errors,
  }));

const badgeClasses: Record<InventoryDraftRow["status"], string> = {
  matched: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300",
  new: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-300",
  ambiguous: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300",
  invalid: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300",
};

export default function StoreInventoryPage() {
  const token = getAccessToken();
  const { tenantId, tenantType } = useAuth();
  const { draft, setRows, updateRow, removeRow, replaceDraft, resetDraft } = useStoreInventory();
  const queryClient = useQueryClient();
  const [textInput, setTextInput] = useState("");

  const storeId = tenantType === "store" ? (tenantId ?? "") : "";
  const summary = getInventoryDraftSummary(draft);
  const canConfirm = canConfirmInventoryDraft(draft);

  const productsQuery = useQuery({
    queryKey: ["store-products", storeId, "inventory-list"],
    enabled: Boolean(token) && Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await api.v1.stores[storeId].products.get({
        query: { limit: "200" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return (data?.data ?? []) as StoreProduct[];
    },
  });

  const storeProducts = productsQuery.data ?? [];
  const findProductById = (storeProductId: string) => storeProducts.find((product) => product.id === storeProductId);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!token || !storeId || !textInput.trim()) {
        throw new Error("TEXT_REQUIRED");
      }

      const { data, error } = await api.v1.stores[storeId].inventory.intake.preview.post(
        { text: textInput.trim() },
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (error) throw error;
      return data as InventoryPreviewResponse;
    },
    onSuccess: (data) => {
      setRows(toDraftRows(data.data.rows));
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!token || !storeId || !canConfirm) {
        throw new Error("INVALID_DRAFT");
      }

      const { data, error } = await api.v1.stores[storeId].inventory.intake.confirm.post(
        {
          rows: draft.rows.map((row) => ({
            lineNumber: row.lineNumber,
            rawText: row.rawText,
            name: row.name,
            sku: row.sku || undefined,
            quantity: row.quantity,
            price: row.price,
            action: row.action!,
            storeProductId: row.action === "match_existing" ? row.matchedStoreProductId : undefined,
          })),
        },
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      replaceDraft({ rows: [], lastReceipt: data.data });
      setTextInput("");
      queryClient.invalidateQueries({ queryKey: ["store-products", storeId] });
    },
  });

  const currentInventory = useMemo(
    () => [...storeProducts].sort((left, right) => right.stock - left.stock || left.name.localeCompare(right.name, "es")),
    [storeProducts],
  );

  if (!storeId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-zinc-500">No se ha identificado la tienda. Por favor inicia sesión nuevamente.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Inventario</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Pega una lista del proveedor, revisa el preview y confirma la entrada de mercancía.
          </p>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 xl:max-w-md dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-300">
          Las ventas del POS descontarán stock automáticamente cuando se confirmen.
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-5">
        <article className="rounded-3xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Filas</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{summary.rows}</p>
        </article>
        <article className="rounded-3xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Piezas</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{summary.quantity}</p>
        </article>
        <article className="rounded-3xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Existentes</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{summary.matched}</p>
        </article>
        <article className="rounded-3xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Nuevos</p>
          <p className="mt-2 text-2xl font-semibold text-sky-600 dark:text-sky-400">{summary.created}</p>
        </article>
        <article className="rounded-3xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Pendientes</p>
          <p className="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-400">{summary.ambiguous + summary.invalid}</p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Texto del proveedor</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Ejemplos: `12 Refresco 600ml`, `Galletas, GAL-001, 6, 30`, o columnas pegadas desde Excel.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setTextInput("");
                resetDraft();
              }}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              <Eraser className="h-3.5 w-3.5" />
              Limpiar
            </button>
          </div>

          <textarea
            value={textInput}
            onChange={(event) => setTextInput(event.target.value)}
            rows={10}
            placeholder={"2 Refresco 600ml\nGalletas Mantequilla, GAL-001, 6, 30\nPapas Fuego\tPAP-123\t4\t22"}
            className="mt-4 w-full rounded-3xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-900 outline-none transition focus:border-sky-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending || !textInput.trim()}
              className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              <PackagePlus className="h-4 w-4" />
              {previewMutation.isPending ? "Interpretando lista..." : "Generar preview"}
            </button>
            <button
              type="button"
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending || !canConfirm}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {confirmMutation.isPending ? "Aplicando entrada..." : "Confirmar entrada"}
            </button>
          </div>

          {previewMutation.isError ? <p className="mt-3 text-sm text-red-500">No pude interpretar esa lista. Revisa el formato e intenta de nuevo.</p> : null}
          {confirmMutation.isError ? <p className="mt-3 text-sm text-red-500">No pude aplicar la entrada. Revisa las filas pendientes o intenta de nuevo.</p> : null}
        </div>

        <div className="rounded-[2rem] border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Resultado esperado</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Edita, corrige o elimina filas antes de confirmar.</p>
            </div>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["store-products", storeId, "inventory-list"] })}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Stock actual
            </button>
          </div>

          {draft.rows.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              Aún no hay preview. Pega una lista y genera la propuesta de entrada.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {draft.rows.map((row) => (
                <article key={row.id} className="rounded-3xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${badgeClasses[row.status]}`}>
                        {row.status === "matched" ? "Existente" : row.status === "new" ? "Nuevo" : row.status === "ambiguous" ? "Revisar" : "Inválido"}
                      </span>
                      <span className="text-xs text-zinc-400">Línea {row.lineNumber}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-red-600 dark:border-zinc-700 dark:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Quitar
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[1.5fr_0.8fr_0.7fr_0.8fr]">
                    <input
                      type="text"
                      value={row.name}
                      onChange={(event) => updateRow(row.id, { name: event.target.value })}
                      placeholder="Nombre del producto"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    />
                    <input
                      type="text"
                      value={row.sku ?? ""}
                      onChange={(event) => updateRow(row.id, { sku: event.target.value || undefined })}
                      placeholder="SKU"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    />
                    <input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(event) => updateRow(row.id, { quantity: Number(event.target.value) })}
                      placeholder="Cantidad"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    />
                    <input
                      type="number"
                      min={0}
                      value={row.price ?? ""}
                      onChange={(event) => {
                        const nextPrice = event.target.value ? Math.max(0, Number(event.target.value)) : undefined;
                        updateRow(row.id, { price: nextPrice, action: row.action ?? "create_new" });
                      }}
                      placeholder="Precio venta"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
                    <select
                      value={row.action ?? ""}
                      onChange={(event) => {
                        const nextAction = event.target.value as InventoryDraftRow["action"] | "";
                        if (!nextAction) {
                          updateRow(row.id, { action: undefined, matchedStoreProductId: undefined, matchedProduct: undefined });
                          return;
                        }

                        if (nextAction === "create_new") {
                          updateRow(row.id, { action: "create_new", matchedStoreProductId: undefined, matchedProduct: undefined });
                          return;
                        }

                        if (row.matchedStoreProductId) {
                          updateRow(row.id, { action: "match_existing" });
                        }
                      }}
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      <option value="">Selecciona qué hacer</option>
                      <option value="match_existing">Sumar a producto existente</option>
                      <option value="create_new">Crear producto nuevo</option>
                    </select>

                    <select
                      value={row.matchedStoreProductId ?? ""}
                      onChange={(event) => {
                        const selectedId = event.target.value;
                        const matchedProduct = findProductById(selectedId);
                        if (!matchedProduct) {
                          updateRow(row.id, { matchedStoreProductId: undefined, matchedProduct: undefined });
                          return;
                        }

                        updateRow(row.id, {
                          action: "match_existing",
                          matchedStoreProductId: selectedId,
                          matchedProduct,
                        });
                      }}
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      <option value="">Selecciona producto existente</option>
                      {(row.candidates ?? storeProducts.slice(0, 50).map((product) => ({
                        storeProductId: product.id,
                        name: product.name,
                        sku: product.sku,
                        price: product.price,
                        stock: product.stock,
                        score: 0,
                      }))).map((candidate) => (
                        <option key={`${row.id}-${candidate.storeProductId}`} value={candidate.storeProductId}>
                          {candidate.name} {candidate.sku ? `(${candidate.sku})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {row.matchedProduct ? (
                    <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200">
                      <p className="font-semibold">{row.matchedProduct.name}</p>
                      <p className="mt-1 text-xs opacity-80">
                        Stock actual {row.matchedProduct.stock} · Quedará en {row.matchedProduct.stock + row.quantity} · Precio actual {formatMoney(row.matchedProduct.price)}
                      </p>
                    </div>
                  ) : null}

                  {row.errors?.length ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4" />
                        <div className="space-y-1">
                          {row.errors.map((error) => (
                            <p key={`${row.id}-${error}`}>{error}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {draft.lastReceipt ? (
        <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">Entrada aplicada</p>
              <h2 className="mt-2 text-lg font-semibold">{draft.lastReceipt.summary.totalQuantity} piezas cargadas al inventario</h2>
              <p className="mt-1 text-sm opacity-80">
                {draft.lastReceipt.summary.createdProducts} productos nuevos y {draft.lastReceipt.summary.updatedProducts} productos actualizados.
              </p>
            </div>
            <span className="rounded-full border border-current/15 px-3 py-1 text-xs font-medium">
              {draft.lastReceipt.replayed ? "Replay idempotente" : "Confirmado"}
            </span>
          </div>
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Stock actual</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Vista rápida de tus productos con existencias.</p>
          </div>
        </div>

        {productsQuery.isLoading ? <p className="mt-4 text-sm text-zinc-500">Cargando inventario...</p> : null}

        {!productsQuery.isLoading && currentInventory.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">Todavía no hay productos cargados para esta tienda.</p>
        ) : null}

        {currentInventory.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-3xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[42rem]">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-[0.18em] text-zinc-400 dark:border-zinc-800">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3">Precio</th>
                </tr>
              </thead>
              <tbody>
                {currentInventory.map((product) => (
                  <tr key={product.id} className="border-b border-zinc-100 text-sm last:border-b-0 dark:border-zinc-800">
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{product.name}</td>
                    <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{product.sku ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${product.stock === 0 ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300" : product.stock <= 5 ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"}`}>
                        {product.stock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">{formatMoney(product.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
