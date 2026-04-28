type StoreQrInput = {
  id: string;
  code: string;
};

const buildWhatsappRegistrationUrl = (storeCode: string) => {
  const sender = (process.env.TWILIO_WHATSAPP_FROM ?? '').replace(/^whatsapp:/, '').replace(/[^\d]/g, '');
  if (!sender) {
    return undefined;
  }

  const url = new URL(`https://wa.me/${sender}`);
  url.searchParams.set('text', storeCode);
  return url.toString();
};

export const generateStoreQrPayload = (store: StoreQrInput) => ({
  code: store.code,
  registrationUrl: buildWhatsappRegistrationUrl(store.code),
  payload: {
    entityType: 'store' as const,
    entityId: store.id,
    code: store.code,
  },
  expiresAt: undefined,
});
