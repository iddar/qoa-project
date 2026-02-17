"use client";

import { useState } from "react";
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

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<UserCreateForm>(emptyForm);

  const { data, isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const token = getAccessToken();
      const { data, error } = await api.v1.users.get({
        query: {
          limit: 50,
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

  const users = (data?.data ?? []) as UserListItem[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-300">
          Administra usuarios de backoffice y operadores por tenant.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,_2fr)_minmax(0,_1fr)]">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">Listado</h2>

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

          {!isLoading && !error && users.length === 0 && (
            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-300">
              No hay usuarios registrados.
            </p>
          )}

          <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
            {users.map((user: UserListItem) => (
              <li key={user.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {user.name ?? user.email ?? user.phone}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-300">
                      {user.email ?? "Sin email"} · {user.phone}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-300">
                      {user.role} · {user.status}
                    </p>
                    {user.tenantId && user.tenantType && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-300">
                        {user.tenantType}: {user.tenantId}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => blockUser.mutate(user.id)}
                      className="rounded-md border border-amber-200 px-3 py-1.5 text-xs text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950"
                      disabled={blockUser.isPending || unblockUser.isPending}
                    >
                      Bloquear
                    </button>
                    <button
                      type="button"
                      onClick={() => unblockUser.mutate(user.id)}
                      className="rounded-md border border-green-200 px-3 py-1.5 text-xs text-green-700 transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-green-900 dark:text-green-300 dark:hover:bg-green-950"
                      disabled={blockUser.isPending || unblockUser.isPending}
                    >
                      Desbloquear
                    </button>
                  </div>
                </div>
              </li>
            ))}
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
