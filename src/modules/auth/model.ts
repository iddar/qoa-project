import { t } from 'elysia';

export const loginRequest = t.Object({
  email: t.String({ format: 'email' }),
  password: t.String({ minLength: 8 }),
});

export const refreshRequest = t.Object({
  refreshToken: t.String(),
});

export const authUser = t.Object({
  id: t.String(),
  email: t.Optional(t.String()),
  phone: t.Optional(t.String()),
  role: t.Optional(t.String()),
});

export const authResponse = t.Object({
  data: t.Object({
    accessToken: t.String(),
    refreshToken: t.String(),
    expiresIn: t.Number(),
    user: t.Optional(authUser),
  }),
});
