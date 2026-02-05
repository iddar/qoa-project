"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const { data, error } = await api.v1.health.get();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>

      <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="mb-4 text-sm font-medium text-zinc-500">
          Estado del API
        </h2>
        {isLoading && (
          <p className="text-sm text-zinc-400">Conectando...</p>
        )}
        {error && (
          <p className="text-sm text-red-500">
            Error al conectar con el API
          </p>
        )}
        {data && (
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="font-medium">{data.status}</span>
            </div>
            <p className="text-zinc-500">
              Uptime: {Math.floor(data.uptime / 60)}m {Math.floor(data.uptime % 60)}s
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
