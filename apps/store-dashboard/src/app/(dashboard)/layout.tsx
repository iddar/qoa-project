"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Archive, BarChart3, CreditCard, LayoutDashboard, Package2, ScanLine, ShoppingCart, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { StoreAgentDrawer } from "@/components/store-agent-drawer";
import { useAuth } from "@/providers/auth-provider";
import { StoreInventoryProvider } from "@/providers/store-inventory-provider";
import { StorePosProvider, useStorePos } from "@/providers/store-pos-provider";

const navItems = [
  { href: "/", label: "Resumen", shortLabel: "Inicio", icon: LayoutDashboard },
  { href: "/pos", label: "POS", shortLabel: "POS", icon: ShoppingCart },
  { href: "/inventory", label: "Inventario", shortLabel: "Inventario", icon: Archive },
  { href: "/products", label: "Catálogo", shortLabel: "Catálogo", icon: Package2 },
  { href: "/sales", label: "Ventas", shortLabel: "Ventas", icon: CreditCard },
  { href: "/scan", label: "Escanear", shortLabel: "Escanear", icon: ScanLine },
  { href: "/customers", label: "Clientes", shortLabel: "Clientes", icon: Users },
  { href: "/reports", label: "Reportes", shortLabel: "Reportes", icon: BarChart3 },
  { href: "/campaigns", label: "Campañas", shortLabel: "Campañas", icon: LayoutDashboard },
];

const mobileNavItems = navItems.slice(0, 5);

function DashboardShell({ children, pathname, logout, role }: {
  children: React.ReactNode;
  pathname: string;
  logout: () => void;
  role: string | null | undefined;
}) {
  const { isAgentOpen } = useStorePos();

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="fixed inset-x-0 top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-400">Qoa</p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Dashboard Tienda</p>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
          >
            Salir
          </button>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-3">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
                }`}
              >
                {item.shortLabel}
              </Link>
            );
          })}
        </nav>
      </div>

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

      <div
        className={`min-w-0 flex-1 transition-[padding] duration-200 ${
          isAgentOpen ? "lg:pr-[28rem]" : "lg:pr-0"
        }`}
      >
        <main className="px-4 pb-28 pt-28 sm:px-6 lg:p-8 lg:pt-8">{children}</main>
      </div>

      <StoreAgentDrawer />

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-zinc-200 bg-white/95 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95">
        {mobileNavItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-2 py-3 text-[11px] font-medium transition ${
                isActive ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

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
      <StoreInventoryProvider>
        <DashboardShell pathname={pathname} logout={logout} role={role}>
          {children}
        </DashboardShell>
      </StoreInventoryProvider>
    </StorePosProvider>
  );
}
