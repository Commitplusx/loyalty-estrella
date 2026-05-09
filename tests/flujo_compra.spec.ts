import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Cliente admin con service_role para bypassar RLS (simula el backend)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key_to_bypass_scanner'
);

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function crearPedidoTest(overrides = {}) {
  const testId = crypto.randomUUID();
  const { error } = await supabaseAdmin.from('pedidos').insert({
    id: testId,
    cliente_tel: '529631234567',
    cliente_nombre: 'Cliente Playwright',
    restaurante: 'Pizza Test E2E',
    descripcion: '2 Pizzas de Pepperoni + 1 Coca-Cola',
    direccion: 'Av. Central 123, Col. Centro, Comitán',
    estado: 'asignado',
    ...overrides,
  });
  if (error) throw new Error(`No se pudo crear pedido de prueba: ${JSON.stringify(error)}`);
  return testId;
}

async function limpiarPedido(id: string) {
  await supabaseAdmin.from('pedidos').delete().eq('id', id);
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

test.describe('Flujo E2E: WebApp de Repartidor', () => {

  test.afterEach(async ({}, testInfo) => {
    // Si el test falló y dejó pedidos, los logs lo indicarán
    if (testInfo.status !== 'passed') {
      console.log('⚠️  Test falló — revisar pedidos residuales en la DB local.');
    }
  });

  // ── TEST 1: Renderizado correcto de un pedido ────────────────────────────────
  test('Muestra los detalles del pedido correctamente', async ({ page }) => {
    const testId = await crearPedidoTest();

    try {
      const key = testId.replace(/-/g, '').slice(0, 8);
      await page.goto(`http://127.0.0.1:5173/pedido/${testId}?key=${key}`);

      // El SplashScreen puede estar activo — esperamos al h1 del pedido específicamente
      await expect(page.getByRole('heading', { name: 'Pizza Test E2E' })).toBeVisible({ timeout: 8000 });
      await expect(page.locator('text=ESTADO: asignado')).toBeVisible();
      await expect(page.locator('text=Av. Central 123')).toBeVisible();
      await expect(page.locator('text=2 Pizzas de Pepperoni')).toBeVisible();

      // El botón de aceptar debe estar disponible para el repartidor autorizado
      await expect(page.locator('button:has-text("ACEPTAR SERVICIO")')).toBeVisible();
    } finally {
      await limpiarPedido(testId);
    }
  });

  // ── TEST 2: La UI reacciona en tiempo real a cambios de estado (via Realtime) ─
  test('La UI se actualiza automáticamente cuando el estado cambia (Realtime)', async ({ page }) => {
    const testId = await crearPedidoTest();

    try {
      const key = testId.replace(/-/g, '').slice(0, 8);
      await page.goto(`http://127.0.0.1:5173/pedido/${testId}?key=${key}`);

      // Verificar estado inicial — el UI muestra estado.replace('_', ' ')
      await expect(page.locator('text=ESTADO: asignado')).toBeVisible({ timeout: 8000 });

      // Simular que el backend cambia el estado (como lo haría el bot/admin)
      await supabaseAdmin.from('pedidos').update({ estado: 'recibido' }).eq('id', testId);
      // La UI debe actualizar via Realtime sin recargar
      await expect(page.locator('text=ESTADO: recibido')).toBeVisible({ timeout: 12000 });

      // Avanzar a en_camino — el UI muestra 'en camino' (replace underscore)
      await supabaseAdmin.from('pedidos').update({ estado: 'en_camino' }).eq('id', testId);
      await expect(page.locator('text=ESTADO: en camino')).toBeVisible({ timeout: 12000 });

      // Avanzar a entregado — el UI muestra el mensaje de finalizado
      await supabaseAdmin.from('pedidos').update({ estado: 'entregado' }).eq('id', testId);
      await expect(page.locator('text=SERVICIO FINALIZADO')).toBeVisible({ timeout: 12000 });
    } finally {
      await limpiarPedido(testId);
    }
  });

  // ── TEST 3: Pedido inexistente muestra 404 correcto ──────────────────────────
  test('Muestra error elegante si el pedido no existe', async ({ page }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await page.goto(`http://127.0.0.1:5173/pedido/${fakeId}?key=00000000`);

    await expect(page.locator('text=Pedido No Encontrado')).toBeVisible({ timeout: 8000 });
  });

  // ── TEST 4: Vista de solo lectura sin key válido ──────────────────────────────
  test('Sin key válido muestra vista de solo lectura', async ({ page }) => {
    const testId = await crearPedidoTest();

    try {
      // Navegamos SIN el key correcto
      await page.goto(`http://127.0.0.1:5173/pedido/${testId}?key=INVALIDO`);

      // Debe mostrar vista de solo lectura, sin botones de acción
      await expect(page.locator('text=Vista de solo lectura')).toBeVisible({ timeout: 8000 });
      await expect(page.locator('button:has-text("ACEPTAR SERVICIO")')).not.toBeVisible();
    } finally {
      await limpiarPedido(testId);
    }
  });

});
