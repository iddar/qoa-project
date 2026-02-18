"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";

export default function WalletSignupPage() {
  const { signup, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
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
      await signup(email, phone, password, name || undefined);
      router.replace("/");
    } catch {
      setError("No fue posible crear tu cuenta con esos datos.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-amber-50 px-6 py-12 dark:bg-zinc-950">
      <div className="absolute -left-12 top-0 h-60 w-60 rounded-full bg-orange-200/60 blur-3xl" />
      <div className="absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-amber-200/60 blur-3xl" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-amber-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Crear cuenta</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Activa tu tarjeta digital en minutos.</p>

        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
          Necesitarás tu email y teléfono para recuperar tu sesión y consultar tu tarjeta en cualquier momento.
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{error}</p>}
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Nombre (opcional)</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Teléfono</span>
            <input required value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Email</span>
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Contraseña</span>
            <input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900" />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? "Creando..." : "Crear cuenta"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-semibold text-zinc-800 underline decoration-zinc-300 underline-offset-2 dark:text-zinc-200">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
