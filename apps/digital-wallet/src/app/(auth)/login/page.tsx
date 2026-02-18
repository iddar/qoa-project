"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";

export default function WalletLoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-zinc-500">Cargando...</p>
      </div>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
      router.replace("/");
    } catch {
      setError("No pudimos iniciar sesión con esos datos.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <div className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-orange-200/70 blur-3xl" />
      <div className="absolute -bottom-16 -right-16 h-72 w-72 rounded-full bg-amber-200/60 blur-3xl" />

      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-amber-100 bg-white/90 p-6 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
        <p className="text-xs uppercase tracking-[0.2em] text-amber-600">Qoa Wallet</p>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">Tu tarjeta digital</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Consulta QR, recompensas e historial desde el celular.</p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-amber-50 px-2 py-1.5 dark:bg-zinc-800/70">
            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">QR</p>
            <p className="text-[10px] text-zinc-500">Siempre listo</p>
          </div>
          <div className="rounded-lg bg-amber-50 px-2 py-1.5 dark:bg-zinc-800/70">
            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Historial</p>
            <p className="text-[10px] text-zinc-500">Compras</p>
          </div>
          <div className="rounded-lg bg-amber-50 px-2 py-1.5 dark:bg-zinc-800/70">
            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Canjes</p>
            <p className="text-[10px] text-zinc-500">Recompensas</p>
          </div>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{error}</p>}
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Contraseña</span>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? "Ingresando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
          ¿No tienes cuenta?{" "}
          <Link href="/signup" className="font-semibold text-zinc-800 underline decoration-zinc-300 underline-offset-2 dark:text-zinc-200">
            Crear cuenta
          </Link>
        </p>
      </div>
    </div>
  );
}
