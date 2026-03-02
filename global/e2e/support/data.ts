export const uniqueSuffix = () => {
  const now = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${now}-${random}`;
};

export const phoneForSuffix = (suffix: string) => {
  const digits = suffix.replace(/[^0-9]/g, "").slice(-10).padStart(10, "0");
  return `+52${digits}`;
};
