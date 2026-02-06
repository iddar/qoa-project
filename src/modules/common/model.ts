import { t } from 'elysia';

export const paginationSchema = t.Object({
  hasMore: t.Boolean(),
  nextCursor: t.Optional(t.String()),
});
