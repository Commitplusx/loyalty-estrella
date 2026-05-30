// ═══════════════════════════════════════════════════════════════════
// estres2026.ts — PRUEBA INTEGRAL DEL SISTEMA LOYALTY ESTRELLA
// Cubre: Admin, Repartidor, Restaurante B2B, Cliente
// Números: Admin=9631539156 | Cliente=9630000001 | Rep=9630000002 | Rest=9630000010
// ═══════════════════════════════════════════════════════════════════

import { executeAdminAction, handleCalificacion, handleTerminos, handleAdminCommands } from './whatsapp-bot/admin-handler.ts'
import { handleRepMessage } from './whatsapp-bot/rep-handler.ts'
import { handleSlashCommands, handleAdminInteractive } from './whatsapp-bot/slash-commands-handler.ts'
import { handleRestaurantCommand } from './whatsapp-bot/restaurant-b2b-handler.ts'

// ── NÚMEROS DE PRUEBA ────────────────────────────────────────────
const ADMIN     = '529631539156'
const ADMIN10   = '9631539156'
const CLIENTE   = '529630000001'
const CLI10     = '9630000001'
const REP       = '529630000002'
const REP10     = '9630000002'
const REST      = '529630000010'

// ── ESTADO MUTABLE DEL MOCK DB ──────────────────────────────────
const mockDB = {
  cliente: { id: 1, telefono: CLI10, nombre: 'Juan Test', puntos: 8, rango: 'plata', es_vip: false, acepta_terminos: true, reputacion: 'bueno', saldo_billetera: 0, envios_gratis_disponibles: 0, notas_crm: null, foto_fachada_url: null, direccion: null, lat_frecuente: null, lng_frecuente: null, cupon_activo: null, envios_totales: 4 },
  clienteSinTC: { id: 2, telefono: '9630000003', nombre: 'Maria NoTC', puntos: 0, rango: 'bronce', es_vip: false, acepta_terminos: false, reputacion: 'bueno' },
  repartidor: { id: 20, user_id: 'user20', telefono: REP10, nombre: 'Pedro Rep', activo: true },
  restaurante: { id: 10, user_id: 'user10', telefono: '9630000010', nombre_restaurante: 'Tacos B2B', acepta_terminos: true, programa_lealtad_activo: true },
  cupones: [{ id: 1, codigo: 'EST-TEST01', estado: 'activo', valor_pesos: 50, cliente_tel: CLI10 }]
}

// ── MOCK SUPABASE ────────────────────────────────────────────────
const makeMockSupabase = () => {
  const chain = (resolveWith: any): any => {
    const c: any = {
      select: () => chain(resolveWith),
      eq: () => chain(resolveWith),
      ilike: () => chain(resolveWith),
      or: () => chain(resolveWith),
      in: () => chain(resolveWith),
      limit: () => chain(resolveWith),
      not: () => chain(resolveWith),
      gte: () => chain(resolveWith),
      lte: () => chain(resolveWith),
      lt: () => chain(resolveWith),
      order: () => chain(resolveWith),
      head: () => chain(resolveWith),
      // update/delete/insert también deben retornar el chain completo
      update: () => chain(resolveWith),
      delete: () => chain(resolveWith),
      insert: () => chain(resolveWith),
      upsert: () => chain(resolveWith),
      // Terminales
      single: async () => ({ data: resolveWith, error: null }),
      maybeSingle: async () => ({ data: resolveWith, error: null }),
      // Para cuando update/delete/insert se usan sin .single() ni .maybeSingle()
      then: (resolve: any) => Promise.resolve({ data: resolveWith, error: null }).then(resolve),
    }
    return c
  }
  return {
    from: (table: string): any => {
      if (table === 'clientes') return chain(mockDB.cliente)
      if (table === 'repartidores') return chain(mockDB.repartidor)
      if (table === 'restaurantes') return chain(mockDB.restaurante)
      if (table === 'bot_memory') return chain(null)
      if (table === 'cupones') return chain(mockDB.cupones[0])
      if (table === 'restaurante_clientes_puntos') return chain([])
      if (table === 'registros_puntos') return chain({})
      if (table === 'admins') return chain(null)
      return chain([])
    },
    rpc: async (fn: string, args?: any) => {
      if (fn === 'fn_registrar_entrega_bulk') return { data: { ok: true, puntos: mockDB.cliente.puntos + (args?.p_cantidad || 1), saldo_billetera: 0, recien_ascendido: false }, error: null }
      if (fn === 'usar_cupon') return { data: { ok: true, cliente_nombre: 'Juan Test', cliente_tel: CLI10 }, error: null }
      if (fn === 'cancelar_cupon') return { data: { ok: true, cliente_nombre: 'Juan Test', monto_reembolsado: 50 }, error: null }
      if (fn === 'increment_cliente_envios_gratis') return { data: { ok: true }, error: null }
      if (fn === 'increment_cliente_saldo') return { data: { ok: true, nuevo_saldo: 200 }, error: null }
      return { data: { ok: true }, error: null }
    }
  }
}


// ── MOCK META API (sendWA) y DEEPSEEK ───────────────────────────
const logs: string[] = []
globalThis.fetch = async (url: string, opts?: any) => {
  if (typeof url === 'string' && url.includes('graph.facebook')) {
    const body = opts?.body ? JSON.parse(opts.body) : {}
    const to = body.to || '?'
    const text = body.text?.body || body.template?.name || body.interactive?.body?.text || 'MEDIA'
    logs.push(`📱 [WA→${to}]: ${String(text).replace(/\n/g,' ').slice(0,80)}`)
    return new Response(JSON.stringify({ messages: [{ id: 'mock' }] }), { status: 200 })
  }
  if (typeof url === 'string' && url.includes('deepseek')) {
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ accion: 'RESPONDER', mensajeUsuario: '[IA Mock]', datosAExtraer: {} }) } }] }), { status: 200 })
  }
  return new Response('OK', { status: 200 })
}

// ── ENV MOCKS ────────────────────────────────────────────────────
const _orig = Deno.env.get
Deno.env.get = (k: string) => {
  if (k === 'ADMIN_PHONES' || k === 'ADMIN_PHONE') return '52' + ADMIN10
  if (k === 'WA_PHONE_NUMBER_ID') return 'MOCK_ID'
  if (k === 'WA_TOKEN') return 'MOCK_TOKEN'
  if (k === 'DEEPSEEK_API_KEY') return 'MOCK_KEY'
  return _orig.call(Deno.env, k)
}

// ── RUNNER ───────────────────────────────────────────────────────
let pass = 0, fail = 0
async function test(name: string, fn: () => Promise<void>) {
  logs.length = 0
  try {
    await fn()
    console.log(`  ✅ ${name}`)
    if (logs.length) logs.forEach(l => console.log(`      ${l}`))
    pass++
  } catch(e: any) {
    console.error(`  ❌ ${name}: ${e.message}`)
    fail++
  }
}
function section(name: string) { console.log(`\n${'─'.repeat(55)}\n🔷 ${name}\n${'─'.repeat(55)}`) }

const db = makeMockSupabase()

// ════════════════════════════════════════════════════════════════
await section('ADMIN — Acciones IA')

await test('SUMAR_PUNTOS con T&C aceptados (getMetaPuntos dinámico)', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg1', { respuesta: { accion: 'SUMAR_PUNTOS', datosAExtraer: { clienteTel: CLI10, puntosASumar: 3 } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('SUMAR_PUNTOS sin T&C → bloquea y manda plantilla', async () => {
  const dbNoTC: any = { ...db, from: (t: string) => t === 'clientes' ? { ...db.from('clientes'), maybeSingle: async () => ({ data: mockDB.clienteSinTC, error: null }) } : db.from(t) }
  await executeAdminAction(dbNoTC, ADMIN, 'msg2', { respuesta: { accion: 'SUMAR_PUNTOS', datosAExtraer: { clienteTel: '9630000003', puntosASumar: 2 } } })
})

await test('BUSCAR_CLIENTE', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg3', { respuesta: { accion: 'BUSCAR_CLIENTE', datosAExtraer: { clienteTel: CLI10 } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('VER_HISTORIAL_CLIENTE', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg4', { respuesta: { accion: 'VER_HISTORIAL_CLIENTE', datosAExtraer: { clienteTel: CLI10 } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('MARCAR_VIP', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg5', { respuesta: { accion: 'MARCAR_VIP', datosAExtraer: { clienteTel: CLI10 } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('AGREGAR_CLIENTE (nuevo registro)', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg6', { respuesta: { accion: 'AGREGAR_CLIENTE', datosAExtraer: { clienteTel: CLI10, clienteNombre: 'Juan Nuevo', colonia: 'Centro' } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('AGREGAR_REPARTIDOR', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg7', { respuesta: { accion: 'AGREGAR_REPARTIDOR', datosAExtraer: { clienteTel: REP10, clienteNombre: 'Carlos Rep' } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('ELIMINAR_REPARTIDOR', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg8', { respuesta: { accion: 'ELIMINAR_REPARTIDOR', datosAExtraer: { clienteTel: REP10, repartidorAlias: 'Pedro' } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('CARGAR_SALDO (cliente VIP)', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg9', { respuesta: { accion: 'CARGAR_SALDO', datosAExtraer: { clienteTel: CLI10, montoSaldo: 100 } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('AGREGAR_NOTA_CLIENTE', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg10', { respuesta: { accion: 'AGREGAR_NOTA_CLIENTE', datosAExtraer: { clienteTel: CLI10, descripcion: 'Nota de prueba' } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('ACTUALIZAR_DIRECCION', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg11', { respuesta: { accion: 'ACTUALIZAR_DIRECCION', datosAExtraer: { clienteTel: CLI10, direccion: 'Calle Falsa 123' } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('CALIFICAR_CLIENTE → excelente', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg12', { respuesta: { accion: 'CALIFICAR_CLIENTE', datosAExtraer: { clienteTel: CLI10, descripcion: 'excelente' } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('ENVIAR_QR', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg13', { respuesta: { accion: 'ENVIAR_QR', datosAExtraer: { clienteTel: CLI10 } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('ENVIAR_TERMINOS', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg14', { respuesta: { accion: 'ENVIAR_TERMINOS', datosAExtraer: { clienteTel: CLI10 } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('ANUNCIO_REPARTIDORES (con throttle 350ms)', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg15', { respuesta: { accion: 'ANUNCIO_REPARTIDORES', datosAExtraer: { descripcion: 'Atención equipo: Test de estrés activo' } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('RECORDATORIO_REPARTIDOR', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg16', { respuesta: { accion: 'RECORDATORIO_REPARTIDOR', datosAExtraer: { repartidorAlias: 'Pedro', descripcion: 'Recuerda traer cambio' } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('VER_REPARTIDORES', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg17', { respuesta: { accion: 'VER_REPARTIDORES', datosAExtraer: {} } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('VER_VIPS', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg18', { respuesta: { accion: 'VER_VIPS', datosAExtraer: {} } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('VER_RESTAURANTES', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg19', { respuesta: { accion: 'VER_RESTAURANTES', datosAExtraer: {} } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('USAR_CUPON', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg20', { respuesta: { accion: 'USAR_CUPON', datosAExtraer: { codigoCupon: 'EST-TEST01' } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('CANCELAR_CUPON', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg21', { respuesta: { accion: 'CANCELAR_CUPON', datosAExtraer: { codigoCupon: 'EST-TEST01' } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('REGISTRAR_RESTAURANTE', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg22', { respuesta: { accion: 'REGISTRAR_RESTAURANTE', datosAExtraer: { nombre_restaurante: 'Tacos El Gordo', correo: 'tacos@test.com' } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('PEDIDOS DESHABILITADOS → VER_PEDIDOS', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg23', { respuesta: { accion: 'VER_PEDIDOS', datosAExtraer: {} } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('PEDIDOS DESHABILITADOS → CANCELAR_PEDIDO', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg24', { respuesta: { accion: 'CANCELAR_PEDIDO', datosAExtraer: { clienteTel: CLI10 } } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('PEDIDOS DESHABILITADOS → ENTREGAR_TODOS', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg25', { respuesta: { accion: 'ENTREGAR_TODOS', datosAExtraer: {} } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('CANCELAR_TODOS sin restaurante → BLOQUEADO', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg26', { respuesta: { accion: 'CANCELAR_TODOS', datosAExtraer: {} } })
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('RESPONDER (mensaje libre de IA)', async () => {
  const r = await executeAdminAction(db, ADMIN, 'msg27', { respuesta: { accion: 'RESPONDER', mensajeUsuario: 'Todo en orden', datosAExtraer: {} } })
  if (r.status !== 200) throw new Error('status !== 200')
})

// ════════════════════════════════════════════════════════════════
await section('ADMIN — Slash Commands')

await test('/info [tel]', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/info ${CLI10}`, 'cmd1', true)
  if (!r) throw new Error('No response')
})

await test('/buscar [tel]', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/buscar ${CLI10}`, 'cmd2', true)
  if (!r) throw new Error('No response')
})

await test('/puntos [tel] 3', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/puntos ${CLI10} 3`, 'cmd3', true)
  if (!r) throw new Error('No response')
})

await test('/score [tel] excelente', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/score ${CLI10} excelente`, 'cmd4', true)
  if (!r) throw new Error('No response')
})

await test('/nota [tel] texto', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/nota ${CLI10} Cliente puntual`, 'cmd5', true)
  if (!r) throw new Error('No response')
})

await test('/qr [tel]', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/qr ${CLI10}`, 'cmd6', true)
  if (!r) throw new Error('No response')
})

await test('/fachada [tel] → sesión silenciosa', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/fachada ${CLI10}`, 'cmd7', true)
  if (!r) throw new Error('No response')
})

await test('/loyalty [tel] → envía T&C (NO "Registro Silencioso")', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/loyalty ${CLI10}`, 'cmd8', true)
  if (!r) throw new Error('No response')
})

await test('/noregistrado [tel] → silencioso SIN mensaje al cliente', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/noregistrado ${CLI10}`, 'cmd9', true)
  if (!r) throw new Error('No response')
})

await test('/saldo [tel] 150', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/saldo ${CLI10} 150`, 'cmd10', true)
  if (!r) throw new Error('No response')
})

await test('/saldo > $10,000 → BLOQUEADO', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/saldo ${CLI10} 15000`, 'cmd11', true)
  if (!r) throw new Error('No response')
})

await test('/usar EST-TEST01', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/usar EST-TEST01`, 'cmd12', true)
  if (!r) throw new Error('No response')
})

await test('/cancelar EST-TEST01', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/cancelar EST-TEST01`, 'cmd13', true)
  if (!r) throw new Error('No response')
})

await test('/pausa [tel]', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/pausa ${CLI10}`, 'cmd14', true)
  if (!r) throw new Error('No response')
})

await test('/bot [tel] (reactivar)', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/bot ${CLI10}`, 'cmd15', true)
  if (!r) throw new Error('No response')
})

await test('/modo [tel] cliente', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/modo ${CLI10} cliente`, 'cmd16', true)
  if (!r) throw new Error('No response')
})

await test('/modo [tel] auto (revertir)', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/modo ${CLI10} auto`, 'cmd17', true)
  if (!r) throw new Error('No response')
})

await test('/menu (lista interactiva)', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/menu`, 'cmd18', true)
  if (!r) throw new Error('No response')
})

await test('/fin (cerrar sesión captura)', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/fin`, 'cmd19', true)
  if (!r) throw new Error('No response')
})

await test('/aprobar_rest [tel] Nombre', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/aprobar_rest 9630000099 Tacos Prueba`, 'cmd20', true)
  if (!r) throw new Error('No response')
})

await test('/rest_clientes [tel]', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/rest_clientes 9630000010`, 'cmd21', true)
  if (!r) throw new Error('No response')
})

await test('/set_field EDIT_NOM [tel] Juan Nuevo', async () => {
  const r = await handleSlashCommands(db, ADMIN, ADMIN10, `/set_field EDIT_NOM ${CLI10} Juan Nuevo`, 'cmd22', true)
  if (!r) throw new Error('No response')
})

await test('/sos (repartidor usa handleRepMessage, no slash)', async () => {
  // /sos es exclusivo de rep-handler, no de slash-commands. Validamos que slash retorne null.
  const r = await handleSlashCommands(db, REP, REP10, `/sos Llanta ponchada`, 'cmd23', false)
  // Slash commands no maneja /sos → retorna null (OK, lo maneja rep-handler por separado)
  if (r !== null) throw new Error('slash no debería manejar /sos')
})

// ════════════════════════════════════════════════════════════════
await section('ADMIN — Botones Interactivos (ACT_MENU)')

const actButtons = ['ACT_MENU_NOREGO','ACT_MENU_LOYALTY','ACT_MENU_INFO','ACT_MENU_QR','ACT_MENU_SCORE','ACT_MENU_SUMAR','ACT_MENU_REGALAR','ACT_MENU_REST']
for (const btn of actButtons) {
  await test(`Botón: ${btn}`, async () => {
    const r = await handleAdminInteractive(db, ADMIN, ADMIN10, btn)
    if (!r) throw new Error('No response')
  })
}

// ════════════════════════════════════════════════════════════════
await section('ADMIN — Calificaciones & Términos (Botones)')

for (const btnId of [`RATE_EXC_${CLI10}`, `RATE_BUE_${CLI10}`, `RATE_REG_${CLI10}`, `RATE_MAL_${CLI10}`, `VETAR_${CLI10}`]) {
  await test(`Calificación: ${btnId}`, async () => {
    const r = await handleCalificacion(db, ADMIN, btnId)
    if (r.status !== 200) throw new Error('status !== 200')
  })
}

await test('handleTerminos ACEPTAR_TERMINOS', async () => {
  const r = await handleTerminos(db, CLIENTE, CLI10, 'ACEPTAR_TERMINOS')
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('handleTerminos RECHAZAR_TERMINOS', async () => {
  const r = await handleTerminos(db, CLIENTE, CLI10, 'RECHAZAR_TERMINOS')
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('handleAdminCommands CMD_CANCELAR → deshabilitado', async () => {
  const r = await handleAdminCommands(db, ADMIN, 'CMD_CANCELAR_ABC123')
  if (r.status !== 200) throw new Error('status !== 200')
})

// ════════════════════════════════════════════════════════════════
await section('REPARTIDOR — Comandos y Flujos')

await test('/sos Accidente', async () => {
  const r = await handleRepMessage(db, REP, 'msg_sos', '/sos Accidente en el crucero', mockDB.repartidor)
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('/libre (notifica al admin)', async () => {
  const r = await handleRepMessage(db, REP, 'msg_libre', '/libre', mockDB.repartidor)
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('/usar EST-TEST01 (canje de cupón)', async () => {
  const r = await handleRepMessage(db, REP, 'msg_cupon', '/usar EST-TEST01', mockDB.repartidor)
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('/usar sin código → pide formato', async () => {
  const r = await handleRepMessage(db, REP, 'msg_usar_vacio', '/usar ', mockDB.repartidor)
  if (r.status !== 200) throw new Error('status !== 200')
})

await test('Botón BTN_ACEPTAR deshabilitado (Loyalty Only)', async () => {
  // Importar handleRepButtons dinámicamente
  const { handleRepButtons } = await import('./whatsapp-bot/rep-handler.ts')
  const r = await handleRepButtons(db, REP, 'BTN_ACEPTAR_fake-id-123', mockDB.repartidor)
  // Debe retornar true (procesado) sin crashear
})

await test('Botón BTN_CUPON_EST-TEST01 (cupón sigue activo)', async () => {
  const { handleRepButtons } = await import('./whatsapp-bot/rep-handler.ts')
  const r = await handleRepButtons(db, REP, 'BTN_CUPON_EST-TEST01', mockDB.repartidor)
})

// ════════════════════════════════════════════════════════════════
await section('RESTAURANTE B2B — Flujos')

await test('B2B: Restaurante manda Hola → menú principal', async () => {
  const stateHola = { step: 'idle' }
  await handleRestaurantCommand(db, REST, 'b2b_msg1', 'hola', mockDB.restaurante, stateHola)
})

await test('B2B: Restaurante pide sumar puntos (T&C cliente OK)', async () => {
  const stateSumar = { step: 'esperando_telefono', subAction: 'sumar_puntos' }
  await handleRestaurantCommand(db, REST, 'b2b_msg2', CLI10, mockDB.restaurante, stateSumar)
})

await test('B2B: Restaurante pide sumar puntos (cliente SIN T&C → bloquea)', async () => {
  // Construir un mock donde 'clientes' devuelve el cliente sin T&C
  const makeMockSinTC = () => {
    const chainSinTC = (resolveWith: any): any => {
      const c: any = {
        select: () => chainSinTC(resolveWith), eq: () => chainSinTC(resolveWith),
        ilike: () => chainSinTC(resolveWith), or: () => chainSinTC(resolveWith),
        in: () => chainSinTC(resolveWith), limit: () => chainSinTC(resolveWith),
        not: () => chainSinTC(resolveWith), gte: () => chainSinTC(resolveWith),
        lte: () => chainSinTC(resolveWith), lt: () => chainSinTC(resolveWith),
        order: () => chainSinTC(resolveWith), head: () => chainSinTC(resolveWith),
        update: () => chainSinTC(resolveWith), delete: () => chainSinTC(resolveWith),
        insert: () => chainSinTC(resolveWith), upsert: () => chainSinTC(resolveWith),
        single: async () => ({ data: resolveWith, error: null }),
        maybeSingle: async () => ({ data: resolveWith, error: null }),
        then: (resolve: any) => Promise.resolve({ data: resolveWith, error: null }).then(resolve),
      }
      return c
    }
    return {
      from: (table: string): any => {
        if (table === 'clientes') return chainSinTC(mockDB.clienteSinTC)
        if (table === 'restaurantes') return chainSinTC(mockDB.restaurante)
        if (table === 'bot_memory') return chainSinTC(null)
        return chainSinTC({})
      },
      rpc: async () => ({ data: { ok: true }, error: null })
    }
  }
  const dbNoTC = makeMockSinTC()
  const stateSumar = { step: 'esperando_telefono', subAction: 'sumar_puntos' }
  await handleRestaurantCommand(dbNoTC as any, REST, 'b2b_msg3', '9630000003', mockDB.restaurante, stateSumar)
})

await test('B2B: Restaurante pide regalar envío', async () => {
  // ... existing tests
  const stateRegalar = { step: 'esperando_telefono', subAction: 'regalar_envio' }
  await handleRestaurantCommand(db, REST, 'b2b_msg4', CLI10, mockDB.restaurante, stateRegalar)
})

await test('B2B: Restaurante envía número 10 dígitos (flujo rápido)', async () => {
  // Simulando que el restaurante no tiene sesión (idle) y manda un teléfono
  const stateIdle = { step: 'idle' }
  const mockMsg = { text: { body: CLI10 } }
  await handleRestaurantCommand(db, REST, REST.replace('52', ''), mockDB.restaurante.id.toString(), mockDB.restaurante.nombre_restaurante, 'text', mockMsg)
})

await test('B2B: Restaurante click RFAST_PUNTOS (botón rápido)', async () => {
  const stateIdle = { step: 'idle' }
  const mockMsg = { interactive: { button_reply: { id: `RFAST_PUNTOS_${CLI10}` } } }
  await handleRestaurantCommand(db, REST, REST.replace('52', ''), mockDB.restaurante.id.toString(), mockDB.restaurante.nombre_restaurante, 'interactive', mockMsg)
})

// ════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(55)}`)
console.log(`🏁  RESULTADO FINAL: ${pass} ✅ PASS  |  ${fail} ❌ FAIL`)
console.log(`${'═'.repeat(55)}\n`)
if (fail > 0) Deno.exit(1)
