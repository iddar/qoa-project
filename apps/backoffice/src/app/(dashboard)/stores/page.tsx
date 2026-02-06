"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type StoreFormState = {
  name: string;
  type: string;
  address: string;
  phone: string;
};

const emptyForm: StoreFormState = {
  name: "",
  type: "",
  address: "",
  phone: "",
};

export default function StoresPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<StoreFormState>(emptyForm);
  const [qrPayload, setQrPayload] = useState<{
    storeId: string;
    code: string;
    payload: unknown;
  } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.stores.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const createStore = useMutation({
    mutationFn: async () => {
      const token = getAccessToken();
      const payload = {
        name: form.name,
        type: form.type || undefined,
        address: form.address || undefined,
        phone: form.phone || undefined,
      };

      const { data, error } = await api.v1.stores.post(payload, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["stores"] });
    },
  });

  const fetchQr = useMutation({
    mutationFn: async (storeId: string) => {
      const token = getAccessToken();
      const { data, error } = await api.v1.stores({ storeId }).qr.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return { storeId, payload: data.data };
    },
    onSuccess: ({ storeId, payload }) => {
      setQrPayload({ storeId, code: payload.code, payload: payload.payload });
    },
  });

  const stores = data?.data ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tiendas</h1>
          <p className="text-sm text-zinc-500">
            Administra las tiendas creadas en el core y genera payloads de QR.
          </p>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,_2fr)_minmax(0,_1fr)]">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">Listado de tiendas</h2>

          {isLoading && (
            <p className="mt-4 text-sm text-zinc-400">Cargando tiendas...</p>
          )}

          {error && (
            <p className="mt-4 text-sm text-red-500">
              No se pudo cargar el listado de tiendas.
            </p>
          )}

          {!isLoading && !error && stores.length === 0 && (
            <p className="mt-4 text-sm text-zinc-500">
              Aún no hay tiendas registradas.
            </p>
          )}

          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {stores.map((store) => (
              <li key={store.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {store.name}
                    </p>
                    <p className="text-xs text-zinc-500">ID: {store.id}</p>
                    <p className="text-xs text-zinc-500">Código: {store.code}</p>
                    {store.type && (
                      <p className="text-xs text-zinc-500">Tipo: {store.type}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fetchQr.mutate(store.id)}
                      className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                      Ver payload QR
                    </button>
                  </div>
                </div>
                {qrPayload?.storeId === store.id && (
                  <div className="mt-3 rounded-md bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-300">
                    <p className="font-semibold">Payload actual</p>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap">
                      {JSON.stringify(
                        { code: qrPayload.code, payload: qrPayload.payload },
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-semibold">Crear tienda</h2>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                createStore.mutate();
              }}
            >
              <div>
                <label className="text-xs font-medium text-zinc-500">
                  Nombre
                </label>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  required
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">
                  Tipo (opcional)
                </label>
                <input
                  value={form.type}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, type: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">
                  Dirección (opcional)
                </label>
                <input
                  value={form.address}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, address: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">
                  Teléfono (opcional)
                </label>
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                disabled={createStore.isPending}
              >
                {createStore.isPending ? "Creando..." : "Crear tienda"}
              </button>
              {createStore.isError && (
                <p className="text-xs text-red-500">
                  No se pudo crear la tienda.
                </p>
              )}
              {createStore.isSuccess && (
                <p className="text-xs text-green-600">
                  Tienda creada correctamente.
                </p>
              )}
            </form>
          </div>

          {fetchQr.isPending && (
            <p className="text-xs text-zinc-400">Cargando payload QR...</p>
          )}
          {fetchQr.isError && (
            <p className="text-xs text-red-500">
              No se pudo obtener el payload QR.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
