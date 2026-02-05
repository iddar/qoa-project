import { t } from 'elysia';

export const userMeResponse = t.Object({
  data: t.Object({
    id: t.String(),
    phone: t.Optional(t.String()),
    email: t.Optional(t.String()),
    name: t.Optional(t.String()),
    role: t.String(),
    status: t.String(),
    blockedUntil: t.Optional(t.String()),
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
    t.Literal('qoa_admin'),
  ]),
  password: t.Optional(t.String({ minLength: 8 })),
});

export const adminCreateUserResponse = t.Object({
  data: t.Object({
    id: t.String(),
    phone: t.Optional(t.String()),
    email: t.Optional(t.String()),
    name: t.Optional(t.String()),
    role: t.String(),
    status: t.String(),
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
