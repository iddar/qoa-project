"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";

const navItems = [
  {
    href: "/",
    label: "Mi tarjeta",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <path d="M2 10h20" />
      </svg>
    ),
  },
  {
    href: "/transactions",
    label: "Historial",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8v4l3 3" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  {
    href: "/purchase",
    label: "Registrar",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v8" />
        <path d="M8 12h8" />
      </svg>
    ),
  },
  {
    href: "/rewards",
    label: "Recompensas",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 12v10H4V12" />
        <path d="M2 7h20v5H2z" />
        <path d="M12 22V7" />
      </svg>
    ),
  },
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

      <main className="flex-1 p-4 pb-20">{children}</main>

      <nav className="fixed bottom-0 left-1/2 z-20 grid w-full max-w-md -translate-x-1/2 grid-cols-4 border-t border-amber-100 bg-white/90 p-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-center text-[11px] font-semibold transition ${
                isActive
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
