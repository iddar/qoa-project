"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

const navItems = [
  { href: "/", label: "Inicio" },
  { href: "/users", label: "Usuarios" },
  { href: "/stores", label: "Tiendas" },
  { href: "/cards", label: "Tarjetas" },
  { href: "/campaigns", label: "Campañas" },
];

function ApiStatus() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const { data, error } = await api.v1.health.get();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-400">
        <span className="h-2 w-2 rounded-full bg-zinc-300" />
        API
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-500">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        API offline
      </div>
    );
  }

  const apiBase =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

  return (
    <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-300">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        API {data?.status}
      </span>
      <a
        href={`${apiBase}/v1/openapi`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
        title="API Docs"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      </a>
    </div>
  );
}

function ProfileButton() {
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.users.me.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const name = data?.data?.name;
  const email = data?.data?.email;
  const initials = name
      ? name
          .split(" ")
          .map((w: string) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
    : email
      ? email[0]!.toUpperCase()
      : "?";

  return (
    <Link
      href="/profile"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      title={name ?? email ?? "Perfil"}
    >
      {initials}
    </Link>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-zinc-400 dark:text-zinc-400">
          Cargando...
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <aside className="flex w-64 flex-col border-r border-zinc-200 bg-zinc-50 p-4 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
        <div className="mb-8">
          <h1 className="text-lg font-semibold">Qoa</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Backoffice
          </p>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                pathname === item.href
                  ? "bg-zinc-200 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-red-600 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-red-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-950">
          <ApiStatus />
          <ProfileButton />
        </header>
        <main className="flex-1 bg-white p-8 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
          {children}
        </main>
      </div>
    </div>
  );
}
