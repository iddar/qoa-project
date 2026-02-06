const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const parseLimit = (limit?: string) => {
  const parsed = Number(limit ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
};

export const parseCursor = (cursor?: string) => {
  if (!cursor) {
    return null;
  }
  const parsed = new Date(cursor);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};
