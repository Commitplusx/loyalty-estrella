// supabase/functions/whatsapp-bot/index.ts
// WhatsApp AI Bot — Edge Function (Modular Architecture)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { sendWA, sendInteractiveButton } from './whatsapp.ts'
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

    // ── IDENTIFICAR ROL PARA ETIQUETAS DE CHATWOOT ──
    let userLabel = 'cliente'
    if (esAdmin) {
      userLabel = 'admin'
    } else {
      const { data: isRep } = await supabase.from('repartidores').select('id').ilike('telefono', `%${from10}%`).limit(1).maybeSingle()
      if (isRep) userLabel = 'repartidor'
      else {
        const { data: isRest } = await supabase.from('restaurantes').select('id').ilike('telefono', `%${from10}%`).limit(1).maybeSingle()
        if (isRest) userLabel = 'restaurante'
      }
    }

    // ── SYNC A CHATWOOT CRM — guarda el promise para usarlo en la respuesta del bot ──
    let cwConvIdPromise: Promise<number | null> = Promise.resolve(null)
    const profileName = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name
    if (msgType === 'text' && msg.text?.body) {
      cwConvIdPromise = syncToChatwoot(fromPhone, msg.text.body as string, profileName, userLabel)
    } else if (msgType === 'interactive') {
      const buttonTitle = msg.interactive?.button_reply?.title || 'Botón presionado'
      cwConvIdPromise = syncToChatwoot(fromPhone, `[Clic Botón] ${buttonTitle}`, profileName, userLabel)
    }

    // Disparar sincronización de Atributos Personalizados en segundo plano
    if (userLabel === 'cliente') {
      updateChatwootProfile(supabase, fromPhone).catch(e => console.error('[CW Sync] Error actualizando perfil:', e))
    }

    // ── COMANDO SECRETO SANEAMIENTO (ahora sí después de esAdmin) ──
    if (msgType === 'text' && msg.text?.body === 'SANEAMIENTO_TOTAL') {
      if (!esAdmin) return new Response('Unauthorized', { status: 401 })
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

    // ── INTERCEPTOR DE MULTIMEDIA Y FORMATOS NO SOPORTADOS ──
    if (['audio', 'image', 'document', 'sticker', 'video', 'voice'].includes(msgType)) {
      if (!esAdmin) {
        await sendWA(fromPhone, `🤖 Por favor envíanos la información únicamente en *texto*. Aún no proceso notas de voz, fotos o documentos. ¡Gracias!`)
      }
      return new Response('OK', { status: 200 })
    }

    // 1. BOTONES INTERACTIVOS Y PLANTILLAS ──
    if (msgType === 'interactive' || msgType === 'button') {
      const buttonId = (msg.interactive?.button_reply?.id || msg.button?.payload || msg.button?.text) as string | undefined
      if (buttonId) {
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
        await handleRepButtons(supabase, fromPhone, buttonId)
      }
      return new Response('OK', { status: 200 })
    }

    // ── SLASH COMMANDS (Admin Dual Mode) ─────────────────────────────────────
    // Deben ir ANTES del flujo admin normal para no pasar por la IA
    if (esAdmin && msgType === 'text') {
      const slashText = (msg.text?.body as string || '').trim().toLowerCase()
      if (slashText === '/repartidor') {
        await supabase.from('bot_memory').upsert({
          phone: `admin_mode_${from10}`,
          history: [{ mode: 'repartidor', activado: Date.now() }],
          updated_at: new Date().toISOString()
        })
        await sendWA(fromPhone, `🛵 *Modo Repartidor activado.*\nAhora recibirás pedidos como mensajero y puedes aceptarlos con el botón.\n\nEscribe */admin* para regresar a modo administrador.`)
        return new Response('OK', { status: 200 })
      }
      if (slashText === '/admin') {
        await supabase.from('bot_memory').delete().eq('phone', `admin_mode_${from10}`)
        await sendWA(fromPhone, `👔 *Modo Admin activado.*\nYa tienes acceso completo al panel de administración.`)
        return new Response('OK', { status: 200 })
      }
      if (slashText.startsWith('/usar ')) {
        const codigo = slashText.replace('/usar ', '').trim().toUpperCase()
        const { data, error } = await supabase.rpc('usar_cupon', { p_codigo: codigo })
        if (error) await sendWA(fromPhone, `❌ Error interno: ${error.message}`)
        else if (!data?.ok) await sendWA(fromPhone, `❌ Error: ${data?.error || 'Cupón no encontrado'}`)
        else await sendWA(fromPhone, `✅ *Cupón Usado*\n\nSe ha marcado como usado el cupón *${codigo}* del cliente *${data.cliente_nombre}* (${data.cliente_tel}).\nYa puede generar uno nuevo.`)
        return new Response('OK', { status: 200 })
      }
      if (slashText.startsWith('/cancelar ')) {
        const codigo = slashText.replace('/cancelar ', '').trim().toUpperCase()
        const { data: adminUser } = await supabase.from('admin_users').select('id').eq('telefono', from10).maybeSingle()
        const { data, error } = await supabase.rpc('cancelar_cupon', {
          p_codigo: codigo,
          p_admin_id: adminUser?.id || null
        })
        if (error) await sendWA(fromPhone, `❌ Error interno: ${error.message}`)
        else if (!data?.ok) await sendWA(fromPhone, `❌ Error: ${data?.error || 'Cupón no encontrado'}`)
        else await sendWA(fromPhone, `✅ *Cupón Cancelado*\n\nSe ha cancelado el cupón *${codigo}* del cliente *${data.cliente_nombre}*.\nSe han devuelto *$${data.monto_reembolsado}* a su billetera.`)
        return new Response('OK', { status: 200 })
      }

      if (slashText === '/testdiscord') {
        await logError(
          'whatsapp-bot',
          '🔥 Prueba manual de Webhook iniciada por el administrador',
          { user: fromPhone, test: true, timestamp: new Date().toISOString() },
          'critical'
        );
        await sendWA(fromPhone, `📡 *Test Enviado*\nAcabo de disparar un error crítico de prueba. Si configuraste bien el \`DISCORD_WEBHOOK_URL\` en Supabase, el mensaje debió llegar al canal de Discord ahora mismo.`);
        return new Response('OK', { status: 200 })
      }

      // ── COMANDOS DE EMERGENCIA (funcionan SIN DeepSeek) ──────────────────────
      // Estos comandos permiten operar el negocio cuando la IA está caída.
      if (slashText.startsWith('/pedido ')) {
        // Formato: /pedido 9631234567 2 tacos pastor de Makitan
        const args = (msg.text?.body as string).slice(8).trim()
        const telMatch = args.match(/^(\d{10})\s+(.+)$/s)
        if (!telMatch) {
          await sendWA(fromPhone, `⚠️ Formato: */pedido 9631234567 descripción del pedido*`)
          return new Response('OK', { status: 200 })
        }
        const [, cTel, desc] = telMatch
        const pData = { clienteTel: cTel, clienteNombre: null, restaurante: null, descripcion: desc, direccion: null, repartidorAlias: null }
        const r = await crearPedidoDesdeBot(supabase, pData, undefined, undefined, messageId)
        if (r.ok && r.pedidoId) {
          await sendWA(fromPhone, `✅ *Pedido creado (modo manual)*\n📞 Cliente: ${cTel}\n📦 ${desc}\n🔗 ${pedidoLink(r.pedidoId)}`)
        } else {
          await sendWA(fromPhone, `❌ Error: ${r.error || 'No se pudo crear el pedido'}`)
        }
        return new Response('OK', { status: 200 })
      }

      if (slashText.startsWith('/puntos ')) {
        // Formato: /puntos 9631234567 [cantidad]
        const args = slashText.slice(8).trim().split(/\s+/)
        const cTel = args[0]?.replace(/\D/g, '').slice(-10)
        const cant = parseInt(args[1] || '1') || 1
        if (!cTel || cTel.length !== 10) {
          await sendWA(fromPhone, `⚠️ Formato: */puntos 9631234567* o */puntos 9631234567 3*`)
          return new Response('OK', { status: 200 })
        }
        let lastRes: any = null, rpcErr: any = null
        for (let i = 0; i < cant; i++) {
          const { data, error } = await supabase.rpc('fn_registrar_entrega', { p_cliente_tel: cTel })
          if (error) { rpcErr = error; break }
          if (data?.ok) lastRes = data
        }
        if (lastRes) {
          await sendWA(fromPhone, `✅ *${cant} punto(s)* sumados a ${cTel}. Total: *${lastRes.puntos} pts*`)
        } else {
          await sendWA(fromPhone, `❌ Error: ${rpcErr?.message || 'Cliente no encontrado'}`)
        }
        return new Response('OK', { status: 200 })
      }

      if (slashText.startsWith('/buscar ')) {
        const cTel = slashText.slice(8).trim().replace(/\D/g, '').slice(-10)
        if (!cTel || cTel.length !== 10) {
          await sendWA(fromPhone, `⚠️ Formato: */buscar 9631234567*`)
          return new Response('OK', { status: 200 })
        }
        const { data: c } = await supabase.from('clientes')
          .select('nombre, telefono, puntos, es_vip, rango, saldo_billetera, envios_totales, envios_gratis_disponibles, cupon_activo, notas_crm')
          .ilike('telefono', `%${cTel}%`).limit(1).maybeSingle()
        if (c) {
          await sendWA(fromPhone,
            `🔍 *${c.nombre || 'Sin nombre'}*\n📞 ${c.telefono}\n⭐ Puntos: ${c.puntos} | Rango: ${c.rango || 'bronce'}\n🎁 Envíos gratis: ${c.envios_gratis_disponibles}\n💰 Billetera: $${c.saldo_billetera || 0}\n🛵 Total entregas: ${c.envios_totales}\n${c.es_vip ? '👑 VIP' : ''}${c.cupon_activo ? `\n🎟️ Cupón: ${c.cupon_activo}` : ''}${c.notas_crm ? `\n📝 ${c.notas_crm.slice(0, 200)}` : ''}`)
        } else {
          await sendWA(fromPhone, `❌ Cliente no encontrado con ese número.`)
        }
        return new Response('OK', { status: 200 })
      }

      if (slashText.startsWith('/saldo ')) {
        // Formato: /saldo 9631234567 150.50
        const args = slashText.slice(7).trim().split(/\s+/)
        const cTel = args[0]?.replace(/\D/g, '').slice(-10)
        const monto = parseFloat(args[1] || '0')
        if (!cTel || cTel.length !== 10 || isNaN(monto) || monto <= 0) {
          await sendWA(fromPhone, `⚠️ Formato: */saldo 9631234567 150.50*`)
          return new Response('OK', { status: 200 })
        }
        const { data: c } = await supabase.from('clientes').select('id, nombre, saldo_billetera').ilike('telefono', `%${cTel}%`).limit(1).maybeSingle()
        if (c) {
          const nuevoSaldo = (c.saldo_billetera || 0) + monto
          await supabase.from('clientes').update({ saldo_billetera: nuevoSaldo }).eq('id', c.id)
          await sendWA(fromPhone, `✅ *$${monto}* cargados a ${c.nombre || cTel}.\n💰 Saldo anterior: $${c.saldo_billetera || 0}\n💰 Saldo nuevo: *$${nuevoSaldo}*`)
        } else {
          await sendWA(fromPhone, `❌ Cliente no encontrado.`)
        }
        return new Response('OK', { status: 200 })
      }

      if (slashText === '/ayuda' || slashText === '/help') {
        await sendWA(fromPhone,
          `📋 *COMANDOS DE EMERGENCIA*\n_(Funcionan sin IA)_\n\n` +
          `📦 */pedido 963XXXXXXX descripción* — Crear pedido\n` +
          `⭐ */puntos 963XXXXXXX [cantidad]* — Sumar puntos\n` +
          `🔍 */buscar 963XXXXXXX* — Ver datos del cliente\n` +
          `💰 */saldo 963XXXXXXX monto* — Cargar billetera\n` +
          `🎟️ */usar CODIGO* — Marcar cupón como usado\n` +
          `🚫 */cancelar CODIGO* — Cancelar cupón\n` +
          `🛵 */repartidor* — Modo repartidor\n` +
          `👔 */admin* — Modo administrador\n\n` +
          `_Estos comandos no requieren IA y siempre funcionan._`)
        return new Response('OK', { status: 200 })
      }
    }

    // ── VERIFICAR MODO REPARTIDOR DEL ADMIN ──────────────────────────────────
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
          if (data) await sendWA(fromPhone, `📍 *RESTAURANTES REGISTRADOS:*\n${data.map((r: any) => `- ${r.nombre}: ${r.telefono} [${r.activo ? '✅' : '❌'}]`).join('\n')}`)
          return new Response('OK', { status: 200 })
        }

        // Asignación rápida de restaurante
        const { data: pendingMem } = await supabase.from('bot_memory').select('history').eq('phone', `admin_rest_pending_${admin10}`).maybeSingle()
        if (pendingMem?.history?.[0]?.pedidos?.length > 0) {
          const assignRes = await handleAdminAssignRest(supabase, fromPhone, admin10, texto, pendingMem.history[0])
          if (assignRes) return assignRes
        }

        // Ejecutar agente Claude Admin
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
            if (handled) return new Response('OK', { status: 200 })
          }
          return new Response('OK', { status: 200 })
        }

        if (msgType === 'text') {
          return await handleRepMessage(supabase, fromPhone, from10, msg.text?.body as string, adminAsRep)
        }

        await sendWA(fromPhone, `🛵 *Modo Repartidor activo.*\nEnvía texto o usa los botones de pedido.\n\nEscribe */admin* para regresar a modo administrador.`)
        return new Response('OK', { status: 200 })
      }

      const portalResponse = await handleRestaurantPortal(supabase, fromPhone, from10, admin10, `52${admin10}`, msgType, msg, sendWA, sendInteractiveButton)
      if (portalResponse) return portalResponse
    }

    // Cacheamos la búsqueda del repartidor para evitar duplicar consultas a la base de datos.
    let cachedRepData: { id: string; user_id: string; nombre: string; alias: string } | null = null
    if (!esAdmin || adminEnModoRepartidor) {
      const { data } = await supabase.from('repartidores')
        .select('id, user_id, nombre, alias').ilike('telefono', `%${from10}%`).limit(1).maybeSingle()
      cachedRepData = data
    }

    // 4. REP FLOW — only for text messages
    if ((!esAdmin || adminEnModoRepartidor) && msgType === 'text') {
      if (cachedRepData) return await handleRepMessage(supabase, fromPhone, from10, msg.text.body as string, cachedRepData)
    }

    // 5. CLIENT INTERACTIVE BUTTONS (Aceptar / Rechazar orden)
    if (!cachedRepData && (!esAdmin || adminEnModoRepartidor)) {
      const buttonText = msgType === 'interactive' 
        ? (msg.interactive?.button_reply?.title || msg.interactive?.button_reply?.id || '')
        : (msgType === 'text' ? (msg.text?.body as string || '') : '')
      
      const normalizedText = buttonText.trim().toLowerCase()
      
      if (normalizedText === 'aceptar') {
        await sendWA(fromPhone, `✅ **¡Confirmado!** Hemos validado tu pedido.\n\nPrepara la mesa 🍽️, te avisaremos por este medio en cuanto tu repartidor inicie la ruta hacia tu domicilio. 🛵💨`)
        return new Response('OK', { status: 200 })
      } else if (normalizedText === 'rechazar') {
        await sendWA(fromPhone, `❌ Lamentamos el inconveniente. Un administrador ha sido notificado y se pondrá en contacto contigo a la brevedad.`)
        if (admin10) {
          await sendWA(`52${admin10}`, `🚨 *ALERTA CLIENTE RECHAZÓ PEDIDO*\n\nEl cliente acaba de presionar "Rechazar" en la notificación de su pedido.\nComunícate de inmediato: wa.me/${fromPhone}`)
        }
        return new Response('OK', { status: 200 })
      }
    }

    // 6. PUBLICO BIENVENIDA O REPARTIDOR MULTIMEDIA ──
    if (!esAdmin || adminEnModoRepartidor) {
      // Reutilizamos la búsqueda del repartidor cacheada anteriormente.
      if (cachedRepData) {
        await sendWA(fromPhone, `🤖 Hola ${cachedRepData.nombre}.\nRecuerda usar los botones para avanzar pedidos o enviarme mensajes de texto sin emojis.`)
      } else {
        const texto = msgType === 'text' ? (msg.text?.body as string).toLowerCase() : ''
        const { data: mem } = await supabase.from('bot_memory').select('history').eq('phone', from10).maybeSingle()
        const isClientAI = (mem?.history?.length > 0) || texto.includes('registrar') || texto.includes('asociar') || texto.includes('restaurante') || texto.includes('convenio')

        if (isClientAI && msgType === 'text') {
           const { conversacionDeepSeek } = await import('./ai.ts')
           const resAI = await conversacionDeepSeek(supabase, fromPhone, msg.text.body as string, false, null, true)
           
           if (resAI?.errorObj) {
             await sendWA(fromPhone, `⚠️ Tuvimos un problema procesando tu mensaje. Reintenta en unos minutos.`)
             return new Response('OK', { status: 200 })
           }
           if (resAI?.respuesta) {
             if (resAI.respuesta.accion === 'REGISTRAR_RESTAURANTE') {
               const nombre = resAI.respuesta.datosAExtraer?.nombre_restaurante
               const correo = resAI.respuesta.datosAExtraer?.correo
               
               await supabase.from('restaurantes_solicitudes').insert({
                 nombre_restaurante: nombre, correo, telefono: from10
               })
               
               const adminMsg = `🔔 *Nueva Solicitud de Restaurante*\n\nRestaurante: ${nombre}\nCorreo: ${correo}\nTeléfono: wa.me/52${from10}\n\nPara aprobar o rechazar, haz clic en el enlace seguro:`
               // Generar enlaces para el Admin
               const SUPABASE_PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
               const functionUrl = `${SUPABASE_PROJECT_URL}/functions/v1/admin-approval`
               
               await sendWA(`52${admin10}`, adminMsg)
               await sendWA(`52${admin10}`, `✅ APROBAR: ${functionUrl}?action=accept&tel=${from10}`)
               await sendWA(`52${admin10}`, `❌ RECHAZAR: ${functionUrl}?action=reject&tel=${from10}`)
               
               await sendWA(fromPhone, `🎉 ¡Excelente *${nombre}*!\n\nTu solicitud ha sido enviada al equipo de administración. Recibirás un mensaje aquí mismo en cuanto sea aprobada para que puedas acceder al portal con tu correo *${correo}*.`)
               
               await supabase.from('bot_memory').delete().eq('phone', from10)
             } else {
               await sendWA(fromPhone, resAI.respuesta.mensajeUsuario)
               if (resAI.nuevoHistorial) {
                 const { guardarMemoria } = await import('./db.ts')
                 await guardarMemoria(supabase, from10, resAI.nuevoHistorial)
               }
             }
           }
        } else {
          const profileName = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name
          // Si el cliente está registrado, mostrar sus puntos en lugar de redirigir al admin
          const { data: cliente } = await supabase.from('clientes')
            .select('nombre, puntos').ilike('telefono', `%${from10}%`).limit(1).maybeSingle()
          const botMsg = cliente
            ? `⭐ ¡Hola *${cliente.nombre || profileName || ''}*!\n\nTienes *${cliente.puntos || 0} puntos* de lealtad acumulados.\n🔗 Tu tarjeta: https://www.app-estrella.shop/loyalty/${from10}\n\nPara hacer un pedido escríbele al administrador: wa.me/52${admin10}`
            : `¡Hola *${profileName || ''}*! 👋 Soy el asistente de Estrella Delivery.\n\nPara pedir un servicio, escríbele al administrador: wa.me/52${admin10}\n\n¡Gracias! ⭐`
          await sendWA(fromPhone, botMsg)
        }
      }
      return new Response('OK', { status: 200 })
    }

    return new Response('OK', { status: 200 })
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
