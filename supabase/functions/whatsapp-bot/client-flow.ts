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
    .select('nombre, puntos, es_vip, reputacion, saldo_billetera, envios_totales, rango, acepta_terminos, notas_crm')
    .eq('telefono', from10).limit(1).maybeSingle()

  let ubicacionesGuardadas: any[] = []
  if (clienteDB?.acepta_terminos === true) {
    const { data: ubiData } = await supabase.from('cliente_ubicaciones')
      .select('tipo, colonia_nombre, lat, lng')
      .eq('cliente_telefono', from10)
      .not('tipo', 'in', '(origen,destino)')
    if (ubiData) ubicacionesGuardadas = ubiData
  }

  // ── Embudo Inicial: número desconocido ──
  if (!clienteDB || clienteDB.acepta_terminos === false) {
    await sendInteractiveButtons(
      fromPhone,
      `🌟 *¡Hola! Bienvenido a Estrella Delivery.*\n\nSomos la mejor plataforma para pedir comida de tus lugares favoritos y ganar recompensas 🍕🛵\n\nPara darte la atención que mereces, cuéntanos:\n*¿Quieres pedir comida o eres un restaurante aliado?*`,
      [
        { id: 'REG_TIPO_CLIENTE',     title: '🍔 Pedir Comida' },
        { id: 'REG_TIPO_RESTAURANTE', title: '🏪 Soy Negocio' }
      ]
    )
    return new Response('OK', { status: 200 })
  }

  // ── Interceptor para el Mesero Virtual (Comercio Conversacional) [DESACTIVADO] ──
  /*
  const { data: orderSession } = await supabase.from('bot_memory')
    .select('history').eq('phone', `order_session_${from10}`).maybeSingle()
    
  const SUPABASE_PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''

  if (orderSession?.history?.[0]) {
    const userText = (msg.text?.body as string ?? '').toLowerCase().trim()
    const exitWords = ['menu', 'menú', 'restaurantes', 'volver', 'salir', 'cancelar']
    
    if (exitWords.includes(userText)) {
      await supabase.from('bot_memory').delete().eq('phone', `order_session_${from10}`)
      
      if (userText === 'cancelar' || userText === 'salir') {
        await sendWA(fromPhone, '✅ Tu sesión de pedido ha sido cancelada.')
        return new Response('OK', { status: 200 })
      } else {
        // Redirigir inmediatamente al catálogo
        const { enviarCatalogoRestaurantes } = await import('./restaurant-b2b-handler.ts')
        await enviarCatalogoRestaurantes(supabase, fromPhone)
        return new Response('OK', { status: 200 })
      }
    }

    // Redirigir a whatsapp-ventas
    // @ts-ignore
    EdgeRuntime.waitUntil(
      fetch(`${SUPABASE_PROJECT_URL}/functions/v1/whatsapp-ventas`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPhone, from10,
          texto: msg.text?.body as string ?? '',
          sessionData: orderSession.history[0]
        })
      }).catch(err => console.error('Error enviando a whatsapp-ventas:', err))
    )
    return new Response('OK', { status: 200 })
  }
  */

  const SUPABASE_PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''

  const clienteCtx = clienteDB ? { ...clienteDB, ubicacionesGuardadas } : null;

  // ── Despacho asíncrono a whatsapp-ai (evita timeout de Meta) ──
  
  // @ts-ignore
  EdgeRuntime.waitUntil(
    fetch(`${SUPABASE_PROJECT_URL}/functions/v1/whatsapp-ai`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromPhone, from10,
        texto: msg.text?.body as string ?? '',
        isRepartidor: false, repartidorInfo: null,
        isClient: true, clienteCtx, regState: undefined
      })
    }).catch(err => console.error('Error invocando whatsapp-ai:', err))
  )

  return new Response('OK', { status: 200 })
}
