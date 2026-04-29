export type WhatsappIntent = 'onboarding' | 'balance' | 'activity' | 'qr' | 'help' | 'unknown';

const INTENT_KEYWORDS: Record<WhatsappIntent, string[]> = {
  balance: ['saldo', 'balance', 'puntos', 'cuanto tengo', 'cuántos puntos', 'mis puntos'],
  activity: [
    'actividad',
    'movimientos',
    'compras',
    'historial',
    'transacciones',
    'mis compras',
    'ultimas compras',
    'últimas compras',
  ],
  qr: ['qr', 'tarjeta', 'código', 'codigo', 'mi qr', 'mi tarjeta', 'codigo qr'],
  help: ['ayuda', 'help', 'menu', 'menú', 'hola', 'info', 'comandos', 'opciones'],
  onboarding: ['alta', 'registro', 'registrarme'],
  unknown: [],
};

export const detectIntent = (text: string): WhatsappIntent => {
  const lower = text.toLowerCase().trim();

  // Exact keyword match first
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (intent === 'unknown') continue;
    for (const keyword of keywords) {
      if (lower === keyword.toLowerCase()) {
        return intent as WhatsappIntent;
      }
    }
  }

  // Partial match for compound messages
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (intent === 'unknown') continue;
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return intent as WhatsappIntent;
      }
    }
  }

  return 'unknown';
};
