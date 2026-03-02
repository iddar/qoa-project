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

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Accesos</h2>
        <div className="mt-3 space-y-2">
          <Link href="/campaigns" className="block rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
            Ver campañas y reglas
          </Link>
          <Link href="/rewards" className="block rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">
            Ir a recompensas
          </Link>
        </div>
      </section>

      <button
        type="button"
        onClick={() => logout()}
        className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
