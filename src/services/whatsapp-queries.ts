import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  balances,
  campaignBalances,
  campaigns,
  cards,
  stores,
  transactions,
  transactionItems,
  accumulations,
  users,
} from '../db/schema';
import { normalizeWhatsappPhone, buildSignedWhatsappCardQrImageUrl } from './twilio-whatsapp';

export const getUserBalanceSummary = async (phone: string): Promise<string> => {
  const normalizedPhone = normalizeWhatsappPhone(phone);

  const [user] = (await db.select({ id: users.id }).from(users).where(eq(users.phone, normalizedPhone))) as Array<{
    id: string;
  }>;

  if (!user) {
    return 'No encontré una cuenta registrada con este número. Escribe *Quiero registrar mi compra en CODIGO_TIENDA* para registrarte.';
  }

  const [card] = (await db
    .select({ id: cards.id, code: cards.code })
    .from(cards)
    .where(and(eq(cards.userId, user.id), isNull(cards.storeId)))) as Array<{ id: string; code: string }>;

  if (!card) {
    return 'No encontré una tarjeta asociada a tu cuenta. Por favor, contacta a soporte.';
  }

  const [balance] = (await db
    .select({ current: balances.current, lifetime: balances.lifetime })
    .from(balances)
    .where(eq(balances.cardId, card.id))) as Array<{ current: number; lifetime: number }>;

  const campaignBalanceRows = (await db
    .select({
      campaignName: campaigns.name,
      current: campaignBalances.current,
    })
    .from(campaignBalances)
    .innerJoin(campaigns, eq(campaignBalances.campaignId, campaigns.id))
    .where(eq(campaignBalances.cardId, card.id))) as Array<{ campaignName: string; current: number }>;

  const total = balance?.current ?? 0;
  let message = `🏆 *Tienes ${total} puntos* en total.`;

  if (campaignBalanceRows.length > 0) {
    message += '\n\n*Por campaña:*';
    for (const row of campaignBalanceRows) {
      message += `\n• ${row.campaignName}: ${row.current} pts`;
    }
  }

  if (total === 0) {
    message += '\n\n¡Empieza a acumular comprando en tus tiendas favoritas! Muestra tu QR al pagar.';
  }

  return message;
};

export const getUserRecentActivity = async (phone: string, limit = 5): Promise<string> => {
  const normalizedPhone = normalizeWhatsappPhone(phone);

  const [user] = (await db.select({ id: users.id }).from(users).where(eq(users.phone, normalizedPhone))) as Array<{
    id: string;
  }>;

  if (!user) {
    return 'No encontré una cuenta registrada. Escribe *Quiero registrar mi compra en CODIGO_TIENDA*.';
  }

  const activityRows = (await db
    .select({
      storeName: stores.name,
      totalAmount: transactions.totalAmount,
      createdAt: transactions.createdAt,
      points: sql<number>`coalesce(sum(${accumulations.amount}), 0)::int`,
    })
    .from(transactions)
    .innerJoin(stores, eq(transactions.storeId, stores.id))
    .leftJoin(transactionItems, eq(transactionItems.transactionId, transactions.id))
    .leftJoin(accumulations, eq(accumulations.transactionItemId, transactionItems.id))
    .where(eq(transactions.userId, user.id))
    .groupBy(transactions.id, stores.name)
    .orderBy(desc(transactions.createdAt))
    .limit(limit)) as Array<{ storeName: string; totalAmount: number; createdAt: Date; points: number }>;

  if (activityRows.length === 0) {
    return 'Aún no tienes compras registradas. ¡Empieza a acumular puntos mostrando tu QR al pagar en tus tiendas!';
  }

  let message = '📋 *Tus últimas compras:*\n';

  activityRows.forEach((row, i) => {
    const date = row.createdAt.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });
    message += `\n${i + 1}. ${row.storeName} — $${row.totalAmount} — +${row.points} pts (${date})`;
  });

  return message;
};

export const resendUserQr = async (phone: string): Promise<{ message: string; mediaUrl?: string }> => {
  const normalizedPhone = normalizeWhatsappPhone(phone);

  const [user] = (await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.phone, normalizedPhone))) as Array<{ id: string; name: string | null }>;

  if (!user) {
    return { message: 'No encontré una cuenta registrada. Escribe *Quiero registrar mi compra en CODIGO_TIENDA*.' };
  }

  const [card] = (await db
    .select({ id: cards.id, code: cards.code })
    .from(cards)
    .where(and(eq(cards.userId, user.id), isNull(cards.storeId)))) as Array<{ id: string; code: string }>;

  if (!card) {
    return { message: 'No encontré tu tarjeta de lealtad. Por favor, contacta a soporte.' };
  }

  const firstName = user.name?.split(' ')[0] ?? 'ahí';
  return {
    message: `Hola ${firstName}, aquí está tu QR de lealtad. Guárdalo y muéstralo cuando compres.\n\nCódigo: ${card.code}`,
    mediaUrl: buildSignedWhatsappCardQrImageUrl(card.id),
  };
};

export const buildHelpMessage = (userName?: string | null): string => {
  const greeting = userName ? `Hola ${userName.split(' ')[0]}!` : '¡Hola!';
  return `${greeting} Soy tu asistente Qoa. Estas son las opciones disponibles:\n\n🎯 *saldo* — Ver tus puntos actuales\n📋 *actividad* — Ver tus últimas compras\n🎴 *qr* — Reenviar tu tarjeta de lealtad\n❓ *ayuda* — Ver este menú\n\n¿En qué puedo ayudarte?`;
};
