"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type UserCreateForm = {
  email: string;
  phone: string;
  name: string;
  role:
    | "consumer"
    | "customer"
    | "store_staff"
    | "store_admin"
    | "cpg_admin"
    | "qoa_support"
    | "qoa_admin";
  tenantId: string;
  tenantType: "store" | "cpg";
};

type UserListItem = {
  id: string;
  phone: string;
  email?: string;
  name?: string;
  role: string;
  status: string;
  tenantId?: string;
  tenantType?: string;
};

const emptyForm: UserCreateForm = {
  email: "",
  phone: "",
  name: "",
  role: "consumer",
  tenantId: "",
  tenantType: "store",
};

const rolesWithTenant = new Set(["store_staff", "store_admin", "cpg_admin"]);

const STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  suspended: "Suspendido",
  blocked: "Bloqueado",
  inactive: "Inactivo",
};

const STATUS_COLORS: Record<string, string> = {
  active: "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-900",
  suspended: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-900",
  blocked: "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-900",
  inactive: "text-zinc-500 bg-zinc-50 border-zinc-200 dark:text-zinc-400 dark:bg-zinc-900 dark:border-zinc-800",
};

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<UserCreateForm>(emptyForm);

  // Filters
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.users.get({
        query: {
          limit: 100,
          offset: 0,
        },
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const createUser = useMutation({
    mutationFn: async () => {
      const token = getAccessToken();
      const requiresTenant = rolesWithTenant.has(form.role);

      const payload = {
        email: form.email || undefined,
        phone: form.phone,
        name: form.name || undefined,
        role: form.role,
        tenantId: requiresTenant ? form.tenantId || undefined : undefined,
        tenantType: requiresTenant ? form.tenantType : undefined,
      };

      const { data, error } = await api.v1.users.post(payload, {
        headers: { authorization: `Bearer ${token}` },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const blockUser = useMutation({
    mutationFn: async (userId: string) => {
      const token = getAccessToken();
      const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await api.v1.users({ id: userId }).block.post(
        {
          until,
          reason: "Bloqueo manual desde backoffice",
        },
        {
          headers: { authorization: `Bearer ${token}` },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const unblockUser = useMutation({
    mutationFn: async (userId: string) => {
      const token = getAccessToken();
      const { data, error } = await api.v1.users({ id: userId }).unblock.post(undefined, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const allUsers = (data?.data ?? []) as UserListItem[];

  const filteredUsers = useMemo(() => {
    return allUsers.filter((user) => {
      const term = search.toLowerCase();
      const matchesSearch =
        !term ||
        user.name?.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term) ||
        user.phone?.toLowerCase().includes(term);

      const matchesRole = !filterRole || user.role === filterRole;
      const matchesStatus = !filterStatus || user.status === filterStatus;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [allUsers, search, filterRole, filterStatus]);

  const isBlocked = (user: UserListItem) =>
    user.status === "suspended" || user.status === "blocked";

  const isPending = (userId: string) =>
    (blockUser.isPending && blockUser.variables === userId) ||
    (unblockUser.isPending && unblockUser.variables === userId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-300">
          Administra usuarios de backoffice y operadores por tenant.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <p className="font-semibold">Contexto operativo</p>
        <p className="mt-1">
          Esta pantalla sirve para controlar acceso operativo por rol y tenant.
          Para roles de tienda/CPG define tenant para restringir alcance. Usa
          bloquear/desbloquear para soporte y control de fraude.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,_2fr)_minmax(0,_1fr)]">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Listado</h2>
            {!isLoading && (
              <span className="text-xs text-zinc-400">
                {filteredUsers.length} de {allUsers.length} usuarios
              </span>
            )}
          </div>

          {/* Search & Filters */}
          <div className="mt-4 flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <svg
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Buscar por nombre, email o teléfono…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-zinc-200 py-1.5 pl-8 pr-3 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder-zinc-500"
              />
            </div>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Todos los roles</option>
              <option value="consumer">consumer</option>
              <option value="customer">customer</option>
              <option value="store_staff">store_staff</option>
              <option value="store_admin">store_admin</option>
              <option value="cpg_admin">cpg_admin</option>
              <option value="qoa_support">qoa_support</option>
              <option value="qoa_admin">qoa_admin</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Todos los estados</option>
              <option value="active">Activo</option>
              <option value="suspended">Suspendido</option>
              <option value="blocked">Bloqueado</option>
              <option value="inactive">Inactivo</option>
            </select>
            {(search || filterRole || filterStatus) && (
              <button
                type="button"
                onClick={() => { setSearch(""); setFilterRole(""); setFilterStatus(""); }}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                Limpiar
              </button>
            )}
          </div>

          {isLoading && (
            <p className="mt-4 text-sm text-zinc-400 dark:text-zinc-400">
              Cargando usuarios...
            </p>
          )}

          {error && (
            <p className="mt-4 text-sm text-red-500">
              No se pudo cargar el listado de usuarios.
            </p>
          )}

          {!isLoading && !error && filteredUsers.length === 0 && (
            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-300">
              {allUsers.length === 0
                ? "No hay usuarios registrados."
                : "Ningún usuario coincide con los filtros."}
            </p>
          )}

          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredUsers.map((user: UserListItem) => {
              const blocked = isBlocked(user);
              const pending = isPending(user.id);
              return (
                <li key={user.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {user.name ?? user.email ?? user.phone}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-300">
                        {user.email ?? "Sin email"} · {user.phone}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {user.role}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            STATUS_COLORS[user.status] ?? STATUS_COLORS.inactive
                          }`}
                        >
                          {STATUS_LABELS[user.status] ?? user.status}
                        </span>
                      </div>
                      {user.tenantId && user.tenantType && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-300">
                          {user.tenantType}: {user.tenantId}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        blocked
                          ? unblockUser.mutate(user.id)
                          : blockUser.mutate(user.id)
                      }
                      disabled={pending}
                      className={`rounded-md border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        blocked
                          ? "border-green-200 text-green-700 hover:bg-green-50 dark:border-green-900 dark:text-green-400 dark:hover:bg-green-950/40"
                          : "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-400 dark:hover:bg-amber-950/40"
                      }`}
                    >
                      {pending
                        ? "..."
                        : blocked
                          ? "Desbloquear"
                          : "Bloquear"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">Crear usuario</h2>
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              createUser.mutate();
            }}
          >
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                Email
              </label>
              <input
                value={form.email}
                type="email"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, email: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                Teléfono
              </label>
              <input
                required
                value={form.phone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                Nombre
              </label>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                Rol
              </label>
              <select
                value={form.role}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    role: event.target.value as UserCreateForm["role"],
                  }))
                }
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="consumer">consumer</option>
                <option value="customer">customer</option>
                <option value="store_staff">store_staff</option>
                <option value="store_admin">store_admin</option>
                <option value="cpg_admin">cpg_admin</option>
                <option value="qoa_support">qoa_support</option>
                <option value="qoa_admin">qoa_admin</option>
              </select>
            </div>

            {rolesWithTenant.has(form.role) && (
              <>
                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                    Tenant ID
                  </label>
                  <input
                    required
                    value={form.tenantId}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, tenantId: event.target.value }))
                    }
                    className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-300">
                    Tenant Type
                  </label>
                  <select
                    value={form.tenantType}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        tenantType: event.target.value as UserCreateForm["tenantType"],
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="store">store</option>
                    <option value="cpg">cpg</option>
                  </select>
                </div>
              </>
            )}

            <button
              type="submit"
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              disabled={createUser.isPending}
            >
              {createUser.isPending ? "Creando..." : "Crear usuario"}
            </button>

            {createUser.isSuccess && (
              <p className="text-xs text-green-600">
                Usuario creado correctamente.
              </p>
            )}
            {createUser.isError && (
              <p className="text-xs text-red-500">
                No se pudo crear el usuario.
              </p>
            )}
          </form>
        </div>
      </section>
    </div>
  );
}
