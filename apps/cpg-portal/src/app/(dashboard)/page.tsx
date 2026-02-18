"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

// ─── Stat card ────────────────────────────────────────────────────────────────

type StatCardProps = {
  label: string;
  value: string | number;
  sublabel?: string;
  trend?: { value: string; up: boolean };
  loading?: boolean;
  comingSoon?: boolean;
  icon: React.ReactNode;
  color: "zinc" | "blue" | "green" | "amber" | "rose";
};

const colorMap = {
  zinc:  { bg: "bg-zinc-100 dark:bg-zinc-800",  icon: "text-zinc-600 dark:text-zinc-400" },
  blue:  { bg: "bg-blue-50 dark:bg-blue-950/40",  icon: "text-blue-600 dark:text-blue-400" },
  green: { bg: "bg-green-50 dark:bg-green-950/40", icon: "text-green-600 dark:text-green-400" },
  amber: { bg: "bg-amber-50 dark:bg-amber-950/40", icon: "text-amber-600 dark:text-amber-400" },
  rose:  { bg: "bg-rose-50 dark:bg-rose-950/40",   icon: "text-rose-600 dark:text-rose-400" },
};

function StatCard({ label, value, sublabel, trend, loading, comingSoon, icon, color }: StatCardProps) {
  const c = colorMap[color];

  return (
    <div className="relative rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
      {comingSoon && (
        <span className="absolute right-4 top-4 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          Próximamente
        </span>
      )}
      <div className="flex items-start justify-between">
        <div className={`rounded-lg p-2 ${c.bg}`}>
          <span className={c.icon}>{icon}</span>
        </div>
      </div>
      <div className="mt-3">
        {loading ? (
          <div className="space-y-1.5">
            <div className="h-7 w-20 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-3.5 w-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          </div>
        ) : comingSoon ? (
          <div className="space-y-0.5">
            <p className="text-2xl font-bold text-zinc-300 dark:text-zinc-700">—</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-600">{label}</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
            {sublabel && <p className="text-xs text-zinc-400 dark:text-zinc-600">{sublabel}</p>}
          </div>
        )}
      </div>
      {trend && !loading && !comingSoon && (
        <div className={`mt-3 flex items-center gap-1 text-xs ${trend.up ? "text-green-600 dark:text-green-400" : "text-rose-600 dark:text-rose-400"}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {trend.up
              ? <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>
              : <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></>
            }
          </svg>
          {trend.value}
        </div>
      )}
    </div>
  );
}

// ─── Quick action card ─────────────────────────────────────────────────────────

function QuickAction({ href, label, description, icon }: { href: string; label: string; description: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700"
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 transition group-hover:border-zinc-300 group-hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto flex-shrink-0 text-zinc-300 transition group-hover:text-zinc-500 dark:text-zinc-700 dark:group-hover:text-zinc-400">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  );
}

// ─── Upcoming campaign placeholder ────────────────────────────────────────────

function CampaignPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      </div>
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Sin campañas activas</p>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
        Las métricas de campañas estarán disponibles próximamente.
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const token = getAccessToken();

  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data, error } = await api.v1.users.me.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const { data: brandsData, isLoading: brandsLoading } = useQuery({
    queryKey: ["brands"],
    queryFn: async () => {
      const { data, error } = await api.v1.brands.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await api.v1.products.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const name = meData?.data?.name;
  const firstName = name?.split(" ")[0] ?? "de vuelta";

  const brands = brandsData?.data ?? [];
  const products = productsData?.data ?? [];
  const activeBrands = brands.filter((b: { status: string }) => b.status === "active").length;
  const activeProducts = products.filter((p: { status: string }) => p.status === "active").length;

  const today = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-zinc-400 dark:text-zinc-600 capitalize">{today}</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Bienvenido, {firstName}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Aquí tienes un resumen de tu actividad en Qoa.
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Marcas activas"
          value={activeBrands}
          sublabel={`${brands.length} en total`}
          loading={brandsLoading}
          color="blue"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
              <path d="M7 7h.01" />
            </svg>
          }
        />
        <StatCard
          label="Productos activos"
          value={activeProducts}
          sublabel={`${products.length} en total`}
          loading={productsLoading}
          color="green"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m7.5 4.27 9 5.15" />
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.3 7 8.7 5 8.7-5" />
              <path d="M12 22V12" />
            </svg>
          }
        />
        <StatCard
          label="Campañas activas"
          value="—"
          comingSoon
          color="amber"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          }
        />
        <StatCard
          label="Puntos entregados"
          value="—"
          comingSoon
          color="rose"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          }
        />
      </div>

      {/* Two column section */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Campaign metrics placeholder — spans 3 cols */}
        <div className="lg:col-span-3 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Rendimiento de campañas</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Evolución mensual de participación</p>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              Próximamente
            </span>
          </div>

          {/* Chart placeholder */}
          <div className="flex h-36 items-end gap-1.5 px-1">
            {[40, 65, 45, 80, 55, 70, 50, 90, 60, 75, 85, 95].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end">
                <div
                  className="rounded-sm bg-zinc-100 dark:bg-zinc-800"
                  style={{ height: `${h}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between px-1">
            {["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].map((m) => (
              <span key={m} className="text-[9px] text-zinc-300 dark:text-zinc-700">{m}</span>
            ))}
          </div>
        </div>

        {/* Quick actions — spans 2 cols */}
        <div className="lg:col-span-2 space-y-3">
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Acciones rápidas</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Gestiona tu catálogo desde aquí</p>
          </div>
          <QuickAction
            href="/brands"
            label="Gestionar marcas"
            description="Crea y administra tus marcas"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                <path d="M7 7h.01" />
              </svg>
            }
          />
          <QuickAction
            href="/products"
            label="Gestionar productos"
            description="Agrega productos a tus marcas"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m7.5 4.27 9 5.15" />
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                <path d="m3.3 7 8.7 5 8.7-5" />
                <path d="M12 22V12" />
              </svg>
            }
          />
        </div>
      </div>

      {/* Active campaigns */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Campañas activas</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Estado actual de tus campañas de fidelización</p>
          </div>
        </div>
        <CampaignPlaceholder />
      </div>

      {/* Catalog summary */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Tu catálogo</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Resumen de marcas y productos registrados</p>
          </div>
          <Link
            href="/brands"
            className="text-xs font-medium text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Ver todo
          </Link>
        </div>

        {brandsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                  <div className="h-3 w-20 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        ) : brands.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-5 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Aún no tienes marcas registradas.</p>
            <Link
              href="/brands"
              className="mt-2 inline-block text-xs font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
            >
              Crear tu primera marca
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {brands.slice(0, 5).map((brand: { id: string; name: string; status: string }) => {
              const brandProducts = products.filter((p: { brandId: string }) => p.brandId === brand.id);
              return (
                <li key={brand.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {brand.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {brand.name}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {brandProducts.length} producto{brandProducts.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    brand.status === "active"
                      ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}>
                    {brand.status === "active" ? "Activa" : "Inactiva"}
                  </span>
                </li>
              );
            })}
            {brands.length > 5 && (
              <li className="pt-3">
                <Link href="/brands" className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                  + {brands.length - 5} marcas más
                </Link>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
