import { buildWhatsappRegistrationUrl } from "./twilio-whatsapp";

type StoreQrInput = {
  id: string;
  code: string;
};

const buildStoreWhatsappRegistrationUrl = (storeCode: string) => {
  try {
    return buildWhatsappRegistrationUrl(storeCode);
  } catch (error) {
    if ((error as Error).message !== "WHATSAPP_REGISTRATION_PHONE_MISSING") {
      throw error;
    }
    return undefined;
  }
};

export const generateStoreQrPayload = (store: StoreQrInput) => ({
  code: store.code,
  registrationUrl: buildStoreWhatsappRegistrationUrl(store.code),
  payload: {
    entityType: "store" as const,
    entityId: store.id,
    code: store.code,
  },
  expiresAt: undefined,
});
