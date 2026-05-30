import { sendWA, sendInteractiveButtons } from './whatsapp.ts'
import { handleRestaurantOnboarding } from './restaurant-onboarding.ts'

export async function handleClientFlow(
  supabase: any,
  fromPhone: string,
  from10: string,
  msgType: string,
  msg: any,
  cachedRepData: any,
  SUPABASE_KEY: string
): Promise<Response | null> {
  // Repartidor descolgado: recordarle que use botones
  if (cachedRepData) {
    await sendWA(fromPhone, `🤖 Hola ${cachedRepData.nombre}.\nRecuerda usar los botones para avanzar pedidos o enviarme mensajes de texto sin emojis.`)
    return new Response('OK', { status: 200 })
  }

  if (msgType !== 'text' && msgType !== 'location' && msgType !== 'image') return null

  // ── Modo pausa (admin habló directamente con el cliente desde Chatwoot) ──
  const { data: pausaData } = await supabase.from('bot_memory')
    .select('history').eq('phone', `bot_pausa_${from10}`).maybeSingle()
  if (pausaData) {
    console.log(`[BOT PAUSA] 🔕 Bot silenciado para ${from10}.`)
    return new Response('OK', { status: 200 })
  }

  // ── PRIORIDAD 1: Flujo de Onboarding de Restaurante ──
  // Debe ir ANTES del lookup de clienteDB para que funcione aunque el número
  // ya exista en la tabla clientes (ej. admin probando desde su propio número).
  const { data: restRegData } = await supabase.from('bot_memory')
    .select('history').eq('phone', `reg_rest_${from10}`).maybeSingle()
  if (restRegData?.history?.[0]) {
    return await handleRestaurantOnboarding(supabase, fromPhone, from10, msgType, msg, restRegData.history[0])
  }

  // ── Buscar cliente en BD ──
  const { data: clienteDB } = await supabase.from('clientes')
    .select('nombre, puntos, es_vip, reputacion, saldo_billetera, envios_totales, rango, acepta_terminos')
    .ilike('telefono', `%${from10}%`).limit(1).maybeSingle()

  // ── Embudo Inicial: número desconocido ──
  if (!clienteDB) {
    // ¿Está en flujo de registro de cliente?
    const { data: clientRegData } = await supabase.from('bot_memory')
      .select('history').eq('phone', `reg_state_${from10}`).maybeSingle()
    
    // Sin estado previo → mostrar embudo inicial
    if (!clientRegData?.history?.[0]) {
      await sendInteractiveButtons(
        fromPhone,
        `🌟 *¡Hola! Bienvenido a Estrella Delivery.*\n\nPara brindarte el mejor servicio, indícanos: ¿Nos escribes para hacer pedidos o eres un Restaurante aliado?`,
        [
          { id: 'REG_TIPO_CLIENTE',     title: '👤 Soy Cliente' },
          { id: 'REG_TIPO_RESTAURANTE', title: '🏪 Soy Restaurante' }
        ]
      )
      return new Response('OK', { status: 200 })
    }
  }

  // Si llegó aquí con location (y no era onboarding de restaurante), avisar y salir
  if (msgType === 'location') {
    await sendWA(fromPhone, `📍 Hemos recibido tu ubicación. Por favor escríbenos qué deseas hacer.`)
    return new Response('OK', { status: 200 })
  }

  // ── Contexto para la IA ──
  const clienteCtx = (clienteDB?.acepta_terminos === true) ? {
    nombre:     clienteDB.nombre,
    puntos:     clienteDB.puntos         ?? 0,
    esVip:      clienteDB.es_vip         === true,
    reputacion: clienteDB.reputacion     || 'sin_calificar',
    saldo:      clienteDB.saldo_billetera ?? 0,
    envios:     clienteDB.envios_totales  ?? 0,
    rango:      clienteDB.rango          || 'bronce'
  } : null

  // ── Estado de registro (máquina de estados) ──
  let regState: { nombre?: string; tel?: string; colonia?: string; step?: number } | undefined = undefined
  if (!clienteDB || clienteDB.acepta_terminos === false) {
    const { data: regData } = await supabase.from('bot_memory')
      .select('history').eq('phone', `reg_state_${from10}`).maybeSingle()
    if (regData?.history?.[0]) {
      regState = regData.history[0] as { nombre?: string; tel?: string; colonia?: string; step?: number }
    }
    if (!regState) regState = { tel: from10, step: 0 }
    else if (!regState.tel) regState.tel = from10
    console.log('📋 RegState loaded:', JSON.stringify(regState))
  }

  // ── Despacho asíncrono a whatsapp-ai (evita timeout de Meta) ──
  const SUPABASE_PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
  fetch(`${SUPABASE_PROJECT_URL}/functions/v1/whatsapp-ai`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromPhone, from10,
      texto: msg.text?.body as string ?? '',
      isRepartidor: false, repartidorInfo: null,
      isClient: true, clienteCtx, regState
    })
  }).catch(err => console.error('Error invocando whatsapp-ai:', err))

  return new Response('OK', { status: 200 })
}
