import { sendWA, sendInteractiveList, sendInteractiveButtons, sendWATemplate } from './whatsapp.ts'
import { extract10Digits, generateCloudinaryVIPCard } from '../_shared/utils.ts'

// Límites de seguridad para evitar abuso
const MAX_PUNTOS_POR_ACCION = 10
const MAX_REGALOS_POR_DIA = 2

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

// ── Menú Principal Interactivo (con contador dinámico de regalos disponibles) ─
async function enviarMenuPrincipal(fromPhone: string, nombreRest: string, supabase?: any, restauranteId?: string) {
  // Calcular cuántos regalos quedan hoy para mostrarlo en el botón
  let regalosQuedan = MAX_REGALOS_POR_DIA
  if (supabase && restauranteId) {
    try {
      const tz = 'America/Mexico_City'
      const dateStr = new Date().toLocaleString('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      const [m, d, y] = dateStr.split('/')
      const hoy = new Date(`${y}-${m}-${d}T00:00:00.000-06:00`).toISOString()
      const { count } = await supabase.from('restaurante_loyalty_log')
        .select('id', { count: 'exact', head: true })
        .eq('restaurante_id', restauranteId)
        .eq('accion', 'regalar_envio')
        .gte('created_at', hoy)
      regalosQuedan = Math.max(0, MAX_REGALOS_POR_DIA - (count || 0))
    } catch (_) { /* no bloquear el menú si falla */ }
  }

  const labelRegalar = regalosQuedan > 0
    ? `🎁 Regalar Envío (quedan ${regalosQuedan} hoy)`
    : `🎁 Regalar Envío (límite alcanzado ⏰)`

  await sendInteractiveList(
    fromPhone,
    `🏪 *Portal de Aliados — Estrella Delivery*\nBienvenido: *${nombreRest}*\n\n💡 *Tip de Velocidad:* Para afiliar clientes o sumarles puntos rápidamente, no necesitas tocar los botones. ¡Solo mándame la foto de su código QR y listo! 📸\n\nSi necesitas otras opciones, elige aquí abajo:`,
    `Abrir Menú`,
    [
      {
        title: 'Gestión Rápida',
        rows: [
          { id: 'REST_MENU_AFILIAR', title: '➕ Afiliar + Puntos', description: 'Registrar cliente y sumar puntos' },
          { id: 'REST_MENU_MOTO', title: '🛵 Solicitar Moto', description: 'Pedir un repartidor Estrella' },
          { id: 'REST_MENU_PUNTOS', title: '⭐ Sumar Puntos', description: 'Premiar visita al local' },
          { id: 'REST_MENU_CANJEAR', title: '🎟️ Canjear Puntos', description: 'Cobrar recompensa del cliente' },
          { id: 'REST_MENU_INFO', title: '📊 Ver Perfil VIP', description: 'Consultar datos de un cliente' },
          { id: 'REST_MENU_REGALAR', title: labelRegalar, description: `Absorbe Estrella Delivery` }
        ]
      },
      {
        title: 'Mi Negocio',
        rows: [
          { id: 'REST_MENU_RESUMEN', title: '📈 Mi Resumen de Hoy', description: 'Ver actividad del día' },
          { id: 'REST_MENU_HISTORIAL', title: '📜 Ver Movimientos', description: 'Últimas 10 acciones' },
          { id: 'REST_MENU_BROADCAST', title: '📢 Enviar Promo VIP', description: 'Mensaje masivo a tus clientes' }
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
  const buttonId = isInteractive ? ((msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || msg.button?.payload || msg.button?.text) as string || '') : ''

  if (!permitido) {
    const loyaltyActions = ['REST_MENU_AFILIAR', 'REST_MENU_PUNTOS', 'REST_MENU_CANJEAR', 'REST_MENU_INFO', 'REST_MENU_REGALAR', 'REST_MENU_BROADCAST', 'REST_MENU_HISTORIAL', 'REST_MENU_RESUMEN']
    const isLoyaltyButton = isInteractive && (loyaltyActions.includes(buttonId) || buttonId.startsWith('RFAST_'))
    // Un texto que empieza con http o { generalmente es un QR escaneado para sumar puntos
    const isQRText = msgType === 'text' && (textBody.startsWith('http') || textBody.startsWith('{'))

    if (isLoyaltyButton || isQRText) {
      await sendWA(fromPhone, `🔒 Tu restaurante aún no tiene activo el programa de lealtad.\n\nContacta a *Estrella Delivery* para activarlo y poder afiliar clientes. 🌟`)
      return new Response('OK', { status: 200 })
    }
    // Dejamos pasar 'hola', 'menu', '/ayuda', y 'REST_MENU_MOTO'
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
    else if (action === 'AFILIAR') targetState = 'AFILIAR_TEL'
    else if (action === 'CANJEAR') targetState = 'CANJEAR_TEL'

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

      const afiliados    = logs?.filter((l: any) => l.accion === 'afiliar_cliente').length || 0
      const ptsSumados   = logs?.filter((l: any) => l.accion === 'sumar_puntos').reduce((s: number, l: any) => s + (l.valor || 0), 0) || 0
      const regalados    = logs?.filter((l: any) => l.accion === 'regalar_envio').length || 0
      const visitasUnicas = new Set(logs?.filter((l: any) => l.accion === 'sumar_puntos').map((l: any) => l.cliente_tel)).size
      const regalosQuedan = Math.max(0, MAX_REGALOS_POR_DIA - regalados)

      const fecha = new Date().toLocaleDateString('es-MX', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })
      await sendWA(fromPhone,
        `📈 *Resumen de hoy — ${fecha}*\n` +
        `Restaurante: *${nombreRest}*\n` +
        `───────────────────\n` +
        `➕ Nuevos afiliados: *${afiliados}*\n` +
        `⭐ Puntos sumados: *${ptsSumados}*\n` +
        `👀 Visitas únicas: *${visitasUnicas}*\n` +
        `🎁 Envíos regalados: *${regalados}/${MAX_REGALOS_POR_DIA}*` +
        (regalosQuedan > 0
          ? ` — te queda${regalosQuedan === 1 ? '' : 'n'} *${regalosQuedan}* para hoy 🎁`
          : ` — *límite del día alcanzado* ⏰`) + `\n` +
        `───────────────────\n` +
        `_¡Sigue así! Cada visita cuenta._ 💪`
      )
      return new Response('OK', { status: 200 })
    }

    if (buttonId === 'REST_MENU_HISTORIAL') {
      const { data: logs } = await supabase.from('restaurante_loyalty_log')
        .select('accion, valor, cliente_tel, created_at')
        .eq('restaurante_id', restauranteId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (!logs || logs.length === 0) {
        await sendWA(fromPhone, `📜 *Historial de Movimientos*\n\nAún no tienes movimientos registrados en tu local.`)
        return new Response('OK', { status: 200 })
      }

      const tz = 'America/Mexico_City'
      const lineas = logs.map((l: any) => {
        const fecha = new Date(l.created_at).toLocaleString('es-MX', { timeZone: tz, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        const telOculto = l.cliente_tel.slice(0, 3) + '****' + l.cliente_tel.slice(-3)
        let icono = '🔸'
        let desc = ''
        if (l.accion === 'sumar_puntos') { icono = '🟢'; desc = `+${l.valor} pts` }
        else if (l.accion === 'canjear_recompensa') { icono = '🔴'; desc = `-${l.valor} pts` }
        else if (l.accion === 'afiliar_cliente') { icono = '👤'; desc = `Nuevo` }
        else if (l.accion === 'regalar_envio') { icono = '🎁'; desc = `Regalo` }
        
        return `${icono} \`${telOculto}\` — *${desc}*\n   📅 _${fecha}_`
      }).join('\n\n')

      await sendWA(fromPhone, `📜 *Últimos 10 Movimientos*\nRestaurante: *${nombreRest}*\n\n${lineas}`)
      return new Response('OK', { status: 200 })
    }

    let promptMsg = ''
    let newState = ''
    
    if (buttonId === 'REST_MENU_MOTO') {
      const { sendInteractiveFlow } = await import('./whatsapp.ts')
      const flowToken = JSON.stringify({ phone: fromPhone })
      await sendInteractiveFlow(fromPhone, `🛵 *Solicitar Moto B2B*\n\nLlena este formulario rápido para despachar tu moto de inmediato:`, `📝 Llenar Formulario`, `1367997788584171`, flowToken, `SOLICITAR_MOTO`)
      return new Response('OK', { status: 200 })
    }

    // AFILIAR ahora usa PUNTOS_TEL: registra al cliente si no existe y suma puntos en 1 solo paso
    if (buttonId === 'REST_MENU_AFILIAR') { promptMsg = 'Escribe el número a *10 dígitos* del cliente:\n_Si es nuevo lo registramos al vuelo y le sumas puntos de inmediato._ 📱'; newState = 'PUNTOS_TEL' }
    else if (buttonId === 'REST_MENU_PUNTOS') { promptMsg = 'Escribe el número a *10 dígitos* del cliente:\n_(También puedes enviar una foto de su Tarjeta VIP QR)_ 📸'; newState = 'PUNTOS_TEL' }
    else if (buttonId === 'REST_MENU_CANJEAR') { promptMsg = 'Escribe el número a *10 dígitos* del cliente que va a cobrar su recompensa:'; newState = 'CANJEAR_TEL' }
    else if (buttonId === 'REST_MENU_REGALAR') { promptMsg = 'Escribe el número a *10 dígitos* del cliente a premiar:'; newState = 'REGALAR_TEL' }
    else if (buttonId === 'REST_MENU_INFO') { promptMsg = 'Escribe el número a *10 dígitos* del cliente a consultar:'; newState = 'INFO_TEL' }
    else if (buttonId === 'REST_MENU_BROADCAST') {
      const { sendInteractiveFlow } = await import('./whatsapp.ts')
      const flowToken = JSON.stringify({ phone: fromPhone, restId: restauranteId, restName: nombreRest })
      await sendInteractiveFlow(fromPhone, `📣 *Creador de Promociones*\n\nUsa este formulario para redactar y segmentar tu promoción a los clientes afiliados:`, `📝 Crear Promoción`, `1047676157695788`, flowToken, `crear_promo`)
      return new Response('OK', { status: 200 })
    }

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
    await enviarMenuPrincipal(fromPhone, nombreRest, supabase, restauranteId)
    return new Response('OK', { status: 200 })
  }

  // 2. Procesamiento de Texto (Máquina de Estados o Comandos directos)
  if (msgType === 'text') {
    const { data: memData } = await supabase.from('bot_memory').select('history, updated_at').eq('phone', `b2b_state_${from10}`).maybeSingle()
    const stateObj = memData?.history?.[0]

    if (stateObj) {
      const state = stateObj.state
      const userInput = (msg.text?.body as string).trim()

      // 1. Timeout de Inactividad (15 mins)
      const lastUpdate = new Date(memData.updated_at).getTime()
      if (Date.now() - lastUpdate > 15 * 60 * 1000) {
        await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)
        await sendWA(fromPhone, `⏱️ _Tu sesión anterior expiró por inactividad._`)
        await enviarMenuPrincipal(fromPhone, nombreRest, supabase, restauranteId)
        return new Response('OK', { status: 200 })
      }

      // Función auxiliar para registrar errores de búsqueda (Rate Limit Antifraude)
      const checkRateLimit = async () => {
        const rlKey = `rl_err_${from10}`
        const { data: rlData } = await supabase.from('bot_memory').select('history').eq('phone', rlKey).maybeSingle()
        const errTimes = ((rlData?.history as number[]) || []).filter(t => t > Date.now() - 60 * 60 * 1000) // últimos 60 mins
        if (errTimes.length >= 10) {
          await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)
          await sendWA(fromPhone, `⛔ *Bloqueo de seguridad*\n\nHas ingresado demasiados números inválidos o inexistentes.\nPor seguridad, tu acceso ha sido suspendido temporalmente.`)
          const { notifyAdmin } = await import('./whatsapp.ts')
          await notifyAdmin(`El restaurante *${nombreRest}* (${from10}) fue bloqueado por buscar más de 10 clientes inválidos en 1 hora.`)
          return false
        }
        errTimes.push(Date.now())
        await supabase.from('bot_memory').upsert({ phone: rlKey, history: errTimes, updated_at: new Date().toISOString() })
        return true
      }

      // AFILIAR FLUJO
      if (state === 'AFILIAR_TEL') {
        const cTel = extract10Digits(userInput)
        if (!cTel || cTel.length !== 10) { await sendWA(fromPhone, `⚠️ Número inválido. Escribe los 10 dígitos o "cancelar":`); return new Response('OK', { status: 200 }) }
        
        const { data: exist } = await supabase.from('clientes').select('id, nombre, acepta_terminos').eq('telefono', cTel).maybeSingle()
        if (exist) {
          if (!exist.acepta_terminos) {
            await sendWA(fromPhone, `ℹ️ El cliente *${exist.nombre}* ya está en el sistema pero no ha aceptado los términos. Le reenviaré la invitación VIP.`)
            await sendWATemplate(`52${cTel}`, 'estrella_terminos_condiciones', [exist.nombre])
            await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)
            await enviarMenuPrincipal(fromPhone, nombreRest)
            return new Response('OK', { status: 200 })
          } else {
            await sendWA(fromPhone, `ℹ️ El cliente *${exist.nombre}* ya está registrado en el programa VIP. Pasando directamente a sumarle puntos...`)
            stateObj.state = 'PUNTOS_CANT'
            stateObj.cTel = cTel
            stateObj.cNombre = exist.nombre
            await supabase.from('bot_memory').update({ history: [stateObj], updated_at: new Date().toISOString() }).eq('phone', `b2b_state_${from10}`)
            await sendWA(fromPhone, `🔢 ¿Cuántos puntos deseas sumar a *${exist.nombre}*?\n(Ejemplo: 1 o 2. Máximo 10)`)
            return new Response('OK', { status: 200 })
          }
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
        
        // Guardar estado pendiente para notificar al restaurante cuando acepte
        await supabase.from('bot_memory').upsert({
          phone: `pending_rest_invite_${cTel}`,
          history: [{ restPhone: fromPhone, restName: nombreRest }],
          updated_at: new Date().toISOString()
        })
        
        await sendWA(fromPhone, `🎉 *${nombreLimpio}* ha sido afiliado en el sistema.\nLe estoy enviando la invitación oficial a los Términos y Condiciones ahora mismo. 📲`)
        
        const templateResult = await sendWATemplate(`52${cTel}`, 'estrella_terminos_condiciones', [nombreLimpio])
        if (!templateResult.ok) {
           await sendWA(fromPhone, `⚠️ Hubo un problema al enviar la invitación a WhatsApp: ${templateResult.error?.substring(0,100)}`)
        }
        await enviarMenuPrincipal(fromPhone, nombreRest)
        return new Response('OK', { status: 200 })
      }

      // PUNTOS FLUJO
      // Si el cliente no existe → registro rápido y suma de inmediato
      // Si existe pero no aceptó términos → se suma igual (el restaurante lo avala)
      if (state === 'PUNTOS_TEL') {
        const cTel = extract10Digits(userInput)
        if (!cTel || cTel.length !== 10) { await sendWA(fromPhone, `⚠️ Número inválido. Escríbelo bien o "cancelar":`); return new Response('OK', { status: 200 }) }
        
        let { data: c } = await supabase.from('clientes').select('id, nombre').eq('telefono', cTel).maybeSingle()
        let esClienteNuevo = false

        if (!c) {
          // Registro rápido: el restaurante avala al cliente
          esClienteNuevo = true
          const qrCode = generateCloudinaryVIPCard(cTel, cTel, 0, 0, false)
          const { error: insErr } = await supabase.from('clientes').insert({
            telefono: cTel,
            nombre: cTel, // nombre temporal, se actualiza cuando el cliente escriba
            acepta_terminos: true,
            puntos: 0,
            qr_code: qrCode
          })
          if (!insErr) {
            c = { id: null, nombre: cTel }
          } else {
            // Puede que ya existiera por race condition
            const { data: reCheck } = await supabase.from('clientes').select('id, nombre').eq('telefono', cTel).maybeSingle()
            c = reCheck
          }
          console.log(`[B2B_PUNTOS] Registro rápido de ${cTel} avalado por ${nombreRest}`)
        }

        if (!c) {
          await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)
          await sendWA(fromPhone, `❌ Error interno al registrar al cliente. Intenta de nuevo.`)
          const { notifyAdmin } = await import('./whatsapp.ts')
          await notifyAdmin(`Error registrando cliente rápido en ${nombreRest}. Causa probable: falla en DB.`)
          await enviarMenuPrincipal(fromPhone, nombreRest, supabase, restauranteId)
          return new Response('OK', { status: 200 })
        }
        
        stateObj.state = 'PUNTOS_CANT'
        stateObj.cTel = cTel
        stateObj.cNombre = c.nombre || cTel
        stateObj.esClienteNuevo = esClienteNuevo
        await supabase.from('bot_memory').update({ history: [stateObj], updated_at: new Date().toISOString() }).eq('phone', `b2b_state_${from10}`)
        await sendWA(fromPhone,
          (esClienteNuevo ? `📋 _Cliente registrado automáticamente._\n\n` : '') +
          `🔢 ¿Cuántos puntos deseas sumar a *${stateObj.cNombre}*?\n(Ejemplo: 1 o 2. Máximo ${MAX_PUNTOS_POR_ACCION})`
        )
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
          const { notifyAdmin } = await import('./whatsapp.ts')
          await notifyAdmin(`Error sumando ${cant} pts en ${nombreRest} para ${cTel}. Error: ${rpcError?.message || 'RPC Failed'}`)
          return new Response('OK', { status: 200 })
        }

        const newPts     = rpcResult.puntos
        const newVisitas = rpcResult.visitas

        // Barra de progreso (meta = 5 puntos por defecto para restaurante B2B)
        const META_B2B = 5
        const progressBar = buildProgressBar(newPts, META_B2B)

        await sendWA(fromPhone, `✅ Has sumado *${cant} punto(s)* a ${cNombre}.\n📊 Puntos en tu local: *${newPts} pts*\n👀 Visitas totales: ${newVisitas}`)
        
        // Notificación al cliente
        if (stateObj.esClienteNuevo) {
          // Plantilla de bienvenida (Inglés 'en' como indicó Meta)
          const templateResult = await sendWATemplate(`52${cTel}`, 'bienvendo_cte', [cNombre, nombreRest, cant.toString()], undefined, undefined, 'en')
          if (!templateResult.ok) {
            await sendWA(`52${cTel}`, `¡Hola ${cNombre}! 👋\n\n*${nombreRest}* te registró en el programa de recompensas de *Estrella Delivery* 🌟\n\n⭐ *Tus puntos: ${cant}*\nCada que pides a domicilio sumas puntos para tu envío GRATIS. ¡Escríbenos para consultar beneficios! 🔥`)
          }
        } else {
          // Usa plantilla de puntos normal para evitar restricción 24h
          const templateResult = await sendWATemplate(`52${cTel}`, 'estrella_puntos_acumulados', [cNombre, cant.toString(), newPts.toString()], undefined, cTel)
          if (!templateResult.ok) {
            // Fallback texto libre con barra
            await sendWA(`52${cTel}`, `⭐ *¡Sumamos puntos en ${nombreRest}!*\n\n${progressBar}`)
          }
        }
        await enviarMenuPrincipal(fromPhone, nombreRest)
        return new Response('OK', { status: 200 })
      }

      // CANJEAR FLUJO
      if (state === 'CANJEAR_TEL') {
        const cTel = extract10Digits(userInput)
        if (!cTel || cTel.length !== 10) { await sendWA(fromPhone, `⚠️ Número inválido. Escríbelo bien o "cancelar":`); return new Response('OK', { status: 200 }) }
        
        const { data: c } = await supabase.from('clientes').select('id, nombre, acepta_terminos').eq('telefono', cTel).maybeSingle()
        if (!c) {
          if (!(await checkRateLimit())) return new Response('OK', { status: 200 })
          await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)
          await sendWA(fromPhone, `❌ Cliente no encontrado.`)
          await enviarMenuPrincipal(fromPhone, nombreRest, supabase, restauranteId)
          return new Response('OK', { status: 200 })
        }
        
        const { data: restPts } = await supabase.from('restaurante_clientes_puntos').select('puntos').eq('restaurante_id', restauranteId).eq('cliente_tel', cTel).maybeSingle()
        const ptsDisponibles = restPts?.puntos || 0
        
        if (ptsDisponibles <= 0) {
          await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)
          await sendWA(fromPhone, `⚠️ El cliente *${c.nombre || cTel}* tiene *0 puntos* en tu local. No hay recompensas por canjear.`)
          await enviarMenuPrincipal(fromPhone, nombreRest)
          return new Response('OK', { status: 200 })
        }

        stateObj.state = 'CANJEAR_CANT'
        stateObj.cTel = cTel
        stateObj.cNombre = c.nombre || cTel
        stateObj.ptsDisp = ptsDisponibles
        await supabase.from('bot_memory').update({ history: [stateObj], updated_at: new Date().toISOString() }).eq('phone', `b2b_state_${from10}`)
        await sendWA(fromPhone, `🎟️ El cliente *${stateObj.cNombre}* tiene *${ptsDisponibles} puntos*.\n¿Cuántos puntos deseas canjear/descontar? (Ejemplo: 5)`)
        return new Response('OK', { status: 200 })
      }

      if (state === 'CANJEAR_CANT') {
        const cant = parseInt(userInput) || 0
        const ptsDisponibles = stateObj.ptsDisp || 0
        const cTel   = stateObj.cTel
        const cNombre = stateObj.cNombre
        
        if (cant <= 0 || cant > ptsDisponibles) { 
          await sendWA(fromPhone, `⚠️ Número inválido. Escribe una cantidad entre 1 y ${ptsDisponibles}, o escribe "cancelar".`)
          return new Response('OK', { status: 200 }) 
        }
        
        await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)

        // Restar puntos atómicamente usando RPC de incremento con número negativo
        const { data: rpcResult, error: rpcError } = await supabase.rpc('fn_incrementar_puntos_restaurante', {
          p_restaurante_id: restauranteId,
          p_cliente_tel:    cTel,
          p_puntos:         -cant
        })

        if (rpcError || !rpcResult?.ok) {
          await sendWA(fromPhone, `❌ Error interno al descontar puntos. Intenta de nuevo.`)
          return new Response('OK', { status: 200 })
        }

        const newPts = rpcResult.puntos
        await supabase.from('restaurante_loyalty_log').insert({ restaurante_id: restauranteId, cliente_tel: cTel, accion: 'canjear_recompensa', valor: cant, descripcion: `Canjeó recompensa` })

        await sendWA(fromPhone, `✅ Has canjeado *${cant} punto(s)* de ${cNombre}.\n📊 Saldo restante en tu local: *${newPts} pts*`)
        
        const notifyResult = await sendWA(`52${cTel}`, `🎟️ *¡Recompensa Canjeada!*\n\nHas usado *${cant} puntos* en *${nombreRest}*. ¡Esperamos que lo hayas disfrutado! 🤤\n\nTe quedan ${newPts} puntos en este local.`)
        if (!notifyResult.ok) {
          // Ignorar silenciosamente si no hay ventana de 24h
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

        // Consultar cliente + puntos en este restaurante + envíos gratis disponibles
        const [{ data: c }, { data: restPts }] = await Promise.all([
          supabase.from('clientes').select('nombre, reputacion, envios_gratis_disponibles').eq('telefono', cTel).maybeSingle(),
          supabase.from('restaurante_clientes_puntos').select('puntos, visitas').eq('restaurante_id', restauranteId).eq('cliente_tel', cTel).maybeSingle()
        ])

        if (!c) { 
          if (!(await checkRateLimit())) return new Response('OK', { status: 200 })
          await sendWA(fromPhone, `❌ Cliente no encontrado en el sistema.`); 
          await enviarMenuPrincipal(fromPhone, nombreRest, supabase, restauranteId); 
          return new Response('OK', { status: 200 }) 
        }

        const enviosGratis = c.envios_gratis_disponibles || 0
        const lineaEnvios = enviosGratis > 0
          ? `🎁 Envíos gratis disponibles: *${enviosGratis}* 🎉`
          : `🎁 Envíos gratis: *Ninguno aún*`

        const info =
          `📊 *Perfil VIP — ${c.nombre || cTel}*\n` +
          `📞 Tel: \`${cTel}\`\n` +
          `🗣️ Reputación: *${c.reputacion || 'Sin calificar'}*\n` +
          `───────────────────\n` +
          `🏪 *Lealtad en tu Local:*\n` +
          `⭐ Puntos aquí: *${restPts?.puntos || 0}*\n` +
          `👀 Visitas: *${restPts?.visitas || 0}*\n` +
          `───────────────────\n` +
          `🛵 *Estrella Delivery:*\n` +
          lineaEnvios

        await sendWA(fromPhone, info)
        await enviarMenuPrincipal(fromPhone, nombreRest)
        return new Response('OK', { status: 200 })
      }

      // REGALAR FLUJO (El restaurante patrocina un envío en Estrella Delivery)
      // Límite: 2 envíos gratis al día, absorbidos por Estrella Delivery
      if (state === 'REGALAR_TEL') {
        const cTel = extract10Digits(userInput)
        await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)
        if (!cTel || cTel.length !== 10) { 
          await sendWA(fromPhone, `⚠️ Número inválido. Escribe los 10 dígitos del celular del cliente.`); 
          await enviarMenuPrincipal(fromPhone, nombreRest); 
          return new Response('OK', { status: 200 }) 
        }

        // Verificar límite diario del restaurante (zona horaria MX)
        const tz = 'America/Mexico_City';
        const dateStr = new Date().toLocaleString("en-US", { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
        const [month, day, year] = dateStr.split('/');
        const isoStart = `${year}-${month}-${day}T00:00:00.000-06:00`;
        const startOfTodayMX = new Date(isoStart).toISOString();
        
        const { count } = await supabase.from('restaurante_loyalty_log').select('id', { count: 'exact', head: true })
          .eq('restaurante_id', restauranteId).eq('accion', 'regalar_envio').gte('created_at', startOfTodayMX)
        const regalosHoy = count || 0
        if (regalosHoy >= MAX_REGALOS_POR_DIA) {
          await sendWA(fromPhone,
            `🚫 *Límite del día alcanzado*\n\n` +
            `Ya usaste tus *${MAX_REGALOS_POR_DIA} envíos gratis* de hoy.\n` +
            `Mañana se reinicia el contador. ⏰`
          )
          await enviarMenuPrincipal(fromPhone, nombreRest)
          return new Response('OK', { status: 200 })
        }

        // Buscar al cliente; si no existe, registrarlo al vuelo
        let { data: c } = await supabase.from('clientes').select('nombre').eq('telefono', cTel).maybeSingle()
        let nombreCliente = c?.nombre || cTel
        let esNuevo = false

        if (!c) {
          // Registro rápido: el restaurante avala al cliente
          esNuevo = true
          const qrCode = generateCloudinaryVIPCard(cTel, cTel, 0, 0, false)
          const { error: insErr } = await supabase.from('clientes').insert({
            telefono: cTel,
            nombre: cTel, // nombre temporal = teléfono, se actualiza cuando el cliente escriba
            acepta_terminos: true, // el restaurante lo avala directamente
            puntos: 0,
            qr_code: qrCode
          })
          if (insErr) {
            // Si ya existe (race condition), no es error, solo continuamos
            const { data: reCheck } = await supabase.from('clientes').select('nombre').eq('telefono', cTel).maybeSingle()
            nombreCliente = reCheck?.nombre || cTel
          }
          console.log(`[B2B_REGALAR] Registro rápido de cliente ${cTel} avalado por ${nombreRest}`)
        }

        // Acreditar el envío gratis en la cuenta del cliente
        await supabase.rpc('increment_cliente_envios_gratis', { p_tel: cTel, p_amount: 1 })
        await supabase.from('restaurante_loyalty_log').insert({
          restaurante_id: restauranteId,
          cliente_tel: cTel,
          accion: 'regalar_envio',
          valor: 1,
          descripcion: `Regalo de ${nombreRest}${esNuevo ? ' (cliente nuevo)' : ''}`
        })

        const quedan = MAX_REGALOS_POR_DIA - (regalosHoy + 1)
        await sendWA(fromPhone,
          `🎁 *¡Envío regalado!*\n\n` +
          `✅ El cliente *${nombreCliente}* tiene 1 envío gratis acreditado.\n` +
          (esNuevo ? `📋 _Lo registramos automáticamente en el sistema._\n` : '') +
          `\n📊 Regalos de hoy: *${regalosHoy + 1}/${MAX_REGALOS_POR_DIA}*` +
          (quedan > 0 ? ` (te queda${quedan === 1 ? '' : 'n'} *${quedan}* más hoy)` : ` — *límite del día alcanzado*`)
        )
        
        // Notificar al cliente usando plantilla para evitar bloqueo de 24h
        const notifyResult = await sendWATemplate(`52${cTel}`, 'estrella_regalo_envio', [nombreRest])
        if (!notifyResult.ok) {
          await sendWA(`52${cTel}`,
            `🎁 *¡${nombreRest} te regaló un envío gratis!*\n\n` +
            `Tu próximo envío con *Estrella Delivery* es *GRATIS* gracias a *${nombreRest}* 🌟\n\n` +
            `¡Úsalo cuando quieras! Solo escríbenos aquí y te lo aplicamos automáticamente. 🛵💨`
          )
        }

        await enviarMenuPrincipal(fromPhone, nombreRest, supabase, restauranteId)
        return new Response('OK', { status: 200 })
      }

      // BROADCAST FLUJO
      if (state === 'BROADCAST_TXT') {
        const promoText = userInput.slice(0, 250) // Limitar a 250 chars
        await supabase.from('bot_memory').delete().eq('phone', `b2b_state_${from10}`)

        if (promoText.length < 5) {
          await sendWA(fromPhone, `⚠️ Promoción muy corta. Envío cancelado.`)
          await enviarMenuPrincipal(fromPhone, nombreRest, supabase, restauranteId)
          return new Response('OK', { status: 200 })
        }

        await sendWA(fromPhone, `⏳ *Procesando envío masivo...*\n\nBuscando a tus mejores clientes VIP (Top 20). Esto puede tomar unos segundos.`)

        // Obtener el Top 20 de clientes del restaurante
        const { data: topClients } = await supabase.from('restaurante_clientes_puntos')
          .select('cliente_tel, puntos, visitas')
          .eq('restaurante_id', restauranteId)
          .order('puntos', { ascending: false })
          .limit(20)

        if (!topClients || topClients.length === 0) {
          await sendWA(fromPhone, `❌ No tienes clientes registrados aún para enviar la promoción.`)
          await enviarMenuPrincipal(fromPhone, nombreRest, supabase, restauranteId)
          return new Response('OK', { status: 200 })
        }

        // Obtener nombres para la plantilla
        const tels = topClients.map((c: any) => c.cliente_tel)
        const { data: profiles } = await supabase.from('clientes').select('telefono, nombre').in('telefono', tels)
        const profileMap = new Map((profiles || []).map((p: any) => [p.telefono, p.nombre]))

        // Enviar plantillas en paralelo pero sin reventar el límite de rate
        let sent = 0
        const promises = topClients.map(async (c: any) => {
          const tel = c.cliente_tel
          const nombre = profileMap.get(tel) || tel
          const templateResult = await sendWATemplate(`52${tel}`, 'estrella_promo_aliado', [nombre, nombreRest, promoText])
          if (templateResult.ok) {
            sent++
            // Guardar el rastro de la promo por si el cliente responde
            await supabase.from('bot_memory').upsert({
              phone: `last_promo_${tel}`,
              history: [{ restId: restauranteId, restName: nombreRest, promoText }],
              updated_at: new Date().toISOString()
            })
          }
          await new Promise(r => setTimeout(r, 100)) // peque delay
        })

        // Edge Functions de Supabase permiten que Promesas background continúen si no retornamos enseguida
        await Promise.allSettled(promises)

        await sendWA(fromPhone, `✅ *¡Promoción enviada con éxito!*\n\nSe entregó a *${sent} clientes VIP* de tu local.\n\n_Recuerda estar atento a tus pedidos. 🛵_`)
        
        // Log para tracking tuyo
        const { notifyAdmin } = await import('./whatsapp.ts')
        await notifyAdmin(`📢 *Broadcast B2B* enviado por ${nombreRest} a ${sent} clientes:\n"${promoText}"`)

        await enviarMenuPrincipal(fromPhone, nombreRest, supabase, restauranteId)
        return new Response('OK', { status: 200 })
      }
    }

    // Si escriben algo sin estar en sesión
    if (textBody === 'hola' || textBody === 'menu' || textBody === '/menu') {
      await enviarMenuPrincipal(fromPhone, nombreRest, supabase, restauranteId)
      return new Response('OK', { status: 200 })
    }

    // Si escriben un número de teléfono directamente para acción rápida (permite formatos como +52 1 963...)
    const numDigits = textBody.replace(/\D/g, '').length
    if (numDigits >= 10 && numDigits <= 15 && textBody.length <= 25) {
      const posibleTelefono = extract10Digits(textBody)
      const { data: existeRapido } = await supabase.from('clientes').select('id, nombre').eq('telefono', posibleTelefono).maybeSingle()
      
      let rows: any[] = []
      let tituloMensaje = ''
      let tituloBoton = ''

      if (existeRapido) {
        rows = [
          { id: `RFAST_PUNTOS_${posibleTelefono}`, title: '⭐ Sumar Puntos', description: 'Premiar visita al local' },
          { id: `RFAST_CANJEAR_${posibleTelefono}`, title: '🎟️ Canjear Puntos', description: 'Cobrar recompensa' },
          { id: `RFAST_INFO_${posibleTelefono}`, title: '📊 Ver Perfil', description: 'Consultar datos' },
          { id: `RFAST_REGALAR_${posibleTelefono}`, title: '🎁 Regalar Envío', description: 'Patrocinar envío' }
        ]
        tituloMensaje = `📲 *Acción rápida* para el cliente \`${posibleTelefono}\`\nSelecciona qué deseas hacer:`
        tituloBoton = `Elegir acción`
      } else {
        rows = [
          { id: `RFAST_AFILIAR_${posibleTelefono}`, title: '➕ Afiliar Cliente', description: 'Registrar nuevo VIP' }
        ]
        tituloMensaje = `⚠️ El número \`${posibleTelefono}\` *no está registrado*.\n¿Deseas afiliarlo ahora?`
        tituloBoton = `Opciones de registro`
      }

      await sendInteractiveList(
        fromPhone,
        tituloMensaje,
        tituloBoton,
        [
          {
            title: 'Opciones Rápidas',
            rows: rows
          }
        ]
      )
      return new Response('OK', { status: 200 })
    }
  }

  // 3. Fallback: Si no era un comando del portal B2B, dejamos que siga al flujo normal (AI/Pedidos)
  return null
}

// ── Botón Menú Restaurantes B2B (Solo admin, por si acaso) ───────────────────
export async function handleAdminRestaurantMenu(supabase: any, fromPhone: string, from10: string, restIds: string[]) {
  // logic ya movida a slash-commands
}

// ── Directorio para Clientes (Take App / Pedir) [DESACTIVADO] ──
export async function enviarCatalogoRestaurantes(supabase: any, fromPhone: string) {
  /*
  const { extract10Digits } = await import('../_shared/utils.ts');
  const tel10 = extract10Digits(fromPhone);

  const [ { data: restaurantes, error }, { data: ultimoPedido } ] = await Promise.all([
    supabase.from('restaurantes').select('id, nombre, descripcion_corta').eq('activo', true).limit(10),
    supabase.from('pedidos').select('id, restaurante, descripcion').eq('cliente_tel', tel10).order('created_at', { ascending: false }).limit(1).maybeSingle()
  ]);
    
  if (error || !restaurantes || restaurantes.length === 0) {
    await sendWA(fromPhone, '😔 Lo sentimos, en este momento no tenemos restaurantes disponibles para pedir.')
    return new Response('OK', { status: 200 })
  }

  const emojis = ['🌮', '🍔', '🍕', '🍣', '🥗', '🍗', '🍜', '🥪', '🍰', '🌭']
  
  const sections: any[] = [];
  
  if (ultimoPedido) {
    const desc = ultimoPedido.descripcion.substring(0, 40) + (ultimoPedido.descripcion.length > 40 ? '...' : '');
    sections.push({
      title: 'Acción Rápida ⚡',
      rows: [{
        id: `REPETIR_PEDIDO_${ultimoPedido.id}`,
        title: `🔄 Repetir Pedido`,
        description: `De ${ultimoPedido.restaurante}: ${desc}`.substring(0, 72)
      }]
    });
  }

  sections.push({
    title: 'Nuestros Favoritos ⭐',
    rows: restaurantes.map((r: any, index: number) => {
      const emoji = emojis[index % emojis.length]
      return {
        id: `CLIENT_REST_MENU_${r.id}`,
        title: `${emoji} ${r.nombre}`,
        description: r.descripcion_corta || 'Toca para ver el delicioso menú ✨'
      }
    })
  });

  await sendInteractiveList(
    fromPhone,
    '✨ *¡Es hora de comer rico!* 🤤\n\n¿De dónde tienes antojo hoy?\nToca el botón de abajo para explorar nuestras opciones. 🛵💨',
    'Ver Opciones 🍽️',
    sections
  )
  */
  
  await sendWA(fromPhone, '⚠️ La función de pedidos por WhatsApp está temporalmente desactivada. Este bot es exclusivo para nuestro programa de Lealtad y Recompensas ⭐.\n\nPara pedir un servicio, mándale mensaje directamente al número de Estrella: *963 153 9156* 📲 y ahí te atienden con gusto.')
  return new Response('OK', { status: 200 })
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
    const { data: cliente } = await supabase.from('clientes').select('nombre, acepta_terminos').eq('telefono', cTel).maybeSingle()
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

export async function handleFlowReply(
  supabase: any,
  fromPhone: string,
  from10: string,
  nfm_reply: any,
  cachedRestData?: any
): Promise<Response | null> {
  const flowName = nfm_reply.name || '';
  const flowData = (() => { try { return JSON.parse(nfm_reply.response_json || '{}') } catch { return {} } })();
  
  // Identificar el flujo ya sea por su nombre de sistema o por los campos únicos de su payload
  if (flowName === 'SOLICITAR_MOTO' || flowName === 'flow_solicitar_moto_b2b' || (flowData.direccion && flowData.tiempo && flowData.telefono)) {
    const { sendWA } = await import('./whatsapp.ts');
    
    if (!cachedRestData) {
      await sendWA(fromPhone, `❌ No tienes un restaurante registrado para solicitar motos.`);
      return new Response('OK', { status: 200 });
    }

    try {
      const telefonoCliente = flowData.telefono;
      const direccionEntrega = flowData.direccion;
      const tiempoEstimado = flowData.tiempo;
      
      const ADMIN_PHONE = Deno.env.get('ADMIN_PHONE') || '9631539156';

      // Insertar en la tabla de pedidos
      const { error: errPedido } = await supabase.from('pedidos').insert({
        restaurante: cachedRestData.nombre,
        cliente_tel: telefonoCliente,
        cliente_nombre: 'Cliente B2B (Moto Rápida)',
        descripcion: `[MOTO B2B] Llevar a: ${direccionEntrega} | Listo: ${tiempoEstimado}`,
        estado: 'pendiente',
        origen: 'b2b_moto'
      });

      if (errPedido) throw errPedido;

      await sendWA(fromPhone, `✅ ¡Tu solicitud de moto ha sido registrada!\n\nDirección: *${direccionEntrega}*\nUn repartidor pasará a recogerlo.`);
      
      // Notificar al admin
      await sendWA(`52${ADMIN_PHONE}`, `🚨 *NUEVA MOTO B2B SOLICITADA* 🚨\nRestaurante: *${cachedRestData.nombre}*\nLlevar a: ${direccionEntrega}\nTiempo estimado: ${tiempoEstimado}\nTel. Cliente: ${telefonoCliente}\n\n👉 Abre tu App de Administrador para verla o reasignarla.`);

      return new Response('OK', { status: 200 });
    } catch (e) {
      console.error('Error procesando Flow:', e);
      const { sendWA } = await import('./whatsapp.ts');
      await sendWA(fromPhone, `❌ Error al procesar tu solicitud. Por favor intenta de nuevo.`);
      return new Response('OK', { status: 200 });
    }
  }

  // Not handled here
  return null;
}
