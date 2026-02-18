"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";

const navItems = [
  { href: "/", label: "Mi tarjeta" },
  { href: "/transactions", label: "Historial" },
  { href: "/rewards", label: "Recompensas" },
];

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading, isAuthenticated, logout } = useAuth();

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
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-gradient-to-b from-amber-50 via-orange-50 to-white dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      <header className="sticky top-0 z-10 border-b border-amber-100/80 bg-white/80 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">Qoa Wallet</p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Tarjeta Digital</p>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="flex-1 p-4">{children}</main>

      <nav className="sticky bottom-0 grid grid-cols-3 border-t border-amber-100 bg-white/90 p-2 dark:border-zinc-800 dark:bg-zinc-950/90">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-2 py-2 text-center text-xs font-semibold transition ${
                isActive
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
