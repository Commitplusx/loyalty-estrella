// ══════════════════════════════════════════════════════════════════════════════
// constants.ts — Single Source of Truth para reglas de negocio
// ══════════════════════════════════════════════════════════════════════════════
// Si cambias un precio o una meta de puntos, SOLO toca este archivo.
// Frontend y backend comparten las mismas constantes.

// ── Programa de Lealtad ─────────────────────────────────────────────────────

/** Meta de puntos por rango para obtener envío gratis */
export const PUNTOS_META = {
  bronce: 5,
  plata: 4,
  oro: 3,
} as const;

/** Calcula la meta de puntos según el rango del cliente */
export function getMetaPuntos(rango?: string | null, esVip?: boolean): number {
  if (rango === 'oro') return PUNTOS_META.oro;
  if (rango === 'plata' || esVip) return PUNTOS_META.plata;
  return PUNTOS_META.bronce;
}

// ── Precios de envío ────────────────────────────────────────────────────────

/** Precio normal del servicio de envío */
export const PRECIO_ENVIO_NORMAL = 50;

/** Tope máximo que cubre un "envío gratis" (el excedente lo paga el cliente) */
export const MAX_COBERTURA_ENVIO_GRATIS = 45;

/** Valor estimado de un canje para cálculo de ahorro del cliente */
export const VALOR_CANJE_ESTIMADO = PRECIO_ENVIO_NORMAL;

// ── Transiciones de estado del pedido ──────────────────────────────────────

/** Mapa de transiciones válidas: estado_destino → estados_origen permitidos */
export const TRANSICIONES_PEDIDO: Record<string, string[]> = {
  aceptado:  ['asignado'],
  recibido:  ['aceptado', 'asignado', 'pendiente'],
  en_camino: ['recibido'],
  entregado: ['en_camino'],
  cancelado: ['asignado', 'aceptado', 'pendiente', 'recibido', 'en_camino'],
};
