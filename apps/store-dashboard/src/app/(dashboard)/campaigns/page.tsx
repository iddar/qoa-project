"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

type Campaign = {
  id: string;
  name: string;
  description?: string;
  status: "active" | "paused" | "ended" | "draft";
  cpgId?: string;
  startsAt?: string;
  endsAt?: string;
  storeEnrollmentStatus?: StoreCampaignAssignment["status"];
  storeAccessMode?: string;
  storeEnrollmentMode?: string;
  createdAt: string;
};

type StoreCampaignAssignment = {
  storeId: string;
  storeName: string;
  status: "visible" | "invited" | "enrolled" | "declined" | "removed" | "suspended";
  enrollmentSource?: string;
  enrolledAt?: string;
  invitedAt?: string;
};

const statusLabel: Record<Campaign["status"], string> = {
  active: "Activa",
  paused: "Pausada",
  ended: "Finalizada",
  draft: "Borrador",
};

const statusClass: Record<Campaign["status"], string> = {
  active: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  paused: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  ended: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

const storeStatusLabel: Record<StoreCampaignAssignment["status"], string> = {
  visible: "Visible",
  invited: "Invitada",
  enrolled: "Participando",
  declined: "Rechazada",
  removed: "Eliminada",
  suspended: "Suspendida",
};

const storeStatusClass: Record<StoreCampaignAssignment["status"], string> = {
  visible: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  invited: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  enrolled: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  declined: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  removed: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  suspended: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const { tenantId, tenantType } = useAuth();
  const token = getAccessToken();

  // Get campaigns visible to this store
  const campaignsQuery = useQuery({
    queryKey: ["store-campaigns", tenantId],
    enabled: Boolean(tenantId) && tenantType === "store",
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await api.v1.campaigns.stores({ storeId: tenantId }).campaigns.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  // Get CPGs related to this store
  const cpgsQuery = useQuery({
    queryKey: ["store-cpgs", tenantId],
    enabled: Boolean(tenantId) && tenantType === "store",
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await api.v1.stores({ storeId: tenantId }).cpgs.get({
        headers: { authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
  });

  const enrollMutation = useMutation({
    mutationFn: async ({ campaignId, status }: { campaignId: string; status: string }) => {
      if (!tenantId) throw new Error("no store");
      const { data, error } = await api.v1.campaigns({ campaignId }).stores({ storeId: tenantId }).enroll.post(
        { status },
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-campaigns", tenantId] });
    },
  });

  const campaigns = (campaignsQuery.data?.data ?? []) as Campaign[];
  const cpgs = (cpgsQuery.data?.data ?? []) as Array<{ id: string; name: string }>;
  const cpgMap = new Map(cpgs.map(c => [c.id, c.name]));

  // Determine enrollment status for display
  const getEnrollmentStatus = (campaign: Campaign): StoreCampaignAssignment["status"] => {
    return campaign.storeEnrollmentStatus ?? "visible";
  };

  if (tenantType !== "store") {
    return (
      <div className="p-8 text-center text-zinc-500">
        Esta página es solo para tiendas.
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Campañas</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Consulta las campañas disponibles para tu tienda.
          </p>
        </div>
      </div>

      {/* Related CPGs */}
      {cpgs.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">CPGs relacionados</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {cpgs.map(cpg => (
              <span key={cpg.id} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                {cpg.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {campaignsQuery.isLoading && (
        <div className="py-8 text-center text-zinc-500">Cargando campañas...</div>
      )}

      {!campaignsQuery.isLoading && campaigns.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-zinc-500 dark:text-zinc-400">
            No hay campañas disponibles para tu tienda todavía.
          </p>
          <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">
            Cuando una marca te invite a sus promociones, aparecerán aquí.
          </p>
        </div>
      )}

      {!campaignsQuery.isLoading && campaigns.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
          <header className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Campañas disponibles</h2>
          </header>

          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {campaigns.map(campaign => {
              const enrollmentStatus = getEnrollmentStatus(campaign);
              const canEnroll = campaign.status === "active" && enrollmentStatus !== "enrolled";

              return (
                <li key={campaign.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-zinc-900 dark:text-zinc-100">{campaign.name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass[campaign.status]}`}>
                          {statusLabel[campaign.status]}
                        </span>
                      </div>
                      {campaign.description && (
                        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{campaign.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
                        {campaign.cpgId && (
                          <span>CPG: {cpgMap.get(campaign.cpgId) ?? campaign.cpgId}</span>
                        )}
                        {campaign.startsAt && (
                          <span>Inicio: {new Date(campaign.startsAt).toLocaleDateString("es-MX")}</span>
                        )}
                        {campaign.endsAt && (
                          <span>Fin: {new Date(campaign.endsAt).toLocaleDateString("es-MX")}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${storeStatusClass[enrollmentStatus]}`}>
                        {storeStatusLabel[enrollmentStatus]}
                      </span>
                      {canEnroll && (
                        <button
                          onClick={() => enrollMutation.mutate({ campaignId: campaign.id, status: "enrolled" })}
                          disabled={enrollMutation.isPending}
                          className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                        >
                          {enrollMutation.isPending ? "Enrolando..." : "Participar"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
