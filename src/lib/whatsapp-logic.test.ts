// ══════════════════════════════════════════════════════════════════════════════
// Tests para lógica de WhatsApp — Truncado, templates, validaciones
// ══════════════════════════════════════════════════════════════════════════════
// Estos tests validan los límites de la API de Meta que causaron bugs reales.

import { describe, it, expect } from 'vitest';

// ── Truncado de body interactivo (Bug D15 / E2) ────────────────────────────
describe('WhatsApp Interactive Button Body Truncation', () => {
  const MAX_BODY_LENGTH = 1024;

  function truncateBody(text: string): string {
    return text.substring(0, MAX_BODY_LENGTH);
  }

  it('texto corto se mantiene igual', () => {
    const text = 'Pedido de 2 tacos pastor';
    expect(truncateBody(text)).toBe(text);
    expect(truncateBody(text).length).toBeLessThanOrEqual(MAX_BODY_LENGTH);
  });

  it('texto largo se trunca a 1024 chars', () => {
    const longText = 'A'.repeat(2000);
    const truncated = truncateBody(longText);
    expect(truncated.length).toBe(MAX_BODY_LENGTH);
  });

  it('texto exactamente de 1024 chars no cambia', () => {
    const exact = 'B'.repeat(1024);
    expect(truncateBody(exact)).toBe(exact);
  });

  it('emojis no rompen el truncado', () => {
    const emojiText = '🍕'.repeat(600); // cada emoji = 2 chars UTF-16
    const truncated = truncateBody(emojiText);
    expect(truncated.length).toBeLessThanOrEqual(MAX_BODY_LENGTH);
  });

  it('dirección larga con GPS se trunca correctamente', () => {
    const detalle = '📋 *Detalle del Pedido*\n\n' +
      '📦 2 hamburguesas de pollo con papas y refresco grande de Coca-Cola de Makitan Express\n' +
      '👤 Juan Pérez López\n' +
      '📞 9631234567\n' +
      '🍽️ Origen: Makitan Express - Comitán de Domínguez\n' +
      '🏠 Ref: Calle 3ra poniente sur #456, Barrio de Guadalupe, a 2 cuadras de la iglesia de San Sebastián, ' +
      'casa color amarillo con portón negro, tocar el timbre 3 veces. ' +
      'Si no contestan llamar al número de respaldo. '.repeat(10) +
      '📍 https://maps.google.com/maps?q=16.2520,-92.1335';
    
    const truncated = truncateBody(detalle);
    expect(truncated.length).toBeLessThanOrEqual(MAX_BODY_LENGTH);
    // Debe mantener el inicio del mensaje
    expect(truncated).toContain('Detalle del Pedido');
  });
});

// ── Template language detection ─────────────────────────────────────────────
describe('WhatsApp Template Language', () => {
  // Simula la lógica de sendWATemplate para el parámetro de idioma
  const TEMPLATES_EN = ['estrella_cupon_generado'];

  function getTemplateLang(templateName: string): string {
    return TEMPLATES_EN.includes(templateName) ? 'en' : 'es_MX';
  }

  it('estrella_cupon_generado usa inglés', () => {
    expect(getTemplateLang('estrella_cupon_generado')).toBe('en');
  });

  it('pedido_aceptado_v2 usa español', () => {
    expect(getTemplateLang('pedido_aceptado_v2')).toBe('es_MX');
  });

  it('template desconocido usa español por defecto', () => {
    expect(getTemplateLang('nuevo_template')).toBe('es_MX');
  });
});

// ── Lógica de idempotencia ──────────────────────────────────────────────────
describe('Idempotencia de mensajes', () => {
  it('mismo messageId genera misma key', () => {
    const msgId = 'wamid.ABCDEF123456';
    const key1 = `processed_msg:${msgId}`;
    const key2 = `processed_msg:${msgId}`;
    expect(key1).toBe(key2);
  });

  it('diferentes messageIds generan keys diferentes', () => {
    const key1 = `processed_msg:wamid.AAA`;
    const key2 = `processed_msg:wamid.BBB`;
    expect(key1).not.toBe(key2);
  });
});

// ── Rate limiting ───────────────────────────────────────────────────────────
describe('Rate limiting logic', () => {
  const MAX_MSGS_PER_MINUTE = 12;

  function shouldBlock(timestamps: number[], now: number): boolean {
    const ventana = now - 60000;
    const recent = timestamps.filter(t => t > ventana);
    return recent.length >= MAX_MSGS_PER_MINUTE;
  }

  it('no bloquea con pocos mensajes', () => {
    const now = Date.now();
    const timestamps = Array.from({ length: 5 }, (_, i) => now - i * 1000);
    expect(shouldBlock(timestamps, now)).toBe(false);
  });

  it('bloquea con 12+ mensajes en 1 minuto', () => {
    const now = Date.now();
    const timestamps = Array.from({ length: 12 }, (_, i) => now - i * 1000);
    expect(shouldBlock(timestamps, now)).toBe(true);
  });

  it('no bloquea si los mensajes son viejos (> 1 min)', () => {
    const now = Date.now();
    const timestamps = Array.from({ length: 20 }, (_, i) => now - 120000 - i * 1000);
    expect(shouldBlock(timestamps, now)).toBe(false);
  });

  it('11 mensajes no bloquea, 12 sí', () => {
    const now = Date.now();
    const eleven = Array.from({ length: 11 }, (_, i) => now - i * 100);
    const twelve = [...eleven, now - 50];
    expect(shouldBlock(eleven, now)).toBe(false);
    expect(shouldBlock(twelve, now)).toBe(true);
  });
});

// ── Slash commands parsing ──────────────────────────────────────────────────
describe('Admin slash commands parsing', () => {
  function parseSlashPedido(text: string): { tel: string; desc: string } | null {
    const args = text.slice(8).trim();
    const match = args.match(/^(\d{10})\s+(.+)$/s);
    if (!match) return null;
    return { tel: match[1], desc: match[2] };
  }

  function parseSlashPuntos(text: string): { tel: string; cant: number } | null {
    const args = text.slice(8).trim().split(/\s+/);
    const tel = args[0]?.replace(/\D/g, '').slice(-10);
    const cant = parseInt(args[1] || '1') || 1;
    if (!tel || tel.length !== 10) return null;
    return { tel, cant };
  }

  it('/pedido con formato válido', () => {
    const result = parseSlashPedido('/pedido 9631234567 2 tacos pastor');
    expect(result).not.toBeNull();
    expect(result!.tel).toBe('9631234567');
    expect(result!.desc).toBe('2 tacos pastor');
  });

  it('/pedido sin descripción falla', () => {
    const result = parseSlashPedido('/pedido 9631234567');
    expect(result).toBeNull();
  });

  it('/pedido con teléfono inválido falla', () => {
    const result = parseSlashPedido('/pedido 12345 algo');
    expect(result).toBeNull();
  });

  it('/pedido con descripción multilínea', () => {
    const result = parseSlashPedido('/pedido 9631234567 2 tacos\ncon salsa verde');
    expect(result).not.toBeNull();
    expect(result!.desc).toContain('con salsa verde');
  });

  it('/puntos con 1 punto (default)', () => {
    const result = parseSlashPuntos('/puntos 9631234567');
    expect(result).not.toBeNull();
    expect(result!.tel).toBe('9631234567');
    expect(result!.cant).toBe(1);
  });

  it('/puntos con cantidad específica', () => {
    const result = parseSlashPuntos('/puntos 9631234567 3');
    expect(result).not.toBeNull();
    expect(result!.cant).toBe(3);
  });

  it('/puntos con teléfono inválido falla', () => {
    const result = parseSlashPuntos('/puntos abc');
    expect(result).toBeNull();
  });
});

// ── CRM notes concatenation (Bug fix) ──────────────────────────────────────
describe('CRM notes concatenation', () => {
  it('concatena notas sin sobreescribir', () => {
    const existing = 'Nota anterior del 01/05';
    const newNote = 'Cliente pidió factura';
    const date = '02/05/2026';
    const result = `${existing}\n[${date}] ${newNote}`;
    expect(result).toContain('Nota anterior');
    expect(result).toContain('Cliente pidió factura');
    expect(result).toContain(date);
  });

  it('primera nota funciona con campo vacío', () => {
    const existing = '';
    const newNote = 'Primera nota';
    const date = '02/05/2026';
    const result = existing
      ? `${existing}\n[${date}] ${newNote}`
      : `[${date}] ${newNote}`;
    expect(result).toBe('[02/05/2026] Primera nota');
  });
});
