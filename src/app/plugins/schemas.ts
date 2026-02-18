import { t } from 'elysia';

export const authorizationHeader = t.Object({
  authorization: t.Optional(
    t.String({
      description: 'Bearer <accessToken>',
    }),
  ),
});
