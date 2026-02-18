import { db } from '../db/client';
import { alertNotifications } from '../db/schema';

export type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  alertCode: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata?: string;
};

export const sendEmailMock = async (payload: EmailPayload) => {
  console.log(
    `[mock-email] to=${payload.to} severity=${payload.severity} code=${payload.alertCode} subject=${payload.subject}`,
  );

  await db.insert(alertNotifications).values({
    channel: 'email',
    recipient: payload.to,
    subject: payload.subject,
    body: payload.text,
    alertCode: payload.alertCode,
    severity: payload.severity,
    status: 'mocked',
    metadata: payload.metadata ?? null,
  });

  return {
    status: 'mocked' as const,
    sentAt: new Date().toISOString(),
  };
};
