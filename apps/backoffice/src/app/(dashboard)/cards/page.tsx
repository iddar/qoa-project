"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type CardFormState = {
  userId: string;
  campaignId: string;
  storeId: string;
};

const emptyForm: CardFormState = {
  userId: "",
  campaignId: "",
  storeId: "",
};

export default function CardsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CardFormState>(emptyForm);
  const [lookupId, setLookupId] = useState("");
  const [qrPayload, setQrPayload] = useState<{
    cardId: string;
    code: string;
    payload: unknown;
  } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cards", lookupId],
    queryFn: async () => {
      if (!lookupId) return null;
      const token = getAccessToken();
      const { data, error } = await api.v1.cards({ cardId: lookupId }).get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const createCard = useMutation({
    mutationFn: async () => {
      const token = getAccessToken();
      const payload = {
        userId: form.userId,
        campaignId: form.campaignId,
        storeId: form.storeId || undefined,
      };
      const { data, error } = await api.v1.cards.post(payload, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["cards"] });
    },
  });

  const fetchQr = useMutation({
    mutationFn: async (cardId: string) => {
      const token = getAccessToken();
      const { data, error } = await api.v1.cards({ cardId }).qr.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return { cardId, payload: data.data };
    },
    onSuccess: ({ cardId, payload }) => {
      setQrPayload({ cardId, code: payload.code, payload: payload.payload });
    },
  });

  const card = data?.data;
  const hasCard = Boolean(card);

  const cardSummary = useMemo(() => {
    if (!card) return [];
    return [
      { label: "ID", value: card.id },
      { label: "Código", value: card.code },
      { label: "Usuario", value: card.userId },
      { label: "Campaña", value: card.campaignId },
      { label: "Tienda", value: card.storeId ?? "—" },
      { label: "Estado", value: card.status },
    ];
  }, [card]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Tarjetas</h1>
        <p className="text-sm text-zinc-500">
          Crea tarjetas y consulta el payload QR de una tarjeta específica.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,_2fr)_minmax(0,_1fr)]">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">Buscar tarjeta</h2>
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (lookupId) {
                queryClient.invalidateQueries({ queryKey: ["cards", lookupId] });
              }
            }}
          >
            <div className="flex-1">
              <label className="text-xs font-medium text-zinc-500">
                ID de tarjeta
              </label>
              <input
                value={lookupId}
                onChange={(event) => setLookupId(event.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <button
              type="submit"
              className="rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Consultar
            </button>
          </form>

          {isLoading && (
            <p className="mt-4 text-sm text-zinc-400">
              Buscando información de la tarjeta...
            </p>
          )}
          {error && (
            <p className="mt-4 text-sm text-red-500">
              No se pudo cargar la tarjeta.
            </p>
          )}
          {!isLoading && !error && lookupId && !hasCard && (
            <p className="mt-4 text-sm text-zinc-500">
              No hay datos para la tarjeta consultada.
            </p>
          )}

          {hasCard && (
            <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  {cardSummary.map((item) => (
                    <div key={item.label} className="text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700 dark:text-zinc-200">
                        {item.label}:
                      </span>{" "}
                      {item.value}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => fetchQr.mutate(card.id)}
                  className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-950"
                >
                  Ver payload QR
                </button>
              </div>
              {qrPayload?.cardId === card.id && (
                <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">
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
            </div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">Crear tarjeta</h2>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              createCard.mutate();
            }}
          >
            <div>
              <label className="text-xs font-medium text-zinc-500">
                ID de usuario
              </label>
              <input
                value={form.userId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, userId: event.target.value }))
                }
                required
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500">
                ID de campaña
              </label>
              <input
                value={form.campaignId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    campaignId: event.target.value,
                  }))
                }
                required
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500">
                ID de tienda (opcional)
              </label>
              <input
                value={form.storeId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, storeId: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              disabled={createCard.isPending}
            >
              {createCard.isPending ? "Creando..." : "Crear tarjeta"}
            </button>
            {createCard.isError && (
              <p className="text-xs text-red-500">
                No se pudo crear la tarjeta.
              </p>
            )}
            {createCard.isSuccess && (
              <p className="text-xs text-green-600">
                Tarjeta creada correctamente.
              </p>
            )}
          </form>
        </div>
      </section>

      {fetchQr.isPending && (
        <p className="text-xs text-zinc-400">Cargando payload QR...</p>
      )}
      {fetchQr.isError && (
        <p className="text-xs text-red-500">
          No se pudo obtener el payload QR.
        </p>
      )}
    </div>
  );
}
