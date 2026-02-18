"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type AlertItem = {
  code: string;
  source: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message: string;
  count: number;
  updatedAt: string;
};

const severityClasses: Record<AlertItem["severity"], string> = {
  low: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  medium: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  high: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export default function AlertsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.alerts.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  const notifyMutation = useMutation({
    mutationFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.alerts.notify.post(
        {
          minSeverity: "high",
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const alerts = (data?.data ?? []) as AlertItem[];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Panel de errores y alertas</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-300">
            Monitoreo operativo de fallos en jobs, webhooks y eventos críticos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => notifyMutation.mutate()}
          disabled={notifyMutation.isPending}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {notifyMutation.isPending ? "Notificando..." : "Notificar (email mock)"}
        </button>
      </div>

      {notifyMutation.isSuccess && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
          Notificaciones simuladas enviadas: {notifyMutation.data?.data.sent ?? 0}
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <p className="font-semibold">Modo actual</p>
        <p className="mt-1">
          El envío de alertas usa `sendEmailMock` por ahora. Se guarda registro en
          base y se imprime log para validar la integración antes de conectar el
          proveedor final.
        </p>
      </div>

      {isLoading && (
        <p className="text-sm text-zinc-400 dark:text-zinc-400">Cargando alertas...</p>
      )}

      {error && (
        <p className="text-sm text-red-500">No se pudieron cargar las alertas.</p>
      )}

      {!isLoading && !error && alerts.length === 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          Sin alertas activas. Todo en orden.
        </div>
      )}

      {alerts.length > 0 && (
        <ul className="space-y-3">
          {alerts.map((alert) => (
            <li
              key={alert.code}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {alert.title}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-300">
                    {alert.message}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${severityClasses[alert.severity]}`}>
                  {alert.severity.toUpperCase()}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-500 dark:text-zinc-300">
                <span>Code: {alert.code}</span>
                <span>Source: {alert.source}</span>
                <span>Count: {alert.count}</span>
                <span>Updated: {new Date(alert.updatedAt).toLocaleString("es-MX")}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
