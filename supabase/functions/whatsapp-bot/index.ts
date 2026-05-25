// supabase/functions/whatsapp-bot/index.ts
// WhatsApp AI Bot — Edge Function (Modular Architecture)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { sendWA, sendInteractiveButton, markMessageAsRead, sendWAImage } from './whatsapp.ts'
import { extract10Digits, guardarMemoria, crearPedidoDesdeBot } from './db.ts'
import { pedidoLink, logError } from '../_shared/utils.ts'
import { handleRepButtons, handleRepMessage } from './rep-handler.ts'
import { handleAdminGPS, handleAdminAssignRest, handleAdminMessage } from './admin-handler.ts'
import { handleRestaurantPortal } from './restaurant-portal.ts'
import { syncToChatwoot, syncBotReplyByConvId, updateChatwootProfile } from './chatwoot-sync.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ADMIN_PHONES_ENV = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''

serve(async (req: Request) => {
  if (req.method === 'GET') {
    const url = new URL(req.url)
    return new Response(url.searchParams.get('hub.challenge') ?? 'Forbidden', { status: url.searchParams.has('hub.challenge') ? 200 : 403 })
  }
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  let errorNotifyPhone = ''

  // ── INTERNAL CRON JOBS ──
  const cronAuth = req.headers.get('x-cron-auth')
  if (cronAuth === 'ESTRELLA_CRON_SECRET_123') {
    try {
      const bodyText = await req.text()
      const body = JSON.parse(bodyText)
      if (body.event === 'CRON_PROMO') {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
        // Buscamos clientes creados entre 1 minuto y 1 hora atrás (para evitar leer toda la base de datos)
        // En producción cambiaremos esto a 5 horas y 6 horas.
        const limiteSuperior = new Date(Date.now() - 1 * 60 * 1000).toISOString()
        const limiteInferior = new Date(Date.now() - 60 * 60 * 1000).toISOString()
        
        const { data: clientes } = await supabase.from('clientes')
          .select('id, telefono, nombre, notas_crm')
          .gte('created_at', limiteInferior)
          .lte('created_at', limiteSuperior)
          
        if (clientes) {
          for (const c of clientes) {
            if (c.notas_crm && c.notas_crm.includes('[PROMO_5H]')) continue;
            
            const promoImg = body.promoUrl || 'https://res.cloudinary.com/dlgcf3cht/image/upload/v1731610444/promo_doble_puntos.png'
            // Bug Fix 1: Evitar crasheo si el cliente no tiene nombre registrado (es null)
            const nombre = c.nombre ? c.nombre.split(' ')[0] : 'Cliente'
            const caption = `🎁 *¡Hola ${nombre}!* Queremos darte una bienvenida especial.\n\nSolo por HOY, si haces tu primer pedido a través de *Estrella Delivery*, ganarás el **DOBLE DE PUNTOS** ⭐⭐ en tu Tarjeta VIP.\n\n¿Qué se te antoja pedir? 🛵💨`
            
            // Usamos sendWAImage directo
            const res = await sendWAImage(`52${c.telefono}`, promoImg, caption)
            
            // Bug Fix 2 & 3: Marcar siempre para evitar loops infinitos si falla
            const status = res.ok ? 'Enviada' : 'Fallida'
            const newNota = c.notas_crm ? `${c.notas_crm}\n[PROMO_5H] ${status}` : `[PROMO_5H] ${status}`
            await supabase.from('clientes').update({ notas_crm: newNota }).eq('id', c.id)
          }
        }
        return new Response('Cron Processed', { status: 200 })
      }
    } catch (e) {
      console.error('CRON Error:', e)
      return new Response('Cron Error', { status: 500 })
    }
  }

  // ── PHASE 4: Meta Webhook Validation (X-Hub-Signature-256) ──
  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET')
  let bodyText = ''
  try {
    bodyText = await req.text()
  } catch (e) {
    return new Response('Bad Request Body', { status: 400 })
  }

  if (appSecret) {
    const signature = req.headers.get('x-hub-signature-256')
    if (!signature) {
      console.error('⚠️ Falla de seguridad: Falta X-Hub-Signature-256')
      return new Response('Unauthorized', { status: 401 })
    }

    // Verificación HMAC SHA256 usando Web Crypto API
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const expectedSigHex = signature.replace('sha256=', '')
    const expectedSigBytes = new Uint8Array(expectedSigHex.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || [])

    const isValid = await crypto.subtle.verify('HMAC', key, expectedSigBytes, encoder.encode(bodyText))

    if (!isValid) {
      console.error('⛔ ALERTA INTENTO DE SPOOFING: La firma HASH no coincide con el payload y el SECRET.')
      return new Response('Unauthorized', { status: 401 })
    }
  } else {
    console.warn('⚠️ [SISTEMA] Securiy Alert: WHATSAPP_APP_SECRET no está configurado. El Webhook opera SIN validación criptográfica (Suceptible a Spoofing).')
  }

  try {
    const body = JSON.parse(bodyText)
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages

    if (!messages || messages.length === 0) return new Response('No messages', { status: 200 })

    const msg = messages[0]

    // Validar campos obligatorios — Meta puede enviar webhooks malformados
    if (!msg.from || !msg.id || !msg.type) {
      console.warn('[BOT] Mensaje malformado sin from/id/type, ignorando:', JSON.stringify(msg).substring(0, 200))
      return new Response('OK', { status: 200 })
    }

    const fromPhone = msg.from as string
    errorNotifyPhone = fromPhone
    const messageId = msg.id as string
    const msgType = msg.type as string

    // ── IDEMPOTENCY: Evitar duplicados de Meta (Optimistic Insert) ──
    const idempotencyKey = `processed_msg:${messageId}`
    const { error: idempError } = await supabase.from('bot_memory').insert({ phone: idempotencyKey, history: [], updated_at: new Date().toISOString() })
    if (idempError) {
      if (idempError.code === '23505' || idempError.message.includes('duplicate key')) {
        console.log(`⚠️ Mensaje duplicado ignorado (Optimistic): ${messageId}`)
        return new Response('OK', { status: 200 })
      }
      // Si la inserción de idempotencia falla por otros motivos, detenemos el proceso
      // para evitar procesar el mensaje varias veces bajo estrés de la DB.
      console.error(`[IDEMPOTENCY DB ERROR]`, idempError)
      return new Response('Service Unavailable', { status: 503 })
    }

    // ── MARCAR COMO LEÍDO (Palomitas Azules) ──
    try {
      await markMessageAsRead(messageId)
    } catch (e) {
      console.error('[ReadReceipt] Error crítico:', e)
    }

    // ── NORMALIZAR TELÉFONO (necesario para rate limit y roles) ──
    const from10 = extract10Digits(fromPhone)

    // ── RATE LIMITING ANTI-SPAM (Protección de Costos API y Base de Datos) ──
    // Evita ataques DoS o que un usuario rompa la IA enviando 50 mensajes de golpe.
    const rateLimitKey = `rate_limit_${from10}`
    const { data: rlData } = await supabase.from('bot_memory').select('history').eq('phone', rateLimitKey).maybeSingle()
    let timestamps = (rlData?.history as number[]) || []
    const ventanaTiempo = Date.now() - 60000 // 1 minuto

    // Filtrar marcas de tiempo más viejas de 1 min
    timestamps = timestamps.filter(t => t > ventanaTiempo)

    if (timestamps.length >= 12) {
      console.warn(`[RATE LIMIT] Bloqueo activo para ${fromPhone}. (${timestamps.length} msgs/min)`)
      // Solo avisamos 1 vez cuando cruza exactamente el límite para no gastar API respondiendo el spam
      if (timestamps.length === 12) {
        await sendWA(fromPhone, `⚠️ *[SISTEMA]*: Estás enviando demasiados mensajes muy rápido. Por protección del sistema, espera 1 minuto antes de continuar.`)
      }
      timestamps.push(Date.now())
      await supabase.from('bot_memory').upsert({ phone: rateLimitKey, history: timestamps, updated_at: new Date().toISOString() })
      return new Response('OK', { status: 200 })
    }

    timestamps.push(Date.now())
    await supabase.from('bot_memory').upsert({ phone: rateLimitKey, history: timestamps, updated_at: new Date().toISOString() })


    // NOTA: La limpieza de bot_memory (idempotencia + rate limits) se delega a pg_cron.
    // Ejecutar en Supabase Dashboard → SQL Editor una sola vez:
    //   SELECT cron.schedule('limpiar-bot-memory','0 3 * * *',
    //     $$ DELETE FROM bot_memory WHERE phone LIKE 'processed_msg:%' AND updated_at < NOW()-INTERVAL '1 hour';
    //        DELETE FROM bot_memory WHERE phone LIKE 'rate_limit_%'    AND updated_at < NOW()-INTERVAL '2 hours'; $$);

    // ── IDENTIFICACIÓN DE ROLES ── (from10 ya definido arriba)
    const ADMIN_PHONES_LIST = ADMIN_PHONES_ENV.split(',').map(s => extract10Digits(s)).filter(Boolean)
    const esAdmin = ADMIN_PHONES_LIST.includes(from10)
    const admin10 = esAdmin ? from10 : (ADMIN_PHONES_LIST[0] || '')

    // ── IDENTIFICAR ROL PARA ETIQUETAS DE CHATWOOT Y LOGICA ──
    let userLabel = 'cliente'
    let cachedRepData: { id: string; user_id: string; nombre: string; alias: string } | null = null
    let cachedRestData: { id: string; nombre: string } | null = null

    if (esAdmin) {
      userLabel = 'admin'
    } else {
      // Consulta paralela de todos los roles posibles
      const [resRep, resRest, modoOverride] = await Promise.all([
        supabase.from('repartidores').select('id, user_id, nombre, alias').ilike('telefono', `%${from10}%`).limit(1).maybeSingle(),
        supabase.from('restaurantes').select('id, nombre').ilike('telefono', `%${from10}%`).limit(1).maybeSingle(),
        supabase.from('bot_memory').select('history').eq('phone', `modo_activo_${from10}`).maybeSingle()
      ])

      // Si hay un override de modo forzado por el admin, respetarlo
      const modoForzado = modoOverride.data?.history?.[0]?.modo as string | undefined

      if (resRep.data && modoForzado !== 'restaurante' && modoForzado !== 'cliente') {
        userLabel = 'repartidor'
        cachedRepData = resRep.data
      } else if (resRest.data && modoForzado !== 'cliente') {
        userLabel = 'restaurante'
        cachedRestData = resRest.data
      }
      // Si modoForzado === 'cliente', cae al default 'cliente' aunque tenga otros roles
    }

    // ── SYNC A CHATWOOT CRM — guarda el promise para usarlo en la respuesta del bot ──
    let cwConvIdPromise: Promise<number | null> = Promise.resolve(null)
    const profileName = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name
    if (msgType === 'text' && msg.text?.body) {
      cwConvIdPromise = syncToChatwoot(fromPhone, msg.text.body as string, profileName, userLabel)
    } else if (msgType === 'interactive') {
      const buttonTitle = msg.interactive?.button_reply?.title || 'Botón presionado'
      cwConvIdPromise = syncToChatwoot(fromPhone, `[Clic Botón] ${buttonTitle}`, profileName, userLabel)
    } else if (['audio', 'image', 'document', 'sticker', 'video', 'voice'].includes(msgType)) {
      cwConvIdPromise = syncToChatwoot(fromPhone, `[Multimedia: ${msgType}]`, profileName, userLabel)
    }

    let cwUpdateProfilePromise: Promise<any> = Promise.resolve()
    if (userLabel === 'cliente') {
      cwUpdateProfilePromise = updateChatwootProfile(supabase, fromPhone).catch(e => console.error('[CW Sync] Error actualizando perfil:', e))
    }

    const exitSafely = async (res: Response) => {
      await Promise.allSettled([cwConvIdPromise, cwUpdateProfilePromise])
      return res
    }

    // ── COMANDO SECRETO SANEAMIENTO (ahora sí después de esAdmin) ──
    if (msgType === 'text' && msg.text?.body === 'SANEAMIENTO_TOTAL') {
      if (!esAdmin) return new Response('Unauthorized', { status: 401 })
      const cleanPhones = async (table: string) => {
        let from = 0; const PAGE = 500
        while (true) {
          const { data } = await supabase.from(table).select('id, telefono').range(from, from + PAGE - 1)
          if (!data?.length) break
          for (const r of data) {
            if (r.telefono && r.telefono !== r.telefono.replace(/\D/g, '')) {
              await supabase.from(table).update({ telefono: r.telefono.replace(/\D/g, '') }).eq('id', r.id)
            }
          }
          from += PAGE
        }
      }
      await Promise.all([cleanPhones('repartidores'), cleanPhones('restaurantes'), cleanPhones('clientes')])
      await sendWA(fromPhone, `✅ [SISTEMA] Base de datos saneada (espacios eliminados en teléfonos).`)
      return await exitSafely(new Response('OK', { status: 200 }))
    }

    // ── INTERCEPTOR DE UBICACIÓN (location pin de WhatsApp) ──────────────────
    // Acepta location en pasos 2 (colonia) o 3 (dirección) del flujo de registro.
    // También acepta location para administradores en sesión de captura (/fachada).
    if (msgType === 'location') {
      const locData = msg.location as { latitude?: number; longitude?: number; address?: string; name?: string } | undefined

      // 1. Revisar si el ADMIN tiene una sesión de captura abierta
      if (esAdmin && locData?.latitude && locData?.longitude) {
        const { data: capRaw } = await supabase.from('bot_memory')
          .select('history').eq('phone', `capture_mode_${from10}`).maybeSingle()
        const captureSession = capRaw?.history?.[0]
        
        if (captureSession && captureSession.clienteId) {
          let locString = locData.address || locData.name
          if (!locString) {
            locString = `https://maps.google.com/?q=${locData.latitude},${locData.longitude}`
          }
          await supabase.from('clientes').update({
            direccion: locString,
            lat_frecuente: locData.latitude,
            lng_frecuente: locData.longitude
          }).eq('id', captureSession.clienteId)
          
          await sendWA(fromPhone, `📍 *Ubicación guardada*\nSe ha asociado la ubicación al cliente *${captureSession.clienteNombre}*.\n\n_Puedes seguir mandando fotos o escribir /fin para terminar la sesión._`)
          return await exitSafely(new Response('OK', { status: 200 }))
        }
      }

      // 2. Leer siempre el reg_state actual para saber si estamos en registro de cliente
      const { data: regRaw } = await supabase.from('bot_memory')
        .select('history').eq('phone', `reg_state_${from10}`).maybeSingle()
      const regState = regRaw?.history?.[0]
      const regStep = regState?.step ?? -1

      if (locData?.latitude && locData?.longitude && (regStep === 2 || regStep === 3)) {
        // Compartir ubicación en paso 2 (colonia) o paso 3 (dirección) → ambos aceptados
        const SUPABASE_PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
        fetch(`${SUPABASE_PROJECT_URL}/functions/v1/whatsapp-ai`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromPhone, from10,
            texto: locData.address || locData.name || `${locData.latitude},${locData.longitude}`,
            isRepartidor: false, repartidorInfo: null,
            isClient: false, clienteCtx: null,
            regState,
            locationData: {
              lat: locData.latitude,
              lng: locData.longitude,
              address: locData.address,
              name: locData.name
            }
          })
        }).catch(err => console.error('[LOC] Error enviando a whatsapp-ai:', err))
        return await exitSafely(new Response('OK', { status: 200 }))
      }

      // Location fuera de registro o sin coordenadas → ignorar silenciosamente
      return await exitSafely(new Response('OK', { status: 200 }))
    }

    // ── INTERCEPTOR DE MULTIMEDIA Y FORMATOS NO SOPORTADOS ──────────────────
    if (['audio', 'image', 'document', 'sticker', 'video', 'voice', 'unsupported'].includes(msgType)) {

      // Imágenes de admin/repartidor → puede ir a handleAdminPhoto (sesión o caption)
      if (msgType === 'image' && (esAdmin || userLabel === 'repartidor')) {
        const { handleAdminPhoto } = await import('./media-handler.ts')
        return await exitSafely(await handleAdminPhoto(supabase, fromPhone, from10, msg.image, esAdmin))
      }

      // Todo lo demás lo rechazamos para clientes
      if (!esAdmin && userLabel !== 'repartidor') {
        if (msgType === 'unsupported') {
          await sendWA(fromPhone, `⚠️ Parece que enviaste una *ubicación en tiempo real* o formato no soportado. Por favor usa la opción de enviar *Ubicación actual (fija)* o escribe tu dirección.`)
        } else {
          await sendWA(fromPhone, `🤖 Por favor envíanos la información únicamente en *texto*. Aún no proceso notas de voz, fotos o documentos. ¡Gracias!`)
        }
      }
      return await exitSafely(new Response('OK', { status: 200 }))
    }

    // 1. BOTONES INTERACTIVOS Y PLANTILLAS ──
    if (msgType === 'interactive' || msgType === 'button') {
      const buttonId = (msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || msg.button?.payload || msg.button?.text) as string | undefined
      if (buttonId) {
        if (esAdmin && buttonId.startsWith('ACT_')) {
          const { handleAdminInteractive } = await import('./slash-commands-handler.ts')
          const res = await handleAdminInteractive(supabase, fromPhone, from10, buttonId)
          if (res) return await exitSafely(res)
        }
        // Botones de confirmación de registro del propio cliente (SI/NO)
        if (buttonId.toUpperCase().startsWith('REG_CONFIRM_')) {
          const esSi = buttonId.toUpperCase().startsWith('REG_CONFIRM_SI_')
          // Redirigimos como texto al flujo asíncrono para que el estado máquina lo procese
          const SUPABASE_PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
          const { data: regData } = await supabase.from('bot_memory')
            .select('history').eq('phone', `reg_state_${from10}`).maybeSingle()
          const regState = regData?.history?.[0] ?? { tel: from10, step: 3 }

          fetch(`${SUPABASE_PROJECT_URL}/functions/v1/whatsapp-ai`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fromPhone, from10,
              texto: esSi ? 'sí' : 'no',
              isRepartidor: false, repartidorInfo: null,
              isClient: true, clienteCtx: null,
              regState
            })
          }).catch(err => console.error('Error REG_CONFIRM:', err))
          return await exitSafely(new Response('OK', { status: 200 }))
        }

        // Botones de aceptación/rechazo de registro (para admin)
        if (esAdmin && (buttonId.startsWith('reg_accept_') || buttonId.startsWith('reg_reject_'))) {
          // BUG-05 fix: extraer sólo los 10 dígitos del teléfono del buttonId
          const telMatch = buttonId.match(/(\d{10})$/)
          const clientTel = telMatch ? telMatch[1] : buttonId.replace(/^reg_(accept|reject)_/, '')
          if (!clientTel || clientTel.length < 10) {
            await sendWA(fromPhone, `⚠️ No pude identificar el teléfono del cliente desde el botón.`)
            return await exitSafely(new Response('OK', { status: 200 }))
          }
          const { data: pendingReg } = await supabase.from('bot_memory')
            .select('history').eq('phone', `pending_reg_${clientTel}`).maybeSingle()
          const regInfo = pendingReg?.history?.[0]

          if (buttonId.startsWith('reg_accept_')) {
            if (!regInfo) {
              await sendWA(fromPhone, `⚠️ No encontré la solicitud para ${clientTel}. Es posible que ya fue procesada.`)
              return await exitSafely(new Response('OK', { status: 200 }))
            }
            // ── Registro directo en BD — BUG-04 fix: sin nanoid externo, usar crypto nativo ──────
            const rndBytes = crypto.getRandomValues(new Uint8Array(4))
            const rndHex = Array.from(rndBytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
            const qrCode = `QR-${clientTel}-${rndHex}`
            const { error: insertErr } = await supabase.from('clientes').upsert({
              telefono: clientTel,
              nombre: regInfo.nombre,
              direccion: regInfo.colonia ? `${regInfo.colonia}, ${regInfo.direccion || ''}`.trim() : (regInfo.direccion || null),
              lat_frecuente: regInfo.lat || null,
              lng_frecuente: regInfo.lng || null,
              puntos: 0,
              es_vip: false,
              acepta_terminos: false,
              qr_code: qrCode,
              created_at: new Date().toISOString()
            }, { onConflict: 'telefono' })

            if (insertErr) {
              console.error('[REG_ACCEPT] Error al insertar cliente:', insertErr)
              await sendWA(fromPhone, `❌ Error al registrar a ${regInfo.nombre}. Intenta con /rol ${clientTel} cliente ${regInfo.nombre}`)
            } else {
              await supabase.from('bot_memory').delete().eq('phone', `pending_reg_${clientTel}`)
              
              // ── Enviar T&C con Botones ──
              const tycUrl = `https://www.app-estrella.shop/terminos`
              const tycTexto = `🌟 *¡Hola, ${regInfo.nombre.split(' ')[0]}! Nos alegra mucho que te unas a Estrella Delivery.* 🛵💨\n\nAl registrarte, entrarás a nuestro programa de lealtad donde:\n✅ Acumulas saldo y puntos con cada envío.\n🎁 Tienes acceso a promociones exclusivas.\n\nPara poder darte tu tarjeta VIP digital, por favor confirma que aceptas nuestros términos y condiciones. 👇\n\n🔗 *Léelos aquí:* ${tycUrl}`

              await sendWA(`52${clientTel}`, tycTexto)
              const { sendInteractiveButtons } = await import('./whatsapp.ts')
              await sendInteractiveButtons(
                `52${clientTel}`,
                `¿Aceptas los términos y condiciones?`,
                [
                  { id: 'ACEPTAR_TERMINOS', title: '✅ Aceptar' },
                  { id: 'RECHAZAR_TERMINOS', title: '❌ Rechazar' }
                ]
              )
              
              await sendWA(fromPhone, `✅ *Cliente Registrado: ${regInfo.nombre}* (${clientTel})\n\n📋 T&C enviados. ⏳ Cuando acepte, recibirá su QR automáticamente.`)
            }
            return await exitSafely(new Response('OK', { status: 200 }))

          } else {
            // Rechazo
            await supabase.from('bot_memory').delete().eq('phone', `pending_reg_${clientTel}`)
            await sendWA(`52${clientTel}`,
              `Lo sentimos 🙏 Tu solicitud no pudo ser aprobada en este momento.\nSi crees que es un error, contáctanos directamente.`
            )
            await sendWA(fromPhone, `❌ Solicitud de *${regInfo?.nombre || clientTel}* rechazada. El cliente fue notificado.`)
            return await exitSafely(new Response('OK', { status: 200 }))
          }
        }

        // Botones de calificación de clientes
        if (buttonId.startsWith('RATE_') || buttonId.startsWith('TAG_') || buttonId.startsWith('VETAR_')) {
          const { handleCalificacion } = await import('./admin-handler.ts')
          return await handleCalificacion(supabase, fromPhone, buttonId)
        }
        // Botones de Términos y Condiciones
        const upId = buttonId.toUpperCase()
        if (upId === 'ACEPTAR_TERMINOS' || upId === 'RECHAZAR_TERMINOS' || upId === 'ACEPTAR' || upId === 'RECHAZAR') {
          const { handleTerminos } = await import('./admin-handler.ts')
          return await handleTerminos(supabase, fromPhone, buttonId)
        }
        // Botones de administrador (Alerta Zombie)
        if (buttonId.startsWith('CMD_REASIGNAR_') || buttonId.startsWith('CMD_CANCELAR_')) {
          const { handleAdminCommands } = await import('./admin-handler.ts')
          return await handleAdminCommands(supabase, fromPhone, buttonId)
        }
        await handleRepButtons(supabase, fromPhone, buttonId)
      }
      return await exitSafely(new Response('OK', { status: 200 }))
    }

    // ── SLASH COMMANDS (Admin Dual Mode) ─────────────────────────────────────
    // Deben ir ANTES del flujo admin normal para no pasar por la IA
    if (esAdmin && msgType === 'text') {
      const slashText = (msg.text?.body as string || '').trim().toLowerCase()
      
      // Si empieza con '/', procesar como Slash Command
      if (slashText.startsWith('/')) {
        const { handleSlashCommands } = await import('./slash-commands-handler.ts')
        const slashRes = await handleSlashCommands(supabase, fromPhone, from10, slashText, messageId)
        if (slashRes) return await exitSafely(slashRes)
      } else {
        // Interceptar si hay un estado de acción pendiente desde el menú de opciones
        const { data: actState } = await supabase.from('bot_memory').select('history').eq('phone', `admin_action_state_${from10}`).maybeSingle()
        if (actState?.history?.[0]?.action) {
          const action = actState.history[0].action
          const targetText = slashText.trim()
          await supabase.from('bot_memory').delete().eq('phone', `admin_action_state_${from10}`)
          
          let simulatedCommand = ''
          if (action === 'ACT_MENU_NOREGO') simulatedCommand = `/noregistrado ${targetText}`
          else if (action === 'ACT_MENU_LOYALTY') simulatedCommand = `/loyalty ${targetText}`
          else if (action === 'ACT_MENU_QR') simulatedCommand = `/qr ${targetText}`
          else if (action === 'ACT_MENU_INFO') simulatedCommand = `/info ${targetText}`
          else if (action === 'ACT_MENU_SCORE') simulatedCommand = `/score ${targetText}`
          
          if (simulatedCommand) {
            const { handleSlashCommands } = await import('./slash-commands-handler.ts')
            const slashRes = await handleSlashCommands(supabase, fromPhone, from10, simulatedCommand, messageId)
            if (slashRes) return await exitSafely(slashRes)
          }
        }
      }
    }

    // ── VERIFICAR MODO REPARTIDOR DEL ADMIN ──────────────────────────────────
    if (msgType === 'text') {
      const txt = (msg.text?.body as string).trim().toLowerCase()
      if (txt === '/reset') {
        await supabase.from('bot_memory').delete().eq('phone', from10)
        await supabase.from('bot_memory').delete().eq('phone', `reg_state_${from10}`)
        await sendWA(fromPhone, '🔄 *Memoria borrada exitosamente.* El bot ya no recuerda nuestra conversación anterior. Escribe "hola" para empezar de cero.')
        return await exitSafely(new Response('OK', { status: 200 }))
      }
    }

    let adminEnModoRepartidor = false
    if (esAdmin) {
      const { data: modeData } = await supabase.from('bot_memory').select('history').eq('phone', `admin_mode_${from10}`).maybeSingle()
      if (modeData?.history?.[0]?.mode === 'repartidor') {
        const horasActivo = (Date.now() - (modeData.history[0].activado || 0)) / 3600000
        if (horasActivo < 8) {
          adminEnModoRepartidor = true
        } else {
          // Auto-regreso a admin después de 8 horas
          await supabase.from('bot_memory').delete().eq('phone', `admin_mode_${from10}`)
          await sendWA(fromPhone, `⏰ *Modo Admin restaurado automáticamente* (8h sin cambio).\nEscribe */repartidor* si deseas volver a modo mensajero.`)
        }
      }
    }

    // 2. ADMIN FLOW ──
    if (esAdmin && !adminEnModoRepartidor) {
      // 2.A GPS Directo
      if (msgType === 'location') {
        return await handleAdminGPS(supabase, fromPhone, admin10, msg.location.latitude, msg.location.longitude, msg.location.name ?? msg.location.address ?? '', messageId)
      }

      if (msgType === 'text') {
        const texto = msg.text.body as string
        if (texto.toLowerCase() === 'debug_restaurantes') {
          const { data } = await supabase.from('restaurantes').select('nombre, telefono, activo').limit(50)
          if (data) await sendWA(fromPhone, `📍 *RESTAURANTES REGISTRADOS:\n${data.map((r: any) => `- ${r.nombre}: ${r.telefono} [${r.activo ? '✅' : '❌'}]`).join('\n')}`)
          return await exitSafely(new Response('OK', { status: 200 }))
        }

        // ── Captura de nota en sesión /fachada activa ─────────────────────
        const lowerTexto = texto.toLowerCase();
        const isAiCommand = lowerTexto.startsWith('actualiza') || lowerTexto.startsWith('califica') || lowerTexto.startsWith('agrega') || lowerTexto.startsWith('ponle');
        
        if (!texto.startsWith('/') && !isAiCommand) {
          const { data: capSesion } = await supabase.from('bot_memory')
            .select('history').eq('phone', `capture_mode_${from10}`).maybeSingle()
          const sesionData = capSesion?.history?.[0]

          // TTL: auto-cerrar si la sesión expiró (2h)
          if (sesionData && sesionData.expira && Date.now() > sesionData.expira) {
            await supabase.from('bot_memory').delete().eq('phone', `capture_mode_${from10}`)
            await sendWA(fromPhone, `⏰ La sesión de captura de *${sesionData.clienteNombre}* expiró (2h). Iníciala de nuevo con /fachada si la necesitas.`)
            // Deja caer al agente Admin normalmente
          } else if (sesionData?.clienteId) {
            // BUGFIX: Detectar si el texto es un enlace a Google Maps
            const isMapsLink = texto.includes('maps.app.goo.gl') || texto.includes('maps.google.com') || texto.includes('goo.gl/maps');
            
            if (isMapsLink) {
              await supabase.from('clientes').update({ direccion: texto.trim() }).eq('id', sesionData.clienteId)
              const { sendInteractiveButton } = await import('./whatsapp.ts')
              await sendInteractiveButton(fromPhone, `📍 *Enlace de Maps guardado* para *${sesionData.clienteNombre}*:\n_${texto}_`, 'ACT_CERRAR_SESION', 'Cerrar Sesión')
              return await exitSafely(new Response('OK', { status: 200 }))
            }

            // Si no es link de maps, se guarda como nota normal
            const { data: cli } = await supabase.from('clientes').select('notas_crm').eq('id', sesionData.clienteId).maybeSingle()
            const notaActual = cli?.notas_crm || ''
            const fecha = new Date().toLocaleDateString('es-MX')
            const notaNueva = notaActual
              ? `${notaActual}\n[${fecha}] 💬 ${texto}`
              : `[${fecha}] 💬 ${texto}`
            await supabase.from('clientes').update({ notas_crm: notaNueva }).eq('id', sesionData.clienteId)
            const { sendInteractiveButton } = await import('./whatsapp.ts')
            await sendInteractiveButton(fromPhone, `📝 Nota guardada para *${sesionData.clienteNombre}*:\n_${texto}_`, 'ACT_CERRAR_SESION', 'Cerrar Sesión')
            return await exitSafely(new Response('OK', { status: 200 }))
          }
        }

        // Ejecutar agente Admin
        return await handleAdminMessage(supabase, fromPhone, messageId, texto)
      }
    }

    // 3. RESTAURANT PORTAL / MODO REPARTIDOR DEL ADMIN ──
    if (!esAdmin || adminEnModoRepartidor) {
      // Si el admin está en modo repartidor, tratarlo como repartidor
      if (adminEnModoRepartidor) {
        // Buscar si el admin está registrado en la tabla repartidores
        let { data: adminAsRep } = await supabase.from('repartidores')
          .select('id, user_id, nombre, alias')
          .ilike('telefono', `%${from10}%`)
          .limit(1).maybeSingle()

        // Si el admin NO está en repartidores, crear un objeto de fallback
        // para que pueda usar todos los botones del ciclo de pedido
        if (!adminAsRep) {
          const { data: adminUser } = await supabase.auth.getUser()
          adminAsRep = {
            id: 'admin-proxy',
            user_id: adminUser?.user?.id || from10,
            nombre: 'Admin (Modo Rep)',
            alias: 'admin',
          } as any
        }

        // Procesar botones interactivos del ciclo de vida del pedido
        if (msgType === 'interactive') {
          const buttonId = msg.interactive?.button_reply?.id as string | undefined
          if (buttonId) {
            const handled = await handleRepButtons(supabase, fromPhone, buttonId)
            if (handled) return await exitSafely(new Response('OK', { status: 200 }))
          }
          return await exitSafely(new Response('OK', { status: 200 }))
        }

        if (msgType === 'text') {
          const textoRep = msg.text?.body as string
          // BUG-03 fix: si el repartidor tiene sesión /fachada activa, guardar texto como nota
          const lowerTextoRep = textoRep.toLowerCase();
          const isAiCommandRep = lowerTextoRep.startsWith('actualiza') || lowerTextoRep.startsWith('califica') || lowerTextoRep.startsWith('agrega') || lowerTextoRep.startsWith('ponle');

          if (textoRep && !textoRep.startsWith('/') && !isAiCommandRep) {
            const { data: capSesionRep } = await supabase.from('bot_memory')
              .select('history').eq('phone', `capture_mode_${from10}`).maybeSingle()
            const sesionRep = capSesionRep?.history?.[0]
            if (sesionRep?.clienteId && sesionRep.expira && Date.now() < sesionRep.expira) {
              // BUGFIX: Detectar si el texto es un enlace a Google Maps
              const isMapsLink = textoRep.includes('maps.app.goo.gl') || textoRep.includes('maps.google.com') || textoRep.includes('goo.gl/maps');
              
              if (isMapsLink) {
                await supabase.from('clientes').update({ direccion: textoRep.trim() }).eq('id', sesionRep.clienteId)
                await sendWA(fromPhone, `📍 *Enlace de Maps guardado* para *${sesionRep.clienteNombre}*:\n_${textoRep}_`)
                return await exitSafely(new Response('OK', { status: 200 }))
              }

              const { data: cliRep } = await supabase.from('clientes').select('notas_crm').eq('id', sesionRep.clienteId).maybeSingle()
              const notaAnterior = cliRep?.notas_crm || ''
              const fecha = new Date().toLocaleDateString('es-MX')
              await supabase.from('clientes').update({
                notas_crm: notaAnterior ? `${notaAnterior}\n[${fecha}] 💬 ${textoRep}` : `[${fecha}] 💬 ${textoRep}`
              }).eq('id', sesionRep.clienteId)
              await sendWA(fromPhone, `📝 Nota guardada para *${sesionRep.clienteNombre}*:\n_${textoRep}_`)
              return await exitSafely(new Response('OK', { status: 200 }))
            }
          }
          return await handleRepMessage(supabase, fromPhone, from10, textoRep, adminAsRep)
        }

        await sendWA(fromPhone, `🛵 *Modo Repartidor activo.*\nEnvía texto o usa los botones de pedido.\n\nEscribe */admin* para regresar a modo administrador.`)
        return await exitSafely(new Response('OK', { status: 200 }))
      }

      // 3.B MODO B2B RESTAURANTE ──
      if (cachedRestData && msgType === 'text') {
        const { handleRestaurantCommand } = await import('./restaurant-b2b-handler.ts')
        const restResponse = await handleRestaurantCommand(supabase, fromPhone, cachedRestData.id, msg.text?.body as string)
        if (restResponse) return await exitSafely(restResponse)
      }

      // AISLADO PARA ENFOCARSE EN LEALTAD:
      /*
      const portalResponse = await handleRestaurantPortal(supabase, fromPhone, from10, admin10, `52${admin10}`, msgType, msg, sendWA, sendInteractiveButton)
      if (portalResponse) return portalResponse
      */
    }

    // La búsqueda de repartidor ya fue cacheada al inicio en cachedRepData (Escalabilidad Fase 2)
    // if (!esAdmin || adminEnModoRepartidor) { ... }

    // 4. REP FLOW — only for text messages
    if ((!esAdmin || adminEnModoRepartidor) && msgType === 'text') {
      if (cachedRepData) return await handleRepMessage(supabase, fromPhone, from10, msg.text.body as string, cachedRepData)
    }

    // 5. CLIENT INTERACTIVE BUTTONS (Aceptar / Rechazar orden)
    // AISLADO PARA ENFOCARSE EN LEALTAD:
    /*
    if (!cachedRepData && (!esAdmin || adminEnModoRepartidor)) {
      const buttonText = msgType === 'interactive'
        ? (msg.interactive?.button_reply?.title || msg.interactive?.button_reply?.id || '')
        : (msgType === 'text' ? (msg.text?.body as string || '') : '')

      const normalizedText = buttonText.trim().toLowerCase()

      if (normalizedText === 'aceptar') {
        await sendWA(fromPhone, `✅ *¡Confirmado!* Hemos validado tu pedido.\n\nPrepara la mesa 🍽️, te avisaremos por este medio en cuanto tu repartidor inicie la ruta hacia tu domicilio. 🛵💨`)
        return await exitSafely(new Response('OK', { status: 200 }))
      } else if (normalizedText === 'rechazar') {
        await sendWA(fromPhone, `❌ Lamentamos el inconveniente. Un administrador ha sido notificado y se pondrá en contacto contigo a la brevedad.`)
        if (admin10) {
          await sendWA(`52${admin10}`, `🚨 *ALERTA CLIENTE RECHAZÓ PEDIDO*\n\nEl cliente acaba de presionar "Rechazar" en la notificación de su pedido.\nComunícate de inmediato: wa.me/${fromPhone}`)
        }
        return await exitSafely(new Response('OK', { status: 200 }))
      }
    }
    */

    // 6. FLUJO INTELIGENTE DE CLIENTES ──
    // Helper: envía mensajes separados si la IA usa ||| como separador
    const sendWAMulti = async (to: string, texto: string) => {
      const partes = texto.split('|||').map(p => p.trim()).filter(Boolean)
      for (let i = 0; i < partes.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 600))
        await sendWA(to, partes[i])
      }
    }

    if (!esAdmin || adminEnModoRepartidor) {
      if (cachedRepData) {
        await sendWA(fromPhone, `🤖 Hola ${cachedRepData.nombre}.\nRecuerda usar los botones para avanzar pedidos o enviarme mensajes de texto sin emojis.`)
      } else if (msgType === 'text') {
        // Buscar datos completos del cliente en la BD
        const { data: clienteDB } = await supabase.from('clientes')
          .select('nombre, puntos, es_vip, reputacion, saldo_billetera, envios_totales, rango, acepta_terminos')
          .ilike('telefono', `%${from10}%`).limit(1).maybeSingle()

        // Preparar contexto para la IA (Solo si el cliente ya aceptó términos y es VIP)
        const clienteCtx = (clienteDB && clienteDB.acepta_terminos === true) ? {
          nombre: clienteDB.nombre,
          puntos: clienteDB.puntos ?? 0,
          esVip: clienteDB.es_vip === true,
          reputacion: clienteDB.reputacion || 'sin_calificar',
          saldo: clienteDB.saldo_billetera ?? 0,
          envios: clienteDB.envios_totales ?? 0,
          rango: clienteDB.rango || 'bronce'
        } : null

        const { conversacionDeepSeek } = await import('./ai.ts')

        // ── Server-side registration state tracker ─────────────────────────────
        // Carga el estado explícito del registro (paso, nombre, colonia, tel).
        // La máquina de estados en whatsapp-ai usa este objeto para saber en qué paso está.
        let regState: { nombre?: string; tel?: string; colonia?: string; step?: number } | undefined = undefined
        if (!clienteDB || clienteDB.acepta_terminos === false) {
          const { data: regData } = await supabase.from('bot_memory')
            .select('history').eq('phone', `reg_state_${from10}`).maybeSingle()
          if (regData?.history?.[0]) {
            regState = regData.history[0] as { nombre?: string; tel?: string; colonia?: string; step?: number }
          }
          // Siempre pre-llenar el teléfono — nunca se lo pedimos al cliente
          if (!regState) regState = { tel: from10, step: 0 }
          else if (!regState.tel) regState.tel = from10
          console.log('📋 RegState loaded:', JSON.stringify(regState))
        }

        // DESACOPLE ASÍNCRONO (Background Task):
        // En lugar de hacer await conversacionDeepSeek, invocamos la nueva Edge Function en segundo plano.
        // Esto evita que Meta colapse por Timeouts si la IA tarda más de 3 segundos.
        const SUPABASE_PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
        
        fetch(`${SUPABASE_PROJECT_URL}/functions/v1/whatsapp-ai`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fromPhone,
            from10,
            texto: msg.text.body as string,
            isRepartidor: !!cachedRepData,
            repartidorInfo: cachedRepData,
            isClient: true,
            clienteCtx,
            regState
          })
        }).catch(err => console.error('Error invocando whatsapp-ai:', err))

        // Respondemos inmediatamente a Meta con 200 OK para no tener timeout
        return await exitSafely(new Response('OK', { status: 200 }))
      } else {
        // Mensaje multimedia de cliente (imagen, audio, etc.)
        const profileName = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name
        await sendWA(fromPhone, `¡Hola *${profileName || ''}*! 👋 Soy el asistente de Estrella Delivery.\n\nPor favor envíame un mensaje de texto para poder ayudarte. 😊`)
      }
      return await exitSafely(new Response('OK', { status: 200 }))
    }

    return await exitSafely(new Response('OK', { status: 200 }))
  } catch (e) {
    const errorString = e instanceof Error ? e.message : String(e);
    const stackTrace = e instanceof Error ? e.stack : undefined;
    console.error('Error root:', e)

    // Guardar en Supabase y enviar a Discord si es crítico
    await logError(
      'whatsapp-bot',
      `Unhandled crash: ${errorString}`,
      { phone: errorNotifyPhone, stack: stackTrace, bodyText: bodyText.substring(0, 500) },
      'critical'
    );

    if (errorNotifyPhone) {
      try {
        // Mensaje suave para el usuario/restaurante
        await sendWA(errorNotifyPhone, `⚠️ *[SISTEMA]*: Tuvimos un problema técnico procesando tu mensaje. El administrador ha sido notificado y lo revisará de inmediato.`)

        // Notificación DLQ (Dead Letter Queue) para el Administrador
        const mainAdmin10 = ADMIN_PHONES_ENV.split(',')[0]?.replace(/\D/g, '').slice(-10)
        if (mainAdmin10) {
          // Si falla la integración con Discord, el administrador al menos recibirá un WhatsApp
          const truncBody = bodyText.substring(0, 800)
          const errorMsg = `🚨 *CRITICAL ERROR (DLQ)* 🚨\n\n*De:* ${errorNotifyPhone}\n*Error:* ${errorString}\n\n*Payload:*\n\`\`\`${truncBody}\`\`\``
          await sendWA(`52${mainAdmin10}`, errorMsg)
        }
      } catch (err2) {
        console.error('Fallback fail:', err2)
      }
    }
    // Siempre retornar 200 a Meta para evitar reintentos masivos
    return new Response('Error handled cleanly', { status: 200 })
  }
})
