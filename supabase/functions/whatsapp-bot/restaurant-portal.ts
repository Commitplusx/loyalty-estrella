// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 🍽️  PORTAL DE RESTAURANTES — ROBUST V2 (Idempotencia & Zod & Happy Hour)
// Manejo fortificado de extracciones, guardrails en DB y AI fallback.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { logError } from '../_shared/utils.ts'

// ─── Tipos Estrictos ────────────────────────────────────────────────────────────
interface Pedido {
  clienteTel: string | null
  descripcion: string | null
  direccion: string | null
  tiempo_estimado: string | null
  precio: string | null // Puede ser negociado
  lat?: number | null
  lng?: number | null
  es_vetado?: boolean
}

interface EstadoSesion {
  phase: string    // idle | collecting_phone | collecting_desc | collecting_dir | collecting_time | collecting_extras | waiting_confirmation
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
const TIMEOUT_SESION_MS = 15 * 60 * 1000 // 15 minutos (Evita sesiones zombis de un día a otro)

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
  intencion: z.enum(['dar_datos', 'preguntar', 'confirmar', 'borrar_pedido', 'otro']).catch('dar_datos'),
  telefono_a_borrar: z.string().nullable().catch(null),
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EXTRACCIÓN ROBUSTA DE TELÉFONOS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function extraerTelefonos(texto: string): string[] {
  const textoLimpio = texto.replace(/[^\d\s\-\.+]/g, ' ')
  const patron = /(?:\+?52[\s\-\.]?)?(\d[\s\-\.]?\d[\s\-\.]?\d[\s\-\.]?\d[\s\-\.]?\d[\s\-\.]?\d[\s\-\.]?\d[\s\-\.]?\d[\s\-\.]?\d[\s\-\.]?\d)/g
  const matches = textoLimpio.match(patron) || []
  return matches
    .map(m => m.replace(/\D/g, '').slice(-10))
    .filter(t => t.length === 10)
    .filter((t, i, arr) => arr.indexOf(t) === i)
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// REGLA GEOGRÁFICA "HORA FELIZ" (Lun & Sab, 17:00-19:00, Centro Comitán)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// (Función esHoraFeliz eliminada — no se usaba en ningún lugar)

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
    // Intento 1: Parseo directo (La IA moderna con json_object devuelve JSON puro sin markdown)
    try {
      const parsed = JSON.parse(text)
      return AiResponseSchema.parse(parsed)
    } catch (parseError) {
      // Intento 2: Extracción de bloque en caso de que la IA incluya texto antes o después (ej. ```json ... ```)
      const startIndex = text.indexOf('{')
      const endIndex = text.lastIndexOf('}')
      if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return null
      
      const cleanJson = text.substring(startIndex, endIndex + 1)
      const parsed = JSON.parse(cleanJson)
      return AiResponseSchema.parse(parsed)
    }
  } catch (err) {
    console.warn('[RESTAURANT AI] Fallo masivo en JSON o validación Zod:', err)
    return null
  }
}

// ── Circuit Breaker DeepSeek — Portal Restaurantes ─────────────────────────
// Persistido en base de datos para entornos Serverless (Edge Functions)
const REST_CB_THRESHOLD = 3
const REST_CB_OPEN_MS = 45_000
const CB_KEY = 'sys_circuit_rest'

async function _getRestCircuit(supabase: SupabaseClient) {
  try {
    const { data } = await supabase.from('bot_memory').select('history').eq('phone', CB_KEY).maybeSingle()
    if (data?.history?.[0]) return data.history[0] as { fails: number, openUntil: number }
  } catch (e) {}
  return { fails: 0, openUntil: 0 }
}

async function _updateRestCircuit(supabase: SupabaseClient, state: { fails: number, openUntil: number }) {
  await supabase.from('bot_memory').upsert({ phone: CB_KEY, history: [state], updated_at: new Date().toISOString() })
}

async function _restCbFail(supabase: SupabaseClient): Promise<void> {
  const c = await _getRestCircuit(supabase)
  c.fails++
  if (c.fails >= REST_CB_THRESHOLD) {
    c.openUntil = Date.now() + REST_CB_OPEN_MS
    c.fails = 0
    console.error('[CIRCUIT OPEN] DeepSeek-Restaurantes pausado 45s por 3 fallas consecutivas')
    logError('whatsapp-bot', '[CIRCUIT OPEN] Restaurante pausado 45s por fallo de AI.', {}, 'error').catch(() => {});
  }
  await _updateRestCircuit(supabase, c)
}

async function _restCbSuccess(supabase: SupabaseClient): Promise<void> { 
  const c = await _getRestCircuit(supabase)
  if (c.fails > 0) {
    await _updateRestCircuit(supabase, { fails: 0, openUntil: 0 })
  }
}

async function llamarDeepSeek(
  supabase: SupabaseClient,
  deepseekKey: string,
  restaurante: RestauranteRow,
  estado: EstadoSesion,
  telefonosEnTexto: string[],
  textoRest: string,
  reintentos = 2
): Promise<any | null> {
  // Circuit breaker: si DeepSeek está caído, respondemos null de inmediato
  const circuit = await _getRestCircuit(supabase)
  if (Date.now() < circuit.openUntil) {
    const secsLeft = Math.ceil((circuit.openUntil - Date.now()) / 1000)
    console.warn(`[CIRCUIT OPEN] Restaurantes DeepSeek en pausa — ${secsLeft}s`)
    return null
  }

  const systemPrompt = `Eres "ALPHA-Estrella", motor de extracción de pedidos de Estrella Delivery. Tu única función es extraer datos con máxima precisión. DEVUELVES EXCLUSIVAMENTE JSON VÁLIDO. Sin texto previo ni posterior.

RESTAURANTE ACTIVO: "${restaurante.nombre}"

ESTADO DE SESIÓN ACTUAL:
${JSON.stringify({
    fase: estado.phase,
    pedido_en_curso: estado.pedido_actual,
    pedidos_acumulados: estado.pedidos_acumulados || [],
    total_esperados: estado.total_esperados
  })}

TELÉFONOS DETECTADOS AUTOMÁTICAMENTE: ${JSON.stringify(telefonosEnTexto)}
(Úsalos como base. El restaurante puede dar más en el texto.)

â•â•â•â•â•â•â•â•â•â•â•â• REGLAS ABSOLUTAS â•â•â•â•â•â•â•â•â•â•â•â•

R1. CADA TELÉFONO = UN PEDIDO DISTINTO
    • 3 teléfonos en el texto = 3 pedidos separados en "nuevos_pedidos_detectados".
    • El primero puede ir en "pedido_actual_actualizado", el resto en "nuevos_pedidos_detectados".

R2. CAMPOS DE UN PEDIDO:
    ✅ OBLIGATORIO: clienteTel (exactamente 10 dígitos numéricos)
    ✅ OBLIGATORIO: direccion (dónde se entrega)
    ✅ IMPORTANTE:  descripcion (qué lleva o instrucciones; si no dice nada escribe "Sin indicaciones")
    ⏱️ OPCIONAL:   tiempo_estimado — Si el restaurante lo menciona, captúralo en texto (ej: "20 min", "media hora"). Si NO lo menciona, pon null. NO lo solicites. El administrador lo confirmará.
    💰 OPCIONAL:   precio — Solo si el restaurante indica un cobro explícito (ej: "cobra 60"). Si no, null.

R3. PEDIDO COMPLETO = clienteTel + descripcion + direccion presentes. tiempo_estimado es bonus, no requisito.
    • Marca "pedido_actual_completo": true si clienteTel + descripcion + direccion están presentes.
    • No esperes el tiempo para marcar completo.

R4. NO INVENTES DATOS
    • Si un campo no aparece en el texto, pon null. Nunca supongas, nunca inventes.

R5. PRIORIDAD: DIRECCIÓN FALTANTE
    • Si tienes clienteTel pero NO direccion: pregunta "¿A qué dirección llevamos el pedido de ${telefonosEnTexto[0] || 'ese cliente'}?"
    • Si ya tienes direccion guardada en el estado, NO la vuelvas a pedir.

R6. NO PIDAS TIEMPO ESTIMADO
    • Si el restaurante no mencionó el tiempo, acepta null y procede. El admin lo maneja.

R7. CANCELACIONES
    • "borra el del 963...", "cancela el último" → intencion: "borrar_pedido" + telefono_a_borrar.

R8. CONFIRMACIÓN
    • "listo", "confirmar", "ok", "mándalo", "envíalo" → intencion: "confirmar"

R9. MÚLTIPLES PEDIDOS EN UN MENSAJE
    • Si el restaurante manda "tel1, desc1, dir1 / tel2, desc2, dir2", extrae ambos correctamente.
    • Usa "nuevos_pedidos_detectados" para el segundo y sucesivos.

â•â•â•â•â•â•â•â•â•â•â•â• FORMATO JSON OBLIGATORIO â•â•â•â•â•â•â•â•â•â•â•â•
{
  "intencion": "dar_datos|preguntar|confirmar|borrar_pedido|otro",
  "telefono_a_borrar": "<10 dígitos o null>",
  "total_pedidos_esperados": <número o null>,
  "pedido_actual_actualizado": {
    "clienteTel": "<10 dígitos exactos o null>",
    "descripcion": "<texto, 'Sin indicaciones', o null>",
    "direccion": "<texto o null>",
    "tiempo_estimado": "<texto o null>",
    "precio": "<texto o null>"
  },
  "pedido_actual_completo": <true si clienteTel+descripcion+direccion presentes, false si falta alguno>,
  "nuevos_pedidos_detectados": [
    { "clienteTel": "...", "descripcion": "...", "direccion": "...", "tiempo_estimado": "...", "precio": "...", "completo": true }
  ],
  "mensaje_para_restaurante": "<mensaje breve, directo y amigable>"
}`

  for (let intento = 1; intento <= reintentos; intento++) {
    try {
      const ctrl = new AbortController()
      const tmr = setTimeout(() => ctrl.abort(), 12000)
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${deepseekKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-chat',
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: textoRest }],
          max_tokens: 1500,
          temperature: 0.0
        }),
        signal: ctrl.signal
      })
      clearTimeout(tmr)

      if (!res.ok) {
        console.warn(`[RESTAURANT AI] HTTP ${res.status} intento ${intento}`)
        await _restCbFail(supabase)
        continue
      }

      const raw = await res.json()
      const content = raw.choices?.[0]?.message?.content || ''
      const result = await extraerJsonSeguro(content)

      if (result) {
        await _restCbSuccess(supabase)
        return result
      }
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError'
      console.warn(`[RESTAURANT AI] ${isTimeout ? 'Timeout 12s' : 'Red Error'} intento ${intento}:`, isTimeout ? '' : err)
      await _restCbFail(supabase)
    }
  }
  return null
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CAPA 4 – FALLBACK INTELIGENTE DE EMERGENCIA
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
      if (textoRest.length > 40 && telefonosEnTexto.length > 1) {
        // Fallback robusto para múltiples teléfonos: empezamos con el primero en modo seguro
        await guardarEstado(supabase, memKey, { phase: 'collecting_desc', pedidos_acumulados: [], pedido_actual: { clienteTel: primerTel }, total_esperados: telefonosEnTexto.length, sesion_inicio: Date.now(), idempotency_keys: estado.idempotency_keys })
        await sendWA(fromPhone, `⚠️️ Entrando en modo de emergencia. Recibí ${telefonosEnTexto.length} teléfonos.\nVamos uno por uno. Empezando por el *${primerTel}*.\n¿Lleva alguna indicación el paquete o monto a cobrar? 📦 (Si no, escribe "nada")`)
      } else {
        await guardarEstado(supabase, memKey, { phase: 'collecting_desc', pedidos_acumulados: [], pedido_actual: { clienteTel: primerTel }, total_esperados: telefonosEnTexto.length || 1, sesion_inicio: Date.now(), idempotency_keys: estado.idempotency_keys })
        await sendWA(fromPhone, `✅ Recibí el teléfono *${primerTel}*.\n¿Lleva alguna indicación el paquete o monto a cobrar? 📦 (Si no, escribe "nada")`)
      }
    } else if (estado.phase === 'collecting_phone' && telefonosEnTexto.length > 0) {
      await guardarEstado(supabase, memKey, { ...estado, phase: 'collecting_desc', pedido_actual: { ...estado.pedido_actual, clienteTel: telefonosEnTexto[0] } })
      await sendWA(fromPhone, `✅ Tel: *${telefonosEnTexto[0]}* anotado. ¿Lleva alguna indicación o cobro? 📦 (O escribe "nada")`)
    } else if (estado.phase === 'collecting_desc') {
      await guardarEstado(supabase, memKey, { ...estado, phase: 'collecting_dir', pedido_actual: { ...estado.pedido_actual, descripcion: textoRest } })
      await sendWA(fromPhone, `✅ Anotado.\n¿A qué dirección llevamos el paquete? 📍`)
    } else if (estado.phase === 'collecting_dir') {
      // tiempo_estimado es opcional: al tener tel+desc+dir vamos directo a extras/confirmación
      await guardarEstado(supabase, memKey, { ...estado, phase: 'collecting_extras', pedido_actual: { ...estado.pedido_actual, direccion: textoRest } })
      await sendWA(fromPhone, `✅ Dirección guardada.\n¿Hay detalles extra (cobro, referencias)? Si no, responde *"listo"* para enviar al mensajero. ⏱️ Si sabes el tiempo de preparación, inclúyelo.`)
    } else if (estado.phase === 'collecting_time') {
      // Fase legacy — si el sistema aún tiene este estado, avanzamos a extras
      await guardarEstado(supabase, memKey, { ...estado, phase: 'collecting_extras', pedido_actual: { ...estado.pedido_actual, tiempo_estimado: textoRest } })
      await sendWA(fromPhone, `✅ Tiempo anotado.\n¿Hay detalles extra de ubicación o cobro? Si no, mándame *"listo"*.`)
    } else {
      await sendWA(fromPhone, `⚠️️ Tuvimos un error temporal de conexión, *${restaurante.nombre}*.\nIntenta enviar el texto de nuevo o escribe *cancelar*.`)
    }
  } catch (err) {
    console.error(`[RESTAURANT PORTAL] Fallback Error:`, err)
  }
  return new Response('OK', { status: 200 })
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// NOTIFICACIÓN E INTERFAZ CUI PARA EL ADMIN (CALEB)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
  let adminMsg = `🍽️ 🚨 *NUEVOS PEDIDOS — ${restaurante.nombre.toUpperCase()}*\n🕐 ${timestamp}\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n`
  pedidosAcumulados.forEach((p, i) => {
    adminMsg += `\n🔸 *PEDIDO #${i + 1}*\n📞 Cliente: \`${p.clienteTel || 'Sin tel'}\`\n`
    if (p.descripcion) adminMsg += `ðŸ” Lleva: *${p.descripcion}*\n`
    if (p.direccion) adminMsg += `📍 Va para: *${p.direccion}*\n`

    if (p.precio && p.precio !== 'nada' && p.precio !== 'null') {
      adminMsg += `💰 Cobrar: ${p.precio}\n`
      // Guardrail de precios anómalos (por si el restaurante lo ingresó manualmente)
      const numPrecio = parseFloat(p.precio.replace(/[^0-9.]/g, ''))
      if (numPrecio > 200) {
        adminMsg += `🚨 *ALERTA DE PRECIO ANÓMALO:* ¡El cobro excede los $200! Verifica si es error de dedo.\n`
      }
    }

    adminMsg += p.tiempo_estimado
      ? `⏱️ Tiempo: ${p.tiempo_estimado}\n`
      : `⏱️ Tiempo: *⚠️️ Sin confirmar — pregunta al restaurante*\n`
  })

  adminMsg += `\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n`
  adminMsg += `🎛️ *ACCIONES (Envía como respuesta):*\n`
  adminMsg += `✅ *[Confirmar a...]* (Ej: "A Jorge", "Todos a Maria")\n`
  adminMsg += `âœ️ *[Editar Precio #X]* (Ej: "El 2 cobra 50")\n`
  adminMsg += `🗺️ *[Ver Mapa]* (Ej: "Manda ref del 1")`

  // Upsert a la DB de memoria de admin
  await supabase.from('bot_memory').upsert({
    phone: `admin_rest_pending_${admin10}`,
    history: [{ pedidos: pedidosAcumulados, restaurante_nombre: restaurante.nombre, restaurante_tel: fromPhone, timestamp: Date.now() }],
    updated_at: new Date().toISOString()
  })

  // Limpieza de memoria
  await guardarEstado(supabase, memKey, { ...ESTADO_IDLE })
  // Bug #2 Fix: validar que adminPhone sea un número WA válido (mín. 12 dígitos con prefijo 52)
  const adminPhoneValido = adminPhone && adminPhone.replace(/\D/g, '').length >= 12
  if (adminPhoneValido) {
    await sendWA(adminPhone, adminMsg)
  } else {
    console.error('[PORTAL] ADMIN_PHONES no configurado o inválido — pedidos NO notificados al admin')
    await sendWA(fromPhone, `⚠️ *Error interno*: no se pudo notificar al administrador automáticamente.\nPor favor, contacta directamente a tu coordinador.`)
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PUNTO DE ENTRADA PRINCIPAL — llamado desde index.ts
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
  // Bug #1 Fix: filtrar activo=true y limitar a 200 para evitar full table scan en cada webhook
  const { data: todosRest, error: dbErr } = await supabase
    .from('restaurantes')
    .select('id, nombre, telefono, activo')
    .eq('activo', true)
    .limit(200)

  if (dbErr) {
    console.error('[RESTAURANT PORTAL] DB Error:', dbErr)
    logError('whatsapp-bot', '[RESTAURANT DB ERROR]', { error: String(dbErr), fromPhone }, 'error').catch(() => {});
    if (from10 === admin10) await sendWA(fromPhone, `⚠️️ Error DB Portal: ${dbErr.message}`)
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

  // ── Idempotencia de webhook (previa al debounce) ──
  // Solo verificamos si el msgId ya fue procesado exitosamente antes.
  // No persistimos la clave aquí todavía — la persistimos después del debounce
  // para evitar que un duplicado marque el mensaje como procesado antes de tiempo.
  if (msgId && estado.idempotency_keys?.includes(msgId)) {
    console.log(`[RESTAURANT PORTAL] Ignorando webhook duplicado: ${msgId}`)
    return new Response('OK', { status: 200 })
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
          await sendWA(fromPhone, `⚠️️ Tuvimos un error o ya se enviaron los pedidos. La bandeja está vacía.`)
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

    // También permitimos recibir la ubicación mientras el restaurante confirma el pedido.
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
    await sendWA(fromPhone, `🤖 Hola *${restaurante.nombre}* 👋\nPor favor envíame la información en *texto* (teléfono, qué lleva, a dónde). âœ️`)
    return new Response('OK', { status: 200 })
  }

  let textoRest = (msg.text?.body as string || '').trim().substring(0, 2000)
  if (!textoRest) return new Response('OK', { status: 200 })

  // ── DEBOUNCE QUEUE (Agrupar múltiples mensajes rápidos del restaurante) ──
  // Nota: 800ms es suficiente para agrupar ráfagas y deja margen cómodo
  // dentro del timeout de 5s de Meta antes de que reintente el webhook.
  const { data: qData } = await supabase.from('bot_memory').select('history').eq('phone', memKey + '_queue').maybeSingle()
  const currentBuffer = qData?.history?.[0]?.buffer || ''
  const newBuffer = currentBuffer ? currentBuffer + '\n' + textoRest : textoRest
  const queueId = msgId || Date.now().toString()

  await supabase.from('bot_memory').upsert({ phone: memKey + '_queue', history: [{ buffer: newBuffer, last_msg: queueId }], updated_at: new Date().toISOString() })

  // 800ms de espera — dentro del margen seguro ante reintentos de Meta
  await new Promise(r => setTimeout(r, 800))

  // Verificamos si otro webhook llegó mientras dormíamos
  const { data: fData } = await supabase.from('bot_memory').select('history').eq('phone', memKey + '_queue').maybeSingle()
  if (fData?.history?.[0]?.last_msg !== queueId) {
    // Otro mensaje más reciente tomó el control — no respondemos para evitar duplicados
    console.log(`[RESTAURANT PORTAL] Debounce: mensaje ${queueId} cedido al siguiente.`)
    return new Response('OK', { status: 200 })
  }

  // Somos el último. Persistimos la clave idempotente AHORA que sabemos que vamos a procesar.
  if (msgId) {
    estado.idempotency_keys = [msgId, ...(estado.idempotency_keys || [])].slice(0, 10)
    await guardarEstado(supabase, memKey, estado)
  }

  // Limpiamos la queue y procesamos el buffer completo
  await supabase.from('bot_memory').upsert({ phone: memKey + '_queue', history: [{ buffer: '', last_msg: '' }], updated_at: new Date().toISOString() })
  textoRest = newBuffer

  const telefonosEnTexto = extraerTelefonos(textoRest)
  const textoBajo = textoRest.toLowerCase()
  const esReinicio = /reinicia(r)?|reset|cancela(r)?|borrar todo|empe(z|c)ar/i.test(textoBajo)
  // Verificamos si alguna línea del mensaje indica que el pedido está listo.
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

  // Si el restaurante tiene un pedido pendiente de confirmación, no procesamos nuevos mensajes como pedidos.
  if (estado.phase === 'waiting_confirmation') {
    if (esListo) {
      // El restaurante escribió "confirmar" / "listo" en lugar de pulsar el botón
      if (estado.pedidos_acumulados && estado.pedidos_acumulados.length > 0) {
        await notificarAdmin(ctx, sendWA, memKey, estado.pedidos_acumulados)
      } else {
        await sendWA(fromPhone, `⚠️️ No hay pedidos en espera. Empieza uno nuevo enviando el teléfono del cliente.`)
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

  // LLAMADA IA (sin cálculo de zonas ni distancias — solo captura y asignación)
  const aiResult = await llamarDeepSeek(supabase, DSKEY, restaurante, estado, telefonosEnTexto, textoRest)
  if (!aiResult) return await manejarFallback(ctx, sendWA, memKey, estado, telefonosEnTexto, textoRest)

  const aiPedidoActual = aiResult.pedido_actual_actualizado || {}
  const aiCompleto = aiResult.pedido_actual_completo === true
  const nuevosDetect = aiResult.nuevos_pedidos_detectados || []
  const msgRest = aiResult.mensaje_para_restaurante || 'Entendido.'
  const totalEsperados = aiResult.total_pedidos_esperados ?? estado.total_esperados ?? 0
  const intencion = aiResult.intencion || 'dar_datos'

  // Si la intención es borrar un pedido
  if (intencion === 'borrar_pedido') {
    const rawTelBorrar = aiResult.telefono_a_borrar || (telefonosEnTexto.length > 0 ? telefonosEnTexto[0] : null)
    
    // Si no hay teléfono explícito para borrar pero el usuario dice "borra el último", podemos inferirlo de la bandeja.
    // La IA a veces no logra mapear si el usuario dice "el último", así que hacemos un fallback lógico.
    let telBorrar = rawTelBorrar ? rawTelBorrar.replace(/\D/g, '').slice(-10) : null
    
    if (!telBorrar && (textoBajo.includes('ultimo') || textoBajo.includes('último'))) {
       if (estado.pedidos_acumulados?.length > 0) {
         telBorrar = estado.pedidos_acumulados[estado.pedidos_acumulados.length - 1].clienteTel
       } else if (estado.pedido_actual?.clienteTel) {
         telBorrar = estado.pedido_actual.clienteTel
       }
    }

    if (telBorrar) {
      const nuevosAcumulados = (estado.pedidos_acumulados || []).filter(p => p.clienteTel !== telBorrar)
      const estabaEnActual = estado.pedido_actual?.clienteTel === telBorrar
      const nuevoPedidoActual = estabaEnActual ? {} : estado.pedido_actual
      
      const eliminados = (estado.pedidos_acumulados?.length || 0) - nuevosAcumulados.length + (estabaEnActual ? 1 : 0)
      
      await guardarEstado(supabase, memKey, { ...estado, phase: (estado.phase === 'waiting_confirmation' && nuevosAcumulados.length === 0) ? 'idle' : estado.phase, pedidos_acumulados: nuevosAcumulados, pedido_actual: nuevoPedidoActual })
      
      let resDel = eliminados > 0 ? `🗑️ Pedido para *${telBorrar}* eliminado correctamente de la bandeja.` : `⚠️️ No encontré ningún pedido para *${telBorrar}* en la bandeja.`
      if (nuevosAcumulados.length > 0 && eliminados > 0) {
         resDel += `\nLlevamos ${nuevosAcumulados.length} pedidos. ¿Algo más o ya mandas *"confirmar"*?`
      }
      await sendWA(fromPhone, resDel)
      return new Response('OK', { status: 200 })
    } else {
      await sendWA(fromPhone, `🤔 No logré identificar qué pedido quieres borrar. Por favor escribe "borrar el del 963..." con el número del cliente.`)
      return new Response('OK', { status: 200 })
    }
  }

  const pedidoActualFinal: Pedido = {
    clienteTel: (aiPedidoActual.clienteTel || estado.pedido_actual?.clienteTel || '')?.replace(/\D/g, '').slice(-10) || null,
    descripcion: aiPedidoActual.descripcion || estado.pedido_actual?.descripcion || null,
    direccion: aiPedidoActual.direccion || estado.pedido_actual?.direccion || null,
    tiempo_estimado: aiPedidoActual.tiempo_estimado || estado.pedido_actual?.tiempo_estimado || null,
    precio: aiPedidoActual.precio || estado.pedido_actual?.precio || null,
    lat: estado.pedido_actual?.lat,
    lng: estado.pedido_actual?.lng
  }

  // tiempo_estimado es OPCIONAL — no bloquea el pedido. El admin lo confirma si falta.
  const pedidoActualEstaCompleto = aiCompleto || (
    (pedidoActualFinal.clienteTel?.length ?? 0) >= 10 &&
    !!pedidoActualFinal.descripcion?.trim() &&
    !!pedidoActualFinal.direccion?.trim()
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

  if (!haySuficientes) {
    let nuevaFase = estado.phase
    let replyMsg = `🤖 *${restaurante.nombre}* | ${msgRest}`

    if (!pedidoActualEstaCompleto || nuevosIncompletos.length > 0) {
      if (!pedidoActualFinal.clienteTel) nuevaFase = 'collecting_phone'
      else if (!pedidoActualFinal.descripcion) nuevaFase = 'collecting_desc'
      else if (!pedidoActualFinal.direccion) nuevaFase = 'collecting_dir'
      // Bug #3 Fix: tiempo_estimado es OPCIONAL — eliminado collecting_time para no bloquear pedidos
      else nuevaFase = 'collecting_extras'
    } else {
      nuevaFase = 'idle'
      replyMsg = `✅ ¡Anotado el pedido para ${pedidoActualFinal.clienteTel}!\nLlevamos ${pedidosListos} pedido(s) en la bandeja.\n`
      if (totalEsperados > 0) {
        replyMsg += `Faltan ${totalEsperados - pedidosListos} para la meta de ${totalEsperados}. Envíame el siguiente.`
      } else {
        replyMsg += `Si eso es todo, responde *"listo"* para solicitar el mensajero. O pásame el siguiente pedido.`
      }
    }

    await guardarEstado(supabase, memKey, { phase: nuevaFase, pedidos_acumulados: pedidosAcumulados, pedido_actual: (!pedidoActualEstaCompleto || nuevosIncompletos.length > 0) ? pedidoActualFinal : {}, total_esperados: totalEsperados || estado.total_esperados, sesion_inicio: estado.sesion_inicio ?? Date.now(), idempotency_keys: estado.idempotency_keys })
    
    // Especial para "listo" sin pedidos
    if (pedidosAcumulados.length === 0 && (esListo || intencion === 'confirmar')) {
       replyMsg = `⚠️️ *${restaurante.nombre}*, me dices "listo" pero no tengo ningún pedido completo aún. Necesito *teléfono*, *indicaciones* y *dirección*.`
    } else if (!pedidoActualEstaCompleto && pedidosAcumulados.length > 0) {
       replyMsg += `\n\n_(✅ Anotados completos: ${pedidosAcumulados.length})_`
    }

    await sendWA(fromPhone, replyMsg)
    return new Response('OK', { status: 200 })
  }

  // Llegando aquí, haySuficientes = true
  if (pedidosAcumulados.length === 0) {
    await sendWA(fromPhone, `⚠️️ Ha ocurrido un error extraño. No hay pedidos para confirmar.`)
    await guardarEstado(supabase, memKey, { ...estado, idempotency_keys: estado.idempotency_keys })
    return new Response('OK', { status: 200 })
  }

  // 📝 BURÓ DE CLIENTES: Verificar reputación antes de mostrar resumen
  let bloqueadoPorVeto = false
  let alertasReputacion = ""
  
  for (const p of pedidosAcumulados) {
    if (p.clienteTel) {
      const { data: cliRep } = await supabase.from('clientes').select('reputacion, etiquetas').in('telefono', [p.clienteTel]).maybeSingle()
      if (cliRep) {
        if (cliRep.reputacion === 'vetado') {
          bloqueadoPorVeto = true
          p.es_vetado = true
          alertasReputacion += `🔴 *SERVICIO RESTRINGIDO:* ${p.clienteTel}\nMotivo: Incidencias de seguridad críticas registradas.\n`
        } else if (cliRep.reputacion === 'malo') {
          alertasReputacion += `🚨 *ALERTA:* Historial de incidencias alto (${p.clienteTel})\n🏷️ Detalle: ${cliRep.etiquetas?.join(', ') || 'revisar historial'}\n`
        } else if (cliRep.reputacion === 'regular') {
          alertasReputacion += `⚠️️ *AVISO:* Historial de incidencias moderado (${p.clienteTel})\n`
        } else if (cliRep.reputacion === 'excelente') {
          alertasReputacion += `⭐ *CLIENTE VIP:* ${p.clienteTel} (Excelente historial de servicio)\n`
        }
      }
    }
  }

  // Filtramos los pedidos de clientes vetados usando la bandera lógica
  if (bloqueadoPorVeto) {
    pedidosAcumulados = pedidosAcumulados.filter(p => !p.es_vetado)
    
    if (pedidosAcumulados.length === 0) {
      await sendWA(fromPhone, `🔴 *PEDIDOS NO PROCESABLES*\n\n${alertasReputacion}\nPor seguridad del personal, todos los números en esta lista tienen el servicio restringido.`)
      await guardarEstado(supabase, memKey, { ...ESTADO_IDLE, idempotency_keys: estado.idempotency_keys })
      return new Response('OK', { status: 200 })
    } else {
      alertasReputacion += `\n⚠️️ *Los pedidos restringidos fueron eliminados de la bandeja automáticamente.*\n\n`
    }
  }

  let resumenMsg = `📝 *RESUMEN DEL ENVÍO*\n\n`
  if (alertasReputacion) resumenMsg = `ℹ️ *NOTAS DE REPUTACIÓN:*\n${alertasReputacion}\n` + resumenMsg

  pedidosAcumulados.forEach((p, i) => {
     resumenMsg += `🔹 *Pedido ${i + 1}*\n`
     resumenMsg += `📞 Tel: ${p.clienteTel}\n📍 Dir: ${p.direccion}\n`
     if (p.descripcion && p.descripcion !== 'nada') resumenMsg += `📦 Notas: ${p.descripcion}\n`
     // Precio desactivado: el admin asigna el cobro manualmente
     resumenMsg += `\n`
  })

  // Guardamos el estado actual
  await guardarEstado(supabase, memKey, { phase: 'waiting_confirmation', pedidos_acumulados: pedidosAcumulados, pedido_actual: {}, total_esperados: totalEsperados || estado.total_esperados, sesion_inicio: estado.sesion_inicio ?? Date.now(), idempotency_keys: estado.idempotency_keys })

  // Ajustamos el mensaje del botón al límite de 1024 caracteres de la API de Meta.
  // Si supera el límite, enviamos el resumen completo por texto plano y luego el botón en un 2do mensaje corto.
  const footerBtn = `¿Deseas solicitar el mensajero ahora?\n_(Escribe "cancelar" si deseas reiniciar)_`
  const fullMsg = resumenMsg + footerBtn
  const WA_INTERACTIVE_LIMIT = 1024

  if (sendInteractiveButton) {
    if (fullMsg.length <= WA_INTERACTIVE_LIMIT) {
      await sendInteractiveButton(fromPhone, fullMsg, `CONFIRMAR_PEDIDOS_REST`, `✅ Solicitar`)
    } else {
      // Resumen demasiado largo: texto plano primero, luego botón con mensaje corto
      await sendWA(fromPhone, resumenMsg)
      await sendInteractiveButton(fromPhone, `¿Confirmas el envío de los ${pedidosAcumulados.length} pedido(s) listados arriba?`, `CONFIRMAR_PEDIDOS_REST`, `✅ Solicitar`)
    }
  } else {
    await sendWA(fromPhone, (resumenMsg + `\n🔹 Escribe *"confirmar"* para solicitar al mensajero, o *"cancelar"* para reiniciar.`).substring(0, 4096))
  }

  return new Response('OK', { status: 200 })
}


