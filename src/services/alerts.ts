import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { reminderJobs, webhookReceipts, whatsappMessages } from '../db/schema';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export type PlatformAlert = {
  code: string;
  source: 'jobs' | 'whatsapp' | 'transactions';
  severity: AlertSeverity;
  title: string;
  message: string;
  count: number;
  updatedAt: string;
};

const countBy = async (query: Promise<Array<{ count: number }>>) => {
  const rows = await query;
  return rows[0]?.count ?? 0;
};

export const collectPlatformAlerts = async () => {
  const now = new Date();
  const staleQueueThreshold = new Date(now.getTime() - 30 * 60 * 1000);

  const [failedReminders, queuedStaleReminders, whatsappErrors, whatsappReplayed, webhookErrors] = await Promise.all([
    countBy(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(reminderJobs)
        .where(eq(reminderJobs.status, 'failed')) as Promise<Array<{ count: number }>>,
    ),
    countBy(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(reminderJobs)
        .where(and(eq(reminderJobs.status, 'queued'), lt(reminderJobs.scheduledFor, staleQueueThreshold))) as Promise<
        Array<{ count: number }>
      >,
    ),
    countBy(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(whatsappMessages)
        .where(eq(whatsappMessages.status, 'error')) as Promise<Array<{ count: number }>>,
    ),
    countBy(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(whatsappMessages)
        .where(eq(whatsappMessages.status, 'replayed')) as Promise<Array<{ count: number }>>,
    ),
    countBy(
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(webhookReceipts)
        .where(eq(webhookReceipts.status, 'error')) as Promise<Array<{ count: number }>>,
    ),
  ]);

  const alerts: PlatformAlert[] = [];

  if (failedReminders > 0) {
    alerts.push({
      code: 'REMINDER_JOBS_FAILED',
      source: 'jobs',
      severity: failedReminders > 10 ? 'critical' : 'high',
      title: 'Fallos en jobs de reminder',
      message: 'Existen jobs de recordatorio en estado failed y requieren revisión operativa.',
      count: failedReminders,
      updatedAt: now.toISOString(),
    });
  }

  if (queuedStaleReminders > 0) {
    alerts.push({
      code: 'REMINDER_JOBS_STALE',
      source: 'jobs',
      severity: queuedStaleReminders > 20 ? 'high' : 'medium',
      title: 'Cola de reminders atrasada',
      message: 'Hay reminders en queued con más de 30 minutos sin procesarse.',
      count: queuedStaleReminders,
      updatedAt: now.toISOString(),
    });
  }

  if (whatsappErrors > 0) {
    alerts.push({
      code: 'WHATSAPP_INGEST_ERRORS',
      source: 'whatsapp',
      severity: whatsappErrors > 5 ? 'critical' : 'high',
      title: 'Errores de ingestión WhatsApp',
      message: 'Mensajes de webhook de WhatsApp terminaron en estado error.',
      count: whatsappErrors,
      updatedAt: now.toISOString(),
    });
  }

  if (whatsappReplayed > 0) {
    alerts.push({
      code: 'WHATSAPP_REPLAY_SPIKE',
      source: 'whatsapp',
      severity: whatsappReplayed > 25 ? 'high' : 'medium',
      title: 'Reintentos/replays en WhatsApp',
      message: 'Se detectaron webhooks repetidos; revisar estabilidad del proveedor.',
      count: whatsappReplayed,
      updatedAt: now.toISOString(),
    });
  }

  if (webhookErrors > 0) {
    alerts.push({
      code: 'TRANSACTION_WEBHOOK_ERRORS',
      source: 'transactions',
      severity: webhookErrors > 5 ? 'critical' : 'high',
      title: 'Errores en webhooks de transacciones',
      message: 'Eventos de transacciones no pudieron procesarse correctamente.',
      count: webhookErrors,
      updatedAt: now.toISOString(),
    });
  }

  return alerts.sort((left, right) => {
    const rank = { critical: 4, high: 3, medium: 2, low: 1 } as const;
    return rank[right.severity] - rank[left.severity] || right.count - left.count;
  });
};
