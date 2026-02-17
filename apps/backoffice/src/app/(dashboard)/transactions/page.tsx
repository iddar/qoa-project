"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type TransactionForm = {
  userId: string;
  storeId: string;
  productId: string;
  quantity: string;
  amount: string;
  idempotencyKey: string;
};

type TransactionRow = {
  id: string;
  userId: string;
  storeId: string;
  totalAmount: number;
  createdAt: string;
  items: Array<{ productId: string; quantity: number; amount: number }>;
};

type WebhookReceipt = {
  id: string;
  source: string;
  status: string;
  replayCount: number;
  transactionId?: string;
  receivedAt: string;
};

type WebhookMetrics = {
  totalReceived: number;
  processed: number;
  replayed: number;
  errors: number;
};

const emptyForm: TransactionForm = {
  userId: "",
  storeId: "",
  productId: "",
  quantity: "1",
  amount: "0",
  idempotencyKey: "",
};

export default function TransactionsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TransactionForm>(emptyForm);

  const { data, isLoading, error } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.transactions.get({
        query: { limit: "50" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const { data: webhookMetricsData } = useQuery({
    queryKey: ["transactions-webhook-metrics"],
    queryFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.transactions["webhook-metrics"].get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  const { data: webhookReceiptsData } = useQuery({
    queryKey: ["transactions-webhook-receipts"],
    queryFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.transactions["webhook-receipts"].get({
        query: { limit: "20" },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  const createTransaction = useMutation({
    mutationFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.transactions.post(
        {
          userId: form.userId,
          storeId: form.storeId,
          idempotencyKey: form.idempotencyKey || undefined,
          items: [
            {
              productId: form.productId,
              quantity: Number(form.quantity) || 1,
              amount: Number(form.amount) || 0,
            },
          ],
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const transactions = (data?.data ?? []) as TransactionRow[];
  const webhookMetrics =
    (webhookMetricsData?.data as WebhookMetrics | undefined) ?? {
      totalReceived: 0,
      processed: 0,
      replayed: 0,
      errors: 0,
    };
  const webhookReceipts =
    (webhookReceiptsData?.data as WebhookReceipt[] | undefined) ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Transacciones</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-300">
          Aquí se registran compras y se audita la ingestión (manual + webhook)
          para validar reglas, idempotencia y estabilidad operativa.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <p className="font-semibold">Cómo usar esta pantalla</p>
        <p className="mt-1">
          1) Usa &quot;Registrar transacción&quot; para pruebas manuales. 2) Revisa
          métricas de webhook para detectar duplicados/reintentos. 3) Consulta el
          historial para correlacionar cada compra con su comportamiento de
          ingestión.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs text-zinc-500 dark:text-zinc-300">
            Webhooks recibidos
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {webhookMetrics.totalReceived}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs text-zinc-500 dark:text-zinc-300">Procesados</p>
          <p className="mt-1 text-2xl font-semibold">{webhookMetrics.processed}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs text-zinc-500 dark:text-zinc-300">Reintentos</p>
          <p className="mt-1 text-2xl font-semibold">{webhookMetrics.replayed}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs text-zinc-500 dark:text-zinc-300">Errores</p>
          <p className="mt-1 text-2xl font-semibold">{webhookMetrics.errors}</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,_2fr)_minmax(0,_1fr)]">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Listado de transacciones</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-300">
                Historial de compras persistidas. Cada fila representa la versión
                final ya desduplicada por idempotency key.
              </p>
            </div>
          </div>

          {isLoading && (
            <p className="mt-4 text-sm text-zinc-400 dark:text-zinc-400">
              Cargando transacciones...
            </p>
          )}
          {error && (
            <p className="mt-4 text-sm text-red-500">
              No se pudo cargar el listado de transacciones.
            </p>
          )}

          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {transactions.map((transaction) => (
              <li key={transaction.id} className="py-4">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  TX {transaction.id}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-300">
                  user: {transaction.userId}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-300">
                  store: {transaction.storeId}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-300">
                  total: {transaction.totalAmount}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-300">
                  items: {transaction.items.length}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">Registrar transacción</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-300">
            Usa esta sección para simular compras desde operación interna. Si
            repites el mismo `idempotencyKey`, el backend responderá replay sin
            crear un nuevo registro.
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              createTransaction.mutate();
            }}
          >
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                User ID
              </label>
              <input
                required
                value={form.userId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, userId: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                Store ID
              </label>
              <input
                required
                value={form.storeId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, storeId: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                Product ID
              </label>
              <input
                required
                value={form.productId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, productId: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                  Cantidad
                </label>
                <input
                  value={form.quantity}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, quantity: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                  Monto
                </label>
                <input
                  value={form.amount}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, amount: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                Idempotency Key (opcional)
              </label>
              <input
                value={form.idempotencyKey}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    idempotencyKey: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              disabled={createTransaction.isPending}
            >
              {createTransaction.isPending ? "Registrando..." : "Registrar"}
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold">Recibos de webhook</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-300">
          Registro de eventos entrantes por hash de payload. `replayCount`
          aumenta cuando llega el mismo evento de nuevo.
        </p>

        <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
          {webhookReceipts.map((receipt) => (
            <li key={receipt.id} className="py-3">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                {receipt.source} · {receipt.status}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-300">
                tx: {receipt.transactionId ?? "sin tx"}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-300">
                replays: {receipt.replayCount}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-300">
                {new Date(receipt.receivedAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
