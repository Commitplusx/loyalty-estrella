import { sendWA, sendInteractiveList, sendInteractiveButtons, sendWATemplate } from './whatsapp.ts'
import { extract10Digits, generateCloudinaryVIPCard } from '../_shared/utils.ts'

// Límites de seguridad para evitar abuso
const MAX_PUNTOS_POR_ACCION = 10
const MAX_REGALOS_POR_DIA = 5

// ── Barra de Progreso Visual para clientes ──────────────────────────────────
function buildProgressBar(ptsActuales: number, meta: number): string {
  const totalSlots = meta
  const filled = Math.min(ptsActuales % meta === 0 && ptsActuales > 0 ? meta : ptsActuales % meta, meta)
  const bar = '🟩'.repeat(filled) + '⬜'.repeat(Math.max(0, totalSlots - filled))
  const restantes = meta - filled
  if (restantes === 0) return `${bar}\n🎉 *¡Completaste un ciclo! Tienes 1 envío GRATIS disponible.*`
  return `${bar} (${filled}/${meta})\n¡Solo te faltan *${restantes}* más para tu envío *GRATIS*! 🚀`
}

// ── Decodificar QR de imagen vía API HTTP (sin librerías nativas) ────────────
async function decodeQRFromUrl(imageUrl: string): Promise<string | null> {
  try {
    const apiUrl = `https://api.qrserver.com/v1/read-qr-code/?fileurl=${encodeURIComponent(imageUrl)}`
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const json = await res.json()
    const text = json?.[0]?.symbol?.[0]?.data
    return text || null
  } catch (e) {
    console.error('[QR_DECODE] Error:', e)
    return null
  }
}

// ── Verificar si el restaurante tiene acceso al programa ────────────────────
async function _verificarAcceso(supabase: any, restauranteId: string): Promise<boolean> {
  const { data } = await supabase.from('restaurantes').select('programa_lealtad_activo').eq('id', restauranteId).maybeSingle()
  return data?.programa_lealtad_activo === true
}

// ── Menú Principal Interactivo ──────────────────────────────────────────────
async function enviarMenuPrincipal(fromPhone: string, nombreRest: string) {
  await sendInteractiveList(
    fromPhone,
    `🏪 *Portal de Aliados — Estrella Delivery*\nRestaurante: *${nombreRest}*\n\nSelecciona qué deseas hacer:`,
    `Abrir Menú`,
    [
      {
        title: 'Gestión de Clientes',
        rows: [
          { id: 'REST_MENU_AFILIAR', title: '➕ Afiliar Cliente', description: 'Registrar nuevo cliente VIP' },
          { id: 'REST_MENU_PUNTOS', title: '⭐ Sumar Puntos', description: 'Premiar visita al restaurante' },
          { id: 'REST_MENU_INFO', title: '📊 Ver Perfil', description: 'Consultar datos de un cliente' },
          { id: 'REST_MENU_REGALAR', title: '🎁 Regalar Envío', description: `Patrocinar envío gratis (Máx ${MAX_REGALOS_POR_DIA}/día)` }
        ]
      },
      {
        title: 'Mi Negocio',
        rows: [
          { id: 'REST_MENU_RESUMEN', title: '📈 Mi Resumen de Hoy', description: 'Ver actividad del día' }
        ]
      }
    ]
  )
}

// ── Handler principal ────────────────────────────────────────────────────────
export async function handleRestaurantCommand(
  supabase: any,
  fromPhone: string,
  from10: string,
  restauranteId: string,
  nombreRest: string,
  msgType: string,
  msg: any
): Promise<Response | null> {
  const permitido = await _verificarAcceso(supabase, restauranteId)

  const isInteractive = msgType === 'interactive' || msgType === 'button'
  const textBody = msgType === 'text' ? (msg.text?.body as string).trim().toLowerCase() : ''
  const buttonId = isInteractive ? (msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || msg.button?.payload || msg.button?.text) as string : ''

  if (!permitido) {
    if (textBody === 'hola' || textBody === 'menu' || textBody === '/ayuda' || isInteractive) {
      await sendWA(fromPhone, `🔒 Tu restaurante aún no tiene activo el programa de lealtad.\n\nContacta a *Estrella Delivery* para activarlo y poder afiliar clientes. 🌟`)
    }
    // Para cualquier otro mensaje de texto sin estado, respondemos igual
    else if (msgType === 'text' && textBody) {
      await sendWA(fromPhone, `⚠️ Tu restaurante aún no está registrado en el programa. Escribe *hola* para más información.`)
    }
    return new Response('OK', { status: 200 })
  }

  // 1. Manejo de Botones/Listas del Menú Principal
  if (isInteractive && buttonId.startsWith('RFAST_')) {
    const parts = buttonId.split('_')
    const action = parts[1] // PUNTOS, INFO, REGALAR
    const cTel = parts[2]
    
    // Convertirlo en un estado de la DB y un mensaje de texto falso, para reusar lógica.
    let targetState = ''
    if (action === 'PUNTOS') targetState = 'PUNTOS_TEL'
    else if (action === 'INFO') targetState = 'INFO_TEL'
    else if (action === 'REGALAR') targetState = 'REGALAR_TEL'

    if (targetState) {
      await supabase.from('bot_memory').upsert({
        phone: `b2b_state_${from10}`,
        history: [{ state: targetState, restId: restauranteId, restName: nombreRest }],
        updated_at: new Date().toISOString()
      })
      // Llamada recursiva simulando que mandó el texto con el teléfono
      const mockMsg = { text: { body: cTel } }
      return await handleRestaurantCommand(supabase, fromPhone, from10, restauranteId, nombreRest, 'text', mockMsg)
    }
    return new Response('OK', { status: 200 })
  }

  if (isInteractive && buttonId.startsWith('REST_MENU_')) {
    // ── Mini-Dashboard de hoy ─────────────────────────────────────────────────
    if (buttonId === 'REST_MENU_RESUMEN') {
      const tz = 'America/Mexico_City'
      const dateStr = new Date().toLocaleString('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      const [m, d, y] = dateStr.split('/')
      const hoy = new Date(`${y}-${m}-${d}T00:00:00.000-06:00`).toISOString()

      const { data: logs } = await supabase.from('restaurante_loyalty_log')
        .select('accion, valor, cliente_tel')
        .eq('restaurante_id', restauranteId)
        .gte('created_at', hoy)

      const afiliados  = logs?.filter((l: any) => l.accion === 'afiliar_cliente').length || 0
      const ptsSumados = logs?.filter((l: any) => l.accion === 'sumar_puntos').reduce((s: number, l: any) => s + (l.valor || 0), 0) || 0
      const regalados  = logs?.filter((l: any) => l.accion === 'regalar_envio').length || 0
      const visitasUnicas = new Set(logs?.filter((l: any) => l.accion === 'sumar_puntos').map((l: any) => l.cliente_tel)).size

      const fecha = new Date().toLocaleDateString('es-MX', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })
      await sendWA(fromPhone,
        `📈 *Resumen de hoy — ${fecha}*\n` +
        `Restaurante: *${nombreRest}*\n` +
        `───────────────────\n` +
        `➕ Nuevos afiliados: *${afiliados}*\n` +
        `⭐ Puntos sumados: *${ptsSumados}*\n` +
        `👀 Visitas únicas: *${visitasUnicas}*\n` +
        `🎁 Envíos regalados: *${regalados}*\n` +
        `───────────────────\n` +
        `_¡Sigue así! Cada visita cuenta._ 💪`
      )
      return new Response('OK', { status: 200 })
    }

    let promptMsg = ''
    let newState = ''
    if (buttonId === 'REST_MENU_AFILIAR') { promptMsg = 'Escribe el número a *10 dígitos* del cliente nuevo:\n_(También puedes enviar una foto de su Tarjeta VIP QR)_ 📸'; newState = 'AFILIAR_TEL' }
    else if (buttonId === 'REST_MENU_PUNTOS') { promptMsg = 'Escribe el número a *10 dígitos* del cliente:\n_(También puedes enviar una foto de su Tarjeta VIP QR)_ 📸'; newState = 'PUNTOS_TEL' }
    else if (buttonId === 'REST_MENU_REGALAR') { promptMsg = 'Escribe el número a *10 dígitos* del cliente a premiar:'; newState = 'REGALAR_TEL' }
    else if (buttonId === 'REST_MENU_INFO') { promptMsg = 'Escribe el número a *10 dígitos* del cliente a consultar:'; newState = 'INFO_TEL' }

    if (newState) {
      await supabase.from('bot_memory').upsert({
        phone: `b2b_state_${from10}`,
        history: [{ state: newState, restId: restauranteId, restName: nombreRest }],
        updated_at: new Date().toISOString()
      })
      await sendWA(fromPhone, `📱 ${promptMsg}`)
    }
    return new Response('OK', { status: 200 })
  }

  // Si cancelan el flujo actual
  if (textBody === 'cancelar' || textBody === '/cancelar' || textBody === 'salir') {
    await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)
    await enviarMenuPrincipal(fromPhone, nombreRest)
    return new Response('OK', { status: 200 })
  }

  // 2. Procesamiento de Texto (Máquina de Estados o Comandos directos)
  if (msgType === 'text') {
    const { data: memData } = await supabase.from('bot_memory').select('history').eq('phone', `b2b_state_${from10}`).maybeSingle()
    const stateObj = memData?.history?.[0]

    if (stateObj) {
      const state = stateObj.state
      const userInput = (msg.text?.body as string).trim()

      // AFILIAR FLUJO
      if (state === 'AFILIAR_TEL') {
        const cTel = extract10Digits(userInput)
        if (!cTel || cTel.length !== 10) { await sendWA(fromPhone, `⚠️ Número inválido. Escribe los 10 dígitos o "cancelar":`); return new Response('OK', { status: 200 }) }
        
        const { data: exist } = await supabase.from('clientes').select('id, nombre').ilike('telefono', `%${cTel}%`).maybeSingle()
        if (exist) {
          await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)
          await sendWA(fromPhone, `ℹ️ El cliente ${cTel} ya estaba registrado como *${exist.nombre}*.`)
          await enviarMenuPrincipal(fromPhone, nombreRest)
          return new Response('OK', { status: 200 })
        }
        
        stateObj.state = 'AFILIAR_NOM'
        stateObj.cTel = cTel
        await supabase.from('bot_memory').update({ history: [stateObj], updated_at: new Date().toISOString() }).eq('phone', `b2b_state_${from10}`)
        await sendWA(fromPhone, `✍️ Escribe el *Nombre* del cliente:`)
        return new Response('OK', { status: 200 })
      }

      if (state === 'AFILIAR_NOM') {
        const cTel = stateObj.cTel
        const nombreLimpio = userInput.slice(0, 60)
        await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)
        
        // Anti-Spam Check: Max 15 afiliaciones por día por restaurante
        const tz = 'America/Mexico_City';
        const dateStr = new Date().toLocaleString("en-US", { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
        const [month, day, year] = dateStr.split('/');
        const isoStart = `${year}-${month}-${day}T00:00:00.000-06:00`;
        const startOfTodayMX = new Date(isoStart).toISOString();
        
        const { count } = await supabase.from('restaurante_loyalty_log').select('id', { count: 'exact', head: true })
          .eq('restaurante_id', restauranteId).eq('accion', 'afiliar_cliente').gte('created_at', startOfTodayMX)
        const afiliacionesHoy = count || 0
        if (afiliacionesHoy >= 15) {
          await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)
          await sendWA(fromPhone, `⚠️ Has alcanzado tu límite de seguridad de *15 invitaciones VIP* por hoy.\nPor favor, intenta de nuevo mañana.`)
          await enviarMenuPrincipal(fromPhone, nombreRest)
          return new Response('OK', { status: 200 })
        }

        const loyaltyUrl = `https://www.app-estrella.shop/loyalty/${cTel}`
        const qrCode = generateCloudinaryVIPCard(cTel, nombreLimpio, 0, 0, false)
        const { error } = await supabase.from('clientes').insert({ telefono: cTel, nombre: nombreLimpio, acepta_terminos: false, puntos: 0, qr_code: qrCode })
        
        if (error) { await sendWA(fromPhone, `❌ Error interno al registrar. Posiblemente el cliente ya existe.`); return new Response('OK', { status: 200 }) }
        
        // Log de auditoría
        await supabase.from('restaurante_loyalty_log').insert({ restaurante_id: restauranteId, cliente_tel: cTel, accion: 'afiliar_cliente', valor: 0, descripcion: `Afilió a ${nombreLimpio}` })
        
        await sendWA(fromPhone, `🎉 *${nombreLimpio}* ha sido afiliado.\nLe estoy enviando su invitación VIP ahora mismo. 📲`)
        const tcMsg = `👋 ¡Hola *${nombreLimpio}*!\n\n*${nombreRest}* te ha invitado al programa VIP de *Estrella Delivery* 🌟\n\nAcumularás recompensas aquí y en envíos. ¿Deseas unirte?`
        await sendInteractiveButtons(`52${cTel}`, tcMsg, [{ id: 'ACEPTAR_TERMINOS', title: '✅ Sí, unirme' }, { id: 'RECHAZAR_TERMINOS', title: '❌ No, gracias' }])
        await enviarMenuPrincipal(fromPhone, nombreRest)
        return new Response('OK', { status: 200 })
      }

      // PUNTOS FLUJO
      if (state === 'PUNTOS_TEL') {
        const cTel = extract10Digits(userInput)
        if (!cTel || cTel.length !== 10) { await sendWA(fromPhone, `⚠️ Número inválido. Escríbelo bien o "cancelar":`); return new Response('OK', { status: 200 }) }
        
        const { data: c } = await supabase.from('clientes').select('id, nombre, acepta_terminos').ilike('telefono', `%${cTel}%`).maybeSingle()
        if (!c) {
          await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)
          await sendWA(fromPhone, `❌ Cliente no encontrado. Afílalo primero tocando "➕ Afiliar Cliente".`)
          await enviarMenuPrincipal(fromPhone, nombreRest)
          return new Response('OK', { status: 200 })
        }
        if (!c.acepta_terminos) {
          await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)
          await sendWA(fromPhone, `❌ El cliente ${cTel} aún no acepta los términos y condiciones VIP. No puedes sumarle puntos.`)
          await enviarMenuPrincipal(fromPhone, nombreRest)
          return new Response('OK', { status: 200 })
        }
        
        stateObj.state = 'PUNTOS_CANT'
        stateObj.cTel = cTel
        stateObj.cNombre = c.nombre || cTel
        await supabase.from('bot_memory').update({ history: [stateObj], updated_at: new Date().toISOString() }).eq('phone', `b2b_state_${from10}`)
        await sendWA(fromPhone, `🔢 ¿Cuántos puntos deseas sumar a *${stateObj.cNombre}*?\n(Ejemplo: 1 o 2. Máximo 10)`)
        return new Response('OK', { status: 200 })
      }

      if (state === 'PUNTOS_CANT') {
        const cant = Math.min(parseInt(userInput) || 0, MAX_PUNTOS_POR_ACCION)
        if (cant <= 0) { await sendWA(fromPhone, `⚠️ Escribe un número mayor a 0:`); return new Response('OK', { status: 200 }) }
        
        const cTel   = stateObj.cTel
        const cNombre = stateObj.cNombre
        await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)

        // Bug 2 fix: Upsert ATÓMICO via RPC para evitar race conditions
        const { data: rpcResult, error: rpcError } = await supabase.rpc('fn_incrementar_puntos_restaurante', {
          p_restaurante_id: restauranteId,
          p_cliente_tel:    cTel,
          p_puntos:         cant
        })

        if (rpcError || !rpcResult?.ok) {
          console.error('[B2B PUNTOS] RPC falló:', rpcError?.message || rpcResult)
          await sendWA(fromPhone, `❌ Error al sumar puntos. Intenta de nuevo.`)
          return new Response('OK', { status: 200 })
        }

        const newPts     = rpcResult.puntos
        const newVisitas = rpcResult.visitas

        // Barra de progreso (meta = 5 puntos por defecto para restaurante B2B)
        const META_B2B = 5
        const progressBar = buildProgressBar(newPts, META_B2B)

        await sendWA(fromPhone, `✅ Has sumado *${cant} punto(s)* a ${cNombre}.\n📊 Puntos en tu local: *${newPts} pts*\n👀 Visitas totales: ${newVisitas}`)
        try {
          // Usa plantilla para brincar la restricción de 24 horas de WhatsApp
          await sendWATemplate(`52${cTel}`, 'estrella_puntos_acumulados', [cNombre, cant.toString(), newPts.toString()], undefined, cTel)
        } catch (e) {
          // Si falla la plantilla, intenta texto libre con la barra de progreso
          await sendWA(`52${cTel}`, `⭐ *¡Sumamos puntos en ${nombreRest}!*\n\n${progressBar}`)
        }
        await enviarMenuPrincipal(fromPhone, nombreRest)
        return new Response('OK', { status: 200 })
      }

      // INFO FLUJO
      if (state === 'INFO_TEL') {
        const cTel = extract10Digits(userInput)
        await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)
        if (!cTel || cTel.length !== 10) { 
          await sendWA(fromPhone, `⚠️ Número inválido.`); 
          await enviarMenuPrincipal(fromPhone, nombreRest); 
          return new Response('OK', { status: 200 }) 
        }

        const { data: c } = await supabase.from('clientes').select('nombre, reputacion').ilike('telefono', `%${cTel}%`).maybeSingle()
        if (!c) { 
          await sendWA(fromPhone, `❌ Cliente no encontrado.`); 
          await enviarMenuPrincipal(fromPhone, nombreRest); 
          return new Response('OK', { status: 200 }) 
        }

        // Consultar puntos en Estrella y puntos en este Restaurante
        const { data: restPts } = await supabase.from('restaurante_clientes_puntos').select('puntos, visitas').eq('restaurante_id', restauranteId).eq('cliente_tel', cTel).maybeSingle()

        const info = `📊 *Perfil de Cliente*\n👤 *${c.nombre || cTel}*\n🗣️ Reputación general: *${c.reputacion || 'Sin calificar'}*\n\n` +
                     `🏪 *Lealtad en tu Local:*\n🎁 Puntos acumulados: *${restPts?.puntos || 0}*\n👀 Visitas totales: *${restPts?.visitas || 0}*`
        await sendWA(fromPhone, info)
        await enviarMenuPrincipal(fromPhone, nombreRest)
        return new Response('OK', { status: 200 })
      }

      // REGALAR FLUJO (El restaurante patrocina un envío en Estrella Delivery)
      if (state === 'REGALAR_TEL') {
        const cTel = extract10Digits(userInput)
        await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)
        if (!cTel || cTel.length !== 10) { 
          await sendWA(fromPhone, `⚠️ Número inválido.`); 
          await enviarMenuPrincipal(fromPhone, nombreRest); 
          return new Response('OK', { status: 200 }) 
        }

        // Bug 1 Fix: Ajustar límite de zona horaria (UTC -> MX)
        const tz = 'America/Mexico_City';
        const dateStr = new Date().toLocaleString("en-US", { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
        const [month, day, year] = dateStr.split('/');
        const isoStart = `${year}-${month}-${day}T00:00:00.000-06:00`;
        const startOfTodayMX = new Date(isoStart).toISOString();
        
        const { count } = await supabase.from('restaurante_loyalty_log').select('id', { count: 'exact', head: true })
          .eq('restaurante_id', restauranteId).eq('accion', 'regalar_envio').gte('created_at', startOfTodayMX)
        const regalosHoy = count || 0
        if (regalosHoy >= MAX_REGALOS_POR_DIA) {
          await sendWA(fromPhone, `⚠️ Has alcanzado el límite de *${MAX_REGALOS_POR_DIA} envíos gratis* por hoy.`)
          await enviarMenuPrincipal(fromPhone, nombreRest)
          return new Response('OK', { status: 200 })
        }

        const { data: c } = await supabase.from('clientes').select('nombre, acepta_terminos').ilike('telefono', `%${cTel}%`).maybeSingle()
        if (!c) { 
          await sendWA(fromPhone, `❌ Cliente no encontrado.`); 
          await enviarMenuPrincipal(fromPhone, nombreRest); 
          return new Response('OK', { status: 200 }) 
        }
        if (!c.acepta_terminos) {
          await sendWA(fromPhone, `❌ El cliente ${cTel} aún no acepta los términos VIP. No puedes regalarle envíos.`)
          await enviarMenuPrincipal(fromPhone, nombreRest)
          return new Response('OK', { status: 200 })
        }

        await supabase.rpc('increment_cliente_envios_gratis', { p_tel: cTel, p_amount: 1 })
        await supabase.from('restaurante_loyalty_log').insert({ restaurante_id: restauranteId, cliente_tel: cTel, accion: 'regalar_envio', valor: 1, descripcion: `Regalo ${nombreRest}` })

        await sendWA(fromPhone, `✅ Has regalado 1 envío gratis a *${c.nombre || cTel}*.\n(${regalosHoy + 1}/${MAX_REGALOS_POR_DIA} regalos hoy)`)
        try {
          await sendWA(`52${cTel}`, `🎁 *¡Sorpresa!*\n\n*${nombreRest}* te acaba de patrocinar un *Envío Gratis* como agradecimiento. 🎉\n¡Pídeles algo rico a través de Estrella Delivery! 🛵`)
        } catch(e) {
          await sendWA(fromPhone, `⚠️ Regalo procesado, pero no se pudo notificar al cliente por WhatsApp.`)
        }
        await enviarMenuPrincipal(fromPhone, nombreRest)
        return new Response('OK', { status: 200 })
      }
    }

    // Si escriben algo sin estar en sesión
    if (textBody === 'hola' || textBody === 'menu' || textBody === '/menu') {
      await enviarMenuPrincipal(fromPhone, nombreRest)
      return new Response('OK', { status: 200 })
    }

    // Si escriben un número de teléfono directamente para acción rápida (permite formatos como +52 1 963...)
    const numDigits = textBody.replace(/\D/g, '').length
    if (numDigits >= 10 && numDigits <= 15 && textBody.length <= 25) {
      const posibleTelefono = extract10Digits(textBody)
      await sendInteractiveList(
        fromPhone,
        `📲 *Acción rápida* para el cliente \`${posibleTelefono}\`\nSelecciona qué deseas hacer:`,
        `Elegir acción`,
        [
          {
            title: 'Opciones Rápidas',
            rows: [
              { id: `RFAST_PUNTOS_${posibleTelefono}`, title: '⭐ Sumar Puntos', description: 'Premiar visita al local' },
              { id: `RFAST_INFO_${posibleTelefono}`, title: '📊 Ver Perfil', description: 'Consultar datos' },
              { id: `RFAST_REGALAR_${posibleTelefono}`, title: '🎁 Regalar Envío', description: 'Patrocinar envío' }
            ]
          }
        ]
      )
      return new Response('OK', { status: 200 })
    }
  }

  // 3. Fallback: Si no era un comando del portal B2B, dejamos que siga al flujo normal (AI/Pedidos)
  return null
}

// ── Handler para cuando el Restaurante envía una FOTO (escaner de QR) ────────────
export async function handleRestaurantPhoto(
  supabase: any,
  fromPhone: string,
  from10: string,
  restauranteId: string,
  nombreRest: string,
  imageMsg: any
): Promise<Response | null> {
  const permitido = await _verificarAcceso(supabase, restauranteId)
  if (!permitido) return null

  const mediaId = imageMsg?.id
  if (!mediaId) return null

  await sendWA(fromPhone, `📸 Leyendo Tarjeta VIP... un momento.`)

  try {
    // 1. Descargar imagen de WhatsApp
    const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN')!
    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` }
    })
    if (!metaRes.ok) {
      await sendWA(fromPhone, `❌ No pude descargar la imagen. Inténtalo de nuevo.`)
      return new Response('OK', { status: 200 })
    }
    const { url: mediaUrl } = await metaRes.json()

    // 2. Decodificar QR usando la URL pública (descargada via API de qrserver.com)
    // Primero necesitamos subir la imagen a un lugar accesible públicamente para que qrserver la lea
    const fileRes = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${WA_TOKEN}` } })
    if (!fileRes.ok) { await sendWA(fromPhone, `❌ Error descargando imagen.`); return new Response('OK', { status: 200 }) }
    const buffer = await fileRes.arrayBuffer()

    // Subir temporalmente a Supabase Storage (bucket público)
    const tmpPath = `qr_scan_tmp/${from10}_${Date.now()}.jpg`
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const { error: upErr } = await supabase.storage.from('fachadas_clientes').upload(tmpPath, buffer, { contentType: 'image/jpeg', upsert: true })
    if (upErr) { await sendWA(fromPhone, `❌ Error interno al procesar imagen.`); return new Response('OK', { status: 200 }) }

    const { data: urlData } = supabase.storage.from('fachadas_clientes').getPublicUrl(tmpPath)
    const publicUrl = urlData?.publicUrl
    if (!publicUrl) { await sendWA(fromPhone, `❌ No pude procesar la imagen.`); return new Response('OK', { status: 200 }) }

    // 3. Decodificar QR desde URL pública
    const qrText = await decodeQRFromUrl(publicUrl)

    // Limpieza asincrónica del archivo temporal
    supabase.storage.from('fachadas_clientes').remove([tmpPath]).catch(() => {})

    if (!qrText) {
      await sendWA(fromPhone, `⚠️ No pude leer el código QR en la foto.\n\n*Consejos:*\n• Asegúrate que el QR esté bien enfocado\n• Además puedes escribir el número del cliente directamente`)
      return new Response('OK', { status: 200 })
    }

    // 4. Extraer teléfono del QR (formato: https://app-estrella.shop/loyalty/9630000001)
    const telMatch = qrText.match(/(\d{10,13})$/)
    if (!telMatch) {
      await sendWA(fromPhone, `⚠️ QR leído pero no contiene un número de cliente válido.\nQR: _${qrText.substring(0, 60)}_`)
      return new Response('OK', { status: 200 })
    }
    const cTel = extract10Digits(telMatch[1])
    console.log(`[QR_SCAN] Teléfono detectado del QR: ${cTel}`)

    // 5. Verificar que el cliente existe
    const { data: cliente } = await supabase.from('clientes').select('nombre, acepta_terminos').ilike('telefono', `%${cTel}%`).maybeSingle()
    const nombreCliente = cliente?.nombre || cTel

    // 6. Mostrar menú rápido igual que si hubieran mandado el número
    await sendInteractiveList(
      fromPhone,
      `📸 *QR detectado*\n👤 Cliente: *${nombreCliente}* \`${cTel}\`\n\nSelecciona qué deseas hacer:`,
      `Elegir acción`,
      [
        {
          title: 'Opciones Rápidas',
          rows: [
            { id: `RFAST_PUNTOS_${cTel}`, title: '⭐ Sumar Puntos', description: 'Premiar visita al local' },
            { id: `RFAST_INFO_${cTel}`, title: '📊 Ver Perfil', description: 'Consultar datos' },
            { id: `RFAST_REGALAR_${cTel}`, title: '🎁 Regalar Envío', description: 'Patrocinar envío' }
          ]
        }
      ]
    )
    return new Response('OK', { status: 200 })
  } catch (e) {
    console.error('[QR_SCAN] Error fatal:', e)
    await sendWA(fromPhone, `❌ Error inesperado al escanear. Escribe el número manualmente.`)
    return new Response('OK', { status: 200 })
  }
}
