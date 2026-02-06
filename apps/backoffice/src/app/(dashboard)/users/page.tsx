"use client";

export default function UsersPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
      </div>
      <div className="rounded-lg border border-zinc-200 p-8 text-center dark:border-zinc-800">
        <p className="text-sm text-zinc-500">
          Gestión de usuarios del sistema.
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Próximamente: listado, búsqueda y creación de usuarios.
        </p>
      </div>
    </div>
  );
}
