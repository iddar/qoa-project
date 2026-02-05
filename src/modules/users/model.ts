import { t } from 'elysia';

export const userMeResponse = t.Object({
  data: t.Object({
    id: t.String(),
    phone: t.Optional(t.String()),
    email: t.Optional(t.String()),
    name: t.Optional(t.String()),
    role: t.String(),
    status: t.String(),
  }),
});
