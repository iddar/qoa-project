"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type MetricCard = {
  title: string;
  total: number;
  active?: number;
  helper: string;
};

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["reports-overview"],
    queryFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.reports.overview.get({
        headers: { authorization: `Bearer ${token}` },
      });

      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  const cards: MetricCard[] = data
    ? [
        {
          title: "CPGs",
          total: data.data.cpgs.total,
          active: data.data.cpgs.active,
          helper: "Empresas de consumo registradas",
        },
        {
          title: "Marcas",
          total: data.data.brands.total,
          active: data.data.brands.active,
          helper: "Brands en catálogo",
        },
        {
          title: "Productos",
          total: data.data.products.total,
          active: data.data.products.active,
          helper: "SKUs disponibles",
        },
        {
          title: "Campañas",
          total: data.data.campaigns.total,
          active: data.data.campaigns.active,
          helper: "Programas de lealtad",
        },
        {
          title: "Tiendas",
          total: data.data.stores.total,
          active: data.data.stores.active,
          helper: "Puntos de venta",
        },
        {
          title: "Tarjetas",
          total: data.data.cards.total,
          active: data.data.cards.active,
          helper: "Tarjetas emitidas",
        },
        {
          title: "Recompensas",
          total: data.data.rewards.total,
          active: data.data.rewards.active,
          helper: "Catálogo de premios",
        },
        {
          title: "Usuarios",
          total: data.data.users.total,
          helper: "Usuarios del ecosistema",
        },
        {
          title: "Transacciones",
          total: data.data.transactions.total,
          helper: "Compras registradas",
        },
        {
          title: "Canjes",
          total: data.data.redemptions.total,
          helper: "Redemptions completados",
        },
        {
          title: "Reminders",
          total: data.data.reminderJobs.total,
          active: data.data.reminderJobs.queued,
          helper: "Jobs de recordatorio (queued)",
        },
        {
          title: "WhatsApp",
          total: data.data.whatsappMessages.total,
          active: data.data.whatsappMessages.replayed,
          helper: "Mensajes ingestados (replays)",
        },
      ]
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-300">
          Vista rápida de salud operativa y volumen de entidades activas.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <p className="font-semibold">Stats de backoffice</p>
        <p className="mt-1">
          Estas métricas se refrescan cada 30s y te ayudan a validar cobertura de
          catálogo, campañas activas y ritmo transaccional sin navegar módulo por
          módulo.
        </p>
      </section>

      {isLoading && (
        <p className="text-sm text-zinc-400 dark:text-zinc-400">
          Cargando métricas...
        </p>
      )}

      {error && (
        <p className="text-sm text-red-500">
          No se pudo cargar el resumen global. Verifica permisos de tu usuario.
        </p>
      )}

      {cards.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => (
            <article
              key={card.title}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                {card.title}
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                {card.total}
              </p>
              {card.active !== undefined && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-300">
                  Activos: {card.active}
                </p>
              )}
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-400">
                {card.helper}
              </p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
