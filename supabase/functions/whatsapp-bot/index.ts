// supabase/functions/whatsapp-bot/index.ts
// WhatsApp AI Bot — Edge Function (Modular Architecture)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { sendWA, sendInteractiveButton } from './whatsapp.ts'
import { extract10Digits } from './db.ts'
import { handleRepButtons, handleRepMessage } from './rep-handler.ts'
import { handleAdminGPS, handleAdminAssignRest, handleAdminMessage } from './admin-handler.ts'
import { handleRestaurantPortal } from './restaurant-portal.ts'

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
  try {
    const body = await req.json()
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages

    if (!messages || messages.length === 0) return new Response('No messages', { status: 200 })

    const msg = messages[0]
    const fromPhone = msg.from as string
    errorNotifyPhone = fromPhone
    const messageId = msg.id as string
    const msgType = msg.type as string

    // ── IDEMPOTENCY: Evitar duplicados de Meta ──
    const idempotencyKey = `processed_msg:${messageId}`
    const { data: alreadyProcessed } = await supabase.from('bot_memory').select('phone').eq('phone', idempotencyKey).maybeSingle()
    if (alreadyProcessed) {
      console.log(`⚠️ Mensaje duplicado ignorado: ${messageId}`)
      return new Response('OK', { status: 200 })
    }
    await supabase.from('bot_memory').upsert({ phone: idempotencyKey, history: [], updated_at: new Date().toISOString() })

    // BUG FIX #7: Limpiar llaves de idempotencia viejas (mayores a 1 hora) para no saturar
    const unaHoraAtras = new Date(Date.now() - 3600 * 1000).toISOString()
    // Borrado silencioso y asíncrono
    supabase.from('bot_memory').delete().ilike('phone', 'processed_msg:%').lt('updated_at', unaHoraAtras).then()

    // ── COMANDO SECRETO SANEAMIENTO ──
    if (msgType === 'text' && msg.text?.body === 'SANEAMIENTO_TOTAL') {
      const cleanPhones = async (table: string) => {
        const { data } = await supabase.from(table).select('id, telefono')
        for (const r of data || []) {
          if (r.telefono && r.telefono !== r.telefono.replace(/\D/g, '')) {
            await supabase.from(table).update({ telefono: r.telefono.replace(/\D/g, '') }).eq('id', r.id)
          }
        }
      }
      await Promise.all([cleanPhones('repartidores'), cleanPhones('restaurantes'), cleanPhones('clientes')])
      await sendWA(fromPhone, `✅ [SISTEMA] Base de datos saneada (espacios eliminados en teléfonos).`)
      return new Response('OK', { status: 200 })
    }

    // ── IDENTIFICACIÓN DE ROLES ──
    const from10  = extract10Digits(fromPhone)
    const ADMIN_PHONES_LIST = ADMIN_PHONES_ENV.split(',').map(s => extract10Digits(s)).filter(Boolean)
    const esAdmin = ADMIN_PHONES_LIST.includes(from10)
    const admin10 = esAdmin ? from10 : (ADMIN_PHONES_LIST[0] || '')

    // ── INTERCEPTOR DE MULTIMEDIA Y FORMATOS NO SOPORTADOS ──
    if (['audio', 'image', 'document', 'sticker', 'video', 'voice'].includes(msgType)) {
      if (!esAdmin) {
        await sendWA(fromPhone, `🤖 Por favor envíanos la información únicamente en *texto*. Aún no proceso notas de voz, fotos o documentos. ¡Gracias!`)
      }
      return new Response('OK', { status: 200 })
    }

    // 1. REP BOTONES INTERACTIVOS ──
    if (msgType === 'interactive') {
      const buttonId = msg.interactive?.button_reply?.id as string | undefined
      if (buttonId) await handleRepButtons(supabase, fromPhone, buttonId)
      return new Response('OK', { status: 200 })
    }

    // 2. ADMIN FLOW ──
    if (esAdmin) {
      // 2.A GPS Directo
      if (msgType === 'location') {
        return await handleAdminGPS(supabase, fromPhone, admin10, msg.location.latitude, msg.location.longitude, msg.location.name ?? msg.location.address ?? '', messageId)
      }
      if (msgType === 'text') {
        const texto = msg.text.body as string
        if (texto.toLowerCase() === 'debug_restaurantes') {
           const { data } = await supabase.from('restaurantes').select('nombre, telefono, activo').limit(50)
           if (data) await sendWA(fromPhone, `📍 *RESTAURANTES REGISTRADOS:*\n${data.map((r:any) => `- ${r.nombre}: ${r.telefono} [${r.activo?'✅':'❌'}]`).join('\n')}`)
           return new Response('OK', { status: 200 })
        }
        
        // Asignación rápida de restaurante
        const { data: pendingMem } = await supabase.from('bot_memory').select('history').eq('phone', `admin_rest_pending_${admin10}`).maybeSingle()
        if (pendingMem?.history?.[0]?.pedidos?.length > 0) {
          const assignRes = await handleAdminAssignRest(supabase, fromPhone, admin10, texto, pendingMem.history[0])
          if (assignRes) return assignRes
        }

        // Ejecutar agente DeepSeek Admin
        return await handleAdminMessage(supabase, fromPhone, messageId, texto)
      }
    }

    // 3. RESTAURANT PORTAL ──
    if (!esAdmin) {
      const portalResponse = await handleRestaurantPortal(supabase, fromPhone, from10, admin10, admin10, msgType, msg, sendWA, sendInteractiveButton)
      if (portalResponse) return portalResponse
    }

    // 4. REP FLOW O PUBLICO ──
    if (!esAdmin && msgType === 'text') {
      const { data: isRep } = await supabase.from('repartidores').select('id, user_id, nombre, alias').ilike('telefono', `%${from10}%`).maybeSingle()
      if (isRep) return await handleRepMessage(supabase, fromPhone, from10, msg.text.body as string, isRep)
    }

    // 5. PUBLICO BIENVENIDA O REPARITDOR MULTIMEDIA ──
    if (!esAdmin) {
       const { data: isRep } = await supabase.from('repartidores').select('nombre').ilike('telefono', `%${from10}%`).maybeSingle()
       if (isRep) {
          await sendWA(fromPhone, `🤖 Hola ${isRep.nombre}.\nRecuerda usar los botones para avanzar pedidos o enviarme mensajes de texto sin emojis.`)
       } else {
          const profileName = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name
          await sendWA(fromPhone, `¡Hola *${profileName||''}*! 👋 Soy el asistente de Estrella Delivery.\n\nPara pedir un servicio, escríbele al administrador: wa.me/52${admin10}\n\n¡Gracias! ⭐`)
       }
       return new Response('OK', { status: 200 })
    }

    return new Response('OK', { status: 200 })
  } catch (e) {
    console.error('Error root:', e)
    if (errorNotifyPhone) {
      try {
        await sendWA(errorNotifyPhone, `⚠️ *[SISTEMA]*: Hubo un fallo interno grave procesando esa solicitud. Detalle: ${e instanceof Error ? e.message : String(e)}`)
      } catch (err2) { console.error('Fallback fail:', err2) }
    }
    // Siempre retornar 200 a Meta
    return new Response('Error handled cleanly', { status: 200 })
  }
})
