"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/providers/auth-provider";

type UserProfile = {
    id: string;
    phone?: string;
    email?: string;
    name?: string;
    role: string;
    status: string;
    tenantId?: string;
    tenantType?: "cpg" | "store";
    blockedUntil?: string;
    createdAt: string;
};

const profileRows = (profile: UserProfile) =>
    [
        ["ID de usuario", profile.id],
        ["Nombre", profile.name ?? "Sin nombre"],
        ["Correo", profile.email ?? "Sin correo"],
        ["Teléfono", profile.phone ?? "Sin teléfono"],
        ["Rol", profile.role],
        ["Estado", profile.status],
        ["Fecha de registro", formatDateTime(profile.createdAt)],
        profile.tenantType ? ["Tipo de tenant", profile.tenantType] : null,
        profile.tenantId ? ["ID de tenant", profile.tenantId] : null,
        profile.blockedUntil ? ["Bloqueado hasta", formatDateTime(profile.blockedUntil)] : null,
    ].filter((row): row is [string, string] => Boolean(row));

export default function WalletProfilePage() {
    const { logout, token } = useAuth();

    const profileQuery = useQuery({
        queryKey: ["wallet-profile"],
        enabled: Boolean(token),
        queryFn: async () => {
            const { data, error } = await api.v1.users.me.get({
                headers: { authorization: `Bearer ${token}` },
            });
            if (error) throw error;
            return data?.data as UserProfile;
        },
    });

    return (
        <div className="space-y-4">
            <header className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
                <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Perfil</h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Gestiona tu cuenta y accesos rápidos de la wallet.
                </p>
            </header>

            <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/70">
                <h2 className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Datos de registro
                </h2>
                {profileQuery.isLoading ? (
                    <p className="px-4 py-4 text-sm text-zinc-500 dark:text-zinc-400">
                        Cargando perfil...
                    </p>
                ) : profileQuery.isError || !profileQuery.data ? (
                    <p className="px-4 py-4 text-sm text-rose-500">No se pudo cargar el perfil.</p>
                ) : (
                    <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {profileRows(profileQuery.data).map(([label, value]) => (
                            <div
                                key={label}
                                className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr]"
                            >
                                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                                    {label}
                                </dt>
                                <dd className="break-words font-mono text-sm text-zinc-800 dark:text-zinc-100">
                                    {value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}
            </section>

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
                        <span className="text-lg leading-none text-zinc-400 dark:text-zinc-500">
                            ›
                        </span>
                    </Link>
                    <Link
                        href="/rewards"
                        className="flex items-center justify-between px-4 py-3.5 text-sm text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
                    >
                        <span>Ir a recompensas</span>
                        <span className="text-lg leading-none text-zinc-400 dark:text-zinc-500">
                            ›
                        </span>
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
