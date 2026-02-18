"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";

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
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-zinc-950">
        <p className="text-sm text-zinc-400">Cargando...</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
      router.replace("/");
    } catch (caughtError) {
      if (caughtError instanceof Error && caughtError.message === "not_cpg_owner") {
        setError("Tu cuenta no está asociada a un CPG owner. Contacta soporte.");
      } else {
        setError("Credenciales inválidas. Verifica tu email y contraseña.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white dark:bg-zinc-950">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-zinc-900 p-12 dark:bg-zinc-950">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-white/10 flex items-center justify-center">
              <span className="text-white text-xs font-bold">Q</span>
            </div>
            <span className="text-white font-semibold text-sm tracking-wide">Qoa</span>
          </div>
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Gestiona tus marcas<br />y productos en<br />un solo lugar.
          </h1>
          <p className="text-zinc-400 text-base leading-relaxed max-w-sm">
            El portal para fabricantes de Qoa te da visibilidad completa sobre tus campañas, marcas y rendimiento en tiempo real.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">+200</p>
            <p className="text-xs text-zinc-500 mt-0.5">Marcas activas</p>
          </div>
          <div className="h-8 w-px bg-zinc-800" />
          <div className="text-center">
            <p className="text-2xl font-bold text-white">+1.2M</p>
            <p className="text-xs text-zinc-500 mt-0.5">Puntos canjeados</p>
          </div>
          <div className="h-8 w-px bg-zinc-800" />
          <div className="text-center">
            <p className="text-2xl font-bold text-white">98%</p>
            <p className="text-xs text-zinc-500 mt-0.5">Uptime</p>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="h-7 w-7 rounded-md bg-zinc-900 flex items-center justify-center dark:bg-zinc-800">
              <span className="text-white text-xs font-bold">Q</span>
            </div>
            <span className="font-semibold text-sm tracking-wide">Qoa</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              Iniciar sesión
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Accede al portal CPG con tu cuenta de fabricante.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/50">
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {submitting ? "Ingresando..." : "Iniciar sesión"}
            </button>
          </form>

          <p className="text-center text-xs text-zinc-400">
            ¿Problemas para acceder?{" "}
            <span className="text-zinc-600 dark:text-zinc-400">
              Contacta a tu administrador de cuenta.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
