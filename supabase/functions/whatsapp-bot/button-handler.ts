import { sendWA, sendInteractiveButtons, sendWADocument } from './whatsapp.ts'
import { handleAdminInteractive } from './slash-commands-handler.ts'
import { handleRepButtons } from './rep-handler.ts'
import { handleCalificacion, handleTerminos, handleAdminCommands } from './admin-handler.ts'
import { startRestaurantOnboarding } from './restaurant-onboarding.ts'
import { iniciarFlujoMandadito, avanzarFlujoMandadito } from './mandadito-handler.ts'

export async function handleButtonEvent(
  supabase: any,
  fromPhone: string,
  from10: string,
  msg: any,
  esAdmin: boolean,
  userLabel: string,
  SUPABASE_KEY: string
): Promise<Response | null> {
  const buttonId = (
    msg.interactive?.button_reply?.id  ||
    msg.interactive?.list_reply?.id    ||
    msg.button?.payload                ||
    msg.button?.text
  ) as string | undefined

  if (!buttonId) return null

  // ── Admin / Repartidor interactive actions (ACT_) ──
  if ((esAdmin || userLabel === 'repartidor') && buttonId.startsWith('ACT_')) {
    const res = await handleAdminInteractive(supabase, fromPhone, from10, buttonId)
    if (res) return res
  }

  // ── Repartidor: menú interactivo y calificaciones ──
  if (userLabel === 'repartidor' && (buttonId.startsWith('REP_CMD_') || buttonId.startsWith('REP_SCORE_'))) {
    if (buttonId.startsWith('REP_SCORE_')) {
      // REP_SCORE_excelente_9631234567 → ejecutar directo
      const { data: repRow } = await supabase.from('repartidores').select('id, nombre, alias').eq('telefono', from10).maybeSingle()
      const repData = repRow ?? { nombre: 'Repartidor' }
      const parts = buttonId.replace('REP_SCORE_', '').split('_') // ['excelente', '9631234567']
      const rep = parts[0]
      const tel = parts[1]
      const { data: c } = await supabase.from('clientes').select('id, nombre').eq('telefono', tel).maybeSingle()
      if (!c) { await sendWA(fromPhone, `❌ No encontré al cliente.`); return new Response('OK', { status: 200 }) }
      const repIcon: Record<string, string> = { excelente: '🌟', bueno: '👍', regular: '⚠️', malo: '❌' }
      await supabase.from('clientes').update({ reputacion: rep }).eq('id', c.id)
      await sendWA(fromPhone, `${repIcon[rep] || '✅'} Calificación guardada: *${c.nombre}* → *${rep}*`)
    } else {
      await handleRepButtons(supabase, fromPhone, buttonId)
    }
    return new Response('OK', { status: 200 })
  }

  // ── Admin: Estadísticas interactive actions (EST_VER_) ──
  if (esAdmin && buttonId.startsWith('EST_VER_')) {
    const { handleAdminMessage } = await import('./admin-handler.ts')
    if (buttonId === 'EST_VER_VIPS') await handleAdminMessage(supabase, fromPhone, 'VER_VIPS', null)
    else if (buttonId === 'EST_VER_REST') await handleAdminMessage(supabase, fromPhone, 'VER_RESTAURANTES', null)
    else if (buttonId === 'EST_VER_REPS') await handleAdminMessage(supabase, fromPhone, 'VER_REPARTIDORES', null)
    return new Response('OK', { status: 200 })
  }

  // ── Admin: Menú Interactivo Modo Lluvia (cmd_lluvia_) ──
  if (esAdmin && buttonId.startsWith('cmd_lluvia_')) {
    const recargoText = buttonId.replace('cmd_lluvia_', '')
    const recargo = parseInt(recargoText, 10)
    
    const { data: config } = await supabase.from('app_config').select('configuracion_precios').eq('id', 'default').single()
    const currentConfig = config?.configuracion_precios || {}

    if (recargo === 0) {
      currentConfig.modo_lluvia = false
      currentConfig.recargo_lluvia = 15
      await supabase.from('app_config').update({ configuracion_precios: currentConfig }).eq('id', 'default')
      await sendWA(fromPhone, '✅ *Modo Lluvia desactivado.*\nLos mandaditos vuelven a su precio normal.')
    } else {
      currentConfig.modo_lluvia = true
      currentConfig.recargo_lluvia = recargo
      await supabase.from('app_config').update({ configuracion_precios: currentConfig }).eq('id', 'default')
      await sendWA(fromPhone, `✅ *Modo Lluvia activado.*\nSe cobrarán *$${recargo} extra* en todos los mandaditos.`)
    }
    return new Response('OK', { status: 200 })
  }

  // ── Botones del Menú Principal del Cliente ──
  if (buttonId === 'MENU_PEDIR_SERVICIO') {
    // DESACTIVADO POR AHORA A PETICIÓN DEL ADMIN
    // await iniciarFlujoMandadito(supabase, fromPhone, from10)
    await sendWA(fromPhone, `🚧 *Servicio en mantenimiento*\nPor el momento los mandaditos automáticos están desactivados mientras aplicamos unas mejoras. Si necesitas un servicio urgente, por favor comunícate con un asesor. 🙏`)
    return new Response('OK', { status: 200 })
  }

  // ── Mandadito: cliente elige "Continuar" desde el guardián de sesión ──
  if (buttonId === 'MAND_CONTINUAR_SESION') {
    const { data: memData } = await supabase.from('bot_memory')
      .select('history').eq('phone', `mandadito_state_${from10}`).maybeSingle()
    const currentState = memData?.history?.[0]
    if (currentState?.step === 1) {
      await sendWA(fromPhone, `📍 ¿Desde dónde recogemos?\n_Escribe la colonia, el nombre del negocio o manda tu pin GPS._`)
    } else if (currentState?.step === 2) {
      await sendWA(fromPhone, `🏁 ¿Y a dónde lo llevamos?\n_Escribe la colonia, el nombre del lugar o manda tu pin GPS._`)
    } else {
      await iniciarFlujoMandadito(supabase, fromPhone, from10)
    }
    return new Response('OK', { status: 200 })
  }

  // ── Mandadito: cliente elige su rol (Envío o Recibo) ──
  if (buttonId === 'MAND_ROLE_ENVIO') {
    await supabase.from('bot_memory').upsert({
      phone: `mandadito_state_${from10}`,
      history: [{ step: 1, role: 'envio' }],
      updated_at: new Date().toISOString()
    })
    const { enviarSelectorUbicacion } = await import('./mandadito-handler.ts')
    await enviarSelectorUbicacion(
      supabase, fromPhone, from10,
      `📍 ¡Perfecto! Por favor dime desde dónde enviamos el paquete:`,
      1,
      'envio'
    )
    return new Response('OK', { status: 200 })
  }

  if (buttonId === 'MAND_ROLE_RECIBO') {
    await supabase.from('bot_memory').upsert({
      phone: `mandadito_state_${from10}`,
      history: [{ step: 1, role: 'recibo' }],
      updated_at: new Date().toISOString()
    })
    const { enviarSelectorUbicacion } = await import('./mandadito-handler.ts')
    await enviarSelectorUbicacion(
      supabase, fromPhone, from10,
      `📍 Entendido. ¿*En dónde recogemos* el paquete? (Especifica la colonia y calle, o el nombre del negocio)`,
      1,
      'recibo'
    )
    return new Response('OK', { status: 200 })
  }

  // ── Mandadito: cliente elige dirección guardada de la lista ──
  if (buttonId.startsWith('MAND_USAR_DIR_')) {
    // Formato corregido: MAND_USAR_DIR_{paso}_{tipo}
    // Bug 2 fix: Ya no embedemos la colonia en el ID. Buscamos por tipo en la BD.
    const sinPrefijo = buttonId.replace('MAND_USAR_DIR_', '')
    const parts = sinPrefijo.split('_')
    const paso = parseInt(parts[0])
    const tipo = parts.slice(1).join('_')  // soporte para tipos compuestos

    // Bug 5 fix: validar paso para evitar comportamiento indefinido si el ID viene malformado
    if (isNaN(paso) || (paso !== 1 && paso !== 2) || !tipo) {
      console.warn(`[MAND_USAR_DIR] ID malformado: ${buttonId}`)
      await sendWA(fromPhone, `⚠️ Ocurrió un error al leer la dirección. Por favor escribe el nombre de la colonia manualmente.`)
      return new Response('OK', { status: 200 })
    }

    // Buscar la dirección más reciente de ese tipo en BD
    const { data: ubiFav } = await supabase.from('cliente_ubicaciones')
      .select('lat, lng, colonia_nombre')
      .eq('cliente_telefono', from10)
      .eq('tipo', tipo)
      .order('ultima_vez', { ascending: false })
      .maybeSingle()

    if (!ubiFav) {
      await sendWA(fromPhone, `⚠️ No encontré esa dirección guardada. Escribe el nombre de la colonia manualmente.`)
      return new Response('OK', { status: 200 })
    }

    const ubicacion: any = ubiFav.lat && ubiFav.lng
      ? { texto: ubiFav.colonia_nombre, lat: ubiFav.lat, lng: ubiFav.lng }
      : { texto: ubiFav.colonia_nombre }

    const { data: memData } = await supabase.from('bot_memory')
      .select('history').eq('phone', `mandadito_state_${from10}`).maybeSingle()
    const currentState = memData?.history?.[0]

    if (paso === 1 && (!currentState || currentState.step === 1)) {
      await avanzarFlujoMandadito(supabase, fromPhone, from10, { step: 1 }, ubicacion)
    } else if (paso === 2 && currentState?.step === 2) {
      await avanzarFlujoMandadito(supabase, fromPhone, from10, currentState, ubicacion)
    } else {
      // Estado desfasado, reiniciar
      await iniciarFlujoMandadito(supabase, fromPhone, from10)
    }
    return new Response('OK', { status: 200 })
  }

  // ── Mandadito: cliente quiere escribir manualmente ──
  if (buttonId.startsWith('MAND_ESCRIBIR_')) {
    const paso = parseInt(buttonId.replace('MAND_ESCRIBIR_', ''))
    const txt = paso === 1
      ? '✏️ Escribe el nombre de la colonia o barrio de *origen*, o manda tu *Ubicación GPS* 📍:'
      : '✏️ Escribe el nombre de la colonia o barrio de *destino*, o manda tu *Ubicación GPS* 📍:'
    await sendWA(fromPhone, txt)
    return new Response('OK', { status: 200 })
  }

  // ── Mandadito: confirmar cotización ──
  if (buttonId.startsWith('CONFIR_MAND_EFECTIVO_') || buttonId.startsWith('CONFIR_MAND_TRANSF_')) {
    const isEfectivo = buttonId.startsWith('CONFIR_MAND_EFECTIVO_')
    const cotizTel = buttonId.replace(isEfectivo ? 'CONFIR_MAND_EFECTIVO_' : 'CONFIR_MAND_TRANSF_', '')
    const { data: cotizMem } = await supabase.from('bot_memory')
      .select('history').eq('phone', `mandadito_cotiz_${cotizTel}`).maybeSingle()
    const cotiz = cotizMem?.history?.[0]

    if (!cotiz) {
      await sendWA(fromPhone, `⚠️ No encontré tu cotización. Por favor vuelve a solicitar el mandadito.`)
      return new Response('OK', { status: 200 })
    }

    // Limpiar cotización guardada
    await supabase.from('bot_memory').delete().eq('phone', `mandadito_cotiz_${cotizTel}`)

    const metodoPagoStr = isEfectivo ? 'Efectivo 💵' : 'Transferencia 💳'

    // Mensaje de confirmación al cliente
    await sendWA(fromPhone,
      `🎉 *¡Pedido confirmado!*\n\n` +
      `🛵 Estamos asignando un repartidor cerca de ti…\n` +
      `Te avisaremos en cuanto uno lo acepte. 📲\n\n` +
      `📋 *Resumen de tu mandadito:*\n` +
      `• Origen: ${cotiz.lblOrigen}\n` +
      `• Destino: ${cotiz.lblDestino}\n` +
      (cotiz.referencias ? `• Notas: _${cotiz.referencias}_\n` : '') +
      `• Pago: ${metodoPagoStr}\n` +
      `• Total: *$${cotiz.precio}*\n\n` +
      (!isEfectivo ? `💳 _Al asignarse el repartidor, podrás enviarle el comprobante de transferencia a él directamente._\n\n` : '') +
      `_¡Gracias por confiar en Estrella Delivery! ⭐_`
    )

    // ── Insertar pedido en la base de datos ──
    // Obtenemos el nombre del cliente si está registrado
    const { data: cliente } = await supabase.from('clientes')
      .select('nombre, lat_frecuente, lng_frecuente')
      .eq('telefono', cotizTel)
      .maybeSingle()

    // Usar la ubicación de origen o destino si no tiene frecuentes
    let lat = cliente?.lat_frecuente ?? cotiz.origenLat ?? null;
    let lng = cliente?.lng_frecuente ?? cotiz.origenLng ?? null;

    const { data: nuevoPedido, error: pedErr } = await supabase.from('pedidos').insert({
      cliente_tel: cotizTel,
      cliente_nombre: cliente?.nombre || null,
      descripcion: cotiz.referencias ? `[MANDADITO] ${cotiz.referencias}` : '[MANDADITO]',
      direccion: cotiz.lblDestino,
      estado: 'pendiente', // Usamos pendiente para que el admin lo asigne
      origen: cotiz.lblOrigen,
      destino: cotiz.lblDestino,
      tipo_pedido: 'mandadito',
      metodo_pago: isEfectivo ? 'efectivo' : 'transferencia',
      precio_entrega: cotiz.precio,
      lat: lat,
      lng: lng
    }).select('id').maybeSingle()

    if (pedErr) {
      console.error('[CONFIRMAR_MANDADITO] Error al insertar pedido:', pedErr)
    }

    // Notificar al admin
    const ADMIN_PHONES_ENV = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''
    const adminPhones = ADMIN_PHONES_ENV.split(',').map((p: string) => p.trim()).filter(Boolean)
    for (const admin of adminPhones) {
      await sendWA(`52${admin}`,
        `🛵 *NUEVO MANDADITO CONFIRMADO*\n\n` +
        `📱 Cliente: ${cotizTel}\n` +
        `📍 Origen: ${cotiz.lblOrigen}\n` +
        `🏁 Destino: ${cotiz.lblDestino}\n` +
        (cotiz.referencias ? `📝 Notas: ${cotiz.referencias}\n` : '') +
        `💵 Precio: $${cotiz.precio} (${isEfectivo ? 'Efectivo' : 'Transferencia'})\n\n` +
        `_Abre la App de Admin (Flutter) para gestionarlo._`
      )
      await new Promise(r => setTimeout(r, 200))
    }

    // ── Flujo post-confirmación: guardar dirección del cliente ──
    // Solo si el cliente aún no tiene direcciones tipo "casa" o "trabajo" guardadas
    const { data: yaTieneDirs } = await supabase.from('cliente_ubicaciones')
      .select('id').eq('cliente_telefono', from10).in('tipo', ['casa', 'trabajo']).limit(1)
    if (!yaTieneDirs?.length) {
      // Guardar en estado las dos direcciones para el flujo siguiente
      await supabase.from('bot_memory').upsert({
        phone: `mand_dir_save_${from10}`,
        history: [{ lblOrigen: cotiz.lblOrigen, lblDestino: cotiz.lblDestino, origenId: cotiz.origenId, destinoId: cotiz.destinoId }],
        updated_at: new Date().toISOString()
      })
      await new Promise(r => setTimeout(r, 800))
      await sendInteractiveButtons(fromPhone,
        `💡 *¿Tú envías o recibes en este mandadito?*\n\n_Preguntamos para guardar tu dirección y agilizar tus próximas entregas. ¡Solo una vez!_`,
        [
          { id: 'MAND_YO_ENVIO',  title: '📦 Yo envío' },
          { id: 'MAND_YO_RECIBO', title: '📬 Yo recibo' }
        ]
      )
    }

    return new Response('OK', { status: 200 })
  }

  // ── Mandadito post-confirm: ¿tú envías o recibes? ──
  if (buttonId === 'MAND_YO_ENVIO' || buttonId === 'MAND_YO_RECIBO') {
    const { data: dirMem } = await supabase.from('bot_memory')
      .select('history').eq('phone', `mand_dir_save_${from10}`).maybeSingle()
    const dirs = dirMem?.history?.[0]
    if (!dirs) {
      await sendWA(fromPhone, `⚠️ Parece que expiró la sesión. No hay problema, pide un nuevo mandadito cuando quieras.`)
      return new Response('OK', { status: 200 })
    }

    // Si envía → su dirección es el ORIGEN. Si recibe → su dirección es el DESTINO.
    const esMiDirOrigen = buttonId === 'MAND_YO_ENVIO'
    const miDir = esMiDirOrigen ? dirs.lblOrigen : dirs.lblDestino
    const otraDir = esMiDirOrigen ? dirs.lblDestino : dirs.lblOrigen

    // Actualizar estado con cuál dirección es la del cliente
    await supabase.from('bot_memory').upsert({
      phone: `mand_dir_save_${from10}`,
      history: [{ ...dirs, esMiDirOrigen }],
      updated_at: new Date().toISOString()
    })

    // 🚨 WhatsApp limita títulos de botones a 20 caracteres
    const capBtn = (s: string, max = 20) => s.length > max ? s.substring(0, max - 1) + '…' : s

    await sendInteractiveButtons(fromPhone,
      `📍 *¿Cuál de estas es tu dirección?*\n\n` +
      `Tenemos dos puntos en tu mandadito:\n\n` +
      `📦 *${dirs.lblOrigen}*\n` +
      `📬 *${dirs.lblDestino}*\n\n` +
      `_Al guardarla, la próxima vez la detectaremos automáticamente._`,
      [
        { id: 'MAND_GUARDAR_MIA',  title: capBtn(`✅ ${miDir}`) },
        { id: 'MAND_GUARDAR_OTRA', title: capBtn(`❌ ${otraDir}`) }
      ]
    )
    return new Response('OK', { status: 200 })
  }

  // ── Mandadito post-confirm: confirmar cuál dirección guardar ──
  if (buttonId === 'MAND_GUARDAR_MIA' || buttonId === 'MAND_GUARDAR_OTRA') {
    const { data: dirMem } = await supabase.from('bot_memory')
      .select('history').eq('phone', `mand_dir_save_${from10}`).maybeSingle()
    const dirs = dirMem?.history?.[0]
    if (!dirs) {
      await sendWA(fromPhone, `⚠️ Sesión expirada. No hay problema, puedes pedir un nuevo mandadito cuando quieras.`)
      return new Response('OK', { status: 200 })
    }

    // Bug fix: esMiDirOrigen puede ser undefined si el usuario saltó el paso anterior
    // MAND_GUARDAR_MIA → guardar la que corresponde al rol (origen si envió, destino si recibió)
    // MAND_GUARDAR_OTRA → guardar la contraria
    const esMiDirOrigen = dirs.esMiDirOrigen ?? true // default: origen si no hay estado
    const usarOrigen = buttonId === 'MAND_GUARDAR_MIA' ? esMiDirOrigen : !esMiDirOrigen

    const dirLabel = usarOrigen ? dirs.lblOrigen : dirs.lblDestino
    const dirId    = usarOrigen ? dirs.origenId  : dirs.destinoId

    // Intentar recuperar GPS desde el historial de ubicaciones del cliente (tipo origen/destino)
    let lat: number | null = null, lng: number | null = null
    {
      const { data: gpsDir } = await supabase.from('cliente_ubicaciones')
        .select('lat, lng').eq('cliente_telefono', from10)
        .eq('tipo', usarOrigen ? 'origen' : 'destino')
        .not('lat', 'is', null).order('ultima_vez', { ascending: false }).limit(1).maybeSingle()
      lat = gpsDir?.lat ?? null
      lng = gpsDir?.lng ?? null
    }

    // Actualizar estado con la dirección final elegida + coords
    await supabase.from('bot_memory').upsert({
      phone: `mand_dir_save_${from10}`,
      history: [{ ...dirs, dirFinalLabel: dirLabel, dirFinalId: dirId, dirFinalLat: lat, dirFinalLng: lng }],
      updated_at: new Date().toISOString()
    })

    const capBtn = (s: string, max = 20) => s.length > max ? s.substring(0, max - 1) + '…' : s
    await sendInteractiveButtons(fromPhone,
      `🏠 *¿Es tu casa o trabajo?*\n\n_Dirección a guardar: *${dirLabel}*_`,
      [
        { id: 'MAND_TIPO_CASA',    title: capBtn('🏠 Es mi casa') },
        { id: 'MAND_TIPO_TRABAJO', title: capBtn('🏢 Es mi trabajo') }
      ]
    )
    return new Response('OK', { status: 200 })
  }

  // ── Mandadito post-confirm: guardar tipo de dirección (casa / trabajo) ──
  if (buttonId === 'MAND_TIPO_CASA' || buttonId === 'MAND_TIPO_TRABAJO') {
    const tipo = buttonId === 'MAND_TIPO_CASA' ? 'casa' : 'trabajo'
    const emoji = tipo === 'casa' ? '🏠' : '🏢'

    const { data: dirMem } = await supabase.from('bot_memory')
      .select('history').eq('phone', `mand_dir_save_${from10}`).maybeSingle()
    const dirs = dirMem?.history?.[0]

    // Siempre limpiar estado, incluso si no hay datos
    await supabase.from('bot_memory').delete().eq('phone', `mand_dir_save_${from10}`)

    if (!dirs?.dirFinalLabel) {
      await sendWA(fromPhone, `⚠️ No pude guardar la dirección (sesión expirada). Pide otro mandadito para intentarlo de nuevo.`)
      return new Response('OK', { status: 200 })
    }

    // GPS: preferir coords del paso anterior (ya buscadas), luego colonia_id, luego nombre
    let lat: number | null = dirs.dirFinalLat ?? null
    let lng: number | null = dirs.dirFinalLng ?? null

    if ((!lat || !lng) && dirs.dirFinalId) {
      const { data: col } = await supabase.from('colonias')
        .select('lat, lng').eq('id', dirs.dirFinalId).maybeSingle()
      lat = col?.lat ?? null
      lng = col?.lng ?? null
    }
    if (!lat || !lng) {
      const { data: histDir } = await supabase.from('cliente_ubicaciones')
        .select('lat, lng').eq('cliente_telefono', from10)
        .ilike('colonia_nombre', `%${dirs.dirFinalLabel.substring(0, 20)}%`)
        .not('lat', 'is', null).limit(1).maybeSingle()
      lat = histDir?.lat ?? null
      lng = histDir?.lng ?? null
    }

    await supabase.from('cliente_ubicaciones').upsert({
      cliente_telefono: from10,
      tipo,
      colonia_nombre: dirs.dirFinalLabel,
      colonia_id: dirs.dirFinalId || null,
      lat, lng,
      ultima_vez: new Date().toISOString()
    }, { onConflict: 'cliente_telefono,tipo,colonia_nombre' })

    // Verificar si ya tiene cuenta de loyalty
    const { data: cliente } = await supabase.from('clientes')
      .select('id, puntos, acepta_terminos').eq('telefono', from10).maybeSingle()

    if (cliente?.acepta_terminos) {
      await sendWA(fromPhone,
        `✅ *¡Dirección ${tipo === 'casa' ? 'de casa' : 'de trabajo'} guardada!* ${emoji}\n\n` +
        `_La próxima vez que pidas un mandadito, te la sugeriremos automáticamente._\n\n` +
        `⭐ Tienes *${cliente.puntos || 0}* puntos Estrella. ¡Sigue acumulando!`
      )
    } else {
      await sendInteractiveButtons(fromPhone,
        `✅ *¡Dirección guardada!* ${emoji}\n\n` +
        `_Ya sabemos donde ${tipo === 'casa' ? 'entregarte' : 'recogerte'} próximas veces._\n\n` +
        `🌟 *¡Únete al programa de lealtad Estrella!*\n` +
        `Acumula puntos con cada mandadito y canjéalos por envíos gratis. ¿Te apuntas?`,
        [
          { id: 'BTN_ACEPTAR_TERMINOS', title: '⭐ Sí, quiero puntos' },
          { id: 'MAND_SKIP_LOYALTY',    title: '❌ Ahora no' }
        ]
      )
    }
    return new Response('OK', { status: 200 })
  }

  // ── Skip loyalty desde post-mandadito (ID único para no colisionar con otros handlers) ──
  if (buttonId === 'MAND_SKIP_LOYALTY') {
    await sendWA(fromPhone, `👍 ¡Entendido! Si cambias de opinión, escríbenos _"quiero puntos"_ y te inscribimos.`)
    return new Response('OK', { status: 200 })
  }





  // ── Mandadito: cancelar (Bugs 3 y 4 fix: limpiar también mandadito_cotiz_) ──
  if (buttonId === 'CANCELAR_MANDADITO') {
    await Promise.all([
      supabase.from('bot_memory').delete().eq('phone', `mandadito_state_${from10}`),
      supabase.from('bot_memory').delete().eq('phone', `mandadito_cotiz_${from10}`)
    ])
    await sendInteractiveButtons(fromPhone,
      `❌ *Cotización cancelada.* ¡Sin problema!\n\n¿En qué más puedo ayudarte?`,
      [
        { id: 'MENU_PEDIR_SERVICIO', title: '🛵 Nuevo mandadito' },
        { id: 'MENU_VER_PUNTOS', title: '⭐ Ver mis puntos' }
      ]
    )
    return new Response('OK', { status: 200 })
  }

  if (buttonId === 'MENU_VER_PUNTOS') {
    const { data: cliente } = await supabase.from('clientes').select('puntos').eq('telefono', from10).maybeSingle()
    if (cliente) {
      await sendWA(fromPhone, `⭐ Tienes *${cliente.puntos || 0}* puntos Estrella.\n\nRecuerda que puedes canjearlos por recompensas geniales.`)
    }
    return new Response('OK', { status: 200 })

  }
  
  if (buttonId === 'MENU_CANCELAR') {
    await supabase.from('bot_memory').delete().eq('phone', `mandadito_state_${from10}`)
    await sendWA(fromPhone, `✅ Operación cancelada. ¡Si necesitas algo, aquí estoy!`)
    return new Response('OK', { status: 200 })
  }

  // ── Admin: Guardar Colonia Interactiva ──
  if (esAdmin && buttonId.startsWith('ADMIN_ADDCOL_')) {
    const parts = buttonId.replace('ADMIN_ADDCOL_', '').split('_')
    if (parts.length >= 2) {
      const coloniaNombre = parts[0]
      const precio = Number(parts[1])
      
      // Insertar colonia con precio
      await supabase.from('colonias').insert({ nombre: coloniaNombre, precio: precio }).catch(() => null)
      
      const { count: sinPrecio } = await supabase.from('colonias').select('*', { count: 'exact', head: true }).is('precio', null)
      
      await sendWA(fromPhone, `✅ *Colonia Guardada*\n\n📍 Colonia: *${coloniaNombre}*\n💰 Precio: *$${precio}*\n\n📌 Faltan ${sinPrecio} colonias por cotizar.`)
    }
    return new Response('OK', { status: 200 })
  }

  // ── Admin: Actualizar colonia tras múltiples coincidencias ──
  if (esAdmin && buttonId.startsWith('ADMIN_SETCOL_')) {
    const parts = buttonId.replace('ADMIN_SETCOL_', '').split('_')
    if (parts.length >= 2) {
      const colId = parts[0]
      const precio = Number(parts[1])
      
      await supabase.from('colonias').update({ precio: precio }).eq('id', colId)
      const { data: col } = await supabase.from('colonias').select('nombre').eq('id', colId).maybeSingle()
      const { count: sinPrecio } = await supabase.from('colonias').select('*', { count: 'exact', head: true }).is('precio', null)
      
      await sendWA(fromPhone, `✅ *Precio actualizado*\n\n📍 Colonia: *${col?.nombre || 'Colonia'}*\n💰 Nuevo Precio: *$${precio}*\n\n📌 Faltan ${sinPrecio} colonias por cotizar.`)
    }
    return new Response('OK', { status: 200 })
  }
  
  if (esAdmin && buttonId === 'ADMIN_IGNORAR') {
    await sendWA(fromPhone, `❌ Operación cancelada.`)
    return new Response('OK', { status: 200 })
  }

  // ── Cliente: Menú de Restaurantes (AI Waiter) ──
  if (buttonId.startsWith('CLIENT_REST_MENU_')) {
    const restId = buttonId.replace('CLIENT_REST_MENU_', '')
    const { data: rest } = await supabase.from('restaurantes').select('id, nombre, horarios').eq('id', restId).maybeSingle()
    if (!rest) {
      await sendWA(fromPhone, 'Restaurante no encontrado.')
      return new Response('OK', { status: 200 })
    }

    // ── 🏪 VERIFICAR HORARIO ────────────────────────────────────────
    if (rest.horarios) {
      const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }))
      const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
      const diaActual = dias[ahora.getDay()]
      const horarioDia = rest.horarios[diaActual]

      if (horarioDia && horarioDia.activo === false) {
        await sendWA(fromPhone, `🔒 *${rest.nombre}* está cerrado hoy.\n\n¿Quieres ver el menú de todos modos o buscamos otra opción?`)
        return new Response('OK', { status: 200 })
      }

      if (horarioDia?.abre && horarioDia?.cierra) {
        const [hAbre, mAbre] = horarioDia.abre.split(':').map(Number)
        const [hCierra, mCierra] = horarioDia.cierra.split(':').map(Number)
        const minActual = ahora.getHours() * 60 + ahora.getMinutes()
        const minAbre = hAbre * 60 + mAbre
        const minCierra = hCierra * 60 + mCierra

        if (minActual < minAbre || minActual > minCierra) {
          await sendWA(fromPhone, `⏰ *${rest.nombre}* está cerrado en este momento.\n\n📌 Horario de hoy: *${horarioDia.abre} — ${horarioDia.cierra}*\n\n¿Quieres que te avisemos cuando abra? Escríbeme luego 😊`)
          return new Response('OK', { status: 200 })
        }
      }
    }

    // ── OBTENER CATEGORÍAS ──
    const [ { data: categorias }, { data: menuCombos } ] = await Promise.all([
      supabase.from('menu_categorias').select('id, nombre, emoji').eq('restaurante_id', restId).order('orden'),
      supabase.from('menu_combos').select('id').eq('restaurante_id', restId).eq('disponible', true).limit(1)
    ])

    let catRows: any[] = []
    
    if (menuCombos && menuCombos.length > 0) {
      catRows.push({
        id: `CLIENT_REST_CAT_combos_${restId}`,
        title: `⭐ Combos y Promos`,
        description: `Ver paquetes especiales`
      })
    }

    if (categorias) {
      categorias.forEach((c: any) => {
        catRows.push({
          id: `CLIENT_REST_CAT_item_${c.id}`,
          title: `${c.emoji || '🍽️'} ${c.nombre}`,
          description: `Toca para ver platillos`
        })
      })
    }

    if (catRows.length === 0) {
      await sendWA(fromPhone, `😔 *${rest.nombre}* aún no ha subido productos a su menú en línea.`)
      return new Response('OK', { status: 200 })
    }

    // Paginación si hay más de 10
    let finalRows = catRows
    if (catRows.length > 10) {
      finalRows = catRows.slice(0, 9)
      finalRows.push({
        id: `CLIENT_REST_CATPAGE_1_${restId}`,
        title: `Ver más categorías ➡️`,
        description: `Página 2`
      })
    }

    // Iniciar sesión vacía para el IA Waiter — con menú real para contexto
    // Fetchar el menú real para que el IA Waiter sepa precios cuando el cliente agrega por botón
    const [ { data: menuItemsAll }, { data: menuCombosAll } ] = await Promise.all([
      supabase.from('menu_items').select('nombre, precio, descripcion').eq('restaurante_id', restId).eq('disponible', true),
      supabase.from('menu_combos').select('nombre, precio, descripcion, incluye').eq('restaurante_id', restId).eq('disponible', true)
    ])
    let menuTextReal = ''
    if (menuCombosAll?.length) {
      menuTextReal += 'COMBOS:\n' + menuCombosAll.map((c: any) => `- ${c.nombre}: $${c.precio}${c.incluye?.length ? ' (incluye: ' + c.incluye.join(', ') + ')' : ''}`).join('\n') + '\n\n'
    }
    if (menuItemsAll?.length) {
      menuTextReal += 'PLATILLOS:\n' + menuItemsAll.map((i: any) => `- ${i.nombre}: $${i.precio}`).join('\n')
    }
    if (!menuTextReal) menuTextReal = 'Sin productos disponibles aún.'

    await supabase.from('bot_memory').upsert({
      phone: `order_session_${from10}`,
      history: [{
        restauranteId: rest.id,
        restauranteNombre: rest.nombre,
        menuText: menuTextReal,
        cart: [],
        history: [],
        ts: Date.now()
      }],
      updated_at: new Date().toISOString()
    })

    const { sendInteractiveList } = await import('./whatsapp.ts')
    await sendInteractiveList(
      fromPhone,
      `👨‍🍳 *¡Bienvenido a ${rest.nombre}!*\n\nSelecciona la categoría que deseas ver:`,
      `Ver Menú 📋`,
      [{ title: 'Categorías', rows: finalRows }]
    )
    return new Response('OK', { status: 200 })
  }

  /* ── Cliente: Repetir Pedido [DESACTIVADO] ──
  if (buttonId.startsWith('REPETIR_PEDIDO_')) {
    const pedidoId = buttonId.replace('REPETIR_PEDIDO_', '')
    const { data: pedido } = await supabase.from('pedidos').select('restaurante_id, restaurante, descripcion, items').eq('id', pedidoId).maybeSingle()
    if (!pedido) {
      await sendWA(fromPhone, '❌ No pudimos encontrar el pedido anterior.')
      return new Response('OK', { status: 200 })
    }

    // Initialize session with the previous items so AI knows context
    const { data: menuCombosAll, data: menuItemsAll } = await Promise.all([
      supabase.from('menu_combos').select('nombre, precio, incluye').eq('restaurante_id', pedido.restaurante_id).eq('disponible', true).limit(50),
      supabase.from('menu_items').select('nombre, precio').eq('restaurante_id', pedido.restaurante_id).eq('disponible', true).limit(100)
    ]).then(res => ({ data: res[0].data, data2: res[1].data }))
    
    let menuTextReal = ''
    if (menuCombosAll?.length) menuTextReal += 'COMBOS:\n' + menuCombosAll.map((c: any) => `- ${c.nombre}: $${c.precio}`).join('\n') + '\n\n'
    if (menuItemsAll?.length) menuTextReal += 'PLATILLOS:\n' + menuItemsAll.map((i: any) => `- ${i.nombre}: $${i.precio}`).join('\n')
    if (!menuTextReal) menuTextReal = 'Sin productos disponibles aún.'

    // Set bot_memory so the AI waiter wakes up directly with a system prompt asking to repeat the order
    await supabase.from('bot_memory').upsert({
      phone: `order_session_${from10}`,
      history: [{
        restauranteId: pedido.restaurante_id,
        restauranteNombre: pedido.restaurante,
        menuText: menuTextReal,
        cart: [],
        history: [
          { role: 'user', content: `Quiero pedir exactamente lo que pedí la vez pasada: ${pedido.descripcion}` }
        ],
        ts: Date.now()
      }],
      updated_at: new Date().toISOString()
    })

    // Trigger AI waiter manually to respond
    const { handleClientMessage } = await import('./client-flow.ts')
    await handleClientMessage(supabase, fromPhone, from10, `Quiero pedir exactamente lo que pedí la vez pasada: ${pedido.descripcion}`, 'text')
    return new Response('OK', { status: 200 })
  }
  */

  /* ── Cliente: Menú Drill-Down (Paginación de Categorías) [DESACTIVADO] ──
  if (buttonId.startsWith('CLIENT_REST_CATPAGE_')) {
    const parts = buttonId.replace('CLIENT_REST_CATPAGE_', '').split('_')
    const page = parseInt(parts[0])
    const restId = parts.slice(1).join('_')
    const [ { data: categorias }, { data: menuCombos } ] = await Promise.all([
      supabase.from('menu_categorias').select('id, nombre, emoji').eq('restaurante_id', restId).order('orden'),
      supabase.from('menu_combos').select('id').eq('restaurante_id', restId).eq('disponible', true).limit(1)
    ])
    let catRows: any[] = []
    if (menuCombos && menuCombos.length > 0) catRows.push({ id: `CLIENT_REST_CAT_combos_${restId}`, title: `⭐ Combos y Promos`, description: `Ver paquetes especiales` })
    if (categorias) categorias.forEach((c: any) => { catRows.push({ id: `CLIENT_REST_CAT_item_${c.id}`, title: `${c.emoji || '🍽️'} ${c.nombre}`, description: `Toca para ver platillos` }) })
    const startIndex = page * 9
    let finalRows = catRows.slice(startIndex, startIndex + 9)
    if (catRows.length > startIndex + 9) finalRows.push({ id: `CLIENT_REST_CATPAGE_${page + 1}_${restId}`, title: `Ver más categorías ➡️`, description: `Página ${page + 2}` })
    finalRows.unshift({ id: page === 1 ? `CLIENT_REST_MENU_${restId}` : `CLIENT_REST_CATPAGE_${page - 1}_${restId}`, title: `⬅️ Regresar`, description: `Página anterior` })
    const { sendInteractiveList } = await import('./whatsapp.ts')
    await sendInteractiveList(fromPhone, `Página ${page + 1} de categorías:`, `Ver más 📋`, [{ title: 'Categorías', rows: finalRows.slice(0, 10) }])
    return new Response('OK', { status: 200 })
  }
  */

  /* ── Cliente: Menú Drill-Down (Ver Categoría) [DESACTIVADO] ──
  if (buttonId.startsWith('CLIENT_REST_CAT_')) {
    const parts = buttonId.replace('CLIENT_REST_CAT_', '').split('_')
    const tipoCat = parts[0]
    const catId = parts.slice(1).join('_')
    let prodRows: any[] = []
    let tituloMsg = ''
    if (tipoCat === 'combos') {
      const { data: combos } = await supabase.from('menu_combos').select('id, nombre, precio, descripcion').eq('restaurante_id', catId).eq('disponible', true)
      tituloMsg = `⭐ *Combos y Promociones*\nSelecciona un combo para ver sus detalles:`
      if (combos) prodRows = combos.map((c: any) => ({ id: `CLIENT_REST_PROD_combo_${c.id}`, title: c.nombre.substring(0, 24), description: `💰 $${c.precio} - ${c.descripcion ? c.descripcion.substring(0, 40) : 'Ver detalles'}` }))
    } else {
      const { data: items } = await supabase.from('menu_items').select('id, nombre, precio, descripcion').eq('categoria_id', catId).eq('disponible', true)
      tituloMsg = `🍽️ *Platillos*\nSelecciona una opción para ver sus detalles:`
      if (items) prodRows = items.map((i: any) => ({ id: `CLIENT_REST_PROD_item_${i.id}`, title: i.nombre.substring(0, 24), description: `💰 $${i.precio} - ${i.descripcion ? i.descripcion.substring(0, 40) : 'Ver detalles'}` }))
    }
    if (prodRows.length === 0) { await sendWA(fromPhone, `Esta categoría está vacía por el momento.`); return new Response('OK', { status: 200 }) }
    let finalRows = prodRows
    if (prodRows.length > 10) { finalRows = prodRows.slice(0, 9); finalRows.push({ id: `CLIENT_REST_PRODPAGE_1_${tipoCat}_${catId}`, title: `Ver más productos ➡️`, description: `Página 2` }) }
    const { sendInteractiveList } = await import('./whatsapp.ts')
    await sendInteractiveList(fromPhone, tituloMsg, `Elegir Opción`, [{ title: 'Productos', rows: finalRows }])
    return new Response('OK', { status: 200 })
  }
  */

  // ── Cliente: Menú Drill-Down - Paginación, Detalle y Carrito [DESACTIVADO] ──
  // if (buttonId.startsWith('CLIENT_REST_PRODPAGE_')) { ... }
  // if (buttonId.startsWith('CLIENT_REST_PROD_')) { ... }
  // if (buttonId === 'CLIENT_CATALOGO_VOLVER') { ... }
  // if (buttonId.startsWith('CLIENT_REST_ADD_')) { ... }

  // ── Registro: confirmación SI/NO ──
  if (buttonId.toUpperCase().startsWith('REG_CONFIRM_')) {
    const esSi = buttonId.toUpperCase().startsWith('REG_CONFIRM_SI_')
    const SUPABASE_PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
    const { data: regData } = await supabase.from('bot_memory')
      .select('history').eq('phone', `reg_state_${from10}`).maybeSingle()
    const regState = regData?.history?.[0] ?? { tel: from10, step: 3 }

    // @ts-ignore
    EdgeRuntime.waitUntil(
      fetch(`${SUPABASE_PROJECT_URL}/functions/v1/whatsapp-ai`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromPhone, from10, texto: esSi ? 'sí' : 'no',
          isRepartidor: false, repartidorInfo: null, isClient: true, clienteCtx: null, regState })
      }).catch(err => console.error('Error REG_CONFIRM:', err))
    )
    return new Response('OK', { status: 200 })
  }

  // ── Embudo inicial: elección de tipo de usuario ──
  if (buttonId === 'REG_TIPO_CLIENTE') {
    const { sendInteractiveFlow } = await import('./whatsapp.ts')
    const flowToken = JSON.stringify({ phone: fromPhone })
    await sendInteractiveFlow(fromPhone, `¡Genial! 🎉 Para darte de alta como Cliente VIP y enviarte tu tarjeta digital, por favor llena este rápido formulario:`, `📝 Llenar Formulario`, `1489224042353572`, flowToken, `REGISTRO_CLIENTE`)
    return new Response('OK', { status: 200 })
  }

  if (buttonId === 'REG_TIPO_RESTAURANTE') {
    const { sendInteractiveFlow } = await import('./whatsapp.ts')
    const flowToken = JSON.stringify({ phone: fromPhone })
    await sendInteractiveFlow(fromPhone, `¡Excelente decisión! 🏪 Para iniciar tu afiliación como Restaurante Aliado, por favor completa esta solicitud:`, `📝 Llenar Formulario`, `27165926819731779`, flowToken, `REGISTRO_RESTAURANTE`)
    return new Response('OK', { status: 200 })
  }

  // ── Admin: aceptar / rechazar registro ──
  if (esAdmin && (buttonId.startsWith('reg_accept_') || buttonId.startsWith('reg_reject_'))) {
    const telMatch  = buttonId.match(/(\d{10})$/)
    const clientTel = telMatch ? telMatch[1] : buttonId.replace(/^reg_(accept|reject)_/, '')
    if (!clientTel || clientTel.length < 10) {
      await sendWA(fromPhone, `⚠️ No pude identificar el teléfono del cliente desde el botón.`)
      return new Response('OK', { status: 200 })
    }

    const { data: pendingReg } = await supabase.from('bot_memory')
      .select('history').eq('phone', `pending_reg_${clientTel}`).maybeSingle()
    const regInfo = pendingReg?.history?.[0]

    if (buttonId.startsWith('reg_accept_')) {
      if (!regInfo) {
        await sendWA(fromPhone, `⚠️ No encontré la solicitud para ${clientTel}. Es posible que ya fue procesada.`)
        return new Response('OK', { status: 200 })
      }
      const rndBytes = crypto.getRandomValues(new Uint8Array(4))
      const rndHex   = Array.from(rndBytes).map((b: number) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
      const qrCode   = `QR-${clientTel}-${rndHex}`

      // Generar código de referido único para el nuevo cliente
      const refBytes = crypto.getRandomValues(new Uint8Array(3))
      const refHex = Array.from(refBytes).map((b: number) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
      const codigoReferido = `ESTRELLA-${refHex}`

      const { error: insertErr } = await supabase.from('clientes').upsert({
        telefono: clientTel, nombre: regInfo.nombre,
        direccion: regInfo.colonia ? `${regInfo.colonia}, ${regInfo.direccion || ''}`.trim() : (regInfo.direccion || null),
        lat_frecuente: regInfo.lat || null, lng_frecuente: regInfo.lng || null,
        cumpleanos: regInfo.cumpleanos || null,
        puntos: 0, es_vip: false, acepta_terminos: false,
        qr_code: qrCode, codigo_referido: codigoReferido, created_at: new Date().toISOString()
      }, { onConflict: 'telefono' })

      if (insertErr) {
        console.error('[REG_ACCEPT] Error al insertar cliente:', insertErr)
        await sendWA(fromPhone, `❌ Error al registrar a ${regInfo.nombre}. Intenta con /rol ${clientTel} cliente ${regInfo.nombre}`)
      } else {
        await supabase.from('bot_memory').delete().eq('phone', `pending_reg_${clientTel}`)
        const tycUrl   = `https://www.app-estrella.shop/terminos`
        const primerNombre = regInfo.nombre.split(' ')[0]
        const tycTexto = `🌟 *¡Hola, ${primerNombre}! Nos alegra mucho que te unas a Estrella Delivery.* 🛵💨\n\nAl registrarte, entrarás a nuestro programa de lealtad donde:\n✅ Acumulas saldo y puntos con cada envío.\n🎁 Tienes acceso a promociones exclusivas.\n\nConfirma que aceptas nuestros términos y condiciones 👇\n\n🔗 *Léelos aquí:* ${tycUrl}`
        await sendWA(`52${clientTel}`, tycTexto)
        await sendInteractiveButtons(`52${clientTel}`, `¿Aceptas los términos y condiciones?`, [
          { id: 'ACEPTAR_TERMINOS', title: '✅ Aceptar' },
          { id: 'RECHAZAR_TERMINOS', title: '❌ Rechazar' }
        ])
        // Enviar código de referido al cliente recién aprobado
        await sendWA(`52${clientTel}`, `🎁 *Tu código de referido personal es:*\n\n*${codigoReferido}*\n\n¡Compártelo con amigos y ambos ganan *1 punto extra* ⭐ cuando se registren!`)
        await sendWA(fromPhone, `✅ *Cliente Registrado: ${regInfo.nombre}* (${clientTel})\n\n📋 T&C enviados. Código de referido: *${codigoReferido}* ⏳`)
      }
      return new Response('OK', { status: 200 })
    } else {
      await supabase.from('bot_memory').delete().eq('phone', `pending_reg_${clientTel}`)
      await sendWA(`52${clientTel}`, `Lo sentimos 🙏 Tu solicitud no pudo ser aprobada.\nSi crees que es un error, contáctanos directamente.`)
      await sendWA(fromPhone, `❌ Solicitud de *${regInfo?.nombre || clientTel}* rechazada. El cliente fue notificado.`)
      return new Response('OK', { status: 200 })
    }
  }

  // ── Admin: Aceptar / Rechazar Restaurante (Versión Flow) ──
  if (esAdmin && (buttonId.startsWith('flow_rest_accept_') || buttonId.startsWith('flow_rest_reject_'))) {
    const restTel = buttonId.replace(/^flow_rest_(accept|reject)_/, '')
    
    // Buscar la solicitud en la base de datos
    const { data: sol, error: solErr } = await supabase.from('restaurantes_solicitudes')
      .select('*').eq('telefono', restTel).eq('estado', 'pendiente').order('creado_en', { ascending: false }).limit(1).maybeSingle()
    
    if (solErr || !sol) {
      await sendWA(fromPhone, `⚠️ No encontré una solicitud pendiente para ${restTel} o ya fue procesada.`)
      return new Response('OK', { status: 200 })
    }

    if (buttonId.startsWith('flow_rest_accept_')) {
      // Generar contraseña segura
      const rNum = Math.floor(1000 + Math.random() * 9000);
      const genPassword = `Estrella${rNum}*`;

      // EMAIL CANÓNICO: siempre derivado del teléfono, garantiza que el login del portal funcione
      const authEmail = `aliado_${restTel}@app-estrella.shop`;

      // Crear Usuario en Auth
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: authEmail,
        password: genPassword,
        email_confirm: true
      })

      let isAuthCreated = true;
      let adminId = authData?.user?.id;

      if (authErr) {
        if (authErr.message.includes('already been registered') || authErr.message.includes('already exists')) {
           isAuthCreated = false;
           const { data: existingId } = await supabase.rpc('get_user_id_by_email', { email_to_search: authEmail });
           adminId = existingId;
        } else {
           await sendWA(fromPhone, `❌ Error al crear usuario en Auth: ${authErr.message}`)
           return new Response('OK', { status: 200 })
        }
      }

      // Generar slug único (mismo algoritmo que admin-approval)
      const baseSlug = sol.nombre_restaurante.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      const finalSlug = `${baseSlug}-${restTel.slice(-4)}`

      // Insertar en la tabla restaurantes
      const { error: insertErr } = await supabase.from('restaurantes').insert({
        nombre: sol.nombre_restaurante,
        telefono: sol.telefono,
        direccion: sol.direccion || null,
        activo: true,
        programa_lealtad_activo: true,
        slug: finalSlug,
        correo: sol.correo || null,  // correo real de contacto (distinto al email de Auth)
        admin_id: adminId
      })

      if (insertErr && insertErr.code !== '23505') {
         await sendWA(fromPhone, `❌ Error al insertar el restaurante: ${insertErr.message}`)
         return new Response('OK', { status: 200 })
      } else if (insertErr && insertErr.code === '23505') {
         await supabase.from('restaurantes').update({ activo: true, programa_lealtad_activo: true, slug: finalSlug }).eq('telefono', sol.telefono)
      }

      // Actualizar estado de solicitud
      await supabase.from('restaurantes_solicitudes').update({ estado: 'aprobado' }).eq('id', sol.id)

      await sendWA(fromPhone, `✅ Restaurante *${sol.nombre_restaurante}* aprobado. Se le enviarán sus accesos por WA.`)

      let msgCredenciales = `🎉 *¡Felicidades, ${sol.encargado || sol.nombre_restaurante}! Tu restaurante ha sido APROBADO.*\n\nYa puedes gestionar todo como Aliado enviándonos la palabra *Menú* o *Hola* por este mismo chat.`;
      if (isAuthCreated) {
        // Las credenciales usan el teléfono como usuario (no el correo real)
        msgCredenciales += `\n\nPara administrar tu menú e información, ingresa a:\n🌐 *https://restaurantes-app-estrella.shop*\n\n_(Usuario: tu número de teléfono *${restTel}* / Clave: ${genPassword})_`;
      }
      await sendWA(`52${restTel}`, msgCredenciales)
      
      const pdfUrl = Deno.env.get('PDF_BIENVENIDA_URL') || "https://jdrrkpvodnqoljycixbg.supabase.co/storage/v1/object/public/restaurantes/pdf-restaurantes/pdf-restaurante.pdf" 
      await sendWADocument(`52${restTel}`, pdfUrl, "Guia_Restaurantes.pdf", "📖 Te enviamos esta pequeña guía en PDF para que sepas cómo sacarle el máximo provecho a Estrella Delivery.")

      return new Response('OK', { status: 200 })

    } else {
      // Rechazar
      await supabase.from('restaurantes_solicitudes').update({ estado: 'rechazado' }).eq('telefono', restTel).eq('estado', 'pendiente')
      await sendWA(fromPhone, `❌ Solicitud de restaurante *${sol.nombre_restaurante}* rechazada.`)
      await sendWA(`52${restTel}`, `Estimado comercio, por el momento no estamos aceptando más registros en su zona o los datos proporcionados no cumplen con las políticas. Gracias por su interés en Estrella Delivery.`)
      return new Response('OK', { status: 200 })
    }
  }

  // ── Admin: aceptar / rechazar Restaurante ──
  if (esAdmin && (buttonId.startsWith('rest_accept_') || buttonId.startsWith('rest_reject_'))) {
    const restTel = buttonId.replace(/^rest_(accept|reject)_/, '')
    
    if (!restTel || restTel.length !== 10) {
      await sendWA(fromPhone, `⚠️ No pude identificar el teléfono del restaurante.`)
      return new Response('OK', { status: 200 })
    }

    const { data: pendingRest } = await supabase.from('bot_memory')
      .select('history').eq('phone', `pending_rest_${restTel}`).maybeSingle()
    const restInfo = pendingRest?.history?.[0]

    if (buttonId.startsWith('rest_accept_')) {
      if (!restInfo) {
        await sendWA(fromPhone, `⚠️ No encontré la solicitud para ${restTel}. Es posible que ya fue procesada.`)
        return new Response('OK', { status: 200 })
      }

      // Generar slug
      const baseSlug = restInfo.nombreRest.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const finalSlug = `${baseSlug}-${restTel.slice(-4)}`;
      
      // Guardar todo: telefono, nombre, foto, ubicacion y que esté activo
      const { error } = await supabase.from('restaurantes').insert({
        telefono: restTel,
        nombre: restInfo.nombreRest,
        direccion: restInfo.ubicacion,
        foto_fachada_url: restInfo.fotoUrl,
        programa_lealtad_activo: true,
        activo: true,
        slug: finalSlug
      })

      if (error) {
        if (error.code === '23505') await sendWA(fromPhone, `⚠️ El restaurante con teléfono ${restTel} ya existe en el sistema.`)
        else await sendWA(fromPhone, `❌ Error al guardar el restaurante: ${error.message}`)
        return new Response('OK', { status: 200 })
      }

      await supabase.from('bot_memory').delete().eq('phone', `pending_rest_${restTel}`)
      
      await sendWA(fromPhone, `✅ Restaurante *${restInfo.nombreRest}* aprobado y registrado en el sistema.`)
      
      const menuUrl = `https://restaurantes-app-estrella.shop/menu/${finalSlug}`;
      const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(menuUrl)}&size=500&margin=2`;
      
      const { sendWAImage } = await import('./whatsapp.ts');
      await sendWAImage(
        `52${restTel}`, 
        qrUrl, 
        `🎉 *¡Felicidades, ${restInfo.responsable || 'aliado'}!*\n\nTu restaurante ha sido aprobado por la administración. Ya eres parte oficial de Estrella Delivery.\n\nAquí tienes tu Código QR y tu link público para que tus clientes comiencen a pedir:\n🔗 ${menuUrl}\n\nPara configurar tu menú, entra a restaurantes-app-estrella.shop con tu número de teléfono.`
      )
      
      // Enviar documento leyendo URL de variable de entorno (con fallback al actual si no existe)
      const pdfUrl = Deno.env.get('PDF_BIENVENIDA_URL') || "https://jdrrkpvodnqoljycixbg.supabase.co/storage/v1/object/public/restaurantes/pdf-restaurantes/pdf-restaurante.pdf" 
      await sendWADocument(`52${restTel}`, pdfUrl, "Guia_Restaurantes.pdf", "📖 Te enviamos esta pequeña guía en PDF para que sepas cómo sacarle el máximo provecho a tu Portal de Aliados.")

      return new Response('OK', { status: 200 })
    } else {
      await supabase.from('bot_memory').delete().eq('phone', `pending_rest_${restTel}`)
      await sendWA(`52${restTel}`, `Lo sentimos 🙏 Tu solicitud de afiliación no pudo ser aprobada.\nSi crees que es un error, contáctanos directamente.`)
      await sendWA(fromPhone, `❌ Solicitud del restaurante *${restInfo?.nombreRest || restTel}* rechazada.`)
      return new Response('OK', { status: 200 })
    }
  }

  // ── Calificación de clientes ──
  if (buttonId.startsWith('RATE_') || buttonId.startsWith('TAG_') || buttonId.startsWith('VETAR_')) {
    return await handleCalificacion(supabase, fromPhone, buttonId)
  }

  // ── Términos y Condiciones / Intercepción de Confirmación de Pedido ──
  const upId = buttonId.toUpperCase()
  if (upId === 'ACEPTAR' || upId === 'RECHAZAR' || upId === 'ACEPTAR_TERMINOS' || upId === 'RECHAZAR_TERMINOS') {
    
    // 1. Revisar si el cliente está respondiendo a una confirmación de pedido activo
    if (upId === 'ACEPTAR' || upId === 'RECHAZAR') {
      const { data: pedidoActivo } = await supabase
        .from('pedidos')
        .select('id, wb_message_id, descripcion, restaurante')
        .eq('cliente_tel', from10)
        .in('estado', ['pendiente', 'asignado', 'recibido'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pedidoActivo) {
        if (upId === 'ACEPTAR') {
          const detalle = pedidoActivo.descripcion || 'tus productos';
          const rest = pedidoActivo.restaurante || 'el restaurante';
          // BUG 3 fix: use wb_message_id (ticket corto) and correct URL params
          const ticketParam = pedidoActivo.wb_message_id || pedidoActivo.id;
          const link = `https://www.app-estrella.shop/success?pedido=${ticketParam}&success=true`;
          const text = `✅ *Pedido Confirmado*\n\nAquí tienes el detalle de tu orden en *${rest}*:\n_${detalle}_\n\nRevisa el estado de tu pedido aquí: ${link}`;
          await sendWA(fromPhone, text);
        } else {
          // RECHAZAR
          await supabase.from('pedidos').update({ estado: 'cancelado' }).eq('id', pedidoActivo.id);
          await sendWA(fromPhone, `❌ Tu pedido en *${pedidoActivo.restaurante || 'el restaurante'}* ha sido cancelado.`);
        }
        return new Response('OK', { status: 200 });
      }
    }

    // 2. Si no hay pedido activo, asumimos que es el flujo de Términos y Condiciones
    return await handleTerminos(supabase, fromPhone, buttonId)
  }

  // ── Comandos admin (alerta zombie) ──
  if (buttonId.startsWith('CMD_REASIGNAR_') || buttonId.startsWith('CMD_CANCELAR_')) {
    return await handleAdminCommands(supabase, fromPhone, buttonId)
  }

  // ── Repartidor (ciclo de vida del pedido) ──
  await handleRepButtons(supabase, fromPhone, buttonId)
  return new Response('OK', { status: 200 })
}
