// supabase/functions/whatsapp-bot/index.ts
// WhatsApp AI Bot — Edge Function (Modular Architecture, Refactored)
// Eliminamos import de serve para usar Deno.serve nativo
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { sendWA, sendWATemplate, markMessageAsRead } from './whatsapp.ts'
import { extract10Digits } from './db.ts'
import { logError } from '../_shared/utils.ts'
import { handleRepButtons, handleRepMessage } from './rep-handler.ts'
import { syncToChatwoot, updateChatwootProfile } from './chatwoot-sync.ts'
import { handleSlashCommands } from './slash-commands-handler.ts'
import { routeCommand } from './commands/command-router.ts'
import { handleCronEvent }   from './cron-handler.ts'
import { handleButtonEvent } from './button-handler.ts'
import { handleAdminFlow }   from './admin-flow.ts'
import { handleClientFlow }  from './client-flow.ts'
import { avanzarFlujoMandadito } from './mandadito-handler.ts'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ADMIN_PHONES_ENV = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-auth',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method === 'GET') {
    const url = new URL(req.url)
    return new Response(url.searchParams.get('hub.challenge') ?? 'Forbidden', {
      headers: corsHeaders,
      status: url.searchParams.has('hub.challenge') ? 200 : 403
    })
  }
  
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })

  let errorNotifyPhone = ''

  // ── CRON JOBS INTERNOS ──
  const cronAuth   = req.headers.get('x-cron-auth')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && cronAuth === cronSecret) {
    try {
      const body     = JSON.parse(await req.text())
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
      const cronRes  = await handleCronEvent(supabase, body)
      if (cronRes) return cronRes
    } catch (e) {
      console.error('CRON Error:', e)
      return new Response('Cron Error', { status: 500 })
    }
  }

  // ── APP RPC (FLUTTER) ──
  const authHeader = req.headers.get('Authorization')
  if (authHeader) {
    try {
      const body = JSON.parse(await req.text())
      if (body.action === 'enviar_terminos') {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
        const { telefono, nombre } = body
        if (!telefono) return new Response('Missing telefono', { status: 400 })
        // Quitar espacios y dejar ultimos 10, o todo. El whatsapp.ts maneja "52" + tel
        const tel10 = extract10Digits(telefono)
        const resTemplate = await sendWATemplate(`52${tel10}`, 'estrella_terminos_condiciones', [nombre ?? 'Cliente Express'])
        if (!resTemplate.ok) return new Response(resTemplate.error, { status: 500 })
        return new Response('OK', { status: 200 })
      }
      return new Response('Unknown Action', { status: 400 })
    } catch (e) {
      console.error('RPC Error:', e)
      return new Response('RPC Error', { status: 500 })
    }
  }

  // ── VALIDACION HMAC ──
  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET')
  let bodyText    = ''
  try { bodyText = await req.text() } catch { return new Response('Bad Request Body', { status: 400 }) }

  if (appSecret) {
    const signature = req.headers.get('x-hub-signature-256')
    if (!signature) return new Response('Unauthorized', { status: 401 })
    
    const encoder  = new TextEncoder()
    const key      = await crypto.subtle.importKey('raw', encoder.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const sigHex   = signature?.replace('sha256=', '') || ''
    const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g)?.map((b: string) => parseInt(b, 16)) || [])
    const isValid  = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(bodyText))
    
    if (!isValid) return new Response('Unauthorized', { status: 401 })
  } else {
    console.warn('WHATSAPP_APP_SECRET no configurado.')
  }

  try {
    const body     = JSON.parse(bodyText)
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages
    const statuses = body?.entry?.[0]?.changes?.[0]?.value?.statuses

    if (statuses?.length > 0) {
      const s = statuses[0]
      if (s.status === 'failed') await logError('whatsapp-bot', 'Meta Async Delivery Failed', { errors: s.errors, phone: s.recipient_id }, 'critical')
      return new Response('OK', { status: 200 })
    }
    if (!messages?.length) return new Response('No messages', { status: 200 })

    const msg = messages[0]
    if (!msg?.from || !msg?.id || !msg?.type) return new Response('OK', { status: 200 })

    const fromPhone = msg.from as string
    errorNotifyPhone = fromPhone
    const messageId  = msg.id   as string
    const msgType    = msg.type as string

    // ── IDEMPOTENCY ──
    const { error: idempError } = await supabase.from('bot_memory').insert({
      phone: `processed_msg:${messageId}`, history: [], updated_at: new Date().toISOString()
    })
    if (idempError) {
      if (idempError.code === '23505' || idempError.message.includes('duplicate key')) return new Response('OK', { status: 200 })
      return new Response('Service Unavailable', { status: 503 })
    }

    // (Typing indicator no soportado oficialmente por Meta)

    try { await markMessageAsRead(messageId) } catch (e) { console.error('[ReadReceipt]', e) }

    const from10 = extract10Digits(fromPhone)

    // ── RATE LIMITING ──
    const rateLimitKey = `rate_limit_${from10}`
    const { data: rlData } = await supabase.from('bot_memory').select('history').eq('phone', rateLimitKey).maybeSingle()
    let timestamps = ((rlData?.history as number[]) || []).filter((t: number) => t > Date.now() - 60000)
    // BUG-A3 fix: >= 13 blocks (message is dropped). At exactly 12 we warn but
    // still process the current message. Previous code warned on 12 AND dropped
    // it, which silently lost the user's request with no bot response.
    if (timestamps.length >= 13) {
      if (timestamps.length === 13) await sendWA(fromPhone, `Estas enviando demasiados mensajes. Espera 1 minuto.`)
      timestamps.push(Date.now())
      await supabase.from('bot_memory').upsert({ phone: rateLimitKey, history: timestamps, updated_at: new Date().toISOString() })
      return new Response('OK', { status: 200 })
    }
    timestamps.push(Date.now())
    if (timestamps.length === 12) await sendWA(fromPhone, `⚠️ Vas muy rápido. Si sigues enviando mensajes en el siguiente minuto, el bot pausará temporalmente.`)

    await supabase.from('bot_memory').upsert({ phone: rateLimitKey, history: timestamps, updated_at: new Date().toISOString() })

    // ── ROLES ──
    const ADMIN_PHONES_LIST = ADMIN_PHONES_ENV.split(',').map((s: string) => extract10Digits(s)).filter(Boolean)
    const esAdmin           = ADMIN_PHONES_LIST.includes(from10)
    const admin10           = esAdmin ? from10 : (ADMIN_PHONES_LIST[0] || '')

    let userLabel     = 'cliente'
    let cachedRepData:  { id: string; user_id: string; nombre: string; alias: string } | null = null
    let cachedRestData: { id: string; nombre: string } | null = null

    const { data: modoOverride } = await supabase.from('bot_memory').select('history').eq('phone', `modo_activo_${from10}`).maybeSingle()
    const modoForzado = modoOverride?.history?.[0]?.modo as string | undefined

    if (esAdmin && modoForzado !== 'cliente' && modoForzado !== 'repartidor' && modoForzado !== 'restaurante') {
      userLabel = 'admin'
    } else {
      const [resRep, resRest] = await Promise.all([
        supabase.from('repartidores').select('id, user_id, nombre, alias').ilike('telefono', `%${from10}%`).limit(1).maybeSingle(),
        supabase.from('restaurantes').select('id, nombre').ilike('telefono', `%${from10}%`).eq('activo', true).limit(1).maybeSingle()
      ])
      
      // Si el admin forzó un modo, respetarlo (a menos que haya borrado el override con /modo auto)
      if (modoForzado === 'cliente') {
        userLabel = 'cliente'
      } else if (modoForzado === 'repartidor' || (resRep.data && modoForzado !== 'restaurante')) {
        userLabel     = 'repartidor'
        cachedRepData = resRep.data || { id: 'admin-rep', user_id: '', nombre: 'Admin', alias: 'admin' }
      } else if (modoForzado === 'restaurante' || (resRest.data && modoForzado !== 'cliente')) {
        userLabel      = 'restaurante'
        cachedRestData = resRest.data || { id: 'admin-rest', nombre: 'Admin Rest' }
      } else {
        userLabel = 'cliente'
      }
    }

    // ── CHATWOOT SYNC ──
    const profileName = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name
    let cwConvIdPromise: Promise<number | null> = Promise.resolve(null)
    if (msgType === 'text' && msg.text?.body)
      cwConvIdPromise = syncToChatwoot(fromPhone, msg.text.body as string, profileName, userLabel)
    else if (msgType === 'interactive')
      cwConvIdPromise = syncToChatwoot(fromPhone, `[Boton] ${msg.interactive?.button_reply?.title || ''}`, profileName, userLabel)
    else if (['audio','image','document','sticker','video','voice'].includes(msgType))
      cwConvIdPromise = syncToChatwoot(fromPhone, `[Multimedia: ${msgType}]`, profileName, userLabel)

    let cwUpdateProfilePromise: Promise<any> = Promise.resolve()
    if (userLabel === 'cliente')
      cwUpdateProfilePromise = updateChatwootProfile(supabase, fromPhone).catch(e => console.error('[CW]', e))

    const exitSafely = async (res: Response) => {
      await Promise.allSettled([cwConvIdPromise, cwUpdateProfilePromise])
      return res
    }

    // ── SANEAMIENTO ──
    if (msgType === 'text' && msg.text?.body === 'SANEAMIENTO_TOTAL') {
      if (!esAdmin) return new Response('Unauthorized', { status: 401 })
      const cleanPhones = async (table: string) => {
        let from = 0
        while (true) {
          const { data } = await supabase.from(table).select('id, telefono').range(from, from + 499)
          if (!data?.length) break
          for (const r of data)
            if (r.telefono !== r.telefono.replace(/\D/g, ''))
              await supabase.from(table).update({ telefono: r.telefono.replace(/\D/g, '') }).eq('id', r.id)
          from += 500
        }
      }
      await Promise.all([cleanPhones('repartidores'), cleanPhones('restaurantes'), cleanPhones('clientes')])
      await sendWA(fromPhone, 'Base de datos saneada.')
      return await exitSafely(new Response('OK', { status: 200 }))
    }

    // ── INTERCEPTOR UBICACION ──
    if (msgType === 'location') {
      const loc = msg.location as { latitude?: number; longitude?: number; address?: string; name?: string } | undefined
      if (esAdmin && loc?.latitude && loc?.longitude) {
        const { data: capRaw } = await supabase.from('bot_memory').select('history').eq('phone', `capture_mode_${from10}`).maybeSingle()
        const cap = capRaw?.history?.[0]
        if (cap?.clienteId) {
          const locStr = loc.address || loc.name || `https://maps.google.com/?q=${loc.latitude},${loc.longitude}`
          await supabase.from('clientes').update({ direccion: locStr, lat_frecuente: loc.latitude, lng_frecuente: loc.longitude }).eq('id', cap.clienteId)
          await sendWA(fromPhone, `Ubicacion guardada para ${cap.clienteNombre}.`)
          return await exitSafely(new Response('OK', { status: 200 }))
        }
      }

      // ── MÁQUINA DE ESTADOS: PROMO VIP (UBICACIÓN) ──
      const { data: promoStateRaw } = await supabase.from('bot_memory').select('history').eq('phone', `promo_state_${from10}`).maybeSingle()
      if (promoStateRaw?.history?.[0]) {
        const { restId, restName, promoText } = promoStateRaw.history[0]
        await supabase.from('bot_memory').delete().eq('phone', `promo_state_${from10}`)
        
        // El cliente mandó su ubicación
        const locUrl = `https://maps.google.com/?q=${loc?.latitude},${loc?.longitude}`
        
        // Avisar al cliente
        await sendWA(fromPhone, `¡Listo! 🌟 Tu orden fue enviada al restaurante y un repartidor de Estrella Delivery pasará por ella en breve.`)
        
        // 1. Notificar al restaurante
        const { data: restRow } = await supabase.from('restaurantes').select('telefono').eq('id', restId).maybeSingle()
        if (restRow?.telefono) {
          await sendWA(`52${restRow.telefono}`, `🚨 *¡NUEVA ORDEN PROMO VIP!* 🚨\n\nTu cliente VIP *${profileName || from10}* acaba de pedir la promoción:\n💬 "${promoText}"\n\n¡Prepáralo que Estrella Delivery ya va en camino para recogerlo! 🛵💨`)
        }
        
        // 2. Notificar al Admin con Notas CRM
        const { data: clienteData } = await supabase.from('clientes').select('notas_crm').eq('telefono', from10).maybeSingle()
        const notasCrm = clienteData?.notas_crm ? `\n📝 *Notas del cliente:* ${clienteData.notas_crm}` : ''

        const { notifyAdmin } = await import('./whatsapp.ts')
        await notifyAdmin(`🛵 *NUEVO VIAJE PROMO B2C:*\n\nRecoger en: *${restName}*\nEntregar a: *${profileName || from10}* (${from10})\nPromoción pedida: "${promoText}"\n📍 Ubicación: ${locUrl}${notasCrm}`)
        
        return await exitSafely(new Response('OK', { status: 200 }))
      }
      // ── MÁQUINA DE ESTADOS: MANDADITOS (UBICACIÓN) ──
      const { data: mandaditoRaw } = await supabase.from('bot_memory').select('history').eq('phone', `mandadito_state_${from10}`).maybeSingle()
      if (mandaditoRaw?.history?.[0]) {
        const payloadText = loc?.name ? (loc?.address ? `${loc.name}, ${loc.address}` : loc.name) : loc?.address
        await avanzarFlujoMandadito(supabase, fromPhone, from10, mandaditoRaw.history[0], { lat: loc?.latitude, lng: loc?.longitude, texto: payloadText })
        return await exitSafely(new Response('OK', { status: 200 }))
      }

      const { data: regRaw } = await supabase.from('bot_memory').select('history').eq('phone', `reg_state_${from10}`).maybeSingle()
      const regState = regRaw?.history?.[0]
      if (loc?.latitude && loc?.longitude && (regState?.step === 2 || regState?.step === 3)) {
        const SUPABASE_PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
        fetch(`${SUPABASE_PROJECT_URL}/functions/v1/whatsapp-ai`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromPhone, from10, texto: loc.address || loc.name || `${loc.latitude},${loc.longitude}`,
            isRepartidor: false, repartidorInfo: null, isClient: false, clienteCtx: null, regState,
            locationData: { lat: loc.latitude, lng: loc.longitude, address: loc.address, name: loc.name } })
        }).catch(err => console.error('[LOC]', err))
        return await exitSafely(new Response('OK', { status: 200 }))
      }
    }

    // ── INTERCEPTOR MULTIMEDIA ──
    if (['audio','image','document','sticker','video','voice','unsupported'].includes(msgType)) {
      // Restaurantes: fotos → escaneo de QR de Tarjeta VIP
      if (msgType === 'image' && cachedRestData) {
        const { handleRestaurantPhoto } = await import('./restaurant-b2b-handler.ts')
        const qrRes = await handleRestaurantPhoto(supabase, fromPhone, from10, cachedRestData.id, cachedRestData.nombre, msg.image)
        if (qrRes) return await exitSafely(qrRes)
      }
      if (msgType === 'image' && (esAdmin || userLabel === 'repartidor')) {
        const { handleAdminPhoto } = await import('./media-handler.ts')
        return await exitSafely(await handleAdminPhoto(supabase, fromPhone, from10, msg.image, esAdmin))
      }
      if (!esAdmin && userLabel !== 'repartidor') {
        const { data: restRegData } = await supabase.from('bot_memory').select('history').eq('phone', `reg_rest_${from10}`).maybeSingle()
        if (msgType === 'image' && restRegData?.history?.[0]?.state === 'REST_REG_FOTO') {
          // Dejar pasar al client-flow para el registro
        } else {
          await sendWA(fromPhone, msgType === 'unsupported'
            ? 'Usa la opcion Ubicacion actual (fija) o escribe tu direccion.'
            : 'Por favor envianos la informacion en texto. Gracias!')
          return await exitSafely(new Response('OK', { status: 200 }))
        }
      }
    }

    // ── RESET ──
    if (msgType === 'text' && (msg.text?.body as string).trim().toLowerCase() === '/reset') {
      await supabase.from('bot_memory').delete().like('phone', `%${from10}%`)
      await sendWA(fromPhone, 'Memoria borrada. Escribe hola para empezar de cero.')
      return await exitSafely(new Response('OK', { status: 200 }))
    }

    // ── INTERCEPTOR PROMO VIP B2C ──
    const userTextOrBtn = msgType === 'text' ? (msg.text?.body as string).trim().toLowerCase() : 
      (msgType === 'interactive' ? (msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '').toLowerCase() : 
      (msgType === 'button' ? (msg.button?.text || '').toLowerCase() : ''))

    if (userTextOrBtn.includes('quiero pedir promo') || userTextOrBtn.includes('quiero pedir') || userTextOrBtn.includes('usar mi beneficio')) {
      // Buscar si el cliente recibió una promo hace poco (hasta 24h)
      const { data: promoData } = await supabase.from('bot_memory').select('history, updated_at').eq('phone', `last_promo_${from10}`).maybeSingle()
      if (promoData?.history?.[0]?.restId) {
        const lastUpd = new Date(promoData.updated_at).getTime()
        if (Date.now() - lastUpd < 24 * 60 * 60 * 1000) {
          const restId = promoData.history[0].restId
          const restName = promoData.history[0].restName
          const promoText = promoData.history[0].promoText || 'Promoción VIP'
          
          // Entrar a estado de espera de ubicación
          await supabase.from('bot_memory').upsert({
            phone: `promo_state_${from10}`,
            history: [{ restId, restName, promoText }],
            updated_at: new Date().toISOString()
          })

          const { sendLocationRequest } = await import('./whatsapp.ts')
          await sendWA(fromPhone, `¡Excelente! 🌟 \n\nPara hacer válido tu beneficio exclusivo y enviarte tu pedido de *${restName}*, por favor compártenos tu ubicación.`)
          await sendLocationRequest(fromPhone, 'Toca aquí para enviar tu ubicación 📍')
          return await exitSafely(new Response('OK', { status: 200 }))
        }
      }
    }

    // ── 1. BOTONES ──
    if (msgType === 'interactive' && msg.interactive?.type === 'nfm_reply') {
      const { handleFlowReply } = await import('./restaurant-b2b-handler.ts')
      const res = await handleFlowReply(supabase, fromPhone, from10, msg.interactive.nfm_reply, cachedRestData)
      if (res) return await exitSafely(res)
    }

    if (msgType === 'interactive' || msgType === 'button') {
      // Bug 6 fix: restaurantes registrados deben ir al B2B handler PRIMERO
      // porque sus botones (REST_MENU_*) no existen en button-handler.ts
      if (cachedRestData) {
        const { handleRestaurantCommand } = await import('./restaurant-b2b-handler.ts')
        const res = await handleRestaurantCommand(supabase, fromPhone, from10, cachedRestData.id, cachedRestData.nombre, msgType, msg)
        if (res) return await exitSafely(res)
      }
      const res = await handleButtonEvent(supabase, fromPhone, from10, msg, esAdmin, userLabel, SUPABASE_KEY)
      return await exitSafely(res ?? new Response('OK', { status: 200 }))
    }

    // ── 2. SLASH COMMANDS ──
    if ((esAdmin || userLabel === 'repartidor') && msgType === 'text') {
      const slashText = (msg.text?.body as string || '').trim().toLowerCase()
      if (slashText.startsWith('/')) {
        const args = slashText.split(/\s+/)
        const ctx = { supabase, fromPhone, from10, slashText, args, messageId, esAdmin: true }
        const routeRes = await routeCommand(ctx)
        if (routeRes) return await exitSafely(routeRes)

        const slashRes = await handleSlashCommands(supabase, fromPhone, from10, slashText, messageId, true)
        if (slashRes) return await exitSafely(slashRes)
      } else {
        const { data: actState } = await supabase.from('bot_memory').select('history').eq('phone', `admin_action_state_${from10}`).maybeSingle()
        if (actState?.history?.[0]?.action) {
          const action     = actState.history[0].action
          const targetText = slashText.trim()

          // ── WIZARD LOYALTY (3 pasos: tel → nombre → dirección) ──
          if (action === 'LOYALTY_STEP_NOMBRE') {
            // Paso 2: recibir nombre
            await supabase.from('bot_memory').upsert({
              phone: `admin_action_state_${from10}`,
              history: [{ action: 'LOYALTY_STEP_DIR', tel: actState.history[0].tel, nombre: targetText }],
              updated_at: new Date().toISOString()
            })
            await sendWA(fromPhone,
              `3️⃣ *¿Cuál es la dirección de entrega?*\n\n_Escribe la dirección o escribe_ *sin dirección* _para omitirla._`
            )
            return await exitSafely(new Response('OK', { status: 200 }))
          }

          if (action === 'LOYALTY_STEP_DIR') {
            // Paso 3: recibir dirección y ejecutar registro
            const tel    = actState.history[0].tel as string
            const nombre = actState.history[0].nombre as string
            const dir    = (targetText.toLowerCase() === 'sin dirección' || targetText.toLowerCase() === 'sin direccion') ? null : targetText
            await supabase.from('bot_memory').delete().eq('phone', `admin_action_state_${from10}`)

            // Crear o actualizar cliente
            const loyaltyUrl = `https://www.app-estrella.shop/loyalty/${tel}`
            const { data: existe } = await supabase.from('clientes').select('id, nombre, acepta_terminos').ilike('telefono', `%${tel}%`).limit(1).maybeSingle()
            let clienteNombre = nombre
            if (existe) {
              await supabase.from('clientes').update({
                nombre,
                ...(dir ? { direccion: dir } : {})
              }).eq('id', existe.id)
              clienteNombre = nombre
            } else {
              await supabase.from('clientes').insert({
                telefono: tel,
                nombre,
                puntos: 0,
                acepta_terminos: false,
                qr_code: loyaltyUrl,
                ...(dir ? { direccion: dir } : {})
              })
            }

            const tcEnviado = (!existe || existe.acepta_terminos === false);

            if (tcEnviado) {
              const templateResult = await sendWATemplate(`52${tel}`, 'estrella_terminos_condiciones', [nombre])
              if (!templateResult.ok) {
                await sendWA(fromPhone, `⚠️ El registro se guardó pero hubo un problema al enviar los Términos al cliente.\nError: ${templateResult.error?.substring(0, 200)}`)
              }
            } else {
              await sendWA(fromPhone, `ℹ️ Este cliente ya había aceptado los Términos anteriormente. Solo se actualizaron sus datos.`)
            }

            const pieMensaje = tcEnviado 
              ? `📤 Se le envió la invitación de Términos y Condiciones. Cuando acepte, recibirá su tarjeta QR automáticamente.`
              : `✅ Perfil actualizado correctamente.`;

            await sendWA(fromPhone,
              `✅ *Registro Loyalty completado*\n\n` +
              `👤 *Nombre:* ${nombre}\n` +
              `📱 *Teléfono:* ${tel}\n` +
              `🏠 *Dirección:* ${dir || 'No especificada'}\n\n` +
              pieMensaje
            )
            return await exitSafely(new Response('OK', { status: 200 }))
          }

          // Primer paso del wizard LOYALTY: recibir teléfono
          if (action === 'ACT_MENU_LOYALTY') {
            const tel = targetText.replace(/\D/g, '').slice(-10)
            if (!tel || tel.length !== 10) {
              await sendWA(fromPhone, `⚠️ Ese número no parece válido. Escribe los *10 dígitos* del teléfono del cliente:`)
              return await exitSafely(new Response('OK', { status: 200 }))
            }
            // No borramos el estado aún — avanzamos al paso 2
            await supabase.from('bot_memory').upsert({
              phone: `admin_action_state_${from10}`,
              history: [{ action: 'LOYALTY_STEP_NOMBRE', tel }],
              updated_at: new Date().toISOString()
            })
            await sendWA(fromPhone, `2️⃣ *¿Cuál es el nombre completo del cliente?*`)
            return await exitSafely(new Response('OK', { status: 200 }))
          }

          // ── Resto de acciones del menú ──
          await supabase.from('bot_memory').delete().eq('phone', `admin_action_state_${from10}`)
          let cmd = ''
          if      (action === 'ACT_MENU_NOREGO')  cmd = `/fachada ${targetText}`
          else if (action === 'ACT_MENU_QR')       cmd = `/qr ${targetText}`
          else if (action === 'ACT_MENU_INFO')     cmd = `/info ${targetText}`
          else if (action === 'ACT_MENU_SCORE')    cmd = `/score ${targetText}`
          else if (action === 'ACT_MENU_SUMAR')    cmd = `/puntos ${targetText}`
          else if (action === 'ACT_MENU_REGALAR')  cmd = `/saldo_regalar ${targetText}`
          else if (action === 'ACT_MENU_REST')     cmd = `/rest_clientes ${targetText}`
          else if (action.startsWith('EDIT_'))     cmd = `/set_field ${action} ${actState.history[0].tel} ${targetText}`
          if (cmd) {
            if (action === 'ACT_MENU_REGALAR') {
              const telMatch = targetText.trim().replace(/\D/g, '').slice(-10)
              const { data: c } = await supabase.from('clientes').select('nombre').ilike('telefono', `%${telMatch}%`).maybeSingle()
              if (!c) { await sendWA(fromPhone, `❌ Cliente no encontrado.`); return await exitSafely(new Response('OK', { status: 200 })) }
              const { error } = await supabase.rpc('increment_cliente_envios_gratis', { p_tel: telMatch, p_amount: 1 })
              if (error) { await sendWA(fromPhone, `❌ Error al regalar envío: ${error.message}`); return await exitSafely(new Response('OK', { status: 200 })) }
              await sendWA(fromPhone, `✅ *Envío gratis regalado* a *${c.nombre}* (${telMatch}).`)
              await sendWA(`52${telMatch}`, `🎉 *¡Sorpresa!*\n\nEl equipo de *Estrella Delivery* te acaba de obsequiar un *Envío Gratis*. 🎁\n¡Úsalo cuando quieras con tu próximo pedido! 🚵`)
              return await exitSafely(new Response('OK', { status: 200 }))
            }

            const args = cmd.split(/\s+/)
            const ctx = { supabase, fromPhone, from10, slashText: cmd, args, messageId, esAdmin: true }
            const routeRes = await routeCommand(ctx)
            if (routeRes) return await exitSafely(routeRes)

            const res = await handleSlashCommands(supabase, fromPhone, from10, cmd, messageId, true)
            if (res) return await exitSafely(res)
          }
        }
      }
    }

    // ── 3. MODO ADMIN ──
    let adminEnModoRepartidor = false
    if (esAdmin) {
      const { data: modeData } = await supabase.from('bot_memory').select('history').eq('phone', `admin_mode_${from10}`).maybeSingle()
      if (modeData?.history?.[0]?.mode === 'repartidor') {
        const horas = (Date.now() - (modeData.history[0].activado || 0)) / 3600000
        if (horas < 8) adminEnModoRepartidor = true
        else {
          await supabase.from('bot_memory').delete().eq('phone', `admin_mode_${from10}`)
          await sendWA(fromPhone, 'Modo Admin restaurado automaticamente (8h).')
        }
      }
    }

    if (userLabel === 'admin' && !adminEnModoRepartidor) {
      const res = await handleAdminFlow(supabase, fromPhone, from10, admin10, msgType, msg, messageId)
      return await exitSafely(res ?? new Response('OK', { status: 200 }))
    }

    // ── 4. REPARTIDOR / ADMIN EN MODO REP ──
    if (adminEnModoRepartidor || userLabel === 'repartidor') {
      let repData = cachedRepData
      if (adminEnModoRepartidor && !repData) {
        repData = await supabase.from('repartidores').select('id, user_id, nombre, alias')
          .ilike('telefono', `%${from10}%`).limit(1).maybeSingle().then((r: any) => r.data)
        if (!repData) repData = { id: 'admin-proxy', user_id: from10, nombre: 'Admin (Modo Rep)', alias: 'admin' } as any
      }
      if (msgType === 'interactive') {
        const btnId = msg.interactive?.button_reply?.id as string | undefined
        if (btnId) await handleRepButtons(supabase, fromPhone, btnId, repData)
        return await exitSafely(new Response('OK', { status: 200 }))
      }
      if (msgType === 'text') {
        const textoRep = msg.text?.body as string
        const isAiCmd  = ['actualiza','califica','agrega','ponle'].some(w => textoRep.toLowerCase().startsWith(w))
        if (!textoRep.startsWith('/') && !isAiCmd) {
          const { data: capData } = await supabase.from('bot_memory').select('history').eq('phone', `capture_mode_${from10}`).maybeSingle()
          const sesion = capData?.history?.[0]
          if (sesion?.clienteId && sesion.expira && Date.now() < sesion.expira) {
            const isMaps = ['maps.app.goo.gl','maps.google.com','goo.gl/maps'].some(d => textoRep.includes(d))
            if (isMaps) {
              await supabase.from('clientes').update({ direccion: textoRep.trim() }).eq('id', sesion.clienteId)
              await sendWA(fromPhone, `Maps guardado para ${sesion.clienteNombre}.`)
              return await exitSafely(new Response('OK', { status: 200 }))
            }
            const { data: cli } = await supabase.from('clientes').select('notas_crm').eq('id', sesion.clienteId).maybeSingle()
            const fecha    = new Date().toLocaleDateString('es-MX')
            const nota     = cli?.notas_crm ? `${cli.notas_crm}\n[${fecha}] ${textoRep}` : `[${fecha}] ${textoRep}`
            await supabase.from('clientes').update({ notas_crm: nota }).eq('id', sesion.clienteId)
            await sendWA(fromPhone, `Nota guardada para ${sesion.clienteNombre}.`)
            return await exitSafely(new Response('OK', { status: 200 }))
          }
        }
        return await exitSafely(await handleRepMessage(supabase, fromPhone, from10, textoRep, repData))
      }
      await sendWA(fromPhone, 'Modo Repartidor activo. Escribe /admin para regresar.')
      return await exitSafely(new Response('OK', { status: 200 }))
    }

    // ── 5. B2B RESTAURANTE ──
    if (cachedRestData && userLabel === 'restaurante') {
      let isB2bState = false
      if (msgType === 'text') {
        const txt = (msg.text?.body as string).trim().toLowerCase()
        const isReserved = ['hola', 'menu', 'menú', '/ayuda'].includes(txt)
        if (!isReserved) {
          const { data } = await supabase.from('bot_memory').select('history').eq('phone', `b2b_state_${from10}`).maybeSingle()
          if (data) isB2bState = true
        } else {
          isB2bState = true
        }
      }

      if (!isB2bState && (msgType === 'text' || msgType === 'location')) {
        const { handleRestaurantDeliveryMessage } = await import('./restaurant-delivery-handler.ts')
        const delRes = await handleRestaurantDeliveryMessage(supabase, fromPhone, from10, cachedRestData, msgType, msg)
        if (delRes) return await exitSafely(delRes)
      }

      const { handleRestaurantCommand } = await import('./restaurant-b2b-handler.ts')
      const res = await handleRestaurantCommand(supabase, fromPhone, from10, cachedRestData.id, cachedRestData.nombre, msgType, msg)
      if (res) return await exitSafely(res)
    }


    // ── 6. MÁQUINA DE ESTADOS: MANDADITOS (TEXTO) ──
    if (msgType === 'text' && userLabel === 'cliente') {
      const { data: mandaditoRaw } = await supabase.from('bot_memory').select('history').eq('phone', `mandadito_state_${from10}`).maybeSingle()
      if (mandaditoRaw?.history?.[0]) {
        const userText = (msg.text?.body as string).trim()
        if (userText.toLowerCase() === 'cancelar') {
          await Promise.all([
            supabase.from('bot_memory').delete().eq('phone', `mandadito_state_${from10}`),
            supabase.from('bot_memory').delete().eq('phone', `mandadito_cotiz_${from10}`)  // Bug 4 fix
          ])
          await sendWA(fromPhone, '✅ Cotización de mandadito cancelada. ¡Aquí cuando me necesites!')
          return await exitSafely(new Response('OK', { status: 200 }))
        }
        
        // ── DEBOUNCE (COLA DE MENSAJES) PARA PASO 3 ──
        // Si el cliente manda varios mensajes seguidos (ej. "a nombre de caleb", "mi numero es 963.."), los juntamos
        if (mandaditoRaw.history[0].step === 3) {
          const uniqueId = crypto.randomUUID()
          const bufferKey = `buffer_mandadito_${from10}_${uniqueId}`
          await supabase.from('bot_memory').insert({ phone: bufferKey, history: [userText, Date.now()], updated_at: new Date().toISOString() })
          
          // BUG-B2 fix: reduced from 3500ms to 1800ms to stay within Meta's 20s timeout.
          // Edge function cold start (~50ms) + AI call (~3-5s) + this debounce must stay < 20s.
          await new Promise(r => setTimeout(r, 1800))

          
          // Leer todos los mensajes del buffer de este número en la ventana de tiempo
          const { data: allBufData } = await supabase.from('bot_memory').select('phone, history').ilike('phone', `buffer_mandadito_${from10}_%`)
          
          if (!allBufData || allBufData.length === 0) {
            // Ya fue procesado por otra ejecución
            return await exitSafely(new Response('OK', { status: 200 }))
          }
          
          // Buscar el mensaje más reciente para saber quién es el "ganador" (la última ejecución en despertar)
          let latestTime = 0
          let latestId = ''
          const texts: string[] = []
          
          // Ordenar por tiempo (el tiempo está en history[1])
          allBufData.sort((a, b) => (a.history[1] as number) - (b.history[1] as number))
          
          for (const buf of allBufData) {
            texts.push(buf.history[0] as string)
            if ((buf.history[1] as number) > latestTime) {
              latestTime = buf.history[1] as number
              latestId = buf.phone
            }
          }
          
          // Si YO no soy el mensaje más reciente que llegó, me silencio y dejo que el más reciente procese todo
          if (bufferKey !== latestId) {
            return await exitSafely(new Response('OK', { status: 200 }))
          }
          
          // Soy la ejecución final. Limpio TODO el buffer de este usuario.
          for (const buf of allBufData) {
            await supabase.from('bot_memory').delete().eq('phone', buf.phone)
          }
          
          const joinedText = texts.join(' | ')
          await avanzarFlujoMandadito(supabase, fromPhone, from10, mandaditoRaw.history[0], { texto: joinedText })
          return await exitSafely(new Response('OK', { status: 200 }))
        }

        // Pasos 1 y 2 se procesan inmediatamente
        await avanzarFlujoMandadito(supabase, fromPhone, from10, mandaditoRaw.history[0], { texto: userText })
        return await exitSafely(new Response('OK', { status: 200 }))
      }
    }

    // ── 7. CLIENTE / NUEVO USUARIO ──
    const clientRes = await handleClientFlow(supabase, fromPhone, from10, msgType, msg, cachedRepData, SUPABASE_KEY)
    return await exitSafely(clientRes ?? new Response('OK', { status: 200 }))

  } catch (e) {
    const errMsg   = e instanceof Error ? e.message : String(e)
    const errStack = e instanceof Error ? e.stack   : undefined
    console.error('Error root:', e)
    await logError('whatsapp-bot', `Crash: ${errMsg}`, { phone: errorNotifyPhone, stack: errStack, body: bodyText.substring(0, 500) }, 'critical')
    if (errorNotifyPhone) {
      try {
        await sendWA(errorNotifyPhone, `Tuvimos un problema tecnico. Nuestro equipo ha sido notificado.\n\n*DEBUG ERROR:*\n${errMsg}`)
        const adminTel = ADMIN_PHONES_ENV.split(',')[0]?.replace(/\D/g, '').slice(-10)
        if (adminTel) await sendWA(`52${adminTel}`, `🚨 *VIGÍA DE SISTEMA: CRASH DETECTADO* 🚨\n\n👤 *Afectado:* ${errorNotifyPhone}\n❌ *Error:* ${errMsg.substring(0, 500)}`)
      } catch (e2) { console.error('Fallback fail:', e2) }
    }
    return new Response('Error handled cleanly', { status: 200 })
  }
})