"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { StoreAgentDrawer } from "@/components/store-agent-drawer";
import { useAuth } from "@/providers/auth-provider";
import { StorePosProvider } from "@/providers/store-pos-provider";

const navItems = [
  { href: "/", label: "Resumen" },
  { href: "/pos", label: "POS" },
  { href: "/products", label: "Catálogo" },
  { href: "/sales", label: "Ventas" },
  { href: "/scan", label: "Escanear" },
  { href: "/customers", label: "Clientes" },
  { href: "/reports", label: "Reportes" },
  { href: "/campaigns", label: "Campañas" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading, isAuthenticated, logout, role } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-zinc-500">Cargando...</p>
      </div>
    );
  }

  return (
    <StorePosProvider>
      <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <aside className="hidden w-60 flex-col border-r border-zinc-200 bg-white lg:flex dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-100 px-4 py-4 dark:border-zinc-800/60">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Qoa</p>
            <p className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">Dashboard Tienda</p>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navItems.map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm transition ${
                    isActive
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-zinc-100 p-3 text-xs text-zinc-500 dark:border-zinc-800/60 dark:text-zinc-400">
            <p className="mb-2 uppercase tracking-wide">Rol: {role ?? "-"}</p>
            <button
              type="button"
              onClick={() => logout()}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Cerrar sesión
            </button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 p-6 lg:p-8">{children}</main>
        </div>
      </div>
      <StoreAgentDrawer />
    </StorePosProvider>
  );
}
