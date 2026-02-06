"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

const roleLabels: Record<string, string> = {
  consumer: "Consumidor",
  customer: "Cliente",
  store_staff: "Staff de tienda",
  store_admin: "Admin de tienda",
  cpg_admin: "Admin CPG",
  qoa_support: "Soporte Qoa",
  qoa_admin: "Admin Qoa",
};

export default function ProfilePage() {
  const { logout } = useAuth();

  const { data, isLoading, error } = useQuery({
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

  const user = data?.data;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Mi perfil</h1>

      {isLoading && (
        <p className="text-sm text-zinc-400">Cargando perfil...</p>
      )}

      {error && (
        <p className="text-sm text-red-500">Error al cargar el perfil</p>
      )}

      {user && (
        <div className="max-w-lg space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-200 text-xl font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {user.name
                ? user.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                : user.email
                  ? user.email[0]!.toUpperCase()
                  : "?"}
            </div>
            <div>
              <p className="text-lg font-medium">
                {user.name ?? "Sin nombre"}
              </p>
              <p className="text-sm text-zinc-500">
                {roleLabels[user.role] ?? user.role}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
            <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
              <div className="flex justify-between px-4 py-3">
                <dt className="text-sm text-zinc-500">ID</dt>
                <dd className="font-mono text-sm">{user.id}</dd>
              </div>
              <div className="flex justify-between px-4 py-3">
                <dt className="text-sm text-zinc-500">Email</dt>
                <dd className="text-sm">{user.email ?? "—"}</dd>
              </div>
              <div className="flex justify-between px-4 py-3">
                <dt className="text-sm text-zinc-500">Teléfono</dt>
                <dd className="text-sm">{user.phone}</dd>
              </div>
              <div className="flex justify-between px-4 py-3">
                <dt className="text-sm text-zinc-500">Rol</dt>
                <dd className="text-sm">
                  {roleLabels[user.role] ?? user.role}
                </dd>
              </div>
              <div className="flex justify-between px-4 py-3">
                <dt className="text-sm text-zinc-500">Estado</dt>
                <dd className="text-sm">
                  <span
                    className={
                      user.status === "active"
                        ? "text-green-600"
                        : "text-red-500"
                    }
                  >
                    {user.status === "active" ? "Activo" : user.status}
                  </span>
                </dd>
              </div>
              {user.tenantId && (
                <div className="flex justify-between px-4 py-3">
                  <dt className="text-sm text-zinc-500">Tenant</dt>
                  <dd className="font-mono text-sm">
                    {user.tenantType}: {user.tenantId}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <button
            onClick={async () => {
              await logout();
              window.location.href = "/login";
            }}
            className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
