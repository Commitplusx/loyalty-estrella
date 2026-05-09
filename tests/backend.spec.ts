/**
 * tests/backend.spec.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Suite de tests de backend para Estrella Delivery.
 * Trabaja directamente contra la DB local usando service_role (bypassa RLS).
 *
 * Cómo correr:
 *   npx playwright test tests/backend.spec.ts --project=chromium
 *
 * Requisitos:
 *   - npx supabase start (Docker corriendo)
 *   - npm run dev NO es necesario para estos tests
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key_to_bypass_scanner',
  { auth: { persistSession: false } }
);

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const TEST_TEL = '5219999000001'; // Teléfono ficticio para los tests

async function crearClienteTest(overrides: Record<string, unknown> = {}) {
  const tel = `521${Date.now().toString().slice(-7)}`;
  const uid = Math.random().toString(36).slice(2, 8);
  const { data, error } = await db.from('clientes').insert({
    nombre: 'Test Backend',
    telefono: tel,
    qr_code: `https://test.estrella/${tel}-${uid}`,
    puntos: 0,
    envios_gratis_disponibles: 0,
    envios_totales: 0,
    es_vip: false,
    rango: 'bronce',
    ...overrides,
  }).select().single();
  if (error) throw new Error(`No se pudo crear cliente: ${JSON.stringify(error)}`);
  return data;
}

async function limpiarCliente(id: string) {
  await db.from('registros_puntos').delete().eq('cliente_id', id);
  await db.from('movimientos_saldo').delete().eq('cliente_tel',
    (await db.from('clientes').select('telefono').eq('id', id).single()).data?.telefono
  );
  await db.from('clientes').delete().eq('id', id);
}

// ─── GRUPO 1: Creación de Clientes ───────────────────────────────────────────

test.describe('RPC: Gestión de Clientes', () => {

  test('get_or_create_cliente crea un cliente nuevo si no existe', async () => {
    const tel = `521${Date.now().toString().slice(-7)}`;

    const { data, error } = await db.rpc('get_or_create_cliente', { p_telefono: tel });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data.telefono).toBe(tel);
    expect(data.puntos).toBe(0);
    // get_or_create_cliente genera QR con formato 'ED-{epoch}-{hash}'
    expect(data.qr_code).toMatch(/^ED-\d+/);

    // Limpieza
    await db.from('clientes').delete().eq('telefono', tel);
  });

  test('get_or_create_cliente devuelve el mismo cliente si ya existe', async () => {
    const cliente = await crearClienteTest();

    try {
      const { data } = await db.rpc('get_or_create_cliente', { p_telefono: cliente.telefono });
      expect(data.id).toBe(cliente.id);
      expect(data.nombre).toBe(cliente.nombre);
    } finally {
      await limpiarCliente(cliente.id);
    }
  });

  test('registro_express_cliente crea con QR canónico de la web', async () => {
    const tel = `521${Date.now().toString().slice(-7)}`;
    const { data, error } = await db.rpc('registro_express_cliente', {
      p_telefono: tel,
      p_nombre: 'Cliente Express Test',
    });
    expect(error).toBeNull();
    expect(data.success).toBe(true);
    expect(data.qr_code).toContain('app-estrella.shop/loyalty/');

    await db.from('clientes').delete().eq('telefono', tel.slice(-10));
  });

});

// ─── GRUPO 2: Acumulación de Puntos ──────────────────────────────────────────

test.describe('RPC: fn_registrar_entrega — Puntos y Saldo', () => {

  test('Un cliente normal acumula 1 punto por entrega', async () => {
    const cliente = await crearClienteTest({ puntos: 0 });

    try {
      const { data, error } = await db.rpc('fn_registrar_entrega', {
        p_cliente_tel: cliente.telefono,
      });
      expect(error).toBeNull();
      expect(data.ok).toBe(true);
      expect(data.puntos).toBe(1);
      expect(data.saldo_ganado).toBe(0); // Normal no gana saldo
    } finally {
      await limpiarCliente(cliente.id);
    }
  });

  test('Un cliente VIP acumula $10 de saldo en las primeras 10 entregas', async () => {
    const cliente = await crearClienteTest({ es_vip: true, entregas_ciclo: 0 });

    try {
      const { data, error } = await db.rpc('fn_registrar_entrega', {
        p_cliente_tel: cliente.telefono,
      });
      expect(error).toBeNull();
      expect(data.ok).toBe(true);
      expect(Number(data.saldo_ganado)).toBe(10);
      expect(data.tier).toBe('premium_10');
    } finally {
      await limpiarCliente(cliente.id);
    }
  });

  test('Un cliente VIP con 11+ entregas gana $7 (tier estándar)', async () => {
    // La entrega 11 del ciclo — entregas_ciclo ya en 10 antes de llamar
    const cliente = await crearClienteTest({ es_vip: true, entregas_ciclo: 10 });

    try {
      const { data } = await db.rpc('fn_registrar_entrega', {
        p_cliente_tel: cliente.telefono,
      });
      expect(data.ok).toBe(true);
      expect(Number(data.saldo_ganado)).toBe(7);
      expect(data.tier).toBe('estandar_7');
    } finally {
      await limpiarCliente(cliente.id);
    }
  });

  test('Con 4 puntos acumulados, el 5to activa el ciclo completo', async () => {
    const cliente = await crearClienteTest({ puntos: 4 });

    try {
      const { data } = await db.rpc('fn_registrar_entrega', {
        p_cliente_tel: cliente.telefono,
      });
      expect(data.ok).toBe(true);
      expect(data.puede_canjear).toBe(true);
      expect(data.puntos).toBe(5);
    } finally {
      await limpiarCliente(cliente.id);
    }
  });

  test('Cliente inexistente devuelve error controlado', async () => {
    const { data } = await db.rpc('fn_registrar_entrega', {
      p_cliente_tel: '521000000INVALID',
    });
    expect(data.ok).toBe(false);
    expect(data.error).toContain('no encontrado');
  });

});

// ─── GRUPO 3: Canje de Beneficios ────────────────────────────────────────────

test.describe('RPC: fn_canjear_beneficio — Canjes', () => {

  test('Cliente normal puede canjear envío gratis con 5 puntos', async () => {
    const cliente = await crearClienteTest({ puntos: 5, es_vip: false });

    try {
      const { data, error } = await db.rpc('fn_canjear_beneficio', {
        p_cliente_tel: cliente.telefono,
        p_tipo: 'envio_normal',
      });
      expect(error).toBeNull();
      expect(data.ok).toBe(true);
      expect(data.valor_pesos).toBe(50);
      // Puntos deben reducirse a 0
      expect(data.puntos_nuevos).toBe(0);
    } finally {
      await db.from('cupones').delete().eq('cliente_tel', cliente.telefono);
      await limpiarCliente(cliente.id);
    }
  });

  test('Cliente sin puntos suficientes recibe error claro', async () => {
    const cliente = await crearClienteTest({ puntos: 3, es_vip: false });

    try {
      const { data } = await db.rpc('fn_canjear_beneficio', {
        p_cliente_tel: cliente.telefono,
        p_tipo: 'envio_normal',
      });
      expect(data.ok).toBe(false);
      expect(data.error).toContain('Necesitas 5 puntos');
    } finally {
      await limpiarCliente(cliente.id);
    }
  });

  test('Cliente no-VIP no puede usar tipo envio_vip', async () => {
    const cliente = await crearClienteTest({ puntos: 5, es_vip: false });

    try {
      const { data } = await db.rpc('fn_canjear_beneficio', {
        p_cliente_tel: cliente.telefono,
        p_tipo: 'envio_vip',
      });
      expect(data.ok).toBe(false);
      expect(data.error).toContain('VIP');
    } finally {
      await limpiarCliente(cliente.id);
    }
  });

  test('VIP puede canjear saldo de billetera', async () => {
    const cliente = await crearClienteTest({
      es_vip: true,
      saldo_billetera: 100,
      puntos: 0,
    });

    try {
      const { data } = await db.rpc('fn_canjear_beneficio', {
        p_cliente_tel: cliente.telefono,
        p_tipo: 'billetera',
        p_saldo_a_usar: 50,
      });
      expect(data.ok).toBe(true);
      expect(Number(data.saldo_nuevo)).toBe(50); // 100 - 50
    } finally {
      await db.from('cupones').delete().eq('cliente_tel', cliente.telefono);
      await limpiarCliente(cliente.id);
    }
  });

  test('VIP no puede canjear más saldo del que tiene', async () => {
    const cliente = await crearClienteTest({ es_vip: true, saldo_billetera: 20 });

    try {
      const { data } = await db.rpc('fn_canjear_beneficio', {
        p_cliente_tel: cliente.telefono,
        p_tipo: 'billetera',
        p_saldo_a_usar: 50,
      });
      expect(data.ok).toBe(false);
      expect(data.error).toContain('Saldo insuficiente');
    } finally {
      await limpiarCliente(cliente.id);
    }
  });

});

// ─── GRUPO 4: Validación de Cupones ──────────────────────────────────────────

test.describe('DB: Integridad de Cupones', () => {

  test('Un cupón generado se puede validar y usar', async () => {
    const cliente = await crearClienteTest({ puntos: 5, es_vip: false });

    try {
      // Generar cupón
      const { data: canjeData } = await db.rpc('fn_canjear_beneficio', {
        p_cliente_tel: cliente.telefono,
        p_tipo: 'envio_normal',
      });
      const codigo = canjeData.codigo;
      expect(codigo).toMatch(/^CANJE-EST-/);

      // Validar cupón (como lo haría el repartidor)
      const { data: validData } = await db.rpc('validar_cupon_publico', {
        p_codigo: codigo,
      });
      expect(validData.ok).toBe(true);
      expect(Number(validData.monto)).toBe(50);

    } finally {
      await db.from('cupones').delete().eq('cliente_tel', cliente.telefono);
      await limpiarCliente(cliente.id);
    }
  });

  test('Un cupón inválido/inexistente devuelve error', async () => {
    const { data } = await db.rpc('validar_cupon_publico', {
      p_codigo: 'CANJE-EST-FALSO',
    });
    expect(data.ok).toBe(false);
    expect(data.error).toBeTruthy();
  });

});

// ─── GRUPO 5: Webhook del Bot (Edge Function) ─────────────────────────────────

test.describe('Edge Function: whatsapp-bot webhook', () => {

  const WEBHOOK_URL = 'http://127.0.0.1:54321/functions/v1/whatsapp-bot';

  function buildPayload(from: string, text: string, wamid: string) {
    return {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'ENTRY_ID',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            messages: [{
              from,
              id: wamid,
              timestamp: Math.floor(Date.now() / 1000).toString(),
              type: 'text',
              text: { body: text },
            }],
            contacts: [{ profile: { name: 'Test User' }, wa_id: from }],
          },
        }],
      }],
    };
  }

  test('Acepta y procesa un mensaje normal devolviendo 200', async ({ request }) => {
    const wamid = `wamid.test_normal_${Date.now()}`;
    const response = await request.post(WEBHOOK_URL, {
      data: buildPayload('529631234567', 'Hola, quiero hacer un pedido', wamid),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status()).toBe(200);
  });

  test('Idempotencia: el mismo wamid dos veces no duplica procesamiento', async ({ request }) => {
    const wamid = `wamid.idempotency_test_${Date.now()}`;
    const payload = buildPayload('529631234567', 'Mensaje duplicado', wamid);

    const res1 = await request.post(WEBHOOK_URL, {
      data: payload,
      headers: { 'Content-Type': 'application/json' },
    });
    const res2 = await request.post(WEBHOOK_URL, {
      data: payload,
      headers: { 'Content-Type': 'application/json' },
    });

    // Ambas deben responder 200 (el bot absorbe el duplicado silenciosamente)
    expect(res1.status()).toBe(200);
    expect(res2.status()).toBe(200);

    // Verificar que solo hay UN registro del wamid en la DB
    const { data } = await db.from('bot_memory')
      .select('phone')
      .eq('phone', `processed_msg:${wamid}`);
    expect(data?.length).toBe(1);
  });

  test('Payload malformado devuelve 200 sin crashear (resiliencia)', async ({ request }) => {
    const response = await request.post(WEBHOOK_URL, {
      data: { garbage: 'data', no_entry: true },
      headers: { 'Content-Type': 'application/json' },
    });
    // El bot nunca debe devolver 5xx
    expect(response.status()).toBeLessThan(500);
  });

  test('Body vacío devuelve respuesta controlada', async ({ request }) => {
    const response = await request.post(WEBHOOK_URL, {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    expect(response.status()).toBeLessThan(500);
  });

});

// ─── GRUPO 6: Integridad de la DB ─────────────────────────────────────────────

test.describe('DB: Constraints e Integridad', () => {

  test('No se puede insertar un pedido con estado inválido', async () => {
    const { error } = await db.from('pedidos').insert({
      cliente_tel: '529631234567',
      descripcion: 'Pedido test inválido',
      estado: 'ESTADO_INEXISTENTE', // Debe violar el CHECK constraint
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain('pedidos_estado_check');
  });

  test('No se pueden tener envios_gratis_disponibles negativos', async () => {
    const { error } = await db.from('clientes').insert({
      nombre: 'Test Negativo',
      telefono: `521${Date.now()}`,
      qr_code: 'test-qr',
      envios_gratis_disponibles: -1, // Viola el CHECK constraint
    });
    expect(error).not.toBeNull();
  });

  test('El trigger updated_at se actualiza automáticamente en pedidos', async () => {
    // Crear un pedido
    const { data: pedido } = await db.from('pedidos').insert({
      cliente_tel: '529631234567',
      descripcion: 'Test trigger updated_at',
      estado: 'asignado',
    }).select().single();

    const updatedAtInicial = pedido.updated_at;

    // Esperar 1 segundo para que haya diferencia
    await new Promise(r => setTimeout(r, 1100));

    await db.from('pedidos').update({ descripcion: 'Modificado' }).eq('id', pedido.id);

    const { data: pedidoActualizado } = await db
      .from('pedidos').select('updated_at').eq('id', pedido.id).single();

    expect(new Date(pedidoActualizado.updated_at) > new Date(updatedAtInicial)).toBe(true);

    // Limpieza
    await db.from('pedidos').delete().eq('id', pedido.id);
  });

});
