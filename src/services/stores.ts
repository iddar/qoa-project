type StoreQrInput = {
  id: string;
  code: string;
};

export const generateStoreQrPayload = (store: StoreQrInput) => ({
  code: store.code,
  payload: {
    entityType: 'store' as const,
    entityId: store.id,
    code: store.code,
  },
  expiresAt: undefined,
});
