export const generateCode = (prefix: string, length: number): string =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, length)}`;
