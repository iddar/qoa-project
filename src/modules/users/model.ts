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

export const userMeUpdateRequest = t.Object({
  name: t.Optional(t.String()),
  email: t.Optional(t.String({ format: 'email' })),
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
