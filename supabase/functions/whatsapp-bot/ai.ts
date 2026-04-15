// ══════════════════════════════════════════════════════════════════════════════
// ai.ts — Motor de DeepSeek R1: prompts, interfaces y validación
// ══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extract10Digits, PedidoData } from './db.ts'

type SupabaseClient = ReturnType<typeof createClient>

// ── Interfaz de respuesta de la IA ────────────────────────────────────────────
export interface AIRespuesta {
  accion:
  | 'CREAR_PEDIDO' | 'RESPONDER' | 'SUMAR_PUNTOS' | 'CONSULTA_GENERAL'
  | 'VER_VIPS' | 'VER_PEDIDOS' | 'ESTADISTICAS' | 'BUSCAR_CLIENTE'
  | 'VER_REPARTIDORES' | 'CANCELAR_PEDIDO' | 'REASIGNAR_PEDIDO'
  | 'AGREGAR_NOTA_CLIENTE' | 'REPORTE_SEMANAL' | 'MARCAR_VIP'
  | 'VER_HISTORIAL_CLIENTE' | 'RECORDATORIO_REPARTIDOR' | 'REVISAR_ENTREGADOS'
  | 'AGREGAR_REPARTIDOR' | 'ELIMINAR_REPARTIDOR' | 'ESTADO_REPARTIDOR'
  | 'VER_ATRASOS' | 'CARGAR_SALDO' | 'ANUNCIO_REPARTIDORES' | 'UBICACION_RESTAURANTE'
  | 'ENTREGAR_TODOS' | 'CANCELAR_TODOS' | 'ENVIAR_QR' | 'VER_RESTAURANTES' | 'AGREGAR_CLIENTE'
  mensajeUsuario: string
  datosAExtraer?: PedidoData & { montoSaldo?: number, diasAtras?: number, clienteNombre?: string, colonia?: string }
}

const VALID_ACTIONS: AIRespuesta['accion'][] = [
  'CREAR_PEDIDO', 'RESPONDER', 'SUMAR_PUNTOS', 'CONSULTA_GENERAL',
  'VER_VIPS', 'VER_PEDIDOS', 'ESTADISTICAS', 'BUSCAR_CLIENTE',
  'VER_REPARTIDORES', 'CANCELAR_PEDIDO', 'REASIGNAR_PEDIDO',
  'AGREGAR_NOTA_CLIENTE', 'REPORTE_SEMANAL', 'MARCAR_VIP',
  'VER_HISTORIAL_CLIENTE', 'RECORDATORIO_REPARTIDOR', 'REVISAR_ENTREGADOS',
  'AGREGAR_REPARTIDOR', 'ELIMINAR_REPARTIDOR', 'ESTADO_REPARTIDOR',
  'VER_ATRASOS', 'CARGAR_SALDO', 'ANUNCIO_REPARTIDORES', 'UBICACION_RESTAURANTE',
  'ENTREGAR_TODOS', 'CANCELAR_TODOS', 'ENVIAR_QR', 'VER_RESTAURANTES', 'AGREGAR_CLIENTE',
]

// ── System prompts ────────────────────────────────────────────────────────────
function buildAdminPrompt(): string {
  return `Eres el "Asistente Virtual de Estrella Delivery". Tu usuario es el Administrador de la plataforma.
Eres una Inteligencia Artificial profesional, proactiva y altamente eficiente diseñada para asistir en la gestión logística y administrativa de la empresa.

⚠️ REGLA ABSOLUTA — FORMATO DE SALIDA:
Tu respuesta COMPLETA debe ser ÚNICAMENTE un objeto JSON válido. Sin texto antes ni después. Sin bloques de código markdown. Sin explicaciones fuera del JSON.
Si necesitas pedir aclaración, usa accion "RESPONDER" y escribe tu pregunta en "mensajeUsuario". NUNCA respondas en texto plano.

REGLAS DEL ASISTENTE:
1. CORTESÍA: Respuestas directas y profesionales. No uses "Comandante" ni jergas militares.
2. TELÉFONO OBLIGATORIO: NUNCA ejecutes CREAR_PEDIDO o SUMAR_PUNTOS sin teléfono del cliente (10 dígitos). Si falta, usa RESPONDER para pedirlo.
3. STAFF vs CLIENTE: Distingue entre clientes y repartidores.
4. NO ALUCINES: NUNCA inventes nombres, teléfonos o estados. El handler consulta la BD real.
5. FORMULARIO DE REGISTRO: Si piden "agregar cliente" sin datos, usa RESPONDER con mensajeUsuario:
"📝 *NUEVO CLIENTE / LEALTAD*\n👤 Nombre: \n📞 Teléfono: \n🌟 Puntos: 0"

HERRAMIENTAS DISPONIBLES:
- CREAR_PEDIDO: Requiere restaurante, clienteTel, descripcion.
- SUMAR_PUNTOS: Requiere clienteTel, puntosASumar.
- BUSCAR_CLIENTE: Requiere clienteTel.
- CANCELAR_PEDIDO: Requiere clienteTel.
- RECORDATORIO_REPARTIDOR: Requiere repartidorAlias, descripcion.
- ESTADO_REPARTIDOR: Requiere repartidorAlias.
- AGREGAR_REPARTIDOR / ELIMINAR_REPARTIDOR: Requiere nombre/teléfono o alias.
- AGREGAR_CLIENTE: Requiere clienteNombre, clienteTel.
- CARGAR_SALDO: Requiere clienteTel, montoSaldo.
- UBICACION_RESTAURANTE: Requiere restaurante.
- ANUNCIO_REPARTIDORES: Requiere descripcion.
- REVISAR_ENTREGADOS: diasAtras (0=hoy, 1=ayer, N=hace N días).
- VER_RESTAURANTES, VER_REPARTIDORES, VER_VIPS, VER_PEDIDOS, ESTADISTICAS, REPORTE_SEMANAL, VER_ATRASOS.
- ENTREGAR_TODOS / CANCELAR_TODOS.
- ENVIAR_QR: Requiere clienteTel. Manda tarjeta de lealtad al cliente.
- REASIGNAR_PEDIDO: Requiere clienteTel, repartidorAlias.
- AGREGAR_NOTA_CLIENTE: Requiere clienteTel, descripcion.
- MARCAR_VIP: Requiere clienteTel.
- VER_HISTORIAL_CLIENTE: Requiere clienteTel.
- RESPONDER: Para charlar, confirmar, o pedir datos faltantes.

FORMATO JSON DE SALIDA (responde SOLO con esto, sin nada más):
{"accion":"UNA_ACCION_LISTADA","mensajeUsuario":"Texto breve y profesional.","datosAExtraer":{"clienteTel":"10 dígitos o null","puntosASumar":null,"diasAtras":null,"clienteNombre":null,"restaurante":null,"descripcion":null,"direccion":null,"repartidorAlias":null,"montoSaldo":null}}`
}

function buildRepartidorPrompt(repartidorInfo: any): string {
  return `Eres el asistente de Estrella Delivery exclusivo para el Repartidor: ${repartidorInfo?.nombre || 'de nuestro equipo'}.
Estás en MODO LIMITADO. Tienes estrictamente prohibido crear pedidos o reasignarlos.
Tus ÚNICAS herramientas permitidas son:
- UBICACION_RESTAURANTE: Buscar y enviar el mapa de un restaurante. Extrae cualquier nombre o indicio mencionado en "restaurante".
- RESPONDER: Para confirmar recepción, chatear o responder un saludo.

Reglas Estrictas: 
1. PROACTIVIDAD.
2. NUNCA le digas "Jefe". Llámalo por su nombre "${repartidorInfo?.nombre}". Ni uses jergas militares.
3. Si el repartidor indica texto normal ("Ya voy", "Voy retrasado", "Sale", "Gracias", etc), simplemente usa RESPONDER, reconoce el mensaje y sé breve: "Entendido, buen camino." o similar. No le pidas teléfonos ni nada si no está cobrando puntos.

SALIDA ESTRICTA (Únicamente un objeto JSON):
{
  "accion": "RESPONDER" | "ESTADO_REPARTIDOR" | "BUSCAR_CLIENTE" | "SUMAR_PUNTOS" | "UBICACION_RESTAURANTE",
  "mensajeUsuario": "Tu respuesta al repartidor.",
  "datosAExtraer": {
    "clienteTel": "10 dígitos o null",
    "puntosASumar": numero_entero o null,
    "descripcion": "Motivo de puntos o null",
    "restaurante": "Nombre del restaurante a buscar o null",
    "repartidorAlias": "${repartidorInfo?.alias || ''}"
  }
}`
}

// ── Enforcement Validator (firewall contra alucinaciones del modelo) ───────────
function enforcerValidator(respuesta: AIRespuesta): AIRespuesta {
  const d: Record<string, any> = respuesta.datosAExtraer || {}

  // Sanitización
  if (d.clienteTel) {
    const num = String(d.clienteTel).replace(/\D/g, '')
    d.clienteTel = num.length >= 10 ? num.slice(-10) : undefined
  }
  if (d.puntosASumar != null) d.puntosASumar = parseInt(String(d.puntosASumar), 10)
  if (d.montoSaldo != null) d.montoSaldo = parseInt(String(d.montoSaldo), 10)

  let blocked = false
  switch (respuesta.accion) {
    case 'CREAR_PEDIDO':
      if (!d.clienteTel || d.clienteTel.length !== 10) { blocked = true; respuesta.mensajeUsuario = 'Necesito el número de teléfono del cliente a 10 dígitos para crear un pedido.' }
      else if (!d.descripcion?.trim()) { blocked = true; respuesta.mensajeUsuario = 'Necesito saber exactamente qué productos quiere en el pedido.' }
      break
    case 'SUMAR_PUNTOS': case 'BUSCAR_CLIENTE': case 'VER_HISTORIAL_CLIENTE':
    case 'MARCAR_VIP': case 'CANCELAR_PEDIDO': case 'AGREGAR_NOTA_CLIENTE':
      if (!d.clienteTel || d.clienteTel.length !== 10) { blocked = true; respuesta.mensajeUsuario = 'Faltan los 10 dígitos del teléfono del cliente para ejecutar eso.' }
      break
    case 'CARGAR_SALDO':
      if (!d.clienteTel || d.clienteTel.length !== 10 || isNaN(d.montoSaldo)) { blocked = true; respuesta.mensajeUsuario = 'Para recargar necesito los 10 dígitos del cliente y el monto numérico exacto.' }
      break
    case 'ELIMINAR_REPARTIDOR': case 'ESTADO_REPARTIDOR': case 'RECORDATORIO_REPARTIDOR':
      if (!d.repartidorAlias) { blocked = true; respuesta.mensajeUsuario = 'Necesito el nombre del repartidor para ejecutar esa acción específica.' }
      break
    case 'ANUNCIO_REPARTIDORES':
      if (!d.descripcion) { blocked = true; respuesta.mensajeUsuario = 'Por favor indique cuál es el mensaje que desea enviar a todos los repartidores.' }
      break
    case 'REASIGNAR_PEDIDO':
      if (!d.clienteTel || d.clienteTel.length !== 10 || !d.repartidorAlias) { blocked = true; respuesta.mensajeUsuario = 'Para reasignar, proporcione los 10 dígitos del cliente y el nombre del nuevo repartidor.' }
      break
    case 'AGREGAR_REPARTIDOR':
      if (!d.clienteNombre || !d.clienteTel || d.clienteTel.length !== 10) { blocked = true; respuesta.mensajeUsuario = 'Para registrar personal, necesito el nombre y su número a 10 dígitos obligatoriamente.' }
      break
  }

  if (blocked) {
    console.warn(`🛡️ Enforcement Validator interceptó '${respuesta.accion}' por falta de datos.`)
    respuesta.accion = 'RESPONDER'
  }
  return respuesta
}

// ── Llamar a DeepSeek R1 ──────────────────────────────────────────────────────
export async function conversacionDeepSeek(
  supabase: SupabaseClient,
  phone: string,
  nuevoTexto: string,
  isRepartidor = false,
  repartidorInfo: any = null,
): Promise<{ respuesta?: AIRespuesta; nuevoHistorial?: any[]; errorObj?: string } | null> {
  try {
    const memPhone = extract10Digits(phone)
    const { data: mem } = await supabase.from('bot_memory').select('history').eq('phone', memPhone).maybeSingle()
    const historia = mem?.history || []

    const systemInstruction = isRepartidor
      ? buildRepartidorPrompt(repartidorInfo)
      : buildAdminPrompt()

    const formattedHistory = historia
      .filter((h: any) => h.content && String(h.content).trim().length > 0)
      .map((h: any) => ({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: String(h.content).trim(),
      }))

    const messages = [
      { role: 'system', content: systemInstruction },
      ...formattedHistory,
      { role: 'user', content: String(nuevoTexto).substring(0, 500) },
    ]

    const API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

    // Separar system del historial (Claude usa system como parámetro top-level)
    const systemMsg = messages.find((m: any) => m.role === 'system')?.content || ''
    const chatMessages = messages.filter((m: any) => m.role !== 'system')

    const callClaude = async (): Promise<Response> => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 25000)
      try {
        return await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 512,
            system: systemMsg,
            messages: chatMessages,
          }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }
    }

    let res: Response
    try {
      res = await callClaude()
      if (res.status >= 500 && res.status < 600) {
        console.warn(`⚠️ Claude API ${res.status}, reintentando en 2s...`)
        await new Promise(r => setTimeout(r, 2000))
        res = await callClaude()
      }
    } catch (fetchErr: any) {
      const isTimeout = fetchErr?.name === 'AbortError'
      console.error(isTimeout ? '⏱️ Timeout 25s alcanzado' : '🌐 Fetch error:', String(fetchErr))
      return { errorObj: isTimeout ? 'Claude no respondió en 25s. Intente de nuevo.' : String(fetchErr) }
    }

    if (!res.ok) {
      const errText = await res.text()
      console.error('Claude API Error:', errText)
      return { errorObj: `HTTP ${res.status} - ${errText}` }
    }

    const data = await res.json()
    console.log(`🤖 [Claude] Tokens usados — input: ${data.usage?.input_tokens} | output: ${data.usage?.output_tokens}`)

    let rawContent = (data.content?.[0]?.text || '{}').trim()

    let cleanJSON = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    const fb = cleanJSON.indexOf('{'), lb = cleanJSON.lastIndexOf('}')
    if (fb !== -1 && lb !== -1) cleanJSON = cleanJSON.substring(fb, lb + 1)

    let respuesta: AIRespuesta
    try {
      const parsed = JSON.parse(cleanJSON)
      if (!parsed.accion || !VALID_ACTIONS.includes(parsed.accion)) throw new Error(`Acción inválida: "${parsed.accion}"`)
      respuesta = parsed as AIRespuesta
    } catch {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed2 = JSON.parse(jsonMatch[0])
          if (parsed2.accion && VALID_ACTIONS.includes(parsed2.accion)) {
            respuesta = parsed2 as AIRespuesta
            console.warn('⚠️ JSON recuperado via regex fallback.')
          } else throw new Error('Acción inválida en fallback')
        } catch {
          console.error('❌ JSON no rescatable. Raw:', rawContent.slice(0, 500))
          respuesta = { accion: 'RESPONDER', mensajeUsuario: 'Disculpe, fallo de conexión con el núcleo de I.A. ¿Podría repetirlo de otra forma?' }
        }
      } else {
        console.error('❌ Sin JSON en respuesta. Raw:', rawContent.slice(0, 500))
        respuesta = { accion: 'RESPONDER', mensajeUsuario: 'Perdone la interrupción, pero los servidores de Inteligencia están saturados (Respuesta no legible). Reintente en un momento, por favor.' }
      }
    }

    respuesta = enforcerValidator(respuesta)

    const nuevoHistorial = [
      ...historia.slice(-6),
      { role: 'user', content: String(nuevoTexto).substring(0, 300) },
      ...(respuesta.mensajeUsuario?.trim() ? [{ role: 'model', content: respuesta.mensajeUsuario.trim().substring(0, 300) }] : []),
    ]

    return { respuesta, nuevoHistorial }
  } catch (e) {
    console.error('DeepSeek error root:', e instanceof Error ? e.message : String(e))
    return { errorObj: `Runtime Error: ${e instanceof Error ? e.message : String(e)}` }
  }
}
