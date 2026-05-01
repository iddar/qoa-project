"use client";

import { type ReactNode, useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { CampaignStoreSelectionMap } from "@/components/campaign-store-selection-map";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/providers/auth-provider";

type CampaignStatus =
    | "draft"
    | "ready_for_review"
    | "in_review"
    | "rejected"
    | "confirmed"
    | "active"
    | "paused"
    | "ended";

type StoreAccessMode = "all_related_stores" | "selected_stores";

type PolicyType = "max_accumulations" | "min_amount" | "min_quantity" | "cooldown";
type ScopeType = "campaign" | "brand" | "product";
type PeriodType = "transaction" | "day" | "week" | "month" | "lifetime";
type AccumulationScopeType = "campaign" | "brand" | "product";
type TierWindowUnit = "day" | "month" | "year";
type TierQualificationMode = "any" | "all";

type TierForm = {
    name: string;
    order: number;
    thresholdValue: number;
    windowUnit: TierWindowUnit;
    windowValue: number;
    minPurchaseCount: number;
    minPurchaseAmount: number;
    qualificationMode: TierQualificationMode;
    graceDays: number;
};

type PolicyForm = {
    policyType: PolicyType;
    scopeType: ScopeType;
    scopeId: string;
    period: PeriodType;
    value: number;
};

type BrandOption = {
    id: string;
    name: string;
};

type ProductOption = {
    id: string;
    name: string;
    sku: string;
};

type CampaignPolicy = {
    id: string;
    policyType: PolicyType;
    scopeType: ScopeType;
    period: PeriodType;
    value: number;
};

type CampaignAccumulationRule = {
    id: string;
    scopeType: AccumulationScopeType;
    scopeId?: string;
    multiplier: number;
    flatBonus: number;
    priority: number;
    active: boolean;
};

type AccumulationRuleForm = {
    scopeType: AccumulationScopeType;
    scopeId: string;
    multiplier: number;
    flatBonus: number;
    priority: number;
};

type CampaignTier = {
    id: string;
    name: string;
    order: number;
    thresholdValue: number;
    windowUnit: TierWindowUnit;
    windowValue: number;
    minPurchaseCount?: number;
    minPurchaseAmount?: number;
    qualificationMode: TierQualificationMode;
    graceDays: number;
};

type AuditItem = {
    id: string;
    action: string;
    notes?: string;
    createdAt: string;
};

type CampaignStoreAssignment = {
    storeId: string;
    storeName: string;
    storeCode: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    status: "visible" | "invited" | "enrolled" | "declined" | "removed" | "suspended";
};

type RelatedStoreOption = {
    storeId: string;
    storeName: string;
    storeCode: string;
    city?: string;
    state?: string;
    latitude?: number;
    longitude?: number;
};

type DailyPoint = {
    date: string | Date | number;
    transactions: number;
    redemptions: number;
};

const toDayLabel = (value: string | Date | number) => {
    if (typeof value === "string") {
        return value.length >= 10 ? value.slice(5, 10) : value;
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "--";
    }

    return parsed.toISOString().slice(5, 10);
};

const emptyPolicyForm: PolicyForm = {
    policyType: "max_accumulations",
    scopeType: "campaign",
    scopeId: "",
    period: "day",
    value: 1,
};

const emptyTierForm: TierForm = {
    name: "",
    order: 1,
    thresholdValue: 1,
    windowUnit: "day",
    windowValue: 90,
    minPurchaseCount: 1,
    minPurchaseAmount: 0,
    qualificationMode: "any",
    graceDays: 7,
};

const emptyAccumulationRuleForm: AccumulationRuleForm = {
    scopeType: "campaign",
    scopeId: "",
    multiplier: 1,
    flatBonus: 0,
    priority: 100,
};

const nextStatusAction: Partial<
    Record<CampaignStatus, { label: string; action: "ready" | "review" | "confirm" | "activate" }>
> = {
    draft: { label: "Enviar a revisión", action: "ready" },
    rejected: { label: "Reenviar a revisión", action: "ready" },
    ready_for_review: { label: "Aprobar revisión", action: "review" },
    in_review: { label: "Confirmar", action: "confirm" },
    confirmed: { label: "Activar", action: "activate" },
};

const campaignStatusLabel: Record<CampaignStatus, string> = {
    draft: "Borrador",
    ready_for_review: "Lista para revisión",
    in_review: "En revisión",
    rejected: "Rechazada",
    confirmed: "Confirmada",
    active: "Activa",
    paused: "Pausada",
    ended: "Finalizada",
};

const periodLabel: Record<PeriodType, string> = {
    transaction: "transacción",
    day: "día",
    week: "semana",
    month: "mes",
    lifetime: "vigencia completa",
};

const scopeTypeLabel: Record<ScopeType, string> = {
    campaign: "campaña",
    brand: "marca",
    product: "producto",
};

const tierWindowLabel: Record<TierWindowUnit, string> = {
    day: "día",
    month: "mes",
    year: "año",
};

const qualificationModeLabel: Record<TierQualificationMode, string> = {
    any: "cualquier requisito",
    all: "todos los requisitos",
};

const formatPolicyLabel = (policy: CampaignPolicy) => {
    const period = periodLabel[policy.period];

    if (policy.policyType === "min_amount") {
        return `Compra mínima de $${policy.value.toLocaleString("es-MX")} por ${period}`;
    }

    if (policy.policyType === "min_quantity") {
        return `Compra mínima de ${policy.value} pieza(s) por ${period}`;
    }

    if (policy.policyType === "max_accumulations") {
        return `Máximo ${policy.value} acumulaciones por ${period}`;
    }

    return `Enfriamiento de ${policy.value} unidades por ${period}`;
};

const enrollmentModeLabel: Record<string, string> = {
    open: "Abierta",
    opt_in: "Por suscripción",
    system_universal: "Universal del sistema",
};

const storeAccessModeLabel: Record<StoreAccessMode, string> = {
    all_related_stores: "Todas las tiendas del CPG",
    selected_stores: "Solo tiendas seleccionadas",
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const toggleValue = (items: string[], value: string) =>
    items.includes(value) ? items.filter((item) => item !== value) : [...items, value];

function Modal({
    title,
    children,
    onClose,
}: {
    title: string;
    children: ReactNode;
    onClose: () => void;
}) {
    return (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 px-4">
            <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between gap-4">
                    <h3 className="min-w-0 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {title}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                        Cerrar
                    </button>
                </div>
                <div className="mt-4">{children}</div>
            </div>
        </div>
    );
}

export default function CampaignDetailPage() {
    const params = useParams<{ campaignId: string }>();
    const campaignId = params.campaignId;
    const { tenantId } = useAuth();
    const token = getAccessToken();
    const queryClient = useQueryClient();

    const [policyForm, setPolicyForm] = useState<PolicyForm>(emptyPolicyForm);
    const [tierForm, setTierForm] = useState<TierForm>(emptyTierForm);
    const [accumulationRuleForm, setAccumulationRuleForm] =
        useState<AccumulationRuleForm>(emptyAccumulationRuleForm);
    const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
    const [isTierModalOpen, setIsTierModalOpen] = useState(false);
    const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
    const [isStoreCoverageModalOpen, setIsStoreCoverageModalOpen] = useState(false);
    const [storeAccessModeDraft, setStoreAccessModeDraft] =
        useState<StoreAccessMode>("selected_stores");
    const [selectedCampaignStoreIds, setSelectedCampaignStoreIds] = useState<string[]>([]);
    const [isStoreCoverageExpanded, setIsStoreCoverageExpanded] = useState(false);
    const [storeSelectionMode, setStoreSelectionMode] = useState<"list" | "map">("list");
    const [storeCoverageSearch, setStoreCoverageSearch] = useState("");
    const deferredStoreCoverageSearch = useDeferredValue(storeCoverageSearch);

    const closePolicyModal = () => {
        setPolicyForm(emptyPolicyForm);
        setIsPolicyModalOpen(false);
    };

    const closeTierModal = () => {
        setTierForm(emptyTierForm);
        setIsTierModalOpen(false);
    };

    const closeRuleModal = () => {
        setAccumulationRuleForm(emptyAccumulationRuleForm);
        setIsRuleModalOpen(false);
    };

    const closeStoreCoverageModal = () => {
        setStoreSelectionMode("list");
        setStoreCoverageSearch("");
        setIsStoreCoverageModalOpen(false);
    };

    const campaignQuery = useQuery({
        queryKey: ["campaign", campaignId],
        queryFn: async () => {
            const { data, error } = await api.v1.campaigns({ campaignId }).get({
                headers: { authorization: `Bearer ${token}` },
            });

            if (error) throw error;
            return data;
        },
    });

    const summaryQuery = useQuery({
        queryKey: ["campaign-summary", campaignId],
        queryFn: async () => {
            const { data, error } = await api.v1.reports.campaigns({ campaignId }).summary.get({
                headers: { authorization: `Bearer ${token}` },
            });

            if (error) throw error;
            return data;
        },
    });

    const policiesQuery = useQuery({
        queryKey: ["campaign-policies", campaignId],
        queryFn: async () => {
            const { data, error } = await api.v1.campaigns({ campaignId }).policies.get({
                headers: { authorization: `Bearer ${token}` },
            });

            if (error) throw error;
            return data;
        },
    });

    const auditQuery = useQuery({
        queryKey: ["campaign-audit", campaignId],
        queryFn: async () => {
            const { data, error } = await api.v1.campaigns({ campaignId })["audit-logs"].get({
                query: {
                    limit: "20",
                },
                headers: { authorization: `Bearer ${token}` },
            });

            if (error) throw error;
            return data;
        },
    });

    const tiersQuery = useQuery({
        queryKey: ["campaign-tiers", campaignId],
        queryFn: async () => {
            const { data, error } = await api.v1.campaigns({ campaignId }).tiers.get({
                headers: { authorization: `Bearer ${token}` },
            });

            if (error) throw error;
            return data;
        },
    });

    const accumulationRulesQuery = useQuery({
        queryKey: ["campaign-accumulation-rules", campaignId],
        queryFn: async () => {
            const { data, error } = await api.v1
                .campaigns({ campaignId })
                ["accumulation-rules"].get({
                    headers: { authorization: `Bearer ${token}` },
                });

            if (error) throw error;
            return data;
        },
    });

    const brandsQuery = useQuery({
        queryKey: ["campaign-policy-brands", tenantId],
        enabled: Boolean(tenantId),
        queryFn: async () => {
            const { data, error } = await api.v1.brands.get({
                query: {
                    cpgId: tenantId ?? undefined,
                    limit: "100",
                },
                headers: { authorization: `Bearer ${token}` },
            });
            if (error) throw error;
            return data;
        },
    });

    const productsQuery = useQuery({
        queryKey: ["campaign-policy-products", tenantId],
        enabled: Boolean(tenantId),
        queryFn: async () => {
            const { data, error } = await api.v1.products.get({
                query: {
                    cpgId: tenantId ?? undefined,
                    limit: "300",
                },
                headers: { authorization: `Bearer ${token}` },
            });
            if (error) throw error;
            return data;
        },
    });

    const rewardsQuery = useQuery({
        queryKey: ["campaign-rewards", campaignId],
        queryFn: async () => {
            const { data, error } = await api.v1.rewards.get({
                query: {
                    campaignId,
                    limit: "200",
                },
                headers: { authorization: `Bearer ${token}` },
            });
            if (error) throw error;
            return data;
        },
    });

    const campaignStoresQuery = useQuery({
        queryKey: ["campaign-stores", campaignId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (api.v1.campaigns({ campaignId }).stores as any).get({
                query: { limit: "500" },
                headers: { authorization: `Bearer ${token}` },
            });

            if (error) throw error;
            return data;
        },
    });

    const relatedStoresQuery = useQuery({
        queryKey: ["related-cpg-stores", tenantId],
        enabled: Boolean(tenantId),
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (api.v1.stores as any)
                .cpgs({ cpgId: tenantId! })
                .stores.get({
                    query: { limit: "500", status: "active" },
                    headers: { authorization: `Bearer ${token}` },
                });

            if (error) throw error;
            return data;
        },
    });

    const transitionMutation = useMutation({
        mutationFn: async (action: "ready" | "review" | "confirm" | "activate") => {
            if (action === "ready") {
                const { data, error } = await api.v1
                    .campaigns({ campaignId })
                    ["ready-for-review"].post(
                        {},
                        { headers: { authorization: `Bearer ${token}` } },
                    );
                if (error) throw error;
                return data;
            }

            if (action === "review") {
                const { data, error } = await api.v1
                    .campaigns({ campaignId })
                    .review.post(
                        { approved: true },
                        { headers: { authorization: `Bearer ${token}` } },
                    );
                if (error) throw error;
                return data;
            }

            if (action === "confirm") {
                const { data, error } = await api.v1
                    .campaigns({ campaignId })
                    .confirm.post({}, { headers: { authorization: `Bearer ${token}` } });
                if (error) throw error;
                return data;
            }

            const { data, error } = await api.v1
                .campaigns({ campaignId })
                .activate.post(undefined, {
                    headers: { authorization: `Bearer ${token}` },
                });
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
            queryClient.invalidateQueries({ queryKey: ["campaign-audit", campaignId] });
            queryClient.invalidateQueries({ queryKey: ["campaigns", tenantId] });
        },
    });

    const createPolicyMutation = useMutation({
        mutationFn: async () => {
            const { data, error } = await api.v1.campaigns({ campaignId }).policies.post(
                {
                    policyType: policyForm.policyType,
                    scopeType: policyForm.scopeType,
                    scopeId: policyForm.scopeType === "campaign" ? undefined : policyForm.scopeId,
                    period: policyForm.period,
                    value: policyForm.value,
                    active: true,
                },
                {
                    headers: { authorization: `Bearer ${token}` },
                },
            );

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            setPolicyForm(emptyPolicyForm);
            setIsPolicyModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["campaign-policies", campaignId] });
            queryClient.invalidateQueries({ queryKey: ["campaign-audit", campaignId] });
        },
    });

    const createTierMutation = useMutation({
        mutationFn: async () => {
            const { data, error } = await api.v1.campaigns({ campaignId }).tiers.post(
                {
                    name: tierForm.name,
                    order: tierForm.order,
                    thresholdValue: tierForm.thresholdValue,
                    windowUnit: tierForm.windowUnit,
                    windowValue: tierForm.windowValue,
                    minPurchaseCount:
                        tierForm.minPurchaseCount > 0 ? tierForm.minPurchaseCount : undefined,
                    minPurchaseAmount:
                        tierForm.minPurchaseAmount > 0 ? tierForm.minPurchaseAmount : undefined,
                    qualificationMode: tierForm.qualificationMode,
                    graceDays: tierForm.graceDays,
                    benefits: [],
                },
                {
                    headers: { authorization: `Bearer ${token}` },
                },
            );

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            setTierForm(emptyTierForm);
            setIsTierModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["campaign-tiers", campaignId] });
            queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
            queryClient.invalidateQueries({ queryKey: ["campaign-audit", campaignId] });
        },
    });

    const createAccumulationRuleMutation = useMutation({
        mutationFn: async () => {
            const payloadScopeId =
                accumulationRuleForm.scopeType === "campaign"
                    ? undefined
                    : accumulationRuleForm.scopeId || undefined;
            const { data, error } = await api.v1
                .campaigns({ campaignId })
                ["accumulation-rules"].post(
                    {
                        scopeType: accumulationRuleForm.scopeType,
                        scopeId: payloadScopeId,
                        multiplier: accumulationRuleForm.multiplier,
                        flatBonus: accumulationRuleForm.flatBonus,
                        priority: accumulationRuleForm.priority,
                        active: true,
                    },
                    {
                        headers: { authorization: `Bearer ${token}` },
                    },
                );

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            setAccumulationRuleForm(emptyAccumulationRuleForm);
            setIsRuleModalOpen(false);
            queryClient.invalidateQueries({
                queryKey: ["campaign-accumulation-rules", campaignId],
            });
            queryClient.invalidateQueries({ queryKey: ["campaign-audit", campaignId] });
        },
    });

    const updateStoreCoverageMutation = useMutation({
        mutationFn: async () => {
            const currentAssignments = (
                (campaignStoresQuery.data?.data ?? []) as CampaignStoreAssignment[]
            ).filter((item) => item.status !== "removed");
            const currentStoreIds = new Set(currentAssignments.map((item) => item.storeId));
            const nextStoreIds = new Set(selectedCampaignStoreIds);

            const { error: updateError } = await api.v1
                .campaigns({ campaignId })
                .patch(
                    { storeAccessMode: storeAccessModeDraft },
                    { headers: { authorization: `Bearer ${token}` } },
                );

            if (updateError) throw updateError;

            if (storeAccessModeDraft === "selected_stores") {
                const toAdd = selectedCampaignStoreIds.filter(
                    (storeId) => !currentStoreIds.has(storeId),
                );
                const toRemove = currentAssignments
                    .map((assignment) => assignment.storeId)
                    .filter((storeId) => !nextStoreIds.has(storeId));

                if (toAdd.length > 0) {
                    const { error } = await (
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        api.v1.campaigns({ campaignId })["stores/target"] as any
                    ).post(
                        {
                            storeIds: toAdd,
                            status: "visible",
                            source: "manual",
                        },
                        {
                            headers: { authorization: `Bearer ${token}` },
                        },
                    );

                    if (error) throw error;
                }

                for (const storeId of toRemove) {
                    const { error } = await (
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        api.v1.campaigns({ campaignId }).stores({ storeId }).enroll as any
                    ).post(
                        {
                            storeId,
                            status: "removed",
                        },
                        {
                            headers: { authorization: `Bearer ${token}` },
                        },
                    );

                    if (error) throw error;
                }
            }
        },
        onSuccess: () => {
            setIsStoreCoverageModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
            queryClient.invalidateQueries({ queryKey: ["campaign-stores", campaignId] });
            queryClient.invalidateQueries({ queryKey: ["campaign-audit", campaignId] });
            queryClient.invalidateQueries({ queryKey: ["campaigns", tenantId] });
        },
    });

    const campaign = campaignQuery.data?.data;
    const currentStatus = campaign?.status as CampaignStatus | undefined;
    const transitionInfo = currentStatus ? nextStatusAction[currentStatus] : undefined;

    const policies = (policiesQuery.data?.data ?? []) as CampaignPolicy[];
    const tiers = (tiersQuery.data?.data ?? []) as CampaignTier[];
    const accumulationRules = (accumulationRulesQuery.data?.data ??
        []) as CampaignAccumulationRule[];
    const auditItems = (auditQuery.data?.data ?? []) as AuditItem[];
    const campaignStoreAssignments = (
        (campaignStoresQuery.data?.data ?? []) as CampaignStoreAssignment[]
    ).filter((item) => item.status !== "removed");
    const targetedStores = campaignStoreAssignments.filter((item) =>
        ["visible", "invited", "enrolled"].includes(item.status),
    );
    const relatedStoreOptions = ((relatedStoresQuery.data?.data ?? []) as RelatedStoreOption[]).map(
        (item) => ({
            storeId: item.storeId,
            storeName: item.storeName,
            storeCode: item.storeCode,
            city: item.city,
            state: item.state,
            latitude: item.latitude,
            longitude: item.longitude,
        }),
    );
    const rewards = (rewardsQuery.data?.data ?? []) as Array<{ status: string; stock?: number }>;
    const activeRewards = rewards.filter((reward) => reward.status === "active").length;
    const rewardEffectiveness =
        activeRewards > 0 ? (summaryQuery.data?.data.kpis.redemptions ?? 0) / activeRewards : 0;

    const scopeOptions = useMemo(() => {
        if (policyForm.scopeType === "brand") {
            const brands = (brandsQuery.data?.data ?? []) as BrandOption[];
            return brands.map((item: BrandOption) => ({ id: item.id, label: item.name }));
        }

        if (policyForm.scopeType === "product") {
            const products = (productsQuery.data?.data ?? []) as ProductOption[];
            return products.map((item: ProductOption) => ({
                id: item.id,
                label: `${item.name} (${item.sku})`,
            }));
        }

        return [];
    }, [brandsQuery.data?.data, policyForm.scopeType, productsQuery.data?.data]);

    const accumulationScopeOptions = useMemo(() => {
        if (accumulationRuleForm.scopeType === "brand") {
            const brands = (brandsQuery.data?.data ?? []) as BrandOption[];
            return brands.map((item: BrandOption) => ({ id: item.id, label: item.name }));
        }

        if (accumulationRuleForm.scopeType === "product") {
            const products = (productsQuery.data?.data ?? []) as ProductOption[];
            return products.map((item: ProductOption) => ({
                id: item.id,
                label: `${item.name} (${item.sku})`,
            }));
        }

        return [];
    }, [accumulationRuleForm.scopeType, brandsQuery.data?.data, productsQuery.data?.data]);

    const campaignStart = campaign?.startsAt ? new Date(campaign.startsAt) : null;
    const campaignEnd = campaign?.endsAt ? new Date(campaign.endsAt) : null;
    const daysRemaining =
        typeof campaign?.daysRemaining === "number" ? campaign.daysRemaining : undefined;
    const dailyPoints = ((summaryQuery.data?.data.daily ?? []) as DailyPoint[]).slice(-12);
    const maxTransactions =
        dailyPoints.reduce((max, point) => Math.max(max, point.transactions), 0) || 1;
    const maxRedemptions =
        dailyPoints.reduce((max, point) => Math.max(max, point.redemptions), 0) || 1;
    const canEditCampaign = campaign?.status === "draft" || campaign?.status === "rejected";
    const normalizedCoverageSearch = normalizeText(deferredStoreCoverageSearch);
    const filteredRelatedStoreOptions = !normalizedCoverageSearch
        ? relatedStoreOptions
        : relatedStoreOptions.filter((store) =>
              [store.storeName, store.storeCode, store.city, store.state]
                  .filter(Boolean)
                  .some((value) => normalizeText(value!).includes(normalizedCoverageSearch)),
          );
    const geoRelatedStoreOptions = relatedStoreOptions.filter(
        (store) => typeof store.latitude === "number" && typeof store.longitude === "number",
    ) as Array<
        RelatedStoreOption & {
            latitude: number;
            longitude: number;
        }
    >;
    const targetedStoreIdSet = new Set(targetedStores.map((store) => store.storeId));
    const targetedGeoStores = geoRelatedStoreOptions.filter((store) =>
        targetedStoreIdSet.has(store.storeId),
    );
    const coverageMapStores =
        campaign?.storeAccessMode === "all_related_stores" ? geoRelatedStoreOptions : targetedGeoStores;
    const coverageStoresWithoutCoordinates =
        campaign?.storeAccessMode === "all_related_stores"
            ? relatedStoreOptions.length - geoRelatedStoreOptions.length
            : targetedStores.length - targetedGeoStores.length;

    const openStoreCoverageModal = () => {
        setStoreAccessModeDraft(
            (campaign?.storeAccessMode as StoreAccessMode | undefined) ?? "selected_stores",
        );
        setSelectedCampaignStoreIds(targetedStores.map((store) => store.storeId));
        setStoreSelectionMode("list");
        setStoreCoverageSearch("");
        setIsStoreCoverageModalOpen(true);
    };

    return (
        <div className="max-w-6xl min-w-0 space-y-6">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <h1 className="break-words text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                        {campaign?.name ?? "Campaña"}
                    </h1>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        Gestiona el ciclo de vida, reglas y resultados de la campaña.
                    </p>
                </div>

                {transitionInfo && (
                    <button
                        type="button"
                        onClick={() => transitionMutation.mutate(transitionInfo.action)}
                        disabled={transitionMutation.isPending}
                        className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                        {transitionMutation.isPending ? "Aplicando..." : transitionInfo.label}
                    </button>
                )}
            </header>

            <section className="grid min-w-0 gap-4 rounded-xl border border-zinc-200 bg-white p-4 md:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                <article className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Inicio</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {campaignStart ? campaignStart.toLocaleDateString("es-MX") : "Sin fecha"}
                    </p>
                </article>
                <article className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Fin</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {campaignEnd ? campaignEnd.toLocaleDateString("es-MX") : "Sin fecha"}
                    </p>
                </article>
                <article className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Estado temporal</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {daysRemaining === undefined
                            ? "Sin límite"
                            : daysRemaining < 0
                              ? `Finalizada hace ${Math.abs(daysRemaining)} día(s)`
                              : `Restan ${daysRemaining} día(s)`}
                    </p>
                </article>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Generales
                </h2>
                <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <article className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">Descripción</p>
                        <p className="mt-1 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {campaign?.description ?? "-"}
                        </p>
                    </article>
                    <article className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">Clave</p>
                        <p className="mt-1 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {campaign?.key ?? "-"}
                        </p>
                    </article>
                    <article className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">Versión</p>
                        <p className="mt-1 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            v{campaign?.version ?? 1}
                        </p>
                    </article>
                    <article className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">
                            Modo de inscripción
                        </p>
                        <p className="mt-1 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {campaign?.enrollmentMode
                                ? (enrollmentModeLabel[campaign.enrollmentMode] ??
                                  campaign.enrollmentMode)
                                : "-"}
                        </p>
                    </article>
                    <article className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">
                            Modo de acumulación
                        </p>
                        <p className="mt-1 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {campaign?.accumulationMode === "amount"
                                ? "Por monto"
                                : campaign?.accumulationMode === "count"
                                  ? "Por cantidad"
                                  : "-"}
                        </p>
                    </article>
                    <article className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">Estado</p>
                        <p className="mt-1 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {currentStatus ? campaignStatusLabel[currentStatus] : "-"}
                        </p>
                    </article>
                </div>
            </section>

            <section className="grid min-w-0 grid-cols-2 gap-4 lg:grid-cols-6">
                <article className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Transacciones</p>
                    <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                        {summaryQuery.data?.data.kpis.transactions ?? 0}
                    </p>
                </article>
                <article className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Ventas</p>
                    <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                        ${(summaryQuery.data?.data.kpis.salesAmount ?? 0).toLocaleString("es-MX")}
                    </p>
                </article>
                <article className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Acumulaciones</p>
                    <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                        {summaryQuery.data?.data.kpis.accumulations ?? 0}
                    </p>
                </article>
                <article className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Canjes</p>
                    <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                        {summaryQuery.data?.data.kpis.redemptions ?? 0}
                    </p>
                </article>
                <article className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Tasa canje</p>
                    <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                        {((summaryQuery.data?.data.kpis.redemptionRate ?? 0) * 100).toFixed(1)}%
                    </p>
                </article>
                <article className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <p className="break-words text-xs text-zinc-500 dark:text-zinc-400">Efectividad de recompensas</p>
                    <p className="mt-1 break-words text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                        {rewardEffectiveness.toFixed(2)}
                    </p>
                    <p className="mt-1 break-words text-[11px] text-zinc-400">canjes por recompensa activa</p>
                </article>
            </section>

            <section className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-4">
                    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
                        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            Tendencia diaria
                        </h2>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            Volumen de transacciones y canjes en los últimos 30 días.
                        </p>

                        <div className="mt-4 grid gap-2">
                            {dailyPoints.map((point: DailyPoint) => {
                                const txHeight = Math.min(
                                    100,
                                    (point.transactions / maxTransactions) * 100,
                                );
                                const redemptionsHeight = Math.min(
                                    100,
                                    (point.redemptions / maxRedemptions) * 100,
                                );
                                return (
                                    <div
                                        key={`${String(point.date)}-${point.transactions}-${point.redemptions}`}
                                        className="grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 text-xs"
                                    >
                                        <span className="text-zinc-400">
                                            {toDayLabel(point.date)}
                                        </span>
                                        <div className="h-2 rounded bg-blue-100 dark:bg-blue-950/40">
                                            <div
                                                className="h-full rounded bg-blue-500"
                                                style={{ width: `${txHeight}%` }}
                                            />
                                        </div>
                                        <div className="h-2 rounded bg-emerald-100 dark:bg-emerald-950/40">
                                            <div
                                                className="h-full rounded bg-emerald-500"
                                                style={{ width: `${redemptionsHeight}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
                        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            Comprobación
                        </h2>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            Transacciones asociadas que no generaron acumulaciones para esta campaña.
                        </p>
                        <p className="mt-3 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                            {summaryQuery.data?.data.transactionsWithoutAccumulations ?? 0}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            transacciones sin puntos
                        </p>
                    </div>
                </div>

                <div className="min-w-0 space-y-4">
                    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="min-w-0 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                Alcance de tiendas
                            </h2>
                            <button
                                type="button"
                                onClick={openStoreCoverageModal}
                                disabled={!canEditCampaign}
                                className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                                {canEditCampaign ? "Modificar" : "Bloqueada"}
                            </button>
                        </div>
                        <div className="mt-3 space-y-3 text-xs">
                            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-zinc-500 dark:text-zinc-400">
                                            Mapa de tiendas participantes
                                        </p>
                                        <p className="mt-1 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                            {coverageMapStores.length > 0
                                                ? `${coverageMapStores.length} tienda(s) con coordenadas visibles`
                                                : "Sin tiendas con coordenadas para mostrar"}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-3">
                                    {coverageMapStores.length > 0 ? (
                                        <CampaignStoreSelectionMap
                                            stores={coverageMapStores}
                                            selectedStoreIds={coverageMapStores.map(
                                                (store) => store.storeId,
                                            )}
                                            onSelectionChange={() => {}}
                                            interactive={false}
                                            autoFitToStores
                                        />
                                    ) : (
                                        <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white px-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                                            No hay tiendas con coordenadas disponibles para pintar el mapa de esta campaña.
                                        </div>
                                    )}
                                </div>
                                {coverageStoresWithoutCoordinates > 0 && (
                                    <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                                        {coverageStoresWithoutCoordinates} tienda(s) activas de este alcance no aparecen en el mapa porque no tienen coordenadas.
                                    </p>
                                )}
                            </div>

                            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                                <p className="text-zinc-500 dark:text-zinc-400">
                                    Modo de cobertura
                                </p>
                                <p className="mt-1 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                    {campaign?.storeAccessMode
                                        ? storeAccessModeLabel[
                                              campaign.storeAccessMode as StoreAccessMode
                                          ]
                                        : "-"}
                                </p>
                            </div>
                            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-zinc-500 dark:text-zinc-400">
                                            Tiendas activas para esta campaña
                                        </p>
                                        <p className="mt-1 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                            {campaign?.storeAccessMode === "all_related_stores"
                                                ? `${relatedStoreOptions.length} tiendas del CPG`
                                                : `${targetedStores.length} tienda(s) seleccionada(s)`}
                                        </p>
                                    </div>
                                    {campaign?.storeAccessMode === "selected_stores" &&
                                        targetedStores.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setIsStoreCoverageExpanded(
                                                        (current) => !current,
                                                    )
                                                }
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                                aria-label={
                                                    isStoreCoverageExpanded
                                                        ? "Ocultar detalle de tiendas"
                                                        : "Mostrar detalle de tiendas"
                                                }
                                            >
                                                <svg
                                                    viewBox="0 0 20 20"
                                                    fill="none"
                                                    className={`h-4 w-4 transition ${isStoreCoverageExpanded ? "rotate-180" : ""}`}
                                                    aria-hidden="true"
                                                >
                                                    <path
                                                        d="M3.75 7.5h12.5M3.75 10h12.5M3.75 12.5h7.5"
                                                        stroke="currentColor"
                                                        strokeWidth="1.6"
                                                        strokeLinecap="round"
                                                    />
                                                </svg>
                                            </button>
                                        )}
                                </div>
                                {campaign?.storeAccessMode === "selected_stores" &&
                                    isStoreCoverageExpanded && (
                                        <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
                                            {targetedStores.length === 0 ? (
                                                <p className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                                                    Sin tiendas seleccionadas.
                                                </p>
                                            ) : (
                                                targetedStores.map((store) => (
                                                    <div
                                                        key={store.storeId}
                                                        className="min-w-0 rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800"
                                                    >
                                                        <p className="break-words font-medium text-zinc-900 dark:text-zinc-100">
                                                            {store.storeName}
                                                        </p>
                                                        <p className="mt-1 break-words text-zinc-500 dark:text-zinc-400">
                                                            {store.storeCode}
                                                            {store.city || store.state
                                                                ? ` · ${[store.city, store.state]
                                                                      .filter(Boolean)
                                                                      .join(", ")}`
                                                                : ""}
                                                        </p>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="min-w-0 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                Políticas activas
                            </h2>
                            <button
                                type="button"
                                onClick={() => setIsPolicyModalOpen(true)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-300 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                aria-label="Agregar política"
                            >
                                +
                            </button>
                        </div>
                        <ul className="mt-3 space-y-2">
                            {policies.length === 0 && (
                                <li className="text-xs text-zinc-500 dark:text-zinc-400">
                                    Sin políticas.
                                </li>
                            )}
                            {policies.map((policy: CampaignPolicy) => (
                                <li
                                    key={policy.id}
                                    className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                                >
                                    <p className="break-words font-medium text-zinc-800 dark:text-zinc-200">
                                        {formatPolicyLabel(policy)}
                                    </p>
                                    <p className="mt-0.5 break-words text-zinc-500 dark:text-zinc-400">
                                        alcance {scopeTypeLabel[policy.scopeType]} · periodo {periodLabel[policy.period]}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="min-w-0 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                Niveles por ventana
                            </h2>
                            <button
                                type="button"
                                onClick={() => setIsTierModalOpen(true)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-300 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                aria-label="Agregar nivel"
                            >
                                +
                            </button>
                        </div>
                        <ul className="mt-3 space-y-2">
                            {tiers.length === 0 && (
                                <li className="text-xs text-zinc-500 dark:text-zinc-400">
                                    Sin niveles configurados.
                                </li>
                            )}
                            {tiers.map((tier: CampaignTier) => (
                                <li
                                    key={tier.id}
                                    className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                                >
                                    <p className="break-words font-medium text-zinc-800 dark:text-zinc-200">
                                        Nivel {tier.order}: {tier.name}
                                    </p>
                                    <p className="mt-0.5 break-words text-zinc-500 dark:text-zinc-400">
                                        ventana {tier.windowValue} {tierWindowLabel[tier.windowUnit]}(s) · modo{" "}
                                        {qualificationModeLabel[tier.qualificationMode]} · gracia {tier.graceDays} día(s)
                                    </p>
                                    <p className="mt-0.5 break-words text-zinc-500 dark:text-zinc-400">
                                        requisitos:{" "}
                                        {tier.minPurchaseCount
                                            ? `${tier.minPurchaseCount} compras`
                                            : "-"}
                                        {tier.minPurchaseCount && tier.minPurchaseAmount
                                            ? " o "
                                            : ""}
                                        {tier.minPurchaseAmount
                                            ? `$${tier.minPurchaseAmount.toLocaleString("es-MX")}`
                                            : ""}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="min-w-0 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                Reglas de acumulación
                            </h2>
                            <button
                                type="button"
                                onClick={() => setIsRuleModalOpen(true)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-300 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                aria-label="Agregar regla"
                            >
                                +
                            </button>
                        </div>
                        <ul className="mt-3 space-y-2">
                            {accumulationRules.length === 0 && (
                                <li className="text-xs text-zinc-500 dark:text-zinc-400">
                                    Sin reglas configuradas (usa regla base de campaña).
                                </li>
                            )}
                            {accumulationRules.map((rule: CampaignAccumulationRule) => (
                                <li
                                    key={rule.id}
                                    className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                                >
                                    <p className="break-words font-medium text-zinc-800 dark:text-zinc-200">
                                        Alcance {scopeTypeLabel[rule.scopeType]} · x{rule.multiplier} +{" "}
                                        {rule.flatBonus} · prioridad {rule.priority}
                                    </p>
                                    <p className="mt-0.5 break-words text-zinc-500 dark:text-zinc-400">
                                        {rule.scopeId ?? "Campaña completa"}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            {isStoreCoverageModalOpen && (
                <Modal title="Configurar alcance de tiendas" onClose={closeStoreCoverageModal}>
                    <form
                        className="space-y-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            updateStoreCoverageMutation.mutate();
                        }}
                    >
                        <div className="space-y-2">
                            <label className="flex min-w-0 items-start gap-3 rounded-lg border border-zinc-200 px-3 py-3 text-sm dark:border-zinc-700">
                                <input
                                    type="radio"
                                    name="store-access-mode"
                                    checked={storeAccessModeDraft === "all_related_stores"}
                                    onChange={() => setStoreAccessModeDraft("all_related_stores")}
                                    className="mt-1"
                                />
                                <div className="min-w-0">
                                    <p className="break-words font-semibold text-zinc-900 dark:text-zinc-100">
                                        Todas las tiendas del CPG
                                    </p>
                                    <p className="mt-1 break-words text-xs text-zinc-500 dark:text-zinc-400">
                                        La campaña estará disponible para toda la red activa de
                                        tiendas relacionadas con tu CPG.
                                    </p>
                                </div>
                            </label>
                            <label className="flex min-w-0 items-start gap-3 rounded-lg border border-zinc-200 px-3 py-3 text-sm dark:border-zinc-700">
                                <input
                                    type="radio"
                                    name="store-access-mode"
                                    checked={storeAccessModeDraft === "selected_stores"}
                                    onChange={() => setStoreAccessModeDraft("selected_stores")}
                                    className="mt-1"
                                />
                                <div className="min-w-0">
                                    <p className="break-words font-semibold text-zinc-900 dark:text-zinc-100">
                                        Solo tiendas seleccionadas
                                    </p>
                                    <p className="mt-1 break-words text-xs text-zinc-500 dark:text-zinc-400">
                                        Elige manualmente las tiendas relacionadas que podrán ver o
                                        enrolarse en la campaña.
                                    </p>
                                </div>
                            </label>
                        </div>

                        {storeAccessModeDraft === "selected_stores" && (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                        Tiendas disponibles
                                    </p>
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <span className="text-xs text-zinc-400">
                                            {selectedCampaignStoreIds.length} seleccionada(s)
                                        </span>
                                        <div className="inline-flex rounded-full border border-zinc-200 p-1 dark:border-zinc-700">
                                            <button
                                                type="button"
                                                onClick={() => setStoreSelectionMode("list")}
                                                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                                    storeSelectionMode === "list"
                                                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                                                        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                                }`}
                                            >
                                                Lista
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setStoreSelectionMode("map")}
                                                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                                    storeSelectionMode === "map"
                                                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                                                        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                                }`}
                                            >
                                                Mapa
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {storeSelectionMode === "list" ? (
                                    <div className="space-y-3">
                                        <input
                                            value={storeCoverageSearch}
                                            onChange={(event) =>
                                                setStoreCoverageSearch(event.target.value)
                                            }
                                            placeholder="Buscar por nombre, código o ciudad"
                                            className="min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 dark:border-zinc-700 dark:bg-zinc-900"
                                        />
                                        <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
                                            {filteredRelatedStoreOptions.map((store) => (
                                                <label
                                                    key={store.storeId}
                                                    className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedCampaignStoreIds.includes(
                                                            store.storeId,
                                                        )}
                                                        onChange={() =>
                                                            setSelectedCampaignStoreIds((current) =>
                                                                toggleValue(
                                                                    current,
                                                                    store.storeId,
                                                                ),
                                                            )
                                                        }
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                                                            {store.storeName}
                                                        </p>
                                                        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                                                            {store.storeCode}
                                                            {store.city || store.state
                                                                ? ` · ${[store.city, store.state]
                                                                      .filter(Boolean)
                                                                      .join(", ")}`
                                                                : ""}
                                                        </p>
                                                    </div>
                                                </label>
                                            ))}
                                            {filteredRelatedStoreOptions.length === 0 && (
                                                <p className="px-2 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                                                    No hay tiendas que coincidan con la búsqueda.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                                            El mapa agrega a la selección las tiendas dentro de un área rectangular, circular o multipuntos. Después puedes ajustar el resultado desde la lista.
                                        </div>
                                        <CampaignStoreSelectionMap
                                            stores={geoRelatedStoreOptions}
                                            selectedStoreIds={selectedCampaignStoreIds}
                                            onSelectionChange={setSelectedCampaignStoreIds}
                                        />
                                        {relatedStoreOptions.length > geoRelatedStoreOptions.length && (
                                            <p className="text-xs text-zinc-400">
                                                {relatedStoreOptions.length - geoRelatedStoreOptions.length} tienda(s)
                                                sin coordenadas no pueden seleccionarse desde el
                                                mapa.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={closeStoreCoverageModal}
                                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={
                                    updateStoreCoverageMutation.isPending ||
                                    (storeAccessModeDraft === "selected_stores" &&
                                        selectedCampaignStoreIds.length === 0)
                                }
                                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                            >
                                {updateStoreCoverageMutation.isPending
                                    ? "Guardando..."
                                    : "Guardar alcance"}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {isPolicyModalOpen && (
                <Modal title="Nueva política" onClose={closePolicyModal}>
                    <form
                        className="space-y-3"
                        onSubmit={(event) => {
                            event.preventDefault();
                            createPolicyMutation.mutate();
                        }}
                    >
                        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Tipo
                                <select
                                    value={policyForm.policyType}
                                    onChange={(event) =>
                                        setPolicyForm((prev) => ({
                                            ...prev,
                                            policyType: event.target.value as PolicyType,
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                >
                                    <option value="max_accumulations">Máximo de acumulaciones</option>
                                    <option value="min_amount">Compra mínima por monto</option>
                                    <option value="min_quantity">Compra mínima por piezas</option>
                                    <option value="cooldown">Tiempo entre acumulaciones</option>
                                </select>
                            </label>

                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Alcance
                                <select
                                    value={policyForm.scopeType}
                                    onChange={(event) =>
                                        setPolicyForm((prev) => ({
                                            ...prev,
                                            scopeType: event.target.value as ScopeType,
                                            scopeId: "",
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                >
                                    <option value="campaign">Campaña</option>
                                    <option value="brand">Marca</option>
                                    <option value="product">Producto</option>
                                </select>
                            </label>
                        </div>

                        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Periodo
                                <select
                                    value={policyForm.period}
                                    onChange={(event) =>
                                        setPolicyForm((prev) => ({
                                            ...prev,
                                            period: event.target.value as PeriodType,
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                >
                                    <option value="transaction">Transacción</option>
                                    <option value="day">Día</option>
                                    <option value="week">Semana</option>
                                    <option value="month">Mes</option>
                                    <option value="lifetime">Vigencia completa</option>
                                </select>
                            </label>

                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Valor
                                <input
                                    type="number"
                                    min={1}
                                    value={policyForm.value}
                                    onChange={(event) =>
                                        setPolicyForm((prev) => ({
                                            ...prev,
                                            value: Number(event.target.value),
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                />
                            </label>
                        </div>

                        {policyForm.scopeType !== "campaign" && (
                            <label className="block min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                {policyForm.scopeType === "brand" ? "Marca" : "Producto"}
                                <select
                                    required
                                    value={policyForm.scopeId}
                                    onChange={(event) =>
                                        setPolicyForm((prev) => ({
                                            ...prev,
                                            scopeId: event.target.value,
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                >
                                    <option value="">Selecciona</option>
                                    {scopeOptions.map((option: { id: string; label: string }) => (
                                        <option key={option.id} value={option.id}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={closePolicyModal}
                                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={createPolicyMutation.isPending}
                                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                            >
                                {createPolicyMutation.isPending
                                    ? "Guardando..."
                                    : "Agregar política"}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {isTierModalOpen && (
                <Modal title="Nuevo nivel" onClose={closeTierModal}>
                    <form
                        className="space-y-3"
                        onSubmit={(event) => {
                            event.preventDefault();
                            createTierMutation.mutate();
                        }}
                    >
                        <label className="block min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            Nombre
                            <input
                                required
                                value={tierForm.name}
                                onChange={(event) =>
                                    setTierForm((prev) => ({ ...prev, name: event.target.value }))
                                }
                                className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                            />
                        </label>

                        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Orden
                                <input
                                    type="number"
                                    min={1}
                                    value={tierForm.order}
                                    onChange={(event) =>
                                        setTierForm((prev) => ({
                                            ...prev,
                                            order: Number(event.target.value),
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                />
                            </label>
                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Umbral
                                <input
                                    type="number"
                                    min={1}
                                    value={tierForm.thresholdValue}
                                    onChange={(event) =>
                                        setTierForm((prev) => ({
                                            ...prev,
                                            thresholdValue: Number(event.target.value),
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                />
                            </label>
                        </div>

                        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Ventana
                                <select
                                    value={tierForm.windowUnit}
                                    onChange={(event) =>
                                        setTierForm((prev) => ({
                                            ...prev,
                                            windowUnit: event.target.value as TierWindowUnit,
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                >
                                    <option value="day">Día</option>
                                    <option value="month">Mes</option>
                                    <option value="year">Año</option>
                                </select>
                            </label>
                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Valor ventana
                                <input
                                    type="number"
                                    min={1}
                                    value={tierForm.windowValue}
                                    onChange={(event) =>
                                        setTierForm((prev) => ({
                                            ...prev,
                                            windowValue: Number(event.target.value),
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                />
                            </label>
                        </div>

                        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Compras mínimas
                                <input
                                    type="number"
                                    min={0}
                                    value={tierForm.minPurchaseCount}
                                    onChange={(event) =>
                                        setTierForm((prev) => ({
                                            ...prev,
                                            minPurchaseCount: Number(event.target.value),
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                />
                            </label>
                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Monto mínimo
                                <input
                                    type="number"
                                    min={0}
                                    value={tierForm.minPurchaseAmount}
                                    onChange={(event) =>
                                        setTierForm((prev) => ({
                                            ...prev,
                                            minPurchaseAmount: Number(event.target.value),
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                />
                            </label>
                        </div>

                        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Modo
                                <select
                                    value={tierForm.qualificationMode}
                                    onChange={(event) =>
                                        setTierForm((prev) => ({
                                            ...prev,
                                            qualificationMode: event.target
                                                .value as TierQualificationMode,
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                >
                                    <option value="any">Cualquier requisito</option>
                                    <option value="all">Todos los requisitos</option>
                                </select>
                            </label>
                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Días de gracia
                                <input
                                    type="number"
                                    min={0}
                                    max={90}
                                    value={tierForm.graceDays}
                                    onChange={(event) =>
                                        setTierForm((prev) => ({
                                            ...prev,
                                            graceDays: Number(event.target.value),
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                />
                            </label>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={closeTierModal}
                                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={createTierMutation.isPending}
                                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                            >
                                {createTierMutation.isPending ? "Guardando..." : "Agregar nivel"}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {isRuleModalOpen && (
                <Modal title="Nueva regla de acumulación" onClose={closeRuleModal}>
                    <form
                        className="space-y-3"
                        onSubmit={(event) => {
                            event.preventDefault();
                            createAccumulationRuleMutation.mutate();
                        }}
                    >
                        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Alcance
                                <select
                                    value={accumulationRuleForm.scopeType}
                                    onChange={(event) =>
                                        setAccumulationRuleForm((prev) => ({
                                            ...prev,
                                            scopeType: event.target.value as AccumulationScopeType,
                                            scopeId: "",
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                >
                                    <option value="campaign">Campaña</option>
                                    <option value="brand">Marca</option>
                                    <option value="product">Producto</option>
                                </select>
                            </label>
                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Prioridad
                                <input
                                    type="number"
                                    min={1}
                                    max={1000}
                                    value={accumulationRuleForm.priority}
                                    onChange={(event) =>
                                        setAccumulationRuleForm((prev) => ({
                                            ...prev,
                                            priority: Number(event.target.value),
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                />
                            </label>
                        </div>

                        {accumulationRuleForm.scopeType !== "campaign" && (
                            <label className="block min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                {accumulationRuleForm.scopeType === "brand" ? "Marca" : "Producto"}
                                <select
                                    required
                                    value={accumulationRuleForm.scopeId}
                                    onChange={(event) =>
                                        setAccumulationRuleForm((prev) => ({
                                            ...prev,
                                            scopeId: event.target.value,
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                >
                                    <option value="">Selecciona</option>
                                    {accumulationScopeOptions.map(
                                        (option: { id: string; label: string }) => (
                                            <option key={option.id} value={option.id}>
                                                {option.label}
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>
                        )}

                        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Multiplicador
                                <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={accumulationRuleForm.multiplier}
                                    onChange={(event) =>
                                        setAccumulationRuleForm((prev) => ({
                                            ...prev,
                                            multiplier: Number(event.target.value),
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                />
                            </label>
                            <label className="min-w-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Bono fijo
                                <input
                                    type="number"
                                    min={0}
                                    value={accumulationRuleForm.flatBonus}
                                    onChange={(event) =>
                                        setAccumulationRuleForm((prev) => ({
                                            ...prev,
                                            flatBonus: Number(event.target.value),
                                        }))
                                    }
                                    className="mt-1 min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                />
                            </label>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={closeRuleModal}
                                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={createAccumulationRuleMutation.isPending}
                                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                            >
                                {createAccumulationRuleMutation.isPending
                                    ? "Guardando..."
                                    : "Agregar regla"}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Auditoría
                </h2>
                <ul className="mt-3 space-y-2">
                    {auditItems.length === 0 && (
                        <li className="text-xs text-zinc-500 dark:text-zinc-400">Sin eventos.</li>
                    )}
                    {auditItems.map((entry: AuditItem) => (
                        <li
                            key={entry.id}
                            className="min-w-0 rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800"
                        >
                            <p className="break-words font-medium text-zinc-700 dark:text-zinc-200">
                                {entry.action}
                            </p>
                            <p className="mt-0.5 break-words text-zinc-500 dark:text-zinc-400">
                                {new Date(entry.createdAt).toLocaleString("es-MX")}
                                {entry.notes ? ` · ${entry.notes}` : ""}
                            </p>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
