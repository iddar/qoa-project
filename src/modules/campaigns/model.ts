import { t } from "elysia";
import { paginationSchema } from "../common/model";

export const campaignStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("ready_for_review"),
  t.Literal("in_review"),
  t.Literal("rejected"),
  t.Literal("confirmed"),
  t.Literal("active"),
  t.Literal("paused"),
  t.Literal("ended"),
]);

export const campaignEnrollmentModeSchema = t.Union([
  t.Literal("open"),
  t.Literal("opt_in"),
  t.Literal("system_universal"),
]);
export const campaignStoreAccessModeSchema = t.Union([
  t.Literal("all_related_stores"),
  t.Literal("selected_stores"),
]);
export const campaignStoreEnrollmentModeSchema = t.Union([
  t.Literal("store_opt_in"),
  t.Literal("cpg_managed"),
  t.Literal("auto_enroll"),
]);
export const campaignStoreEnrollmentStatusSchema = t.Union([
  t.Literal("visible"),
  t.Literal("invited"),
  t.Literal("enrolled"),
  t.Literal("declined"),
  t.Literal("removed"),
  t.Literal("suspended"),
]);
export const campaignAccumulationModeSchema = t.Union([t.Literal("count"), t.Literal("amount")]);

export const tierWindowUnitSchema = t.Union([
  t.Literal("day"),
  t.Literal("month"),
  t.Literal("year"),
]);
export const tierQualificationModeSchema = t.Union([t.Literal("any"), t.Literal("all")]);
export const tierBenefitTypeSchema = t.Union([
  t.Literal("discount"),
  t.Literal("reward"),
  t.Literal("multiplier"),
  t.Literal("free_product"),
]);

export const tierBenefitSchema = t.Object({
  id: t.String(),
  type: tierBenefitTypeSchema,
  config: t.Optional(t.String()),
});

export const campaignTierSchema = t.Object({
  id: t.String(),
  campaignId: t.String(),
  name: t.String(),
  order: t.Number(),
  thresholdValue: t.Number(),
  windowUnit: tierWindowUnitSchema,
  windowValue: t.Number(),
  minPurchaseCount: t.Optional(t.Number()),
  minPurchaseAmount: t.Optional(t.Number()),
  qualificationMode: tierQualificationModeSchema,
  graceDays: t.Number(),
  createdAt: t.String(),
  updatedAt: t.Optional(t.String()),
  benefits: t.Array(tierBenefitSchema),
});

export const campaignSchema = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.Optional(t.String()),
  key: t.Optional(t.String()),
  cpgId: t.Optional(t.String()),
  status: campaignStatusSchema,
  enrollmentMode: campaignEnrollmentModeSchema,
  storeAccessMode: campaignStoreAccessModeSchema,
  storeEnrollmentMode: campaignStoreEnrollmentModeSchema,
  accumulationMode: campaignAccumulationModeSchema,
  startsAt: t.Optional(t.String()),
  endsAt: t.Optional(t.String()),
  version: t.Number(),
  createdBy: t.Optional(t.String()),
  updatedBy: t.Optional(t.String()),
  createdAt: t.String(),
  updatedAt: t.Optional(t.String()),
  daysRemaining: t.Optional(t.Number()),
  isExpired: t.Optional(t.Boolean()),
  policySummaries: t.Optional(
    t.Array(
      t.Object({
        policyType: t.Union([
          t.Literal("max_accumulations"),
          t.Literal("min_amount"),
          t.Literal("min_quantity"),
          t.Literal("cooldown"),
        ]),
        scopeType: t.Union([t.Literal("campaign"), t.Literal("brand"), t.Literal("product")]),
        period: t.Union([
          t.Literal("transaction"),
          t.Literal("day"),
          t.Literal("week"),
          t.Literal("month"),
          t.Literal("lifetime"),
        ]),
        value: t.Number(),
        label: t.String(),
      }),
    ),
  ),
  tiers: t.Optional(t.Array(campaignTierSchema)),
});

export const campaignAuditLogSchema = t.Object({
  id: t.String(),
  campaignId: t.String(),
  action: t.String(),
  notes: t.Optional(t.String()),
  actorUserId: t.Optional(t.String()),
  metadata: t.Optional(t.String()),
  createdAt: t.String(),
});

export const campaignPolicyTypeSchema = t.Union([
  t.Literal("max_accumulations"),
  t.Literal("min_amount"),
  t.Literal("min_quantity"),
  t.Literal("cooldown"),
]);

export const campaignPolicyScopeTypeSchema = t.Union([
  t.Literal("campaign"),
  t.Literal("brand"),
  t.Literal("product"),
]);

export const campaignPolicyPeriodSchema = t.Union([
  t.Literal("transaction"),
  t.Literal("day"),
  t.Literal("week"),
  t.Literal("month"),
  t.Literal("lifetime"),
]);

export const campaignAccumulationRuleScopeTypeSchema = t.Union([
  t.Literal("campaign"),
  t.Literal("brand"),
  t.Literal("product"),
]);

export const campaignAccumulationRuleSchema = t.Object({
  id: t.String(),
  campaignId: t.String(),
  scopeType: campaignAccumulationRuleScopeTypeSchema,
  scopeId: t.Optional(t.String()),
  multiplier: t.Number(),
  flatBonus: t.Number(),
  priority: t.Number(),
  active: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.Optional(t.String()),
});

export const campaignPolicySchema = t.Object({
  id: t.String(),
  campaignId: t.String(),
  policyType: campaignPolicyTypeSchema,
  scopeType: campaignPolicyScopeTypeSchema,
  scopeId: t.Optional(t.String()),
  period: campaignPolicyPeriodSchema,
  value: t.Number(),
  config: t.Optional(t.String()),
  active: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.Optional(t.String()),
});

export const campaignCreateRequest = t.Object({
  name: t.String({ minLength: 3, maxLength: 160 }),
  description: t.Optional(t.String()),
  key: t.Optional(t.String({ minLength: 3, maxLength: 80 })),
  cpgId: t.Optional(t.String({ format: "uuid" })),
  enrollmentMode: t.Optional(campaignEnrollmentModeSchema),
  storeAccessMode: t.Optional(campaignStoreAccessModeSchema),
  storeEnrollmentMode: t.Optional(campaignStoreEnrollmentModeSchema),
  accumulationMode: t.Optional(campaignAccumulationModeSchema),
  startsAt: t.Optional(t.String()),
  endsAt: t.Optional(t.String()),
});

export const campaignUpdateRequest = t.Object({
  name: t.Optional(t.String({ minLength: 3, maxLength: 160 })),
  description: t.Optional(t.String()),
  enrollmentMode: t.Optional(campaignEnrollmentModeSchema),
  storeAccessMode: t.Optional(campaignStoreAccessModeSchema),
  accumulationMode: t.Optional(campaignAccumulationModeSchema),
  startsAt: t.Optional(t.String()),
  endsAt: t.Optional(t.String()),
  status: t.Optional(campaignStatusSchema),
});

export const campaignListQuery = t.Object({
  status: t.Optional(campaignStatusSchema),
  cpgId: t.Optional(t.String({ format: "uuid" })),
  enrollmentMode: t.Optional(campaignEnrollmentModeSchema),
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
});

export const campaignSubscribeResponse = t.Object({
  data: t.Object({
    campaignId: t.String(),
    status: t.String(),
    subscribedAt: t.String(),
  }),
});

export const campaignSubscriptionSchema = t.Object({
  campaignId: t.String(),
  campaignName: t.String(),
  enrollmentMode: campaignEnrollmentModeSchema,
  status: t.String(),
  subscribedAt: t.Optional(t.String()),
  startsAt: t.Optional(t.String()),
  endsAt: t.Optional(t.String()),
  daysRemaining: t.Optional(t.Number()),
  policySummaries: t.Optional(
    t.Array(
      t.Object({
        policyType: t.Union([
          t.Literal("max_accumulations"),
          t.Literal("min_amount"),
          t.Literal("min_quantity"),
          t.Literal("cooldown"),
        ]),
        scopeType: t.Union([t.Literal("campaign"), t.Literal("brand"), t.Literal("product")]),
        period: t.Union([
          t.Literal("transaction"),
          t.Literal("day"),
          t.Literal("week"),
          t.Literal("month"),
          t.Literal("lifetime"),
        ]),
        value: t.Number(),
        label: t.String(),
      }),
    ),
  ),
});

export const campaignSubscriptionListResponse = t.Object({
  data: t.Array(campaignSubscriptionSchema),
});

export const campaignAuditQuery = t.Object({
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
});

export const campaignReviewRequest = t.Object({
  approved: t.Optional(t.Boolean()),
  notes: t.Optional(t.String()),
});

export const campaignNoteRequest = t.Object({
  notes: t.Optional(t.String()),
  reason: t.Optional(t.String()),
});

export const campaignPolicyCreateRequest = t.Object({
  policyType: campaignPolicyTypeSchema,
  scopeType: campaignPolicyScopeTypeSchema,
  scopeId: t.Optional(t.String({ format: "uuid" })),
  period: campaignPolicyPeriodSchema,
  value: t.Number({ minimum: 1 }),
  config: t.Optional(t.String()),
  active: t.Optional(t.Boolean()),
});

export const campaignPolicyUpdateRequest = t.Object({
  policyType: t.Optional(campaignPolicyTypeSchema),
  scopeType: t.Optional(campaignPolicyScopeTypeSchema),
  scopeId: t.Optional(t.String({ format: "uuid" })),
  period: t.Optional(campaignPolicyPeriodSchema),
  value: t.Optional(t.Number({ minimum: 1 })),
  config: t.Optional(t.String()),
  active: t.Optional(t.Boolean()),
});

export const campaignTierCreateRequest = t.Object({
  name: t.String({ minLength: 2, maxLength: 80 }),
  order: t.Number({ minimum: 1 }),
  thresholdValue: t.Number({ minimum: 1 }),
  windowUnit: t.Optional(tierWindowUnitSchema),
  windowValue: t.Optional(t.Number({ minimum: 1 })),
  minPurchaseCount: t.Optional(t.Number({ minimum: 1 })),
  minPurchaseAmount: t.Optional(t.Number({ minimum: 1 })),
  qualificationMode: t.Optional(tierQualificationModeSchema),
  graceDays: t.Optional(t.Number({ minimum: 0, maximum: 90 })),
  benefits: t.Optional(
    t.Array(
      t.Object({
        type: tierBenefitTypeSchema,
        config: t.Optional(t.String()),
      }),
    ),
  ),
});

export const campaignTierUpdateRequest = t.Object({
  name: t.Optional(t.String({ minLength: 2, maxLength: 80 })),
  order: t.Optional(t.Number({ minimum: 1 })),
  thresholdValue: t.Optional(t.Number({ minimum: 1 })),
  windowUnit: t.Optional(tierWindowUnitSchema),
  windowValue: t.Optional(t.Number({ minimum: 1 })),
  minPurchaseCount: t.Optional(t.Number({ minimum: 1 })),
  minPurchaseAmount: t.Optional(t.Number({ minimum: 1 })),
  qualificationMode: t.Optional(tierQualificationModeSchema),
  graceDays: t.Optional(t.Number({ minimum: 0, maximum: 90 })),
  benefits: t.Optional(
    t.Array(
      t.Object({
        type: tierBenefitTypeSchema,
        config: t.Optional(t.String()),
      }),
    ),
  ),
});

export const campaignAccumulationRuleCreateRequest = t.Object({
  scopeType: campaignAccumulationRuleScopeTypeSchema,
  scopeId: t.Optional(t.String({ format: "uuid" })),
  multiplier: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
  flatBonus: t.Optional(t.Number({ minimum: 0, maximum: 1000000 })),
  priority: t.Optional(t.Number({ minimum: 1, maximum: 1000 })),
  active: t.Optional(t.Boolean()),
});

export const campaignAccumulationRuleUpdateRequest = t.Object({
  scopeType: t.Optional(campaignAccumulationRuleScopeTypeSchema),
  scopeId: t.Optional(t.String({ format: "uuid" })),
  multiplier: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
  flatBonus: t.Optional(t.Number({ minimum: 0, maximum: 1000000 })),
  priority: t.Optional(t.Number({ minimum: 1, maximum: 1000 })),
  active: t.Optional(t.Boolean()),
});

export const campaignResponse = t.Object({
  data: campaignSchema,
});

export const campaignListResponse = t.Object({
  data: t.Array(campaignSchema),
  pagination: paginationSchema,
});

export const campaignAuditListResponse = t.Object({
  data: t.Array(campaignAuditLogSchema),
  pagination: paginationSchema,
});

export const campaignPolicyResponse = t.Object({
  data: campaignPolicySchema,
});

export const campaignPolicyListResponse = t.Object({
  data: t.Array(campaignPolicySchema),
});

export const campaignTierResponse = t.Object({
  data: campaignTierSchema,
});

export const campaignTierListResponse = t.Object({
  data: t.Array(campaignTierSchema),
});

export const campaignAccumulationRuleResponse = t.Object({
  data: campaignAccumulationRuleSchema,
});

export const campaignAccumulationRuleListResponse = t.Object({
  data: t.Array(campaignAccumulationRuleSchema),
});

// Store targeting / enrollment schemas
export const campaignStoreTargetRequest = t.Object({
  storeIds: t.Array(t.String({ format: "uuid" })),
  status: t.Optional(campaignStoreEnrollmentStatusSchema),
  source: t.Optional(t.Union([t.Literal("manual"), t.Literal("zone"), t.Literal("import")])),
});

export const campaignStoreEnrollRequest = t.Object({
  storeId: t.String({ format: "uuid" }),
  status: campaignStoreEnrollmentStatusSchema,
});

export const campaignStoreAssignmentSchema = t.Object({
  storeId: t.String(),
  storeName: t.String(),
  storeCode: t.String(),
  neighborhood: t.Optional(t.String()),
  city: t.Optional(t.String()),
  state: t.Optional(t.String()),
  status: campaignStoreEnrollmentStatusSchema,
  visibilitySource: t.Optional(t.String()),
  enrollmentSource: t.Optional(t.String()),
  enrolledAt: t.Optional(t.String()),
  invitedAt: t.Optional(t.String()),
});

export const campaignStoreListResponse = t.Object({
  data: t.Array(campaignStoreAssignmentSchema),
  pagination: paginationSchema,
});
