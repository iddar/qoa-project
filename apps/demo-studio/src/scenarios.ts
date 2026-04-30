export type ScenarioId = "pos-wallet" | "inventory-intake" | "geo-campaigns";

export type SceneMedia = {
  label?: string;
  screenshot: string;
  video?: string;
  videoLoopSeconds?: number;
  videoPlaybackRate?: number;
  videoStartSeconds?: number;
  phone?: boolean;
};

export type Scenario = {
  id: ScenarioId;
  title: string;
  shortTitle: string;
  subtitle: string;
  durationSeconds: number;
  accent: string;
  narrative: string[];
  captions: string[];
  scenes: Array<{
    id: string;
    title: string;
    caption: string;
    secondary?: SceneMedia;
  } & SceneMedia>;
};

export const scenarios: Scenario[] = [
  {
    id: "pos-wallet",
    title: "Venta asistida por IA + Wallet",
    shortTitle: "POS + Wallet",
    subtitle: "Nota de voz, QR de cliente y acumulación visible en móvil.",
    durationSeconds: 90,
    accent: "#10b981",
    narrative: [
      "El tendero no captura una venta: conversa con el agente.",
      "El cliente muestra su QR, la venta se liga a su tarjeta y los puntos se acumulan automáticamente.",
      "La wallet confirma el movimiento sin esperar conciliaciones manuales.",
    ],
    captions: [
      "La IA convierte voz en carrito.",
      "El QR liga identidad y lealtad.",
      "La wallet refleja la última transacción.",
    ],
    scenes: [
      {
        id: "pos-agent",
        label: "Tienda",
        title: "Pedido y cliente listos",
        caption: "El tendero arma el carrito por voz mientras el cliente abre su wallet.",
        screenshot: "recordings/pos-wallet/01-pos-agent.png",
        video: "recordings/pos-wallet/01-pos-flow.webm",
        videoLoopSeconds: 22,
        videoPlaybackRate: 0.72,
        videoStartSeconds: 0,
        phone: true,
        secondary: {
          label: "Cliente",
          screenshot: "recordings/pos-wallet/00-wallet-card.png",
          video: "recordings/pos-wallet/02-wallet-card.webm",
          videoLoopSeconds: 22,
          videoPlaybackRate: 0.82,
          videoStartSeconds: 0,
          phone: true,
        },
      },
      {
        id: "pos-success",
        label: "Tienda",
        title: "Escaneo sin fricción",
        caption: "El scanner real del POS lee el QR de la wallet y liga la venta.",
        screenshot: "recordings/pos-wallet/02-pos-success.png",
        video: "recordings/pos-wallet/01-pos-flow.webm",
        videoLoopSeconds: 22,
        videoPlaybackRate: 0.72,
        videoStartSeconds: 3,
        phone: true,
        secondary: {
          label: "Cliente",
          screenshot: "recordings/pos-wallet/00-wallet-card.png",
          video: "recordings/pos-wallet/02-wallet-card.webm",
          videoLoopSeconds: 22,
          videoPlaybackRate: 0.82,
          videoStartSeconds: 0,
          phone: true,
        },
      },
      {
        id: "wallet-history",
        label: "Tienda",
        title: "Confirmación en ambos lados",
        caption: "La caja confirma la venta y la wallet muestra la última transacción.",
        screenshot: "recordings/pos-wallet/03-wallet-history.png",
        video: "recordings/pos-wallet/01-pos-flow.webm",
        videoLoopSeconds: 22,
        videoPlaybackRate: 0.72,
        videoStartSeconds: 18,
        phone: true,
        secondary: {
          label: "Cliente",
          screenshot: "recordings/pos-wallet/03-wallet-history.png",
          video: "recordings/pos-wallet/03-wallet-flow.webm",
          videoLoopSeconds: 22,
          videoPlaybackRate: 0.72,
          videoStartSeconds: 0,
          phone: true,
        },
      },
    ],
  },
  {
    id: "inventory-intake",
    title: "Inventario desde foto + corrección por voz",
    shortTitle: "Inventario IA",
    subtitle: "Una foto crea el preview; una nota de voz corrige cantidades antes de aplicar.",
    durationSeconds: 90,
    accent: "#0ea5e9",
    narrative: [
      "El operador sube una foto del ticket del proveedor.",
      "El agente prepara un preview editable y resuelve coincidencias contra el catálogo.",
      "Una corrección por voz actualiza el borrador y la confirmación mueve stock real.",
    ],
    captions: [
      "La foto se convierte en filas verificables.",
      "La voz corrige el borrador sin teclado.",
      "El inventario queda actualizado y auditable.",
    ],
    scenes: [
      {
        id: "inventory-photo",
        title: "Foto interpretada",
        caption: "Preview de entrada desde ticket de proveedor.",
        screenshot: "recordings/inventory-intake/01-inventory-photo.png",
        video: "recordings/inventory-intake/01-inventory-flow.webm",
        videoLoopSeconds: 22,
        videoPlaybackRate: 0.72,
        videoStartSeconds: 0,
      },
      {
        id: "inventory-corrected",
        title: "Corrección aplicada",
        caption: "La nota de voz ajusta cantidades específicas.",
        screenshot: "recordings/inventory-intake/02-inventory-corrected.png",
        video: "recordings/inventory-intake/01-inventory-flow.webm",
        videoLoopSeconds: 22,
        videoPlaybackRate: 0.72,
        videoStartSeconds: 9,
      },
      {
        id: "inventory-stock",
        title: "Stock actualizado",
        caption: "La entrada confirmada aparece en movimientos y stock actual.",
        screenshot: "recordings/inventory-intake/03-inventory-stock.png",
        video: "recordings/inventory-intake/01-inventory-flow.webm",
        videoLoopSeconds: 22,
        videoPlaybackRate: 0.72,
        videoStartSeconds: 18,
      },
    ],
  },
  {
    id: "geo-campaigns",
    title: "Campañas delimitadas por zona",
    shortTitle: "Campañas geo",
    subtitle: "Segmentación de tiendas en mapa, reglas de acumulación y activación comercial.",
    durationSeconds: 94,
    accent: "#f59e0b",
    narrative: [
      "El equipo comercial crea una campaña para una zona específica.",
      "El mapa selecciona tiendas por área y mantiene una lista auditable.",
      "Las reglas permiten probar distintos incentivos por monto, cantidad o frecuencia.",
    ],
    captions: [
      "La campaña nace con objetivo y ventana.",
      "El mapa convierte geografía en cobertura operativa.",
      "Las reglas hacen medible cada incentivo.",
    ],
    scenes: [
      {
        id: "campaign-new",
        title: "Campaña creada",
        caption: "Nombre, vigencia y modo de acumulación.",
        screenshot: "recordings/geo-campaigns/01-campaign-new.png",
        video: "recordings/geo-campaigns/01-campaign-flow.webm",
        videoLoopSeconds: 24,
        videoPlaybackRate: 0.74,
        videoStartSeconds: 0,
      },
      {
        id: "campaign-map",
        title: "Zona seleccionada",
        caption: "Área geográfica que agrega tiendas elegibles.",
        screenshot: "recordings/geo-campaigns/02-campaign-map.png",
        video: "recordings/geo-campaigns/01-campaign-flow.webm",
        videoLoopSeconds: 24,
        videoPlaybackRate: 0.74,
        videoStartSeconds: 10,
      },
      {
        id: "campaign-rules",
        title: "Reglas listas",
        caption: "Políticas, cobertura y seguimiento de performance.",
        screenshot: "recordings/geo-campaigns/03-campaign-rules.png",
        video: "recordings/geo-campaigns/01-campaign-flow.webm",
        videoLoopSeconds: 24,
        videoPlaybackRate: 0.74,
        videoStartSeconds: 22,
      },
    ],
  },
];

export const scenarioIds = scenarios.map((scenario) => scenario.id);

export const getScenario = (id: ScenarioId) => {
  const scenario = scenarios.find((entry) => entry.id === id);
  if (!scenario) {
    throw new Error(`Unknown scenario: ${id}`);
  }
  return scenario;
};
