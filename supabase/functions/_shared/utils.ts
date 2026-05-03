// ══════════════════════════════════════════════════════════════════════════════
// _shared/utils.ts — Utilidades compartidas entre Edge Functions
// ══════════════════════════════════════════════════════════════════════════════
// Elimina código duplicado entre whatsapp-bot y notificar-whatsapp.

/** Extrae los últimos 10 dígitos de un teléfono (estándar MX) */
export function extract10Digits(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

/** Formatea un teléfono a formato internacional MX (52 + 10 dígitos) */
export function formatTel(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return `52${digits.slice(-10)}`
}

/** Genera número de orden legible: EST-00123 (últimos 5 chars del UUID) */
export function generarNumeroOrden(pedidoId: string): string {
  const shortId = pedidoId.replace(/-/g, '').slice(-5).toUpperCase()
  return `EST-${shortId}`
}

/** Genera link al pedido con key de acceso (primeros 8 chars del UUID sin guiones) */
export function pedidoLink(pedidoId: string): string {
  const BASE_LINK = 'https://www.app-estrella.shop/pedido'
  const key = pedidoId.replace(/-/g, '').slice(0, 8)
  return `${BASE_LINK}/${pedidoId}?key=${key}`
}
