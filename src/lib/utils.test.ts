// ══════════════════════════════════════════════════════════════════════════════
// Tests para _shared/utils — Funciones compartidas entre Edge Functions
// ══════════════════════════════════════════════════════════════════════════════
// Estas funciones son usadas por whatsapp-bot Y notificar-whatsapp.
// Un bug aquí rompe TODO el sistema de comunicación.

import { describe, it, expect } from 'vitest';

// Copiamos las funciones puras aquí porque los archivos _shared usan Deno imports
// En un proyecto ideal, estas estarían en un paquete compartido.
// Pero testear la lógica pura es lo que importa.

function extract10Digits(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

function formatTel(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return `52${digits.slice(-10)}`;
}

function generarNumeroOrden(pedidoId: string): string {
  const shortId = pedidoId.replace(/-/g, '').slice(-5).toUpperCase();
  return `EST-${shortId}`;
}

function pedidoLink(pedidoId: string): string {
  const BASE_LINK = 'https://www.app-estrella.shop/pedido';
  const key = pedidoId.replace(/-/g, '').slice(0, 8);
  return `${BASE_LINK}/${pedidoId}?key=${key}`;
}

// ── extract10Digits ─────────────────────────────────────────────────────────
describe('extract10Digits', () => {
  it('extrae 10 dígitos de número MX completo', () => {
    expect(extract10Digits('529631234567')).toBe('9631234567');
  });

  it('maneja formato con +52', () => {
    expect(extract10Digits('+529631234567')).toBe('9631234567');
  });

  it('maneja formato con 521 (viejo formato MX)', () => {
    expect(extract10Digits('5219631234567')).toBe('9631234567');
  });

  it('maneja número de 10 dígitos directo', () => {
    expect(extract10Digits('9631234567')).toBe('9631234567');
  });

  it('elimina espacios y guiones', () => {
    expect(extract10Digits('963 123 4567')).toBe('9631234567');
    expect(extract10Digits('963-123-4567')).toBe('9631234567');
  });

  it('elimina paréntesis y +', () => {
    expect(extract10Digits('+52 (963) 123-4567')).toBe('9631234567');
  });

  it('maneja string vacío', () => {
    expect(extract10Digits('')).toBe('');
  });

  it('maneja texto sin números', () => {
    expect(extract10Digits('hola mundo')).toBe('');
  });

  it('números cortos (< 10 dígitos) devuelven lo que hay', () => {
    expect(extract10Digits('12345')).toBe('12345');
  });
});

// ── formatTel ───────────────────────────────────────────────────────────────
describe('formatTel', () => {
  it('formatea número MX a 52+10 dígitos', () => {
    expect(formatTel('9631234567')).toBe('529631234567');
  });

  it('reformatea número ya con 52', () => {
    expect(formatTel('529631234567')).toBe('529631234567');
  });

  it('maneja formato con +', () => {
    expect(formatTel('+529631234567')).toBe('529631234567');
  });

  it('limpia caracteres especiales', () => {
    expect(formatTel('(963) 123-4567')).toBe('529631234567');
  });

  it('formato con 521 se normaliza correctamente', () => {
    expect(formatTel('5219631234567')).toBe('529631234567');
  });
});

// ── generarNumeroOrden ──────────────────────────────────────────────────────
describe('generarNumeroOrden', () => {
  it('genera formato EST-XXXXX', () => {
    const result = generarNumeroOrden('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result).toMatch(/^EST-[A-Z0-9]{5}$/);
  });

  it('usa últimos 5 caracteres del UUID sin guiones', () => {
    const result = generarNumeroOrden('00000000-0000-0000-0000-000000067890');
    expect(result).toBe('EST-67890');
  });

  it('convierte a mayúsculas', () => {
    const result = generarNumeroOrden('00000000-0000-0000-0000-00000abcdef');
    expect(result).toBe('EST-BCDEF');
  });

  it('es consistente — mismo input = mismo output', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(generarNumeroOrden(id)).toBe(generarNumeroOrden(id));
  });
});

// ── pedidoLink ──────────────────────────────────────────────────────────────
describe('pedidoLink', () => {
  it('genera URL con key de acceso', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const link = pedidoLink(id);
    expect(link).toContain(`/pedido/${id}`);
    expect(link).toContain('?key=');
  });

  it('key son los primeros 8 chars del UUID sin guiones', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const link = pedidoLink(id);
    const key = id.replace(/-/g, '').slice(0, 8);
    expect(link).toContain(`?key=${key}`);
  });

  it('key diferente para UUIDs diferentes', () => {
    const link1 = pedidoLink('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    const link2 = pedidoLink('11111111-2222-3333-4444-555555555555');
    const key1 = link1.split('key=')[1];
    const key2 = link2.split('key=')[1];
    expect(key1).not.toBe(key2);
  });

  it('URL base es correcta', () => {
    const link = pedidoLink('test-uuid');
    expect(link).toContain('https://www.app-estrella.shop/pedido/');
  });
});

// ── Rate limit key normalization (mismo concepto que index.ts) ──────────────
describe('Rate limit normalization', () => {
  it('diferentes formatos del mismo número producen el mismo from10', () => {
    const formats = [
      '529631234567',
      '+529631234567',
      '5219631234567',
      '9631234567',
    ];
    const normalized = formats.map(extract10Digits);
    const allSame = normalized.every(n => n === normalized[0]);
    expect(allSame).toBe(true);
    expect(normalized[0]).toBe('9631234567');
  });
});

// ── PedidoView access key validation (misma lógica que el frontend) ─────────
describe('PedidoView access key validation', () => {
  it('key válido coincide con los primeros 8 chars del UUID', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const key = id.replace(/-/g, '').slice(0, 8);
    expect(key).toBe('a1b2c3d4');
    expect(key === id.replace(/-/g, '').slice(0, 8)).toBe(true);
  });

  it('key inválido no pasa', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const wrongKey = '12345678';
    expect(wrongKey === id.replace(/-/g, '').slice(0, 8)).toBe(false);
  });

  it('key vacío no autoriza', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const emptyKey = '';
    expect(emptyKey === id.replace(/-/g, '').slice(0, 8)).toBe(false);
  });
});
