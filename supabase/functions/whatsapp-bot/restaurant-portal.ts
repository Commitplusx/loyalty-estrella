// ══════════════════════════════════════════════════════════════════════════════
// 🍽️  PORTAL DE RESTAURANTES — ROBUST V2 (Idempotencia & Zod & Happy Hour)
// Manejo fortificado de extracciones, guardrails en DB y AI fallback.
// ══════════════════════════════════════════════════════════════════════════════

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

// ─── Tipos Estrictos ────────────────────────────────────────────────────────────
interface Pedido {
  clienteTel: string | null
  descripcion: string | null
  direccion: string | null
  tiempo_estimado: string | null
  precio: string | null // Puede ser negociado
}

interface EstadoSesion {
  phase: string    // idle | collecting_phone | collecting_desc | collecting_dir | collecting_extras
  pedidos_acumulados: Pedido[]
  pedido_actual: Partial<Pedido>
  total_esperados: number
  sesion_inicio: number | null
  idempotency_keys: string[]  // Array de msg.id para evitar procesados duplicados.
}

interface RestauranteRow {
  id: string
  nombre: string
  telefono: string
}

interface PortalContext {
  supabase: SupabaseClient
  fromPhone: string
  from10: string
  admin10: string
  adminPhone: string | undefined
  msgType: string
  msg: any // Metadata del Webhook original
  restaurante: RestauranteRow
  deepseekKey: string
}

type SendWA = (to: string, body: string) => Promise<void>
const TIMEOUT_SESION_MS = 4 * 60 * 60 * 1000 // 4 horas

const ESTADO_IDLE: EstadoSesion = {
  phase: 'idle',
  pedidos_acumulados: [],
  pedido_actual: {},
  total_esperados: 0,
  sesion_inicio: null,
  idempotency_keys: []
}

// ─── Esquema Zod de Validación para AI ─────────────────────────────────────────
const AiResponseSchema = z.object({
  intencion: z.enum(['dar_datos', 'preguntar', 'confirmar', 'otro']).catch('dar_datos'),
  total_pedidos_esperados: z.number().nullable().catch(null),
  pedido_actual_actualizado: z.object({
    clienteTel: z.string().nullable().catch(null),
    descripcion: z.string().nullable().catch(null),
    direccion: z.string().nullable().catch(null),
    tiempo_estimado: z.string().nullable().catch(null),
    precio: z.string().nullable().catch(null) // Negociación de precios
  }).catch({ clienteTel: null, descripcion: null, direccion: null, tiempo_estimado: null, precio: null }),
  pedido_actual_completo: z.boolean().catch(false),
  nuevos_pedidos_detectados: z.array(z.object({
    clienteTel: z.string().nullable().catch(null),
    descripcion: z.string().nullable().catch(null),
    direccion: z.string().nullable().catch(null),
    tiempo_estimado: z.string().nullable().catch(null),
    precio: z.string().nullable().catch(null),
    completo: z.boolean().catch(false)
  })).catch([]),
  mensaje_para_restaurante: z.string().catch('Entendido, analizando...')
})

// ══════════════════════════════════════════════════════════════════════════════
// EXTRACCIÓN ROBUSTA DE TELÉFONOS
// ══════════════════════════════════════════════════════════════════════════════
function extraerTelefonos(texto: string): string[] {
  const textoLimpio = texto.replace(/[^\d\s\-\.+]/g, ' ')
  const patron = /(?:\+?52[\s\-\.]?)?(\d[\s\-\.]?\d[\s\-\.]?\d[\s\-\.]?\d[\s\-\.]?\d[\s\-\.]?\d[\s\-\.]?\d[\s\-\.]?\d[\s\-\.]?\d[\s\-\.]?\d)/g
  const matches = textoLimpio.match(patron) || []
  return matches
    .map(m => m.replace(/\D/g, '').slice(-10))
    .filter(t => t.length === 10)
    .filter((t, i, arr) => arr.indexOf(t) === i)
}

// ══════════════════════════════════════════════════════════════════════════════
// REGLA GEOGRÁFICA "HORA FELIZ" (Lun & Sab, 17:00-19:00, Centro Comitán)
// ══════════════════════════════════════════════════════════════════════════════
function esHoraFeliz(): boolean {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }))
  const dia = now.getDay()
  const hora = now.getHours()
  if (![1, 6].includes(dia)) return false
  return (hora >= 17 && hora < 19)
}

async function leerEstado(supabase: SupabaseClient, memKey: string): Promise<EstadoSesion> {
  try {
    const { data, error } = await supabase.from('bot_memory').select('history').eq('phone', memKey).maybeSingle()
    if (error) throw error
    if (data?.history?.[0]) {
      const dbState = data.history[0]
      if (!Array.isArray(dbState.idempotency_keys)) dbState.idempotency_keys = []
      return dbState as EstadoSesion
    }
  } catch (err) {
    console.error('[RESTAURANT PORTAL] Error DB leerEstado:', err)
  }
  return { ...ESTADO_IDLE }
}

async function guardarEstado(supabase: SupabaseClient, memKey: string, estado: EstadoSesion): Promise<boolean> {
  try {
    const { error } = await supabase.from('bot_memory').upsert({
      phone: memKey,
      history: [estado],
      updated_at: new Date().toISOString()
    })
    if (error) throw error
    return true
  } catch (err) {
    console.error('[RESTAURANT PORTAL] Error DB guardarEstado:', err)
    return false
  }
}

async function extraerJsonSeguro(text: string): Promise<any | null> {
  try {
    const startIndex = text.indexOf('{')
    const endIndex = text.lastIndexOf('}')
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return null
    let cleanJson = text.substring(startIndex, endIndex + 1)
      .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
      .replace(/:\s*'([^']*)'/g, ': "$1"')

    const parsed = JSON.parse(cleanJson)
    return AiResponseSchema.parse(parsed)
  } catch (err) {
    console.warn('[RESTAURANT AI] Fallo en JSON o validación Zod:', err)
    return null
  }
}

async function llamarDeepSeek(
  deepseekKey: string,
  restaurante: RestauranteRow,
  estado: EstadoSesion,
  telefonosEnTexto: string[],
  textoRest: string,
  zonas: any[],
  esHoraFelizActiva: boolean,
  reintentos = 3
): Promise<any | null> {
  const promptZonas = (zonas && zonas.length > 0)
    ? `TABULADOR DE PRECIOS POR COLONIA CONFIGURADO PARA "${restaurante.nombre}":
${zonas.map(z => `- "${z.colonias?.nombre}": Normal $${z.precio_estandar ?? 45}${z.aplica_hora_feliz ? ' [Aplica Hora Feliz: $35]' : ' [PRECIO FIJO (No aplica Hora Feliz)]'}`).join('\n')}
ESTADO DE HORA FELIZ AHORA: ${esHoraFelizActiva ? 'ACTIVA (Lunes/Sábado 17-19h)' : 'INACTIVA'}
CRÍTICO: Si la dirección coincide con una zona donde "aplica_hora_feliz" es true y HORA FELIZ está ACTIVA, el precio DEBE ser $35.`
    : `No hay zonas específicas configuradas para este restaurante. Usa el precio estándar de $45 o lo que se negocie en el chat.`

  const systemPrompt = `Eres "ALPHA-Estrella Restaurantes", el motor de Estrella Delivery. Eres ESTRICTO devolviendo EXCLUSIVAMENTE JSON.

RESTAURANTE: "${restaurante.nombre}"

${promptZonas}

ESTADO ACTUAL:
${JSON.stringify({
    fase: estado.phase,
    pedido_actual_memoria: estado.pedido_actual,
    pedidos_acumulados_listos: estado.pedidos_acumulados?.length || 0,
    total_esperados_anotados: estado.total_esperados
  })}

TELEFONOS DETECTADOS: ${JSON.stringify(telefonosEnTexto)}

REGLAS ABSOLUTAS:
1. Cada TÉLEFONO DE CLIENTE = Un pedido diferente.
2. Pedido COMPLETO = clienteTel (10 dígitos exactos) + descripcion + direccion.
3. PRECIOS: Usa el TABULADOR arriba mencionado. Si no hay coincidencia, usa $45.
4. NEGOCIACIÓN: Si el restaurante o el cliente acuerdan un precio diferente explícitamente (ej: "cobra 50", "va por 35"), ese manda sobre el tabulador.
5. NO inventes datos. Si no hay, envía null.
6. ENFOQUE LOGÍSTICO (CRÍTICO): Eres un servicio de mensajería para restaurantes. NUNCA preguntes "¿Qué va a pedir?". El pedido ya está hecho. Pregunta siempre de forma logística: "¿A qué dirección llevamos el paquete?" o "¿Lleva algún detalle escrito o monto a cobrar?". Puedes usar el campo 'descripcion' para guardar si llevan "1 hamburguesa" o "Paquete chico".
7. DEBES DEVOLVER EXCLUSIVAMENTE ESTE FORMATO JSON:
{
  "intencion": "dar_datos|preguntar|confirmar|otro",
  "total_pedidos_esperados": <numero_o_null>,
  "pedido_actual_actualizado": { "clienteTel": "...", "descripcion": "...", "direccion": "...", "tiempo_estimado": "...", "precio": "..." },
  "pedido_actual_completo": <true/false>,
  "nuevos_pedidos_detectados": [ { "clienteTel": "...", "descripcion": "...", "direccion": "...", "tiempo_estimado": "...", "precio": "...", "completo": true/false } ],
  "mensaje_para_restaurante": "..."
}`

  for (let intento = 1; intento <= reintentos; intento++) {
    try {
      const ctrl = new AbortController()
      const tmr = setTimeout(() => ctrl.abort(), 20000)
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${deepseekKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-reasoner',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: textoRest }],
          max_tokens: 1500,
          temperature: 0.0
        }),
        signal: ctrl.signal
      })
      clearTimeout(tmr)

      if (!res.ok) continue

      const raw = await res.json()
      const content = raw.choices?.[0]?.message?.content || ''
      const result = await extraerJsonSeguro(content)

      if (result) return result
    } catch (err) {
      console.warn(`[RESTAURANT AI] Red Error Intento ${intento}:`, err)
    }
  }
  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// CAPA 4 – FALLBACK INTELIGENTE DE EMERGENCIA
// ══════════════════════════════════════════════════════════════════════════════
async function manejarFallback(
  ctx: PortalContext,
  sendWA: SendWA,
  memKey: string,
  estado: EstadoSesion,
  telefonosEnTexto: string[],
  textoRest: string
): Promise<Response> {
  const { supabase, fromPhone, restaurante } = ctx
  console.warn(`[RESTAURANT PORTAL] Fallback puro ejecutado para ${restaurante.nombre}`)

  try {
    if (telefonosEnTexto.length > 0 && estado.phase === 'idle') {
      const primerTel = telefonosEnTexto[0]
      await guardarEstado(supabase, memKey, { phase: 'collecting_desc', pedidos_acumulados: [], pedido_actual: { clienteTel: primerTel }, total_esperados: telefonosEnTexto.length, sesion_inicio: Date.now(), idempotency_keys: estado.idempotency_keys })
      await sendWA(fromPhone, `✅ Recibí el teléfono *${primerTel}*.\n¿Lleva alguna indicación el paquete o monto a cobrar? 📦 (Si no, escribe "nada")`)
    } else if (estado.phase === 'collecting_phone' && telefonosEnTexto.length > 0) {
      await guardarEstado(supabase, memKey, { ...estado, phase: 'collecting_desc', pedido_actual: { ...estado.pedido_actual, clienteTel: telefonosEnTexto[0] } })
      await sendWA(fromPhone, `✅ Tel: *${telefonosEnTexto[0]}* anotado. ¿Lleva alguna indicación o cobro? 📦 (O escribe "nada")`)
    } else if (estado.phase === 'collecting_desc') {
      await guardarEstado(supabase, memKey, { ...estado, phase: 'collecting_dir', pedido_actual: { ...estado.pedido_actual, descripcion: textoRest } })
      await sendWA(fromPhone, `✅ Anotado.\n¿A qué dirección llevamos el paquete? 📍`)
    } else if (estado.phase === 'collecting_dir') {
      await guardarEstado(supabase, memKey, { ...estado, phase: 'collecting_extras', pedido_actual: { ...estado.pedido_actual, direccion: textoRest } })
      await sendWA(fromPhone, `✅ Dirección guardada.\n¿Hay detalles extra de ubicación?. Si no, mándame *"listo"*.`)
    } else {
      await sendWA(fromPhone, `⚠️ Tuvimos un error temporal de conexión, *${restaurante.nombre}*.\nIntenta enviar el texto de nuevo o escribe *cancelar*.`)
    }
  } catch (err) {
    console.error(`[RESTAURANT PORTAL] Fallback Error:`, err)
  }
  return new Response('OK', { status: 200 })
}

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICACIÓN E INTERFAZ CUI PARA EL ADMIN (CALEB)
// ══════════════════════════════════════════════════════════════════════════════
async function notificarAdmin(
  ctx: PortalContext,
  sendWA: SendWA,
  memKey: string,
  pedidosAcumulados: Pedido[]
): Promise<void> {
  const { supabase, fromPhone, admin10, adminPhone, restaurante } = ctx
  const timestamp = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: true })

  // Confirmación al rest y UX
  let confirmMsg = `🥳 *¡Impecable ${restaurante.nombre}, pedidos capturados!*\n\n`
  pedidosAcumulados.forEach((p, i) => { confirmMsg += `📦 *${p.clienteTel}* — ${(p.descripcion || '').substring(0, 40)}\n` })
  confirmMsg += `\n_🚀 Jefe notificado para asignación de repartidor_`
  await sendWA(fromPhone, confirmMsg)

  // Mensaje estructurado hacia el Admin con controles UI
  let adminMsg = `🍽️ 🚨 *NUEVOS PEDIDOS — ${restaurante.nombre.toUpperCase()}*\n🕐 ${timestamp}\n━━━━━━━━━━━━━━━━━━━━\n`
  pedidosAcumulados.forEach((p, i) => {
    adminMsg += `\n🔸 *PEDIDO #${i + 1}*\n📞 Cliente: \`${p.clienteTel || 'Sin tel'}\`\n`
    if (p.descripcion) adminMsg += `🍔 Lleva: *${p.descripcion}*\n`
    if (p.direccion) adminMsg += `📍 Va para: *${p.direccion}*\n`

    // Logica visual si aplicó Happy Hour
    if (p.precio === '$35' && esHoraFeliz()) {
      adminMsg += `💰 Cobro: ${p.precio} _(🔥 Hora Feliz Aplicada)_\n`
    } else if (p.precio) {
      adminMsg += `💰 Cobro: ${p.precio}\n`
    }

    if (p.tiempo_estimado) adminMsg += `⏱️ Tiempo: ${p.tiempo_estimado}\n`
  })

  adminMsg += `\n━━━━━━━━━━━━━━━━━━━━\n`
  adminMsg += `🎛️ *ACCIONES (Envía como respuesta):*\n`
  adminMsg += `✅ *[Confirmar a...]* (Ej: "A Jorge", "Todos a Maria")\n`
  adminMsg += `✏️ *[Editar Precio #X]* (Ej: "El 2 cobra 50")\n`
  adminMsg += `🗺️ *[Ver Mapa]* (Ej: "Manda ref del 1")`

  // Upsert a la DB de memoria de admin
  await supabase.from('bot_memory').upsert({
    phone: `admin_rest_pending_${admin10}`,
    history: [{ pedidos: pedidosAcumulados, restaurante_nombre: restaurante.nombre, restaurante_tel: fromPhone, timestamp: Date.now() }],
    updated_at: new Date().toISOString()
  })

  // Limpieza de memoria
  await guardarEstado(supabase, memKey, { ...ESTADO_IDLE })
  if (adminPhone) await sendWA(adminPhone, adminMsg)
}

// ══════════════════════════════════════════════════════════════════════════════
// PUNTO DE ENTRADA PRINCIPAL — llamado desde index.ts
// ══════════════════════════════════════════════════════════════════════════════
export async function handleRestaurantPortal(
  supabase: SupabaseClient,
  fromPhone: string,
  from10: string,
  admin10: string,
  adminPhone: string | undefined,
  msgType: string,
  msg: any,
  sendWA: SendWA,
  sendInteractiveButton?: any
): Promise<Response | null> {

  // Validar si el remitente está verificado en la tabla de restaurantes (Búsqueda Ultra-Robusta)
  // Nota: Recuperamos todos para evitar problemas de RLS si la query exacta falla por índices o tipos.
  const { data: todosRest, error: dbErr } = await supabase.from('restaurantes').select('id, nombre, telefono, activo')

  if (dbErr) {
    console.error('[RESTAURANT PORTAL] DB Error:', dbErr)
    if (from10 === admin10) await sendWA(fromPhone, `⚠️ Error DB Portal: ${dbErr.message}`)
  }

  // Buscar coincidencia ignorando formato y estado (para debug)
  const restaurante = todosRest?.find(r => {
    const db10 = (r.telefono || '').replace(/\D/g, '').slice(-10)
    return db10 === from10 && r.activo === true
  })

  // Log secreto para el admin si falla la detección (Solo si lo pide explícitamente)
  if (!restaurante && from10 === admin10 && msgType === 'text' && (msg.text?.body || '').toLowerCase().includes('debug_restaurantes')) {
    const total = todosRest?.length || 0
    await sendWA(fromPhone, `🔍 *Debug Portal:* No te detecté como restaurante. \n- Tel Detectado: ${from10}\n- Registros en DB: ${total}`)
    return new Response('OK', { status: 200 })
  }

  if (!restaurante) return null

  const DSKEY = Deno.env.get('DEEPSEEK_API_KEY') ?? ''
  const ctx: PortalContext = { supabase, fromPhone, from10, admin10, adminPhone, msgType, msg, restaurante, deepseekKey: DSKEY }

  const msgId = msg.id || ''
  const memKey = `rest_${from10}`
  let estado = await leerEstado(supabase, memKey)

  // ── BUG FIX #1: Idempotencia ANTES de cualquier await largo (incluyendo debounce).
  // Se guarda en DB inmediatamente para que el webhook duplicado de Meta sea ignorado
  // incluso si llegara durante los 5 segundos del debounce.
  if (msgId && estado.idempotency_keys?.includes(msgId)) {
    console.log(`[RESTAURANT PORTAL] Ignorando webhook IDEMPOTENTE duplicado: ${msgId}`)
    return new Response('OK', { status: 200 })
  }
  if (msgId) {
    estado.idempotency_keys = [msgId, ...(estado.idempotency_keys || [])].slice(0, 10)
    // Persistir la clave ANTES del debounce para protegerse de duplicados temporales
    await guardarEstado(supabase, memKey, estado)
  }

  console.log(`🍽️ [RESTAURANT PORTAL] ${restaurante.nombre} (${fromPhone}) - msgType: ${msgType}`)

  // ── CONFIRMACIÓN INTERACTIVA (BOTÓN) ──
  if (msgType === 'interactive') {
    const btnId = msg.interactive?.button_reply?.id as string | undefined
    if (btnId === 'CONFIRMAR_PEDIDOS_REST') {
       // El restaurante pulsó el botón
       if (estado.pedidos_acumulados && estado.pedidos_acumulados.length > 0) {
          await notificarAdmin(ctx, sendWA, memKey, estado.pedidos_acumulados)
       } else {
          await sendWA(fromPhone, `⚠️ Tuvimos un error o ya se enviaron los pedidos. La bandeja está vacía.`)
       }
       return new Response('OK', { status: 200 })
    } else if (btnId === 'CANCELAR_PEDIDOS_REST') {
       // El restaurante pulsó cancelar
       await guardarEstado(supabase, memKey, { ...ESTADO_IDLE, sesion_inicio: Date.now(), idempotency_keys: estado.idempotency_keys })
       await sendWA(fromPhone, `🚫 Envío cancelado. Bandeja limpia, ¿en qué más te ayudo?`)
       return new Response('OK', { status: 200 })
    }
  }

  if (msgType === 'location') {
    const lat = msg.location?.latitude
    const lng = msg.location?.longitude
    const addr = msg.location?.address || msg.location?.name || ''

    // BUG FIX #2b: También permitir ubicación cuando se espera confirmación
    if (estado.phase === 'collecting_dir' || estado.phase === 'collecting_desc' || estado.phase === 'waiting_confirmation') {
      // Si hay un pedido en espera de confirmación, actualizar su dirección y re-mostrar resumen
      if (estado.phase === 'waiting_confirmation' && addr && estado.pedidos_acumulados?.length > 0) {
        const pedidosActualizados = estado.pedidos_acumulados.map((p, i) => i === estado.pedidos_acumulados.length - 1 ? { ...p, direccion: addr } : p)
        await guardarEstado(supabase, memKey, { ...estado, pedidos_acumulados: pedidosActualizados })
        await sendWA(fromPhone, `📍 Dirección actualizada: *${addr}*\nPulsa el botón o escribe *"confirmar"* para solicitar el mensajero.`)
      } else {
        await guardarEstado(supabase, memKey, { ...estado, pedido_actual: { ...estado.pedido_actual, direccion: addr, lat, lng } as any, phase: 'collecting_extras' })
        await sendWA(fromPhone, `📍 ¡Ubicación recibida! ${addr ? '📍 *' + addr + '*' : ''}\n¿Algún detalle extra (cobro, etc)? O responde *"listo"*.`)
      }
    } else {
      await sendWA(fromPhone, `📍 Ubicación guardada. Envíame también el teléfono del cliente para anotarla al pedido.`)
    }
    return new Response('OK', { status: 200 })
  }

  if (msgType !== 'text') {
    await sendWA(fromPhone, `🤖 Hola *${restaurante.nombre}* 👋\nPor favor envíame la información en *texto* (teléfono, qué lleva, a dónde). ✏️`)
    return new Response('OK', { status: 200 })
  }

  let textoRest = (msg.text?.body as string || '').trim().substring(0, 2000)
  if (!textoRest) return new Response('OK', { status: 200 })

  // ── DEBOUNCE QUEUE (Agrupar múltiples mensajes rápidos) ──
  const { data: qData } = await supabase.from('bot_memory').select('history').eq('phone', memKey + '_queue').maybeSingle()
  const currentBuffer = qData?.history?.[0]?.buffer || ''
  const newBuffer = currentBuffer ? currentBuffer + '\n' + textoRest : textoRest
  const queueId = msgId || Date.now().toString()

  await supabase.from('bot_memory').upsert({ phone: memKey + '_queue', history: [{ buffer: newBuffer, last_msg: queueId }], updated_at: new Date().toISOString() })

  // Dormimos 4 segundos (dejando margen antes del timeout de 5s de Meta)
  await new Promise(r => setTimeout(r, 4000))

  // Verificamos si otro webhook llegó mientras dormíamos
  const { data: fData } = await supabase.from('bot_memory').select('history').eq('phone', memKey + '_queue').maybeSingle()
  if (fData?.history?.[0]?.last_msg !== queueId) {
    // Otro mensaje está listo para procesar — morimos en silencio
    return new Response('OK', { status: 200 })
  }

  // Somos el último. Limpiamos queue y procesamos el buffer completo
  await supabase.from('bot_memory').upsert({ phone: memKey + '_queue', history: [{ buffer: '', last_msg: '' }], updated_at: new Date().toISOString() })
  textoRest = newBuffer

  const telefonosEnTexto = extraerTelefonos(textoRest)
  const textoBajo = textoRest.toLowerCase()
  const esReinicio = /reinicia(r)?|reset|cancela(r)?|borrar todo|empe(z|c)ar/i.test(textoBajo)
  // BUG FIX #4: esListo debe buscar en CADA LÍNEA del buffer, no en el texto completo
  const esListo = textoRest.split('\n').some(linea =>
    /^(listo|ok|ya|si|sí|correcto|confirma|env[íi]alo|dale|manda(lo)?)\s*[.!]*$/i.test(linea.trim())
  )
  const esSaludo = /^(hola|buenas|buenos|que tal|saludos|hello)\s*[.!]*$/i.test(textoRest.split('\n')[0].trim())

  if (estado.sesion_inicio && estado.phase !== 'idle' && (Date.now() - estado.sesion_inicio) > TIMEOUT_SESION_MS) {
    console.log(`⏰ [RESTAURANT PORTAL] Timeout ${restaurante.nombre}`)
    estado = { ...ESTADO_IDLE, sesion_inicio: Date.now(), idempotency_keys: estado.idempotency_keys }
    await guardarEstado(supabase, memKey, estado)
    await sendWA(fromPhone, `⏰ *${restaurante.nombre}*, expiró la sesión por inactividad. 🔄\n¿Qué pedidos enviamos ahora?`)
    return new Response('OK', { status: 200 })
  }

  if (esReinicio) {
    await guardarEstado(supabase, memKey, { ...ESTADO_IDLE, sesion_inicio: Date.now(), idempotency_keys: estado.idempotency_keys })
    await sendWA(fromPhone, `🔄 *Cancelado / Reiniciado.*\nBandeja limpia, ${restaurante.nombre}. ¿Nuevos pedidos?`)
    return new Response('OK', { status: 200 })
  }

  // BUG FIX #3: Guard para waiting_confirmation — no procesar nuevos pedidos hasta que el restaurante confirme o cancele.
  if (estado.phase === 'waiting_confirmation') {
    if (esListo) {
      // El restaurante escribió "confirmar" / "listo" en lugar de pulsar el botón
      if (estado.pedidos_acumulados && estado.pedidos_acumulados.length > 0) {
        await notificarAdmin(ctx, sendWA, memKey, estado.pedidos_acumulados)
      } else {
        await sendWA(fromPhone, `⚠️ No hay pedidos en espera. Empieza uno nuevo enviando el teléfono del cliente.`)
      }
    } else {
      // Nuevo texto llegó mientras hay un pedido pendiente de confirmación — recordatorio
      await sendWA(fromPhone, `⏳ *${restaurante.nombre}*, tienes un pedido pendiente de confirmación.\n✅ Pulsa el botón o escribe *"confirmar"* para enviarlo.\n🔄 Escribe *"cancelar"* para descartarlo y empezar de nuevo.`)
    }
    return new Response('OK', { status: 200 })
  }

  // Intercepción "Hola" estática para evitar gasto de IA
  if (esSaludo && estado.phase === 'idle' && telefonosEnTexto.length === 0) {
    await sendWA(fromPhone, `🤖 ¡Hola *${restaurante.nombre}*! 👋\nSoy el asistente logístico para restaurantes.\n\nPara enviarme pedidos solo necesitas escribir algo así:\n\n*Pedido 1:*\n📞 9631234567\n📝 1 Hamburguesa con papas\n📍 Barrio La Cueva (Referencia enfrente del parque)\n\n¡Estoy listo cuando tú lo estés! 📝🛵`)
    return new Response('OK', { status: 200 })
  }

  // 1. Fetch Dynamic Zones for this restaurant
  const { data: zonasEnvio } = await supabase
    .from('restaurante_colonias')
    .select('*, colonias(nombre)')
    .eq('restaurante_telefono', from10)

  const horaFelizActiva = esHoraFeliz()

  // LLAMADA IA
  const aiResult = await llamarDeepSeek(DSKEY, restaurante, estado, telefonosEnTexto, textoRest, zonasEnvio || [], horaFelizActiva)
  if (!aiResult) return await manejarFallback(ctx, sendWA, memKey, estado, telefonosEnTexto, textoRest)

  const aiPedidoActual = aiResult.pedido_actual_actualizado || {}
  const aiCompleto = aiResult.pedido_actual_completo === true
  const nuevosDetect = aiResult.nuevos_pedidos_detectados || []
  const msgRest = aiResult.mensaje_para_restaurante || 'Entendido.'
  const totalEsperados = aiResult.total_pedidos_esperados ?? estado.total_esperados ?? 0
  const intencion = aiResult.intencion || 'dar_datos'

  const pedidoActualFinal: Pedido = {
    clienteTel: aiPedidoActual.clienteTel || estado.pedido_actual?.clienteTel || null,
    descripcion: aiPedidoActual.descripcion || estado.pedido_actual?.descripcion || null,
    direccion: aiPedidoActual.direccion || estado.pedido_actual?.direccion || null,
    tiempo_estimado: aiPedidoActual.tiempo_estimado || estado.pedido_actual?.tiempo_estimado || null,
    precio: aiPedidoActual.precio || estado.pedido_actual?.precio || null,
  }

  const pedidoActualEstaCompleto = aiCompleto || (
    (pedidoActualFinal.clienteTel?.length ?? 0) >= 10 && !!pedidoActualFinal.descripcion?.trim() && !!pedidoActualFinal.direccion?.trim()
  )

  const nuevosCompletos = nuevosDetect.filter((p: any) => p.completo)
  const nuevosIncompletos = nuevosDetect.filter((p: any) => !p.completo)

  let pedidosAcumulados = [...(estado.pedidos_acumulados || [])]
  if (pedidoActualEstaCompleto) pedidosAcumulados.push(pedidoActualFinal)
  pedidosAcumulados = [...pedidosAcumulados, ...nuevosCompletos]

  // DEDUPLICACIÓN CRÍTICA
  const mapVistos = new Map<string, Pedido>()
  pedidosAcumulados.forEach(p => { if (p.clienteTel) mapVistos.set(p.clienteTel, p) })
  pedidosAcumulados = Array.from(mapVistos.values())

  const pedidosListos = pedidosAcumulados.length
  const haySuficientes = totalEsperados > 0 ? pedidosListos >= totalEsperados : (pedidoActualEstaCompleto && nuevosIncompletos.length === 0 && (esListo || intencion === 'confirmar'))

  if (!haySuficientes && (!pedidoActualEstaCompleto || nuevosIncompletos.length > 0)) {
    let nuevaFase = estado.phase
    if (!pedidoActualFinal.clienteTel) nuevaFase = 'collecting_phone'
    else if (!pedidoActualFinal.descripcion) nuevaFase = 'collecting_desc'
    else if (!pedidoActualFinal.direccion) nuevaFase = 'collecting_dir'
    else nuevaFase = 'collecting_extras'

    await guardarEstado(supabase, memKey, { phase: nuevaFase, pedidos_acumulados: pedidosAcumulados, pedido_actual: pedidoActualEstaCompleto ? {} : pedidoActualFinal, total_esperados: totalEsperados || estado.total_esperados, sesion_inicio: estado.sesion_inicio ?? Date.now(), idempotency_keys: estado.idempotency_keys })
    let replyMsg = `🤖 *${restaurante.nombre}* | ${msgRest}`
    if (pedidosAcumulados.length > 0) replyMsg += `\n\n_(✅ Anotados por ahora: ${pedidosAcumulados.length})_`
    if (!msgRest.toLowerCase().includes('listo') && pedidoActualEstaCompleto && pedidosAcumulados.length > 0 && !totalEsperados) replyMsg += `\nSi eso es todo, responde *"listo"*.`

    await sendWA(fromPhone, replyMsg)
    return new Response('OK', { status: 200 })
  }

  if (pedidosAcumulados.length === 0) {
    if (esListo || intencion === 'confirmar') await sendWA(fromPhone, `⚠️ *${restaurante.nombre}*, me dices "listo" pero no tengo ningún pedido completo. Necesito *teléfono*, *dirección* y *cobro*.`)
    else await sendWA(fromPhone, `🤖 ${msgRest}`)

    await guardarEstado(supabase, memKey, { ...estado, idempotency_keys: estado.idempotency_keys })
    return new Response('OK', { status: 200 })
  }

  // 📝 ENVIAR BOTÓN DE CONFIRMACIÓN EN LUGAR DE ENVIAR DIRECTO AL ADMIN
  console.log(`✅ [RESTAURANT PORTAL] Esperando confirmación de ${pedidosAcumulados.length} pedido(s) de ${restaurante.nombre}`)

  let resumenMsg = `📝 *RESUMEN DEL ENVÍO*\n\n`
  pedidosAcumulados.forEach((p, i) => {
     resumenMsg += `🔹 *Pedido ${i + 1}*\n`
     resumenMsg += `📞 Tel: ${p.clienteTel}\n📍 Dir: ${p.direccion}\n`
     if (p.descripcion && p.descripcion !== 'nada') resumenMsg += `📦 Notas: ${p.descripcion}\n`
     if (p.precio && p.precio !== 'nada') resumenMsg += `💰 Cobrar: ${p.precio}\n`
     resumenMsg += `\n`
  })

  // Guardamos el estado actual
  await guardarEstado(supabase, memKey, { phase: 'waiting_confirmation', pedidos_acumulados: pedidosAcumulados, pedido_actual: {}, total_esperados: totalEsperados || estado.total_esperados, sesion_inicio: estado.sesion_inicio ?? Date.now(), idempotency_keys: estado.idempotency_keys })

  // BUG FIX #5: Truncar el body del botón a 1024 chars (límite de Meta API).
  // Si supera el límite, enviamos el resumen completo por texto plano y luego el botón en un 2do mensaje corto.
  const footerBtn = `¿Deseas solicitar el mensajero ahora?\n_(Escribe "cancelar" si deseas reiniciar)_`
  const fullMsg = resumenMsg + footerBtn
  const WA_INTERACTIVE_LIMIT = 1024

  if (sendInteractiveButton) {
    if (fullMsg.length <= WA_INTERACTIVE_LIMIT) {
      await sendInteractiveButton(fromPhone, fullMsg, `CONFIRMAR_PEDIDOS_REST`, `✅ Solicitar Mensajero`)
    } else {
      // Resumen demasiado largo: texto plano primero, luego botón con mensaje corto
      await sendWA(fromPhone, resumenMsg)
      await sendInteractiveButton(fromPhone, `¿Confirmas el envío de los ${pedidosAcumulados.length} pedido(s) listados arriba?`, `CONFIRMAR_PEDIDOS_REST`, `✅ Solicitar Mensajero`)
    }
  } else {
    await sendWA(fromPhone, (resumenMsg + `\n🔹 Escribe *"confirmar"* para solicitar al mensajero, o *"cancelar"* para reiniciar.`).substring(0, 4096))
  }

  return new Response('OK', { status: 200 })
}

