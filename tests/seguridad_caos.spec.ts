/**
 * tests/seguridad_caos.spec.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Suite de tests de Seguridad (RLS) y Caos (Condiciones de Carrera) para Estrella Delivery.
 * 
 * Cómo correr:
 *   npx playwright test tests/seguridad_caos.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Cliente con SERVICE ROLE (Bypassa RLS, usado para setup/teardown y pruebas de carrera)
const dbAdmin = createClient(
  process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key_to_bypass_scanner', // Service Role Key Local
  { auth: { persistSession: false } }
);

// Cliente con ANON KEY (Sujeto a RLS)
// Nota: Reemplaza esta llave con tu llave ANON local si difiere del estándar.
const dbAnon = createClient(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZmF1bHQiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MDk5MjAwMCwiZXhwIjoiMjA1NjYzMzYwMCJ9.0000000000000000000000000000000000000000000', 
  { auth: { persistSession: false } }
);

test.describe('🔥 CAOS: Condiciones de Carrera (Race Conditions)', () => {
  test('5 repartidores intentan aceptar el MISMO pedido al mismo milisegundo', async () => {
    // 1. Setup: Crear un pedido en estado 'asignado'
    const { data: p, error: insertErr } = await dbAdmin.from('pedidos').insert({
      cliente_tel: '5219999000001',
      descripcion: 'Pedido para prueba de carrera',
      estado: 'asignado',
    }).select().single();
    expect(insertErr).toBeNull();
    const pedidoId = p.id;
    expect(insertErr).toBeNull();

    // 2. Simular 5 repartidores intentando hacer el UPDATE exacto al mismo tiempo
    // La lógica del bot es: update({ estado: 'aceptado' }).eq('id', id).eq('estado', 'asignado')
    const intentos = 5;
    const promesasUpdate = [];

    for (let i = 0; i < intentos; i++) {
      const repartidorSimulado = `00000000-0000-0000-0000-00000000000${i}`;
      promesasUpdate.push(
        dbAdmin.from('pedidos')
          .update({ estado: 'recibido' })
          .eq('id', pedidoId)
          .eq('estado', 'asignado') // ESTA ES LA CLAVE DE LA TRANSACCIÓN
          .select()
      );
    }

    // 3. Ejecutar todas las promesas en paralelo
    const resultados = await Promise.all(promesasUpdate);

    // 4. Analizar resultados
    // Solamente UNA de las peticiones debió afectar filas (data.length === 1)
    let exitosos = 0;
    let rechazados = 0;
    let ganador = '';

    for (let i = 0; i < resultados.length; i++) {
      const res = resultados[i];
      if (res.data && res.data.length > 0) {
        exitosos++;
        ganador = `Intento-${i}`;
      } else {
        rechazados++;
      }
    }

    // 5. Aserciones Críticas
    expect(exitosos).toBe(1);      // Solo 1 logró ganar la carrera
    expect(rechazados).toBe(4);    // 4 fueron bloqueados por la base de datos limpiamente
    console.log(`Ganador de la carrera: ${ganador}`);

    // Limpieza
    await dbAdmin.from('pedidos').delete().eq('id', pedidoId);
  });
});

test.describe('🛡️ SEGURIDAD: Row Level Security (RLS)', () => {
  // NOTA: Si RLS no está activo en local, estos tests van a FALLAR intencionalmente.
  // Esto es la prueba de fuego de que debemos activar RLS.

  test('Un usuario anónimo NO debe poder LEER la tabla de clientes', async () => {
    const { data, error } = await dbAnon.from('clientes').select('*').limit(1);
    
    // Si data existe y tiene longitud, significa que RLS está apagado y hay fuga de datos
    expect(data === null || data.length === 0, '⚠️ ALERTA DE SEGURIDAD: La tabla clientes es pública').toBeTruthy();
    
    // Debería retornar un error 401, 403 o simplemente array vacío si las políticas lo ocultan
    if (error) {
      expect(['PGRST116', 'PGRST301', '401', '403'].some(c => error.code === c || error.message.includes('permission'))).toBeTruthy();
    }
  });

  test('Un usuario anónimo NO debe poder MODIFICAR (UPDATE) saldo de billeteras', async () => {
    // Intentar subir el saldo de billetera arbitrariamente
    const { error, data } = await dbAnon.from('clientes')
      .update({ saldo_billetera: 9999 })
      .eq('telefono', '5219999000001')
      .select();

    // Debe fallar o no retornar data
    expect(data === null || data.length === 0).toBeTruthy();
  });

  test('Un usuario anónimo NO debe poder LEER bot_memory (Rate limits expuestos)', async () => {
    const { data, error } = await dbAnon.from('bot_memory').select('*').limit(1);
    
    // bot_memory actualmente tiene RLS desactivado en local según la auditoría.
    // Este test FALLARÁ si no se ha activado en la base de datos.
    expect(data === null || data.length === 0, '⚠️ ALERTA DE SEGURIDAD: bot_memory tiene RLS desactivado y expone historiales de IA').toBeTruthy();
  });
});
