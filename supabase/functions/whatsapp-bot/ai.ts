// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ai.ts â€” Motor de DeepSeek R1: prompts, interfaces y validaciÃ³n
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extract10Digits, PedidoData, limpiarMemoria } from './db.ts'
import { logError } from '../_shared/utils.ts'

type SupabaseClient = ReturnType<typeof createClient>

// â”€â”€ Interfaz de respuesta de la IA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export interface AIRespuesta {
  accion:
  | 'CREAR_PEDIDO' | 'RESPONDER' | 'SUMAR_PUNTOS' | 'CONSULTA_GENERAL'
  | 'VER_VIPS' | 'VER_PEDIDOS' | 'ESTADISTICAS' | 'BUSCAR_CLIENTE'
  | 'VER_REPARTIDORES' | 'CANCELAR_PEDIDO' | 'REASIGNAR_PEDIDO'
  | 'AGREGAR_NOTA_CLIENTE' | 'REPORTE_SEMANAL' | 'MARCAR_VIP'
  | 'VER_HISTORIAL_CLIENTE' | 'RECORDATORIO_REPARTIDOR' | 'REVISAR_ENTREGADOS'
  | 'AGREGAR_REPARTIDOR' | 'ELIMINAR_REPARTIDOR' | 'ESTADO_REPARTIDOR'
  | 'VER_ATRASOS' | 'CARGAR_SALDO' | 'ANUNCIO_REPARTIDORES' | 'UBICACION_RESTAURANTE'
  | 'ENTREGAR_TODOS' | 'CANCELAR_TODOS' | 'ENVIAR_QR' | 'VER_RESTAURANTES' | 'AGREGAR_CLIENTE' | 'ENVIAR_TERMINOS' | 'REGISTRAR_RESTAURANTE'
  | 'USAR_CUPON' | 'CANCELAR_CUPON' | 'SOLICITAR_REGISTRO' | 'ACTUALIZAR_DIRECCION' | 'CALIFICAR_CLIENTE'
  mensajeUsuario: string
  datosAExtraer?: PedidoData & { montoSaldo?: number, diasAtras?: number, clienteNombre?: string, colonia?: string, nombre_restaurante?: string, correo?: string, codigoCupon?: string, direccion?: string }
}

const VALID_ACTIONS: AIRespuesta['accion'][] = [
  'CREAR_PEDIDO', 'RESPONDER', 'SUMAR_PUNTOS', 'CONSULTA_GENERAL',
  'VER_VIPS', 'VER_PEDIDOS', 'ESTADISTICAS', 'BUSCAR_CLIENTE',
  'VER_REPARTIDORES', 'CANCELAR_PEDIDO', 'REASIGNAR_PEDIDO',
  'AGREGAR_NOTA_CLIENTE', 'REPORTE_SEMANAL', 'MARCAR_VIP',
  'VER_HISTORIAL_CLIENTE', 'RECORDATORIO_REPARTIDOR', 'REVISAR_ENTREGADOS',
  'AGREGAR_REPARTIDOR', 'ELIMINAR_REPARTIDOR', 'ESTADO_REPARTIDOR',
  // Fix: comas separando cada accion (antes usaba | bitwise OR en runtime)
  'VER_ATRASOS', 'CARGAR_SALDO', 'ANUNCIO_REPARTIDORES', 'UBICACION_RESTAURANTE',
  'ENTREGAR_TODOS', 'CANCELAR_TODOS', 'ENVIAR_QR', 'VER_RESTAURANTES',
  'AGREGAR_CLIENTE', 'ENVIAR_TERMINOS', 'REGISTRAR_RESTAURANTE',
  'USAR_CUPON', 'CANCELAR_CUPON', 'SOLICITAR_REGISTRO', 'ACTUALIZAR_DIRECCION', 'CALIFICAR_CLIENTE'
]

// â”€â”€ System prompts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildAdminPrompt(): string {
  return `Eres el "Asistente Virtual de Estrella Delivery". Tu usuario es el Administrador de la plataforma.
Eres una Inteligencia Artificial profesional, proactiva y altamente eficiente diseÃ±ada para asistir en la gestiÃ³n logÃ­stica y administrativa de la empresa.

âš ï¸ REGLA ABSOLUTA â€” FORMATO DE SALIDA:
Tu respuesta COMPLETA debe ser ÃšNICAMENTE un objeto JSON vÃ¡lido. Sin texto antes ni despuÃ©s. Sin bloques de cÃ³digo markdown. Sin explicaciones fuera del JSON.
Si necesitas pedir aclaraciÃ³n, usa accion "RESPONDER" y escribe tu pregunta en "mensajeUsuario". NUNCA respondas en texto plano.

REGLAS DEL ASISTENTE:
1. CORTESÃA: Respuestas directas y profesionales. No uses "Comandante" ni jergas militares.
2. TELÃ‰FONO OBLIGATORIO: NUNCA ejecutes CREAR_PEDIDO o SUMAR_PUNTOS sin telÃ©fono del cliente (10 dÃ­gitos). Si falta, usa RESPONDER para pedirlo.
3. STAFF vs CLIENTE: Distingue entre clientes y repartidores.
4. NO ALUCINES: NUNCA inventes nombres, telÃ©fonos o estados. El handler consulta la BD real.
5. FORMULARIO DE REGISTRO: Si piden "agregar cliente" sin datos, usa RESPONDER con mensajeUsuario:
"ðŸ“ *NUEVO CLIENTE / LEALTAD*\nðŸ‘¤ Nombre: \nðŸ“ž TelÃ©fono: \nðŸŒŸ Puntos: 0"
6. REGISTRO SILENCIOSO: Si el admin pide "agregar silenciosamente", "no le mandes mensaje", o "cÃ³mo agrego una fachada de alguien que no estÃ¡", usa RESPONDER para decirle: "Para registrar un cliente silenciosamente sin enviarle mensajes, usa el comando: */noregistrado [10_digitos]*"

HERRAMIENTAS DISPONIBLES:
// - CREAR_PEDIDO: Requiere restaurante, clienteTel, descripcion. (DESHABILITADO)
- SUMAR_PUNTOS: Requiere clienteTel, puntosASumar.
- BUSCAR_CLIENTE: Requiere clienteTel.
- CANCELAR_PEDIDO: Requiere clienteTel.
- RECORDATORIO_REPARTIDOR: Requiere repartidorAlias, descripcion.
- ESTADO_REPARTIDOR: Requiere repartidorAlias.
- AGREGAR_REPARTIDOR / ELIMINAR_REPARTIDOR: Ãšsalo ÃšNICAMENTE para agregar o eliminar a un repartidor (mensajero/empleado) del sistema. Requiere clienteNombre, clienteTel.
- AGREGAR_CLIENTE: Ãšsalo para registrar a un CLIENTE en el sistema de lealtad. Requiere clienteNombre, clienteTel y opcionalmente colonia. (Ej: "registra a Juan PÃ©rez 9631234567")
- CARGAR_SALDO: Requiere clienteTel, montoSaldo.
- UBICACION_RESTAURANTE: Requiere restaurante.
- ANUNCIO_REPARTIDORES: Requiere descripcion.
- REVISAR_ENTREGADOS: diasAtras (0=hoy, 1=ayer, N=hace N dÃ­as).
- VER_RESTAURANTES, VER_REPARTIDORES, VER_VIPS, VER_PEDIDOS, ESTADISTICAS, REPORTE_SEMANAL, VER_ATRASOS.
- ENTREGAR_TODOS / CANCELAR_TODOS.
- ENVIAR_QR: Requiere clienteTel. Manda tarjeta de lealtad (QR) al cliente.
- ENVIAR_TERMINOS: Requiere clienteTel. Manda la solicitud de aceptaciÃ³n de tÃ©rminos y condiciones al cliente. Ãšsalo cuando el admin pida "manda tÃ©rminos", "envÃ­a tÃ©rminos", "pide aceptaciÃ³n" a un cliente.
- REGISTRAR_RESTAURANTE: Cuando alguien escribe para registrar o asociar su restaurante. Requiere nombre_restaurante y correo. Si falta alguno, usa RESPONDER para pedÃ­rselos paso a paso (primero el nombre, luego el correo).
- REASIGNAR_PEDIDO: Requiere clienteTel, repartidorAlias.
- AGREGAR_NOTA_CLIENTE: Requiere clienteTel, descripcion.
- ACTUALIZAR_DIRECCION: Requiere clienteTel, direccion. Ãšsalo cuando el admin pida "guarda la ubicaciÃ³n", "la direcciÃ³n es".
- CALIFICAR_CLIENTE: Requiere clienteTel, descripcion. Ãšsalo cuando el admin pida "ponle reputaciÃ³n", "califica", "agrega calificacion media/buena/mala". (Usa excelente, bueno, regular, malo o vetado).
- MARCAR_VIP: Requiere clienteTel.
- VER_HISTORIAL_CLIENTE: Requiere clienteTel.
- USAR_CUPON: Requiere codigoCupon. Ãšsalo cuando el admin pida "usa el cupon CODE", "aplica el codigo CODE".
- CANCELAR_CUPON: Requiere codigoCupon. Ãšsalo cuando el admin pida "cancela el cupon CODE", "reembolsa el codigo CODE".
- RESPONDER: Para charlar, confirmar, o pedir datos faltantes.

FORMATO JSON DE SALIDA (responde SOLO con esto, sin nada mÃ¡s):
{"accion":"UNA_ACCION_LISTADA","mensajeUsuario":"Texto breve y profesional.","datosAExtraer":{"clienteTel":"10 dÃ­gitos o null","puntosASumar":null,"diasAtras":null,"clienteNombre":null,"colonia":null,"restaurante":null,"descripcion":null,"direccion":null,"repartidorAlias":null,"montoSaldo":null,"nombre_restaurante":null,"correo":null,"codigoCupon":null}}`
}

function buildRepartidorPrompt(repartidorInfo: any): string {
  return `Eres el asistente de Estrella Delivery exclusivo para el Repartidor: ${repartidorInfo?.nombre || 'de nuestro equipo'}.
Tienes acceso completo a todas las herramientas de administraciÃ³n, gestiÃ³n logÃ­stica y de lealtad (billetera, puntos, etc.). Eres una Inteligencia Artificial profesional, proactiva y altamente eficiente.

âš ï¸ REGLA ABSOLUTA â€” FORMATO DE SALIDA:
Tu respuesta COMPLETA debe ser ÃšNICAMENTE un objeto JSON vÃ¡lido. Sin texto antes ni despuÃ©s. Sin bloques de cÃ³digo markdown. Sin explicaciones fuera del JSON.
Si necesitas pedir aclaraciÃ³n, usa accion "RESPONDER" y escribe tu pregunta en "mensajeUsuario". NUNCA respondas en texto plano.

REGLAS DEL ASISTENTE:
1. CORTESÃA: Respuestas directas y profesionales. No uses "Comandante" ni jergas militares. LlÃ¡malo por su nombre "${repartidorInfo?.nombre || 'Repartidor'}".
2. TELÃ‰FONO OBLIGATORIO: NUNCA ejecutes CREAR_PEDIDO o SUMAR_PUNTOS sin telÃ©fono del cliente (10 dÃ­gitos). Si falta, usa RESPONDER para pedirlo.
3. STAFF vs CLIENTE: Distingue entre clientes y repartidores.
4. NO ALUCINES: NUNCA inventes nombres, telÃ©fonos o estados. El handler consulta la BD real.
5. FORMULARIO DE REGISTRO: Si piden "agregar cliente" sin datos, usa RESPONDER con mensajeUsuario:
"ðŸ“ *NUEVO CLIENTE / LEALTAD*\nðŸ‘¤ Nombre: \nðŸ“ž TelÃ©fono: \nðŸŒŸ Puntos: 0"
6. REGISTRO SILENCIOSO: Si piden "registrar un cliente silenciosamente", usa RESPONDER para decirle: "Para registrar un cliente silenciosamente sin enviarle mensajes, usa el comando: */noregistrado [10_digitos]*"

HERRAMIENTAS DISPONIBLES:
- SUMAR_PUNTOS: Requiere clienteTel, puntosASumar.
- BUSCAR_CLIENTE: Requiere clienteTel.
- CANCELAR_PEDIDO: Requiere clienteTel.
- RECORDATORIO_REPARTIDOR: Requiere repartidorAlias, descripcion.
- ESTADO_REPARTIDOR: Requiere repartidorAlias.
- AGREGAR_REPARTIDOR / ELIMINAR_REPARTIDOR: Ãšsalo ÃšNICAMENTE para agregar o eliminar a un repartidor (mensajero/empleado) del sistema. Requiere clienteNombre, clienteTel.
- AGREGAR_CLIENTE: Ãšsalo para registrar a un CLIENTE en el sistema de lealtad. Requiere clienteNombre, clienteTel y opcionalmente colonia. (Ej: "registra a Juan PÃ©rez 9631234567")
- CARGAR_SALDO: Requiere clienteTel, montoSaldo.
- UBICACION_RESTAURANTE: Requiere restaurante.
- ANUNCIO_REPARTIDORES: Requiere descripcion.
- REVISAR_ENTREGADOS: diasAtras (0=hoy, 1=ayer, N=hace N dÃ­as).
- VER_RESTAURANTES, VER_REPARTIDORES, VER_VIPS, VER_PEDIDOS, ESTADISTICAS, REPORTE_SEMANAL, VER_ATRASOS.
- ENTREGAR_TODOS / CANCELAR_TODOS.
- ENVIAR_QR: Requiere clienteTel. Manda tarjeta de lealtad (QR) al cliente.
- ENVIAR_TERMINOS: Requiere clienteTel. Manda la solicitud de aceptaciÃ³n de tÃ©rminos y condiciones al cliente.
- REGISTRAR_RESTAURANTE: Requiere nombre_restaurante y correo.
- REASIGNAR_PEDIDO: Requiere clienteTel, repartidorAlias.
- AGREGAR_NOTA_CLIENTE: Requiere clienteTel, descripcion.
- ACTUALIZAR_DIRECCION: Requiere clienteTel, direccion.
- CALIFICAR_CLIENTE: Requiere clienteTel, descripcion. (Usa excelente, bueno, regular, malo o vetado).
- MARCAR_VIP: Requiere clienteTel.
- VER_HISTORIAL_CLIENTE: Requiere clienteTel.
- USAR_CUPON: Requiere codigoCupon.
- CANCELAR_CUPON: Requiere codigoCupon.
- RESPONDER: Para charlar, confirmar, o pedir datos faltantes.

FORMATO JSON DE SALIDA (responde SOLO con esto, sin nada mÃ¡s):
{"accion":"UNA_ACCION_LISTADA","mensajeUsuario":"Texto breve y profesional.","datosAExtraer":{"clienteTel":"10 dÃ­gitos o null","puntosASumar":null,"diasAtras":null,"clienteNombre":null,"colonia":null,"restaurante":null,"descripcion":null,"direccion":null,"repartidorAlias":"${repartidorInfo?.alias || ''}","montoSaldo":null,"nombre_restaurante":null,"correo":null,"codigoCupon":null}}`
}

function buildClientPrompt(clienteCtx?: { nombre?: string; puntos?: number; esVip?: boolean; reputacion?: string; saldo?: number; envios?: number; rango?: string } | null, regState?: { nombre?: string; tel?: string; colonia?: string }): string {
  const ctx = clienteCtx
  const esRegistrado = !!ctx?.nombre

  let contextBlock = ''
  if (esRegistrado) {
    contextBlock = `
CONTEXTO DEL CLIENTE (datos reales â€” NO inventes):
- Nombre: ${ctx!.nombre}
- Puntos: ${ctx!.puntos ?? 0}
- Rango: ${ctx!.rango || 'bronce'}
- VIP: ${ctx!.esVip ? 'SÃ­' : 'No'}
- Saldo: $${ctx!.saldo ?? 0}
- Entregas: ${ctx!.envios ?? 0}
${ctx!.reputacion === 'excelente' ? '- â­ CLIENTE EXCELENTE: TrÃ¡talo con calidez especial.\n' : ''}${ctx!.esVip ? '- ðŸ‘‘ ES VIP: Trato preferencial.\n' : ''}`
  }

  // Build registration state block â€” server-confirmed data
  let regStateBlock = ''
  if (!esRegistrado && regState && (regState.nombre || regState.tel || regState.colonia)) {
    regStateBlock = `
âš ï¸ ESTADO ACTUAL DEL REGISTRO:
- clienteNombre: ${regState.nombre || 'PENDIENTE'}
- clienteTel: ${regState.tel || 'PENDIENTE'} (AUTO-DETECTADO de WhatsApp â€” NO lo preguntes, solo confÃ­rmalo en el resumen final)
- colonia: ${regState.colonia || 'PENDIENTE'}
Solo pide el PRIMER campo que diga PENDIENTE (ignorando clienteTel ya que se detectÃ³ solo). Si solo falta clienteTel, pasa al resumen.`
  }

  return `Eres el asistente virtual de *Estrella Delivery* ðŸŒŸ atendiendo a un cliente por WhatsApp.
Eres amigable, cercano y usas emojis. Hablas en espaÃ±ol mexicano informal.
${contextBlock}${regStateBlock}
âš ï¸ REGLA DE FORMATO: Escribe mensajes CORTOS (mÃ¡ximo 2-3 lÃ­neas cada uno). Si necesitas decir mÃ¡s, separa con |||
Ejemplo: "Â¡Hola Juan! ðŸ‘‹ QuÃ© gusto verte por aquÃ­|||Tienes 12 puntos acumulados â­|||Visita tu portal para ver tus recompensas ðŸŽ https://www.app-estrella.shop/loyalty/"

REGLAS:
1. ${esRegistrado ? `SALUDA a "${ctx!.nombre}" con cariÃ±o. Usa emojis.` : 'El cliente NO estÃ¡ registrado. IMPORTANTE: NO te presentes mÃ¡s de una vez. Si ya saludaste en el historial, PASA DIRECTO a pedir el siguiente dato.'}
2. ${esRegistrado ? 'Si pregunta por puntos, dile los datos reales. InvÃ­talo a la web.' : `REGISTRO â€” solo necesitas recopilar 2 datos (el telÃ©fono ya lo tenemos de WhatsApp):
   a) Nombre completo
   b) Colonia o direcciÃ³n
   âš ï¸ TELÃ‰FONO: Ya fue detectado automÃ¡ticamente. Cuando le pidas el nombre por primera vez, menciÃ³nale su nÃºmero, ejemplo: "Veo que tu nÃºmero es ${regState?.tel || 'tu WhatsApp'} ðŸ“± Â¿Me dices tu nombre completo para registrarte?". NUNCA le pidas el telÃ©fono como dato aparte. Solo confÃ­rmalo de nuevo en el resumen final.
   PASO CRÃTICO (STATE TRACKING): En tu respuesta JSON, DEBES llenar "clienteNombre", "clienteTel" y "colonia" con los datos que ya tengas.
   Si "clienteNombre" ya tiene un valor, NO preguntes por el nombre, pide la colonia directamente.
   REGLA DE ORO: DEBES terminar obligatoriamente tu mensaje con una pregunta pidiendo el ÃšNICO dato que falta. NUNCA repitas una pregunta.
   
   âš ï¸ PROCESO DE CONFIRMACIÃ“N (MUY IMPORTANTE):
   PASO 1: Cuando ya tengas nombre Y colonia, usa la acciÃ³n RESPONDER para mostrarle el resumen completo (incluyendo el telÃ©fono auto-detectado) y preguntarle si todo estÃ¡ bien:
   "Â¿Confirmo tus datos?|||ðŸ‘¤ Nombre: [nombre]|||ðŸ“± Tel: [tel auto-detectado]|||ðŸ  Colonia: [colonia]|||Â¿Todo correcto? ðŸ˜Š"
   PASO 2: SOLAMENTE cuando el cliente responda "sÃ­", "correcto", o afirmativamente a tu resumen, puedes usar la acciÃ³n SOLICITAR_REGISTRO. 
   Â¡NUNCA uses SOLICITAR_REGISTRO en el mismo mensaje donde le muestras el resumen! Debes esperar su respuesta afirmativa.`}
3. NUNCA aceptes pedidos de envÃ­o ni de comida. Si el cliente quiere un servicio, hacer un pedido o mandar un paquete, dile EXACTAMENTE: "Para pedir un servicio, mÃ¡ndale mensaje directamente al nÃºmero de Estrella: 963 153 9156 ðŸ“² y ahÃ­ te atienden con gusto."
4. Invita a visitar: https://www.app-estrella.shop/loyalty/
5. ${ctx?.reputacion === 'malo' || ctx?.reputacion === 'regular' ? 'NO menciones su reputaciÃ³n. AtiÃ©ndelo normal.' : ctx?.reputacion === 'excelente' ? 'Hazle saber que es un cliente muy valorado ðŸŒŸ' : 'SÃ© amable con todos.'}
6. Si quieren registrar un restaurante, usa REGISTRAR_RESTAURANTE.
7. SOLICITAR_REGISTRO SOLO cuando tengas los 3 datos Y el cliente los haya confirmado.
8. POLÃTICA DE PRIVACIDAD: Si el cliente pregunta por sus datos o por quÃ© le toman foto a su casa, explÃ­cale que: "Por seguridad de nuestros repartidores y agilidad logÃ­stica tomamos fotos 100% EXTERIORES de la fachada (sin rostros). Si no eres VIP, tus datos jamÃ¡s se usan para enviarte publicidad. Todo esto en cumplimiento con la LFPDPPP."

HERRAMIENTAS:
- RESPONDER: Chatear, saludar, informar puntos, pedir datos.
- REGISTRAR_RESTAURANTE: Afiliar restaurante. Requiere "nombre_restaurante" y "correo".
- SOLICITAR_REGISTRO: Solo con los 3 datos confirmados. DEBES incluir "clienteNombre", "clienteTel" y "colonia" en datosAExtraer, extrayÃ©ndolos del historial de la conversaciÃ³n.

FORMATO JSON (responde SOLO esto):
{"datosAExtraer":{"clienteNombre":null,"clienteTel":null,"colonia":null,"nombre_restaurante":null,"correo":null},"accion":"UNA_ACCION","mensajeUsuario":"Mensaje corto|||Otro mensaje corto ðŸ˜Š"}`
}

// â”€â”€ Validador de Seguridad (evita datos incorrectos de la IA) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function enforcerValidator(respuesta: AIRespuesta): AIRespuesta {
  const d: Record<string, any> = respuesta.datosAExtraer || {}

  // SanitizaciÃ³n
  if (d.clienteTel) {
    const num = String(d.clienteTel).replace(/\D/g, '')
    d.clienteTel = num.length >= 10 ? num.slice(-10) : undefined
  }
  if (d.puntosASumar != null) d.puntosASumar = parseInt(String(d.puntosASumar), 10)
  if (d.montoSaldo != null) d.montoSaldo = parseFloat(String(d.montoSaldo))

  let blocked = false
  switch (respuesta.accion) {
    case 'CREAR_PEDIDO':
      if (!d.clienteTel || d.clienteTel.length !== 10) { blocked = true; respuesta.mensajeUsuario = 'Necesito el nÃºmero de telÃ©fono del cliente a 10 dÃ­gitos para crear un pedido.' }
      else if (!d.descripcion?.trim()) { blocked = true; respuesta.mensajeUsuario = 'Necesito saber exactamente quÃ© productos quiere en el pedido.' }
      break
    case 'SUMAR_PUNTOS':
      if (!d.clienteTel || d.clienteTel.length !== 10) { blocked = true; respuesta.mensajeUsuario = 'Faltan los 10 dÃ­gitos del telÃ©fono del cliente.' }
      else if (d.puntosASumar != null && d.puntosASumar <= 0) { blocked = true; respuesta.mensajeUsuario = 'La cantidad de puntos a sumar debe ser mayor a cero.' }
      break
    case 'BUSCAR_CLIENTE': case 'VER_HISTORIAL_CLIENTE':
    case 'MARCAR_VIP': case 'CANCELAR_PEDIDO': case 'AGREGAR_NOTA_CLIENTE':
    case 'ACTUALIZAR_DIRECCION': case 'CALIFICAR_CLIENTE':
      if (!d.clienteTel || d.clienteTel.length !== 10) { blocked = true; respuesta.mensajeUsuario = 'Faltan los 10 dÃ­gitos del telÃ©fono del cliente para ejecutar eso.' }
      break
    case 'CARGAR_SALDO':
      if (!d.clienteTel || d.clienteTel.length !== 10 || isNaN(d.montoSaldo) || d.montoSaldo <= 0) { blocked = true; respuesta.mensajeUsuario = 'Para recargar necesito los 10 dÃ­gitos del cliente y el monto numÃ©rico mayor a 0.' }
      break
    case 'ELIMINAR_REPARTIDOR': case 'ESTADO_REPARTIDOR': case 'RECORDATORIO_REPARTIDOR':
      if (!d.repartidorAlias) { blocked = true; respuesta.mensajeUsuario = 'Necesito el nombre del repartidor para ejecutar esa acciÃ³n especÃ­fica.' }
      break
    case 'ANUNCIO_REPARTIDORES':
      if (!d.descripcion) { blocked = true; respuesta.mensajeUsuario = 'Por favor indique cuÃ¡l es el mensaje que desea enviar a todos los repartidores.' }
      break
    case 'REASIGNAR_PEDIDO':
      if (!d.clienteTel || d.clienteTel.length !== 10 || !d.repartidorAlias) { blocked = true; respuesta.mensajeUsuario = 'Para reasignar, proporcione los 10 dÃ­gitos del cliente y el nombre del nuevo repartidor.' }
      break
    case 'AGREGAR_REPARTIDOR':
      if (!d.clienteNombre || !d.clienteTel || d.clienteTel.length !== 10) { blocked = true; respuesta.mensajeUsuario = 'Para registrar personal, necesito el nombre y su nÃºmero a 10 dÃ­gitos obligatoriamente.' }
      break
    case 'AGREGAR_CLIENTE':
      if (!d.clienteNombre || !d.clienteTel || d.clienteTel.length !== 10) { blocked = true; respuesta.mensajeUsuario = 'Para registrar al cliente, necesito su nombre y su telÃ©fono a 10 dÃ­gitos.' }
      break
    case 'REGISTRAR_RESTAURANTE':
      if (!d.nombre_restaurante || !d.correo || !d.correo.includes('@')) { blocked = true; respuesta.mensajeUsuario = 'Â¡Excelente! Para registrar tu restaurante necesito que me des su Nombre y un Correo electrÃ³nico vÃ¡lido.' }
      break
    case 'USAR_CUPON': case 'CANCELAR_CUPON':
      if (!d.codigoCupon) { blocked = true; respuesta.mensajeUsuario = 'Proporciona el cÃ³digo del cupÃ³n para ejecutar esta acciÃ³n.' }
      break
  }

  if (blocked) {
    console.warn(`ðŸ›¡ï¸ Enforcement Validator interceptÃ³ '${respuesta.accion}' por falta de datos.`)
    respuesta.accion = 'RESPONDER'
  }
  return respuesta
}

// â”€â”€ Cortocircuito (Circuit Breaker) para la IA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Previene saturar el servicio cuando estÃ¡ caÃ­do. Tras varios fallos,
// pausa las peticiones temporalmente para ahorrar recursos.
const DS_FAIL_THRESHOLD = 3
const DS_OPEN_MS = 45_000
const CB_KEY = 'sys_circuit_ds'

async function _getDsCircuit(supabase: SupabaseClient) {
  try {
    const { data } = await supabase.from('bot_memory').select('history').eq('phone', CB_KEY).maybeSingle()
    if (data?.history?.[0]) return data.history[0] as { fails: number, openUntil: number }
  } catch (e) { }
  return { fails: 0, openUntil: 0 }
}

async function _updateDsCircuit(supabase: SupabaseClient, state: { fails: number, openUntil: number }) {
  await supabase.from('bot_memory').upsert({ phone: CB_KEY, history: [state], updated_at: new Date().toISOString() })
}

async function _cbFail(supabase: SupabaseClient): Promise<void> {
  const c = await _getDsCircuit(supabase)
  c.fails++
  if (c.fails >= DS_FAIL_THRESHOLD) {
    c.openUntil = Date.now() + DS_OPEN_MS
    c.fails = 0
    console.error(`â›” [CIRCUIT OPEN] DeepSeek pausado ${DS_OPEN_MS / 1000}s por ${DS_FAIL_THRESHOLD} fallas consecutivas.`)
  }
  await _updateDsCircuit(supabase, c)
}

async function _cbSuccess(supabase: SupabaseClient): Promise<void> {
  const c = await _getDsCircuit(supabase)
  if (c.fails > 0) {
    await _updateDsCircuit(supabase, { fails: 0, openUntil: 0 })
  }
}

// â”€â”€ Llamar a DeepSeek R1 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function conversacionDeepSeek(
  supabase: SupabaseClient,
  phone: string,
  nuevoTexto: string,
  isRepartidor = false,
  repartidorInfo: any = null,
  isClient = false,
  clienteCtx: { nombre?: string; puntos?: number; esVip?: boolean; reputacion?: string; saldo?: number; envios?: number; rango?: string } | null = null,
  regState?: { nombre?: string; tel?: string; colonia?: string }
): Promise<{ respuesta?: AIRespuesta; nuevoHistorial?: any[]; errorObj?: string } | null> {
  try {
    // Circuit breaker: si estÃ¡ abierto, rechazar inmediatamente sin llamar a DeepSeek
    const circuit = await _getDsCircuit(supabase)
    if (Date.now() < circuit.openUntil) {
      const secsLeft = Math.ceil((circuit.openUntil - Date.now()) / 1000)
      console.warn(`â›” [CIRCUIT OPEN] DeepSeek en pausa â€” ${secsLeft}s restantes`)
      return { errorObj: `IA en pausa temporal (${secsLeft}s). Reintenta en un momento.` }
    }

    const memPhone = extract10Digits(phone)
    const callerPhone10 = memPhone
    const { data: mem } = await supabase.from('bot_memory').select('history').eq('phone', memPhone).maybeSingle()
    const historia = mem?.history || []

    // â”€â”€ MOCK MODE PARA TESTS DE ESTRÃ‰S â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (Deno.env.get('DEBUG_MOCK_AI') === 'true') {
      const mockRes: AIRespuesta = {
        accion: 'RESPONDER',
        mensajeUsuario: 'ðŸ¤– [MOCK MODE] RecibÃ­ tu mensaje: ' + nuevoTexto.substring(0, 50)
      }
      return {
        respuesta: mockRes,
        nuevoHistorial: [
          ...(historia).slice(-5),
          { role: 'user', content: nuevoTexto },
          { role: 'model', content: mockRes.mensajeUsuario }
        ]
      }
    }

    let systemInstruction = buildAdminPrompt()
    if (isRepartidor) systemInstruction = buildRepartidorPrompt(repartidorInfo)
    else if (isClient) systemInstruction = buildClientPrompt(clienteCtx, regState)

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

    const API_KEY = Deno.env.get('DEEPSEEK_API_KEY')!

    const callDeepSeek = async (): Promise<Response> => {
      const controller = new AbortController()
      // Tiempo de espera de 12 segundos para evitar retrasos excesivos.
      const timeout = setTimeout(() => controller.abort(), 12000)
      try {
        return await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            response_format: { type: 'json_object' },
            messages,
            max_tokens: 2048,
            temperature: 0.0,
          }),
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
        console.warn(`âš ï¸ DeepSeek API ${res.status}, reintentando inmediatamente...`)
        res = await callDeepSeek()
      }
    } catch (fetchErr: any) {
      const isTimeout = fetchErr?.name === 'AbortError'
      const msg = isTimeout ? 'â±ï¸ Timeout 12s alcanzado, usando fallback' : 'ðŸŒ Fetch error: ' + String(fetchErr);
      console.error(msg)
      await logError('whatsapp-bot', `DeepSeek Fetch Failure: ${msg}`, { error: String(fetchErr), callerPhone10 }, 'critical');
      await _cbFail(supabase)
      return { errorObj: isTimeout ? 'DeepSeek no respondiÃ³ a tiempo. Intente de nuevo.' : String(fetchErr) }
    }

    if (!res.ok) {
      const errText = await res.text()
      console.error('DeepSeek API Error:', errText)
      await logError('whatsapp-bot', `DeepSeek HTTP Error ${res.status}`, { response: errText, callerPhone10 }, 'critical');
      await _cbFail(supabase)
      return { errorObj: `HTTP ${res.status} - ${errText}` }
    }

    const data = await res.json()
    console.log(`ðŸ¤– [DeepSeek] Tokens usados â€” input: ${data.usage?.prompt_tokens} | output: ${data.usage?.completion_tokens}`)

    // El formato es compatible con el estÃ¡ndar de OpenAI.
    let rawContent = (data.choices?.[0]?.message?.content || '').trim()

    // Manejo de respuestas vacÃ­as (ocurre cuando el historial acumula demasiados tokens).
    // Fix: reintentar SIN historial para liberar contexto y obtener respuesta vÃ¡lida.
    if (!rawContent || rawContent.length < 10) {
      console.warn(`âš ï¸ DeepSeek respuesta muy corta (${rawContent.length} chars, ${data.usage?.completion_tokens} tokens). Reintentando sin historial...`)
      const messagesNoHistory = [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: String(nuevoTexto).substring(0, 500) },
      ]
      let res2: Response
      try {
        const ctrl2 = new AbortController()
        const tmr2 = setTimeout(() => ctrl2.abort(), 12000)
        res2 = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'deepseek-chat', response_format: { type: 'json_object' }, messages: messagesNoHistory, max_tokens: 2048, temperature: 0.0 }),
          signal: ctrl2.signal,
        })
        clearTimeout(tmr2)
      } catch (e2) {
        const msg = 'âŒ DeepSeek devolviÃ³ contenido vacÃ­o. Finish reason: ' + (data.choices?.[0]?.finish_reason || 'unknown')
        console.error(msg)
        await _cbFail(supabase)
        return { errorObj: msg }
      }
      const data2 = await res2.json()
      rawContent = (data2.choices?.[0]?.message?.content || '').trim()
      console.log(`ðŸ”„ [Retry sin historial] Tokens â€” input: ${data2.usage?.prompt_tokens} | output: ${data2.usage?.completion_tokens}`)
      if (!rawContent || rawContent.length < 10) {
        const msg = 'âŒ DeepSeek devolviÃ³ contenido vacÃ­o incluso sin historial. Finish reason: ' + (data2.choices?.[0]?.finish_reason || 'unknown')
        console.error(msg)
        await logError('whatsapp-bot', 'DeepSeek Empty Response (retry)', { finish_reason: data2.choices?.[0]?.finish_reason, callerPhone10 }, 'error')
        await _cbFail(supabase)
        return { errorObj: msg }
      }
    }

    let cleanJSON = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    const fb = cleanJSON.indexOf('{'), lb = cleanJSON.lastIndexOf('}')
    if (fb !== -1 && lb !== -1) cleanJSON = cleanJSON.substring(fb, lb + 1)

    let respuesta: AIRespuesta
    try {
      const parsed = JSON.parse(cleanJSON)
      if (!parsed.accion || !VALID_ACTIONS.includes(parsed.accion)) throw new Error(`AcciÃ³n invÃ¡lida: "${parsed.accion}"`)
      respuesta = parsed as AIRespuesta
    } catch {
      const fallbackFb = rawContent.indexOf('{')
      const fallbackLb = rawContent.lastIndexOf('}')
      if (fallbackFb !== -1 && fallbackLb !== -1 && fallbackLb > fallbackFb) {
        try {
          const jsonMatchStr = rawContent.substring(fallbackFb, fallbackLb + 1)
          const parsed2 = JSON.parse(jsonMatchStr)
          if (parsed2.accion && VALID_ACTIONS.includes(parsed2.accion)) {
            respuesta = parsed2 as AIRespuesta
            console.warn('âš ï¸ JSON recuperado via substring fallback.')
          } else throw new Error('AcciÃ³n invÃ¡lida en fallback')
        } catch (repairErr: any) {
          console.error('âŒ JSON no rescatable. Raw:', rawContent.slice(0, 500))
          await logError('whatsapp-bot', `DeepSeek malformed JSON`, { rawContent: rawContent.slice(0, 500), phone: callerPhone10 }, 'warn');
          throw new Error('AI devolviÃ³ formato JSON no rescatable.')
        }
      } else {
        console.error('âŒ Sin JSON en respuesta. Raw:', rawContent.slice(0, 500))
        respuesta = { accion: 'RESPONDER', mensajeUsuario: 'Perdone la interrupciÃ³n, pero los servidores de Inteligencia estÃ¡n saturados (Respuesta no legible). Reintente en un momento, por favor.' }
      }
    }

    respuesta = enforcerValidator(respuesta)
    await _cbSuccess(supabase)

    const nuevoHistorial = [
      ...historia.slice(-12),
      { role: 'user', content: String(nuevoTexto).substring(0, 300) },
      // Strip ||| separators before saving â€” the AI should see clean text in history
      ...(respuesta.mensajeUsuario?.trim()
        ? [{ role: 'model', content: respuesta.mensajeUsuario.replace(/\|\|\|/g, ' ').trim().substring(0, 300) }]
        : []),
    ]

    return { respuesta, nuevoHistorial }
  } catch (e) {
    console.error('DeepSeek error root:', e instanceof Error ? e.message : String(e))
    return { errorObj: `Runtime Error: ${e instanceof Error ? e.message : String(e)}` }
  }
}
