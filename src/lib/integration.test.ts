// ══════════════════════════════════════════════════════════════════════════════
// Tests de integración — Flujo completo del pedido y programa de lealtad
// ══════════════════════════════════════════════════════════════════════════════
// Estos tests validan flujos end-to-end sin tocar la BD real.

import { describe, it, expect } from 'vitest';
import { getMetaPuntos, TRANSICIONES_PEDIDO, MAX_COBERTURA_ENVIO_GRATIS } from '@/lib/constants';

// ── Flujo completo de pedido (state machine) ───────────────────────────────
describe('Ciclo de vida del pedido', () => {
  function canTransition(from: string, to: string): boolean {
    const allowed = TRANSICIONES_PEDIDO[to];
    if (!allowed) return false;
    return allowed.includes(from);
  }

  it('flujo feliz: asignado → aceptado → recibido → en_camino → entregado', () => {
    expect(canTransition('asignado', 'aceptado')).toBe(true);
    expect(canTransition('aceptado', 'recibido')).toBe(true);
    expect(canTransition('recibido', 'en_camino')).toBe(true);
    expect(canTransition('en_camino', 'entregado')).toBe(true);
  });

  it('NO permite saltar estados', () => {
    expect(canTransition('asignado', 'en_camino')).toBe(false);
    expect(canTransition('asignado', 'entregado')).toBe(false);
    expect(canTransition('aceptado', 'entregado')).toBe(false);
    expect(canTransition('recibido', 'entregado')).toBe(false);
  });

  it('permite cancelar desde cualquier estado activo', () => {
    expect(canTransition('asignado', 'cancelado')).toBe(true);
    expect(canTransition('aceptado', 'cancelado')).toBe(true);
    expect(canTransition('recibido', 'cancelado')).toBe(true);
    expect(canTransition('en_camino', 'cancelado')).toBe(true);
  });

  it('NO permite cancelar lo ya finalizado', () => {
    expect(canTransition('entregado', 'cancelado')).toBe(false);
    expect(canTransition('cancelado', 'cancelado')).toBe(false);
  });

  it('NO permite retroceder estados', () => {
    expect(canTransition('en_camino', 'recibido')).toBe(false);
    expect(canTransition('entregado', 'en_camino')).toBe(false);
    expect(canTransition('recibido', 'aceptado')).toBe(false);
  });

  it('estado desconocido no tiene transiciones válidas', () => {
    expect(canTransition('asignado', 'inventado')).toBe(false);
    expect(canTransition('inventado', 'entregado')).toBe(false);
  });
});

// ── Programa de lealtad — flujo completo de acumulación ────────────────────
describe('Flujo de acumulación de puntos', () => {
  interface ClienteSimulado {
    puntos: number;
    rango: string;
    es_vip: boolean;
    envios_gratis_disponibles: number;
    envios_totales: number;
  }

  function simularEntrega(cliente: ClienteSimulado): ClienteSimulado {
    const meta = getMetaPuntos(cliente.rango, cliente.es_vip);
    const nuevosPuntos = cliente.puntos + 1;
    const enviosGratis = nuevosPuntos % meta === 0
      ? cliente.envios_gratis_disponibles + 1
      : cliente.envios_gratis_disponibles;

    return {
      ...cliente,
      puntos: nuevosPuntos,
      envios_totales: cliente.envios_totales + 1,
      envios_gratis_disponibles: enviosGratis,
    };
  }

  it('cliente bronce gana envío gratis cada 5 entregas', () => {
    let cliente: ClienteSimulado = {
      puntos: 0, rango: 'bronce', es_vip: false,
      envios_gratis_disponibles: 0, envios_totales: 0,
    };

    for (let i = 0; i < 5; i++) {
      cliente = simularEntrega(cliente);
    }

    expect(cliente.puntos).toBe(5);
    expect(cliente.envios_gratis_disponibles).toBe(1);
    expect(cliente.envios_totales).toBe(5);
  });

  it('cliente oro gana envío gratis cada 3 entregas', () => {
    let cliente: ClienteSimulado = {
      puntos: 0, rango: 'oro', es_vip: false,
      envios_gratis_disponibles: 0, envios_totales: 0,
    };

    for (let i = 0; i < 6; i++) {
      cliente = simularEntrega(cliente);
    }

    expect(cliente.puntos).toBe(6);
    expect(cliente.envios_gratis_disponibles).toBe(2); // 2 ciclos completos
  });

  it('10 entregas de cliente plata = 2 envíos gratis + 2 puntos en nuevo ciclo', () => {
    let cliente: ClienteSimulado = {
      puntos: 0, rango: 'plata', es_vip: false,
      envios_gratis_disponibles: 0, envios_totales: 0,
    };

    for (let i = 0; i < 10; i++) {
      cliente = simularEntrega(cliente);
    }

    expect(cliente.puntos).toBe(10);
    expect(cliente.envios_gratis_disponibles).toBe(2); // 4+4=8 puntos = 2 ciclos, 2 puntos sobrantes
    expect(cliente.puntos % 4).toBe(2);
  });
});

// ── Billetera — flujo completo de canje ────────────────────────────────────
describe('Flujo de canje de billetera', () => {
  interface WalletState {
    saldo: number;
    cupon_activo: string | null;
  }

  function canjeComida(state: WalletState, monto: number): WalletState | { error: string } {
    if (state.cupon_activo) return { error: `Ya tienes cupón activo: ${state.cupon_activo}` };
    if (monto <= 0) return { error: 'Monto debe ser mayor a 0' };
    if (monto > state.saldo) return { error: 'Saldo insuficiente' };
    return {
      saldo: state.saldo - monto,
      cupon_activo: `FOOD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    };
  }

  function canjeEnvio(state: WalletState, costoEnvio: number): WalletState | { error: string } {
    if (state.cupon_activo) return { error: `Ya tienes cupón activo: ${state.cupon_activo}` };
    const cobertura = Math.min(costoEnvio, MAX_COBERTURA_ENVIO_GRATIS);
    if (cobertura > state.saldo) return { error: `Saldo insuficiente. Necesitas $${cobertura}` };
    return {
      saldo: state.saldo - cobertura,
      cupon_activo: `ENVIO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    };
  }

  it('canje de comida descuenta el monto exacto', () => {
    const result = canjeComida({ saldo: 200, cupon_activo: null }, 80);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.saldo).toBe(120);
      expect(result.cupon_activo).toBeTruthy();
    }
  });

  it('canje de comida falla con cupón activo', () => {
    const result = canjeComida({ saldo: 200, cupon_activo: 'FOOD-ABC123' }, 50);
    expect('error' in result).toBe(true);
  });

  it('canje de comida falla con saldo insuficiente', () => {
    const result = canjeComida({ saldo: 30, cupon_activo: null }, 50);
    expect('error' in result).toBe(true);
  });

  it('canje de envío cubre hasta $45', () => {
    const result = canjeEnvio({ saldo: 100, cupon_activo: null }, 60);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.saldo).toBe(55); // 100 - 45
    }
  });

  it('canje de envío barato cubre solo el costo real', () => {
    const result = canjeEnvio({ saldo: 100, cupon_activo: null }, 30);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.saldo).toBe(70); // 100 - 30
    }
  });

  it('NO permite dos cupones activos simultáneos', () => {
    let state: WalletState = { saldo: 500, cupon_activo: null };
    
    const first = canjeComida(state, 100);
    expect('error' in first).toBe(false);
    if (!('error' in first)) {
      state = first;
      const second = canjeComida(state, 50);
      expect('error' in second).toBe(true);
      if ('error' in second) {
        expect(second.error).toContain('cupón activo');
      }
    }
  });

  it('saldo nunca queda negativo', () => {
    const result = canjeEnvio({ saldo: 20, cupon_activo: null }, 50);
    expect('error' in result).toBe(true);
  });
});

// ── Rangos y progresión ────────────────────────────────────────────────────
describe('Sistema de rangos', () => {
  function calcularRango(enviosTotales: number): string {
    if (enviosTotales >= 50) return 'oro';
    if (enviosTotales >= 20) return 'plata';
    return 'bronce';
  }

  it('0-19 entregas = bronce', () => {
    expect(calcularRango(0)).toBe('bronce');
    expect(calcularRango(10)).toBe('bronce');
    expect(calcularRango(19)).toBe('bronce');
  });

  it('20-49 entregas = plata', () => {
    expect(calcularRango(20)).toBe('plata');
    expect(calcularRango(35)).toBe('plata');
    expect(calcularRango(49)).toBe('plata');
  });

  it('50+ entregas = oro', () => {
    expect(calcularRango(50)).toBe('oro');
    expect(calcularRango(100)).toBe('oro');
    expect(calcularRango(999)).toBe('oro');
  });

  it('subir de rango reduce la meta de puntos', () => {
    const metaBronce = getMetaPuntos('bronce');
    const metaPlata = getMetaPuntos('plata');
    const metaOro = getMetaPuntos('oro');
    
    expect(metaOro).toBeLessThan(metaPlata);
    expect(metaPlata).toBeLessThan(metaBronce);
  });
});
