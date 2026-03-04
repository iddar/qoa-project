"use client";

import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";

export default function WalletProfilePage() {
  const { logout } = useAuth();

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Perfil</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Gestiona tu cuenta y accesos rápidos de la wallet.</p>
      </header>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/70">
        <h2 className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Accesos
        </h2>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          <Link
            href="/campaigns"
            className="flex items-center justify-between px-4 py-3.5 text-sm text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
          >
            <span>Ver campañas y reglas</span>
            <span className="text-lg leading-none text-zinc-400 dark:text-zinc-500">›</span>
          </Link>
          <Link
            href="/rewards"
            className="flex items-center justify-between px-4 py-3.5 text-sm text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
          >
            <span>Ir a recompensas</span>
            <span className="text-lg leading-none text-zinc-400 dark:text-zinc-500">›</span>
          </Link>
        </div>
      </section>

      <button
        type="button"
        onClick={() => logout()}
        className="w-full py-2 text-sm text-rose-400 transition hover:text-rose-500"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
