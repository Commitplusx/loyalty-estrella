// ══════════════════════════════════════════════════════════════════════════════
// Tests para constants.ts — Reglas de negocio (Single Source of Truth)
// ══════════════════════════════════════════════════════════════════════════════
// Estos tests validan que las reglas de puntos, precios y transiciones
// funcionen correctamente. Si alguien cambia un valor sin querer, estos fallan.

import { describe, it, expect } from 'vitest';
import {
  PUNTOS_META,
  getMetaPuntos,
  PRECIO_ENVIO_NORMAL,
  MAX_COBERTURA_ENVIO_GRATIS,
  VALOR_CANJE_ESTIMADO,
  TRANSICIONES_PEDIDO,
} from '@/lib/constants';

// ── getMetaPuntos ───────────────────────────────────────────────────────────
describe('getMetaPuntos', () => {
  it('retorna 5 para bronce (default)', () => {
    expect(getMetaPuntos()).toBe(5);
    expect(getMetaPuntos(null)).toBe(5);
    expect(getMetaPuntos(undefined)).toBe(5);
    expect(getMetaPuntos('bronce')).toBe(5);
  });

  it('retorna 4 para plata', () => {
    expect(getMetaPuntos('plata')).toBe(4);
  });

  it('retorna 3 para oro', () => {
    expect(getMetaPuntos('oro')).toBe(3);
  });

  it('retorna 4 para VIP sin rango específico', () => {
    expect(getMetaPuntos(undefined, true)).toBe(4);
    expect(getMetaPuntos(null, true)).toBe(4);
    expect(getMetaPuntos('bronce', true)).toBe(4);
  });

  it('oro tiene prioridad sobre VIP', () => {
    // Un cliente oro-VIP sigue siendo 3, no 4
    expect(getMetaPuntos('oro', true)).toBe(3);
  });

  it('plata con VIP sigue siendo 4', () => {
    expect(getMetaPuntos('plata', true)).toBe(4);
  });

  it('no acepta rangos inventados — usa default bronce', () => {
    expect(getMetaPuntos('diamante')).toBe(5);
    expect(getMetaPuntos('premium')).toBe(5);
    expect(getMetaPuntos('')).toBe(5);
  });
});

// ── PUNTOS_META (valores constantes) ────────────────────────────────────────
describe('PUNTOS_META', () => {
  it('tiene exactamente 3 rangos', () => {
    expect(Object.keys(PUNTOS_META)).toHaveLength(3);
  });

  it('oro < plata < bronce (mejor rango = menos puntos)', () => {
    expect(PUNTOS_META.oro).toBeLessThan(PUNTOS_META.plata);
    expect(PUNTOS_META.plata).toBeLessThan(PUNTOS_META.bronce);
  });

  it('ningún rango requiere 0 o menos puntos', () => {
    expect(PUNTOS_META.bronce).toBeGreaterThan(0);
    expect(PUNTOS_META.plata).toBeGreaterThan(0);
    expect(PUNTOS_META.oro).toBeGreaterThan(0);
  });
});

// ── Precios ─────────────────────────────────────────────────────────────────
describe('Precios de envío', () => {
  it('precio normal es mayor que 0', () => {
    expect(PRECIO_ENVIO_NORMAL).toBeGreaterThan(0);
  });

  it('cobertura de envío gratis es menor o igual al precio normal', () => {
    expect(MAX_COBERTURA_ENVIO_GRATIS).toBeLessThanOrEqual(PRECIO_ENVIO_NORMAL);
  });

  it('valor del canje es igual al precio normal', () => {
    expect(VALOR_CANJE_ESTIMADO).toBe(PRECIO_ENVIO_NORMAL);
  });
});

// ── Transiciones de estado del pedido ──────────────────────────────────────
describe('TRANSICIONES_PEDIDO', () => {
  it('define transiciones para todos los estados destino principales', () => {
    expect(TRANSICIONES_PEDIDO).toHaveProperty('aceptado');
    expect(TRANSICIONES_PEDIDO).toHaveProperty('recibido');
    expect(TRANSICIONES_PEDIDO).toHaveProperty('en_camino');
    expect(TRANSICIONES_PEDIDO).toHaveProperty('entregado');
    expect(TRANSICIONES_PEDIDO).toHaveProperty('cancelado');
  });

  it('aceptado solo viene de asignado', () => {
    expect(TRANSICIONES_PEDIDO.aceptado).toContain('asignado');
    expect(TRANSICIONES_PEDIDO.aceptado).toHaveLength(1);
  });

  it('recibido puede venir de aceptado, asignado o pendiente', () => {
    expect(TRANSICIONES_PEDIDO.recibido).toContain('aceptado');
    expect(TRANSICIONES_PEDIDO.recibido).toContain('asignado');
    expect(TRANSICIONES_PEDIDO.recibido).toContain('pendiente');
  });

  it('en_camino solo viene de recibido', () => {
    expect(TRANSICIONES_PEDIDO.en_camino).toEqual(['recibido']);
  });

  it('entregado solo viene de en_camino', () => {
    expect(TRANSICIONES_PEDIDO.entregado).toEqual(['en_camino']);
  });

  it('NO se puede saltar de asignado a entregado', () => {
    expect(TRANSICIONES_PEDIDO.entregado).not.toContain('asignado');
    expect(TRANSICIONES_PEDIDO.entregado).not.toContain('pendiente');
  });

  it('NO se puede saltar de asignado a en_camino', () => {
    expect(TRANSICIONES_PEDIDO.en_camino).not.toContain('asignado');
  });

  it('cancelar es posible desde cualquier estado activo', () => {
    expect(TRANSICIONES_PEDIDO.cancelado).toContain('asignado');
    expect(TRANSICIONES_PEDIDO.cancelado).toContain('aceptado');
    expect(TRANSICIONES_PEDIDO.cancelado).toContain('recibido');
    expect(TRANSICIONES_PEDIDO.cancelado).toContain('en_camino');
  });

  it('NO se puede cancelar un pedido ya entregado', () => {
    expect(TRANSICIONES_PEDIDO.cancelado).not.toContain('entregado');
  });

  it('NO se puede cancelar un pedido ya cancelado', () => {
    expect(TRANSICIONES_PEDIDO.cancelado).not.toContain('cancelado');
  });
});

// ── Cálculos de ciclo de puntos ─────────────────────────────────────────────
describe('Lógica de ciclo de puntos', () => {
  it('cliente bronce con 0 puntos necesita 5 envíos', () => {
    const meta = getMetaPuntos('bronce');
    const puntos = 0;
    const restantes = meta - (puntos % meta);
    expect(restantes).toBe(5);
  });

  it('cliente oro con 2 puntos necesita 1 más', () => {
    const meta = getMetaPuntos('oro');
    const puntos = 2;
    const restantes = meta - (puntos % meta);
    expect(restantes).toBe(1);
  });

  it('cliente plata con 4 puntos inicia nuevo ciclo', () => {
    const meta = getMetaPuntos('plata');
    const puntos = 4;
    const enCiclo = puntos % meta;
    expect(enCiclo).toBe(0); // Ciclo completado
  });

  it('cliente bronce con 12 puntos está en medio del tercer ciclo', () => {
    const meta = getMetaPuntos('bronce');
    const puntos = 12;
    const enCiclo = puntos % meta;
    const restantes = meta - enCiclo;
    expect(enCiclo).toBe(2);
    expect(restantes).toBe(3);
  });

  it('progreso del 100% cuando el cliente llena el ciclo', () => {
    const meta = getMetaPuntos('plata');
    const puntos = 4;
    const progreso = Math.min((puntos / meta) * 100, 100);
    expect(progreso).toBe(100);
  });

  it('progreso no excede 100% con puntos extra', () => {
    const meta = getMetaPuntos('oro');
    const puntos = 10;
    const progreso = Math.min((puntos / meta) * 100, 100);
    expect(progreso).toBe(100);
  });
});

// ── Lógica de billetera / cobertura de envío ────────────────────────────────
describe('Lógica de billetera', () => {
  it('envío normal cubre hasta MAX_COBERTURA', () => {
    const costoReal = 50;
    const cobertura = Math.min(costoReal, MAX_COBERTURA_ENVIO_GRATIS);
    expect(cobertura).toBe(45);
  });

  it('envío barato cubre el monto exacto', () => {
    const costoReal = 30;
    const cobertura = Math.min(costoReal, MAX_COBERTURA_ENVIO_GRATIS);
    expect(cobertura).toBe(30);
  });

  it('envío caro genera diferencia a pagar', () => {
    const costoReal = 80;
    const cobertura = Math.min(costoReal, MAX_COBERTURA_ENVIO_GRATIS);
    const diferencia = Math.max(0, costoReal - MAX_COBERTURA_ENVIO_GRATIS);
    expect(cobertura).toBe(45);
    expect(diferencia).toBe(35);
  });

  it('envío exactamente en el tope no genera diferencia', () => {
    const costoReal = MAX_COBERTURA_ENVIO_GRATIS;
    const diferencia = Math.max(0, costoReal - MAX_COBERTURA_ENVIO_GRATIS);
    expect(diferencia).toBe(0);
  });
});
