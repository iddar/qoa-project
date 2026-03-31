"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";

function getLoginErrorMessage(caughtError: unknown) {
  if (caughtError instanceof Error && caughtError.message === "store_tenant_required") {
    return "Tu usuario de tienda no tiene tenant asociado. Contacta a soporte.";
  }

  if (caughtError instanceof Error && caughtError.message === "not_store_operator") {
    return "Tu cuenta no tiene acceso al dashboard de tienda.";
  }

  if (caughtError instanceof Error && caughtError.message === "profile_fetch_failed") {
    return "El login si respondio, pero no pudimos validar la sesion contra el API. Revisa el certificado de Caddy en tu iPhone.";
  }

  if (caughtError instanceof TypeError) {
    return "No pudimos conectar con el API. En iPhone normalmente es un tema de certificado de Caddy sin confiar.";
  }

  if (caughtError instanceof Error && /fetch|network|load failed/i.test(caughtError.message)) {
    return "No pudimos conectar con el API. En iPhone normalmente es un tema de certificado de Caddy sin confiar.";
  }

  return "Credenciales inválidas.";
}

export default function LoginPage() {
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
      <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-100 dark:bg-zinc-950 lg:min-h-screen">
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
    } catch (caughtError) {
      setError(getLoginErrorMessage(caughtError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-[100dvh] overflow-hidden lg:min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-amber-100 p-12 lg:block dark:bg-zinc-900">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-amber-300/60 blur-3xl" />
        <div className="absolute -bottom-12 left-8 h-56 w-56 rounded-full bg-orange-300/60 blur-3xl" />
        <div className="relative z-10 flex h-full flex-col justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">Qoa Retail Ops</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight text-zinc-900 dark:text-zinc-50">
              Control diario de la tienda en una sola vista
            </h1>
          </div>
          <p className="max-w-md text-sm text-zinc-700 dark:text-zinc-300">
            Registra transacciones, consulta clientes recurrentes y sigue el rendimiento de lealtad por día.
          </p>
        </div>
      </div>

      <div className="flex min-h-[100dvh] items-center justify-center bg-white px-5 py-6 dark:bg-zinc-950 sm:px-6 sm:py-8 lg:min-h-screen lg:px-6 lg:py-12">
        <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6 lg:border-none lg:bg-transparent lg:p-0 lg:shadow-none">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-600 dark:text-amber-400 lg:hidden">Qoa Retail Ops</p>
            <h2 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100 lg:mt-0">Dashboard Tienda</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Inicia sesión para continuar.</p>
            <p className="mt-2 text-xs leading-5 text-zinc-400">Accede con la cuenta operativa asignada a tu tienda.</p>
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
                className="w-full rounded-lg border border-zinc-200 px-3 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Contraseña</span>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {submitting ? "Ingresando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
