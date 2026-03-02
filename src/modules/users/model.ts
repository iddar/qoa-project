import { t } from 'elysia';

const tenantTypeSchema = t.Union([t.Literal('cpg'), t.Literal('store')]);

export const userMeResponse = t.Object({
  data: t.Object({
    id: t.String(),
    phone: t.Optional(t.String()),
    email: t.Optional(t.String()),
    name: t.Optional(t.String()),
    role: t.String(),
    status: t.String(),
    tenantId: t.Optional(t.String()),
    tenantType: t.Optional(tenantTypeSchema),
    blockedUntil: t.Optional(t.String()),
  }),
});

export const userWalletResponse = t.Object({
  data: t.Object({
    card: t.Object({
      id: t.String(),
      campaignId: t.String(),
      code: t.String(),
      currentTierId: t.Optional(t.String()),
      tierGraceUntil: t.Optional(t.String()),
      tierLastEvaluatedAt: t.Optional(t.String()),
      tierState: t.Union([t.Literal('unqualified'), t.Literal('qualified'), t.Literal('at_risk')]),
      currentTier: t.Optional(
        t.Object({
          id: t.String(),
          name: t.String(),
          order: t.Number(),
          thresholdValue: t.Number(),
          windowUnit: t.Union([t.Literal('day'), t.Literal('month'), t.Literal('year')]),
          windowValue: t.Number(),
          minPurchaseCount: t.Optional(t.Number()),
          minPurchaseAmount: t.Optional(t.Number()),
          qualificationMode: t.Union([t.Literal('any'), t.Literal('all')]),
          graceDays: t.Number(),
          benefits: t.Array(
            t.Object({
              id: t.String(),
              type: t.Union([
                t.Literal('discount'),
                t.Literal('reward'),
                t.Literal('multiplier'),
                t.Literal('free_product'),
              ]),
              config: t.Optional(t.String()),
            }),
          ),
        }),
      ),
      status: t.String(),
      createdAt: t.String(),
    }),
    totals: t.Object({
      current: t.Number(),
      lifetime: t.Number(),
    }),
    campaigns: t.Array(
      t.Object({
        campaignId: t.String(),
        campaignName: t.String(),
        enrollmentMode: t.Union([t.Literal('open'), t.Literal('opt_in'), t.Literal('system_universal')]),
        subscriptionStatus: t.Optional(t.String()),
        current: t.Number(),
        lifetime: t.Number(),
      }),
    ),
  }),
});

export const userMeUpdateRequest = t.Object({
  name: t.Optional(t.String()),
  email: t.Optional(t.String({ format: 'email' })),
});

export const userListQuery = t.Object({
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100 })),
  offset: t.Optional(t.Integer({ minimum: 0 })),
  role: t.Optional(
    t.Union([
      t.Literal('consumer'),
      t.Literal('customer'),
      t.Literal('store_staff'),
      t.Literal('store_admin'),
      t.Literal('cpg_admin'),
      t.Literal('qoa_support'),
      t.Literal('qoa_admin'),
    ]),
  ),
  status: t.Optional(t.Union([t.Literal('active'), t.Literal('suspended')])),
});

export const userListResponse = t.Object({
  data: t.Array(
    t.Object({
      id: t.String(),
      phone: t.Optional(t.String()),
      email: t.Optional(t.String()),
      name: t.Optional(t.String()),
      role: t.String(),
      status: t.String(),
      tenantId: t.Optional(t.String()),
      tenantType: t.Optional(tenantTypeSchema),
      createdAt: t.String(),
    }),
  ),
  meta: t.Object({
    total: t.Integer(),
    limit: t.Integer(),
    offset: t.Integer(),
  }),
});

export const adminCreateUserRequest = t.Object({
  phone: t.String({ minLength: 7 }),
  email: t.Optional(t.String({ format: 'email' })),
  name: t.Optional(t.String()),
  role: t.Union([
    t.Literal('consumer'),
    t.Literal('customer'),
    t.Literal('store_staff'),
    t.Literal('store_admin'),
    t.Literal('cpg_admin'),
    t.Literal('qoa_support'),
    t.Literal('qoa_admin'),
  ]),
  password: t.Optional(t.String({ minLength: 8 })),
  tenantId: t.Optional(t.String({ format: 'uuid' })),
  tenantType: t.Optional(tenantTypeSchema),
});

export const adminCreateUserResponse = t.Object({
  data: t.Object({
    id: t.String(),
    phone: t.Optional(t.String()),
    email: t.Optional(t.String()),
    name: t.Optional(t.String()),
    role: t.String(),
    status: t.String(),
    tenantId: t.Optional(t.String()),
    tenantType: t.Optional(tenantTypeSchema),
    temporaryPassword: t.Optional(t.String()),
  }),
});

export const blockUserRequest = t.Object({
  until: t.Optional(t.String()),
  reason: t.Optional(t.String()),
});

export const blockUserResponse = t.Object({
  data: t.Object({
    id: t.String(),
    status: t.String(),
    blockedUntil: t.Optional(t.String()),
    blockedReason: t.Optional(t.String()),
  }),
});
