export type ScenarioId = "pos-wallet" | "inventory-intake" | "geo-campaigns";

export type SceneFocusArea = {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
};

export type SceneCursorPoint = {
  x: number;
  y: number;
  label?: string;
};

export type SceneMedia = {
  label?: string;
  narrative?: string;
  screenshot: string;
  video?: string;
  videoLoopSeconds?: number;
  videoPlaybackRate?: number;
  videoPlayForSeconds?: number;
  videoPoster?: string;
  videoPrerollSeconds?: number;
  videoStartSeconds?: number;
  freezeAtSeconds?: number;
  phone?: boolean;
  highlight?: SceneFocusArea;
  cursor?: SceneCursorPoint;
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
    slate?: string;
    beats?: string[];
    secondary?: SceneMedia;
  } & SceneMedia>;
};

export const scenarios: Scenario[] = [
  {
    id: "pos-wallet",
    title: "Venta asistida por IA + Wallet",
    shortTitle: "POS + Wallet",
    subtitle: "Una venta móvil donde tendero y cliente avanzan juntos: voz, QR y puntos visibles al cierre.",
    durationSeconds: 75,
    accent: "#10b981",
    narrative: [
      "El tendero dicta el pedido y la IA lo transforma en un carrito listo para cobrar.",
      "El cliente abre su wallet, muestra su QR y queda identificado sin llenar formularios.",
      "Al confirmar la venta, la wallet refleja puntos, avance de campaña y última transacción.",
    ],
    captions: [
      "Voz a carrito en segundos.",
      "QR para identidad y lealtad.",
      "Puntos e historial al instante.",
    ],
    scenes: [
      {
        id: "pos-agent",
        label: "Tienda",
        narrative: "Tendero: dicta el pedido y valida el total sin teclear.",
        title: "Pedido y cliente listos",
        caption: "El tendero arma el carrito por voz mientras el cliente prepara su wallet.",
        slate: "Orden por voz + wallet lista",
        beats: ["Voz", "Carrito", "QR"],
        screenshot: "recordings/pos-wallet/01-pos-order.png",
        video: "recordings/pos-wallet/01-pos-flow.webm",
        videoLoopSeconds: 11,
        videoPlaybackRate: 0.55,
        videoPlayForSeconds: 7.4,
        videoStartSeconds: 0,
        phone: true,
        highlight: { x: 8, y: 8, width: 84, height: 20, label: "pedido armado" },
        cursor: { x: 80, y: 18, label: "total" },
        secondary: {
          label: "Cliente",
          narrative: "Cliente: abre su wallet y tiene su QR listo para identificarse.",
          screenshot: "recordings/pos-wallet/00-wallet-home.png",
          phone: true,
          highlight: { x: 10, y: 28, width: 80, height: 28, label: "progreso de campaña" },
          cursor: { x: 54, y: 43, label: "progreso de campaña" },
        },
      },
      {
        id: "pos-success",
        label: "Tienda",
        narrative: "Tendero: escanea el QR desde el POS y liga la venta al cliente correcto.",
        title: "Escaneo sin fricción",
        caption: "El scanner del POS lee el QR de la wallet y liga la venta.",
        slate: "Escaneo QR + identidad ligada",
        beats: ["Cámara", "Lectura", "Cliente"],
        screenshot: "recordings/pos-wallet/02-pos-linked.png",
        video: "recordings/pos-wallet/01-pos-flow.webm",
        videoLoopSeconds: 12,
        videoPlaybackRate: 0.64,
        videoPlayForSeconds: 5,
        videoStartSeconds: 4.6,
        phone: true,
        highlight: { x: 10, y: 34, width: 80, height: 34, label: "scanner POS" },
        cursor: { x: 50, y: 50, label: "leer QR" },
        secondary: {
          label: "Cliente",
          narrative: "Cliente: no entrega datos; solo muestra su QR de lealtad.",
          screenshot: "recordings/pos-wallet/00-wallet-card.png",
          video: "recordings/pos-wallet/02-wallet-card.webm",
          videoLoopSeconds: 18,
          videoPlaybackRate: 0.82,
          videoStartSeconds: 2,
          phone: true,
          highlight: { x: 13, y: 34, width: 74, height: 36, label: "identidad" },
          cursor: { x: 51, y: 54, label: "QR activo" },
        },
      },
      {
        id: "wallet-history",
        label: "Tienda",
        narrative: "Tendero: confirma la venta y QOA calcula puntos en el mismo paso.",
        title: "Confirmación en ambos lados",
        caption: "La caja confirma la venta y la wallet muestra la última transacción.",
        slate: "Venta confirmada + puntos visibles",
        beats: ["Cobro", "Puntos", "Historial"],
        screenshot: "recordings/pos-wallet/04-pos-success.png",
        video: "recordings/pos-wallet/01-pos-flow.webm",
        videoLoopSeconds: 11,
        videoPlaybackRate: 0.62,
        videoPlayForSeconds: 4.2,
        videoStartSeconds: 8.1,
        phone: true,
        highlight: { x: 10, y: 52, width: 80, height: 24, label: "venta confirmada" },
        cursor: { x: 70, y: 64, label: "confirmar" },
        secondary: {
          label: "Cliente",
          narrative: "Cliente: ve puntos, avance de campaña y la compra recién registrada.",
          screenshot: "recordings/pos-wallet/03-wallet-history.png",
          video: "recordings/pos-wallet/03-wallet-flow.webm",
          videoLoopSeconds: 18,
          videoPlaybackRate: 0.72,
          videoStartSeconds: 0,
          phone: true,
          highlight: { x: 9, y: 18, width: 82, height: 27, label: "última transacción" },
          cursor: { x: 52, y: 34, label: "última transacción" },
        },
      },
    ],
  },
  {
    id: "inventory-intake",
    title: "Inventario desde foto + corrección por voz",
    shortTitle: "Inventario IA",
    subtitle: "Foto y voz convierten el ticket del proveedor en inventario revisado, corregido y trazable.",
    durationSeconds: 76,
    accent: "#0ea5e9",
    narrative: [
      "El operador captura la evidencia del proveedor desde el flujo natural de inventario.",
      "El asistente propone un borrador editable con productos, cantidades y coincidencias.",
      "La voz corrige detalles puntuales y la confirmación actualiza stock con trazabilidad.",
    ],
    captions: [
      "Foto a borrador verificable.",
      "Voz para corregir sin fricción.",
      "Stock actualizado con evidencia.",
    ],
    scenes: [
      {
        id: "inventory-photo",
        narrative: "El operador captura el ticket del proveedor y el asistente prepara un borrador editable.",
        title: "Ticket interpretado",
        caption: "Borrador de entrada desde evidencia del proveedor.",
        slate: "Foto capturada + vista previa editable",
        beats: ["Foto", "Lectura", "Vista previa"],
        screenshot: "recordings/inventory-intake/01-inventory-photo.png",
        video: "recordings/inventory-intake/01-inventory-flow.webm",
        videoLoopSeconds: 22,
        videoPlaybackRate: 0.72,
        videoPlayForSeconds: 5.8,
        videoStartSeconds: 0,
        highlight: { x: 30, y: 37, width: 44, height: 27, label: "ticket detectado" },
        cursor: { x: 82, y: 49, label: "vista previa" },
      },
      {
        id: "inventory-corrected",
        narrative: "La nota de voz corrige cantidades específicas y el asistente deja claro qué cambió.",
        title: "Corrección revisable",
        caption: "La voz ajusta cantidades antes de aplicar stock.",
        slate: "Corrección por voz + filas ajustadas",
        beats: ["Voz", "Ajuste", "Confirmar"],
        screenshot: "recordings/inventory-intake/02-inventory-corrected.png",
        highlight: { x: 54, y: 22, width: 41, height: 50, label: "cantidades corregidas" },
        cursor: { x: 84, y: 58, label: "corrección por voz" },
      },
      {
        id: "inventory-stock",
        narrative: "Al confirmar, el movimiento queda reflejado en inventario real con evidencia del origen.",
        title: "Stock actualizado",
        caption: "La entrada confirmada aparece en movimientos y stock actual.",
        slate: "Confirmación + inventario actualizado",
        beats: ["Aplicar", "Stock", "Auditoría"],
        screenshot: "recordings/inventory-intake/03-inventory-stock.png",
        video: "recordings/inventory-intake/01-inventory-flow.webm",
        videoLoopSeconds: 22,
        videoPlaybackRate: 0.72,
        videoPlayForSeconds: 2.2,
        videoStartSeconds: 8,
        highlight: { x: 11, y: 18, width: 78, height: 58, label: "stock actualizado" },
        cursor: { x: 71, y: 35, label: "inventario" },
      },
    ],
  },
  {
    id: "geo-campaigns",
    title: "Campañas delimitadas por zona",
    shortTitle: "Campañas geo",
    subtitle: "Del objetivo comercial al mapa de tiendas, reglas de acumulación y medición.",
    durationSeconds: 85,
    accent: "#f59e0b",
    narrative: [
      "Marketing crea una campaña con objetivo, vigencia y mecánica clara.",
      "El mapa convierte territorio en tiendas seleccionadas y auditables.",
      "Las reglas traducen la estrategia en incentivos medibles por el portal.",
    ],
    captions: [
      "Objetivo y vigencia claros.",
      "Territorio convertido en cobertura.",
      "Incentivos listos para medir.",
    ],
    scenes: [
      {
        id: "campaign-new",
        title: "Campaña creada",
        caption: "Objetivo, vigencia y modo de acumulación.",
        slate: "Campaña nueva + objetivo comercial",
        beats: ["Nombre", "Vigencia", "Tipo"],
        screenshot: "recordings/geo-campaigns/01-campaign-new.png",
        video: "recordings/geo-campaigns/01-campaign-flow.webm",
        videoLoopSeconds: 24,
        videoPlaybackRate: 0.74,
        videoPlayForSeconds: 4,
        videoStartSeconds: 0,
        highlight: { x: 58, y: 16, width: 34, height: 64, label: "configuración" },
        cursor: { x: 75, y: 36, label: "tipo" },
      },
      {
        id: "campaign-map",
        title: "Zona seleccionada",
        caption: "Área geográfica que agrega tiendas accionables.",
        slate: "Zona geográfica + cobertura de tiendas",
        beats: ["Mapa", "Polígono", "Cobertura"],
        screenshot: "recordings/geo-campaigns/02-campaign-map.png",
        video: "recordings/geo-campaigns/01-campaign-flow.webm",
        videoLoopSeconds: 24,
        videoPlaybackRate: 0.74,
        videoPlayForSeconds: 3,
        videoStartSeconds: 4.5,
        highlight: { x: 65, y: 3, width: 31, height: 29, label: "zona activa" },
        cursor: { x: 83, y: 17, label: "delimitar" },
      },
      {
        id: "campaign-rules",
        title: "Reglas listas",
        caption: "Reglas, cobertura y medición comercial.",
        slate: "Reglas listas + campaña medible",
        beats: ["Reglas", "Tiendas", "Guardar"],
        screenshot: "recordings/geo-campaigns/03-campaign-rules.png",
        video: "recordings/geo-campaigns/01-campaign-flow.webm",
        videoLoopSeconds: 24,
        videoPlaybackRate: 0.74,
        videoPlayForSeconds: 2.6,
        videoStartSeconds: 7.4,
        highlight: { x: 55, y: 18, width: 38, height: 54, label: "reglas activas" },
        cursor: { x: 82, y: 63, label: "guardar" },
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
