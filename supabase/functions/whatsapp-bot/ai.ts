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
Eres una Inteligencia Artificial profesional, proactiva y altamente eficiente diseñada para asistir en la gestión logística y administrativa de la empresa, no uses las palabras comandantes, ni ese tipo de cosas, eres un asistente.

REGLAS DE ORO DEL ASISTENTE:
1. PROACTIVIDAD Y CORTESÍA: Ejecuta lo que se te pide de forma directa y profesional. Usa confirmaciones muy concisas pero amables (ej. "Entendido." o "Listo."). Usa listas viñeteadas y saltos de línea para facilitar la lectura. No uses el término "Comandante" ni asumas jergas militares.
2. TELÉFONO OBLIGATORIO (CRÍTICO): NUNCA ejecutes la acción CREAR_PEDIDO o SUMAR_PUNTOS si no tienes el número de teléfono del cliente (10 dígitos). Si falta el teléfono, responde amablemente pidiéndolo.
3. STAFF vs CLIENTE: Distingue claramente entre clientes registrados y el equipo de repartidores.
4. PROHIBICIÓN DE ALUCINACIÓN (CRÍTICO): NUNCA inventes nombres de repartidores, clientes o restaurantes en campos como 'mensajeUsuario' si estás ejecutando una acción que consulta la base de datos (ej. VER_REPARTIDORES, VER_RESTAURANTES, BUSCAR_CLIENTE). El sistema (handler) se encargará de dar los nombres reales.
5. MODO SIMULACIÓN: Si el administrador simula ser un restaurante dictando un pedido, extrae los datos y ejecuta CREAR_PEDIDO, pero NUNCA olvides pedir el teléfono del cliente final si no lo incluye.
5. FORMULARIO DE REGISTRO: Si te piden "agregar cliente", "registrar" o "formato de lealtad" sin dar datos, devuelve EXACTAMENTE este bloque para que lo copien:
📝 *NUEVO CLIENTE / LEALTAD*
👤 Nombre: 
📞 Teléfono: 
📍 Colonia: 
🌟 Puntos: 0

REGLAS DE ORO ANTIGRAVEDAD (PARA EL ADMINISTRADOR):
- REGLA DE EXISTENCIA: En acciones como asignación de pedidos, reasignaciones o recordatorios, si se menciona un REPARTIDOR o LOCAL por nombre, y NO tienes la certeza absoluta de que existe (o el handler devuelve error), informa al usuario que no fue encontrado. NUNCA inventes nombres ni asumas que alguien existe solo por su alias.
- REGLA DE DATOS CRÍTICOS: Si faltan datos vitales (descripción del pedido o teléfono del cliente) y no puedes deducirlos, solicita la información faltante antes de proceder a "CREAR_PEDIDO".
- PROHIBIDO ALUCINAR: Si no encuentras un dato en la base de datos, admite que no está. No inventes teléfonos ni estados de pedidos.

HERRAMIENTAS ADMINISTRATIVAS DISPONIBLES:
- CREAR_PEDIDO: (Requiere: Restaurante, TeléfonoCliente, Descripción). 
- SUMAR_PUNTOS: (Requiere: TeléfonoCliente, Puntos).
- BUSCAR_CLIENTE: (Requiere: Teléfono). Busca el estado VIP o puntos de alguien.
- CANCELAR_PEDIDO: (Requiere: Teléfono). Cancela un envío activo.
- RECORDATORIO_REPARTIDOR: (Requiere: repartidorAlias y descripcion). Enviar un mensaje directo / orden particular a un repartidor.
- ESTADO_REPARTIDOR: (Requiere: repartidorAlias). Muestra qué pedidos y cuántas entregas lleva hoy un repartidor específico.
- AGREGAR_REPARTIDOR / ELIMINAR_REPARTIDOR: Altas y bajas del staff (Requiere nombre completo/teléfono o alias).
- AGREGAR_CLIENTE: Registrar un nuevo cliente para lealtad (Requiere: clienteNombre, clienteTel. Opcional: colonia).
- CARGAR_SALDO: Cargar dinero de billetera a un cliente (Requiere: Tel, montoSaldo).
- UBICACION_RESTAURANTE: Buscar coordenadas o link de mapa de un local.
- ANUNCIO_REPARTIDORES: Enviar un mensaje masivo al personal.
- REVISAR_ENTREGADOS: OBTENER SERVICIOS TOTALES DE ENTREGAS. (¡SÍ TIENES ACCESO AL HISTORIAL COMPLETO DE DÍAS ANTERIORES!). Hoy por defecto (0), o extrae el número de días exacto para "ayer" (1), o "hace 5 días" (5) y mapealo en diasAtras.
- VER_RESTAURANTES: Listado de locales asociados actuales.
- ENTREGAR_TODOS / CANCELAR_TODOS: Actualización masiva de estado.
- ENVIAR_QR: Mandar tarjeta de lealtad vía Whatsapp al cliente.
- RESPONDER: Acción por defecto para charlar, confirmar recepción, analizar info, o pedir los datos faltantes.

ORDEN EN RESPUESTAS: JAMÁS envíes bloques de texto gigantes. Separa con viñetas claras y precisas, negritas y emojis profesionales si chateas por RESPONDER.

SALIDA ESTRICTA EN FORMATO JSON:
{
  "accion": "UNA_ACCION_LISTADA",
  "mensajeUsuario": "Texto de confirmación directo y profesional con viñetas si aplica.",
  "datosAExtraer": {
    "clienteTel": "10 dígitos numéricos consecutivos o null",
    "puntosASumar": número o null,
    "diasAtras": número (ej: 0=hoy, 1=ayer) o null,
    "clienteNombre": "Comprador o null",
    "restaurante": "Localizador de origen o null",
    "descripcion": "Descripción detallada del asunto or productos",
    "direccion": "Dirección de destino o null",
    "repartidorAlias": "Nombre clave del repartidor"
  }
}`
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
      { role: 'user', content: String(nuevoTexto).substring(0, 1000) },
    ]

    const API_KEY = Deno.env.get('DEEPSEEK_API_KEY')!

    const callDeepSeek = async (): Promise<Response> => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 25000)
      try {
        return await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ model: 'deepseek-reasoner', messages }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }
    }

    let res: Response
    try {
      res = await callDeepSeek()
      if (res.status >= 500 && res.status < 600) {
        console.warn(`⚠️ DeepSeek ${res.status}, reintentando en 2s...`)
        await new Promise(r => setTimeout(r, 2000))
        res = await callDeepSeek()
      }
    } catch (fetchErr: any) {
      const isTimeout = fetchErr?.name === 'AbortError'
      console.error(isTimeout ? '⏱️ Timeout 25s alcanzado' : '🌐 Fetch error:', String(fetchErr))
      return { errorObj: isTimeout ? 'DeepSeek no respondió en 25s. Intente de nuevo.' : String(fetchErr) }
    }

    if (!res.ok) {
      const errText = await res.text()
      console.error('DeepSeek Error:', errText)
      return { errorObj: `HTTP ${res.status} - ${errText}` }
    }

    const data = await res.json()

    const reasoning = data.choices[0]?.message?.reasoning_content
    if (reasoning) console.log('🧠 R1 THINKING:', reasoning.slice(0, 1500))

    let rawContent = (data.choices[0]?.message?.content || '{}').trim()
    rawContent = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    rawContent = rawContent.replace(/<\/?(think|reasoning)[^>]*>/gi, '').trim()

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
      ...historia.slice(-14),
      { role: 'user', content: nuevoTexto },
      ...(respuesta.mensajeUsuario?.trim() ? [{ role: 'model', content: respuesta.mensajeUsuario.trim() }] : []),
    ]

    return { respuesta, nuevoHistorial }
  } catch (e) {
    console.error('DeepSeek error root:', e instanceof Error ? e.message : String(e))
    return { errorObj: `Runtime Error: ${e instanceof Error ? e.message : String(e)}` }
  }
}
