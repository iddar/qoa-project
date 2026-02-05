import { t } from 'elysia';

export const loginRequest = t.Object({
  email: t.String({ format: 'email' }),
  password: t.String({ minLength: 8 }),
});

export const signupRequest = t.Object({
  phone: t.String({ minLength: 7 }),
  email: t.Optional(t.String({ format: 'email' })),
  name: t.Optional(t.String()),
  password: t.String({ minLength: 8 }),
  role: t.Optional(t.Union([t.Literal('consumer'), t.Literal('customer')])),
});

export const refreshRequest = t.Object({
  refreshToken: t.String(),
});

export const authUser = t.Object({
  id: t.String(),
  email: t.Optional(t.String()),
  phone: t.Optional(t.String()),
  role: t.Optional(t.String()),
  tenantId: t.Optional(t.String()),
  tenantType: t.Optional(t.Union([t.Literal('cpg'), t.Literal('store')])),
});

export const authResponse = t.Object({
  data: t.Object({
    accessToken: t.String(),
    refreshToken: t.String(),
    expiresIn: t.Number(),
    user: t.Optional(authUser),
  }),
});
