import { sendWA, sendInteractiveList, sendInteractiveButton } from './whatsapp.ts'
import { extract10Digits, crearPedidoDesdeBot } from './db.ts'
import { pedidoLink, logError, generateCloudinaryVIPCard } from '../_shared/utils.ts'

export async function handleSlashCommands(
  supabase: any,
  fromPhone: string,
  from10: string,
  slashText: string,
  messageId: string
): Promise<Response | null> {

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

  // ── /fin — Cerrar sesión de captura activa ────────────────────────────────
  if (slashText === '/fin' || slashText === '/listo') {
    const { data: sesion } = await supabase.from('bot_memory')
      .select('history').eq('phone', `capture_mode_${from10}`).maybeSingle()
    if (sesion?.history?.[0]) {
      const { clienteNombre, clienteTel } = sesion.history[0]
      await supabase.from('bot_memory').delete().eq('phone', `capture_mode_${from10}`)
      await sendWA(fromPhone,
        `✅ *SESIÓN CERRADA*\n───────────────────\n\n` +
        `📋 *Cliente:* ${clienteNombre || clienteTel}\n\n` +
        `_Todo el contenido enviado ha sido guardado exitosamente._ 👍`
      )
    } else {
      await sendWA(fromPhone, `ℹ️ No hay ninguna sesión de captura activa.`)
    }
    return new Response('OK', { status: 200 })
  }

  // ── /opciones — Menú principal interactivo del administrador ────────────────
  if (slashText === '/opciones' || slashText === '/menu') {
    await sendInteractiveList(
      fromPhone,
      `⚙️ *MENÚ DE ADMINISTRADOR*\n───────────────────\nSelecciona la acción rápida que deseas realizar:`,
      `Elegir Acción`,
      [
        {
          title: 'Gestión de Clientes',
          rows: [
            { id: 'ACT_MENU_NOREGO', title: 'Registro Silencioso', description: 'Crea cliente sin notificar (Sesión)' },
            { id: 'ACT_MENU_LOYALTY', title: 'Registro Loyalty', description: 'Crea y envía invitación T&C (Sesión)' },
            { id: 'ACT_MENU_INFO', title: 'Ver Ficha / Perfil', description: 'Consultar puntos, reputación, notas' },
            { id: 'ACT_MENU_QR', title: 'Enviar Tarjeta VIP', description: 'Manda el QR de lealtad por WA' },
            { id: 'ACT_MENU_SCORE', title: 'Calificar Reputación', description: 'Asignar Excelente, Bueno, Malo' }
          ]
        }
      ]
    )
    return new Response('OK', { status: 200 })
  }

  // ── /fachada — Activar sesión de captura de fachada ──────────────────────
  // Uso: /fachada 9631234567
  // Después: manda foto → se guarda como fachada del cliente
  //          manda texto → se guarda como nota_crm
  //          manda /fin  → cierra la sesión

  // ── /noregistrado, /fachada y /loyalty — Activar sesión de captura de fachada ──────────────────────
  if (slashText.startsWith('/fachada ') || slashText.startsWith('/noregistrado ') || slashText.startsWith('/loyalty ')) {
    const isLoyalty = slashText.startsWith('/loyalty ');
    const isNoregistrado = slashText.startsWith('/noregistrado ');
    const param = slashText.replace(isLoyalty ? '/loyalty ' : (isNoregistrado ? '/noregistrado ' : '/fachada '), '').trim();
    const cTel = extract10Digits(param);
    if (!cTel || cTel.length !== 10) {
      await sendWA(fromPhone, `⚠️ Formato: */fachada 9631234567*`)
      return new Response('OK', { status: 200 })
    }
    let { data: cliente } = await supabase.from('clientes')
      .select('id, nombre, foto_fachada_url, notas_crm, acepta_terminos')
      .ilike('telefono', `%${cTel}%`).limit(1).maybeSingle()
      
    let clienteId = cliente?.id
    let clienteNombre = cliente?.nombre
    let tieneFotoMsg = cliente?.foto_fachada_url ? `✅ Ya tiene foto guardada.` : `📷 Sin foto aún.`
    let tieneNotaMsg = cliente?.notas_crm ? `📝 Nota actual: _${cliente.notas_crm.slice(0, 80)}_` : `📝 Sin notas.`

    if (!cliente) {
      const loyaltyUrl = `https://www.app-estrella.shop/loyalty/${cTel}`
      const { data: nuevo, error } = await supabase.from('clientes').insert({
        telefono: cTel,
        nombre: 'Cliente Express',
        puntos: 0,
        acepta_terminos: false,
        qr_code: loyaltyUrl
      }).select('id, nombre').single()

      if (nuevo) {
        clienteId = nuevo.id
        clienteNombre = nuevo.nombre
        tieneFotoMsg = `📷 Sin foto aún.`
        tieneNotaMsg = `📝 Sin notas.`
        await sendWA(fromPhone, `ℹ️ *REGISTRO SILENCIOSO*\nEl cliente no existía, lo he registrado automáticamente como *Cliente Express* para poder guardar sus datos.`)
      } else {
        await sendWA(fromPhone, `❌ Error al crear el cliente: ${error?.message}`)
        return new Response('OK', { status: 200 })
      }
    }

    if (isLoyalty && (!cliente || cliente?.acepta_terminos === false)) {
      const { sendWATemplate } = await import('./whatsapp.ts')
      await sendWATemplate(`52${cTel}`, 'estrella_terminos_condiciones', [clienteNombre || 'Cliente'])
      await sendWA(fromPhone, `📤 Se ha enviado la invitación del programa Loyalty a *${clienteNombre}*. Cuando acepte, recibirá su QR.`)
    }

    // Guardar sesión de captura con TTL
    const SESION_TTL_MS = 2 * 60 * 60 * 1000 // 2 horas
    await supabase.from('bot_memory').upsert({
      phone: `capture_mode_${from10}`,
      history: [{
        mode: 'fachada',
        clienteTel: cTel,
        clienteId: clienteId,
        clienteNombre: clienteNombre,
        capturedBy: from10,      // quién activó la sesión
        iniciado: Date.now(),    // timestamp para TTL
        expira: Date.now() + SESION_TTL_MS
      }],
      updated_at: new Date().toISOString()
    })

    await sendWA(fromPhone,
      `📸 *SESIÓN DE CAPTURA ACTIVA*\n───────────────────\n\n` +
      `👤 *Cliente:* ${clienteNombre} (\`${cTel}\`)\n` +
      `${tieneFotoMsg}\n${tieneNotaMsg}\n\n` +
      `*📌 OPCIONES:*\n` +
      `📷 *Envía una foto:* Se guardará como fachada.\n` +
      `💬 *Envía texto:* Se guardará como nota CRM.\n` +
      `📍 *Dirección:* Pide a la IA: _"Actualiza la dirección de ${cTel} a..."_\n` +
      `⭐ *Reputación:* Escribe: _/score ${cTel} excelente_ (O regular, malo)\n` +
      `❌ *Escribe /fin:* Para cerrar la sesión.`
    )
    return new Response('OK', { status: 200 })
  }

  // ── /nota — Guardar nota directa sin sesión ───────────────────────────────
  // Uso: /nota 9631234567 Casa azul con portón negro, perro grande
  if (slashText.startsWith('/nota ')) {
    const rest = slashText.slice(6).trim()
    const match = rest.match(/^(\d[\d\s\-]{8,}\d)\s+(.+)$/s)
    const cTel = match ? extract10Digits(match[1]) : null
    const nota = match ? match[2].trim() : null
    if (!cTel || cTel.length !== 10 || !nota) {
      await sendWA(fromPhone, `⚠️ Formato: */nota 9631234567 texto de la nota*`)
      return new Response('OK', { status: 200 })
    }
    const { data: c } = await supabase.from('clientes')
      .select('id, nombre, notas_crm').ilike('telefono', `%${cTel}%`).limit(1).maybeSingle()
    if (!c) {
      await sendWA(fromPhone, `❌ Cliente ${cTel} no encontrado.`)
      return new Response('OK', { status: 200 })
    }
    const notaFinal = c.notas_crm
      ? `${c.notas_crm}\n[${new Date().toLocaleDateString('es-MX')}] ${nota}`
      : `[${new Date().toLocaleDateString('es-MX')}] ${nota}`
    await supabase.from('clientes').update({ notas_crm: notaFinal }).eq('id', c.id)
    await sendWA(fromPhone,
      `✅ *NOTA GUARDADA*\n───────────────────\n\n` +
      `👤 *Cliente:* ${c.nombre} (\`${cTel}\`)\n\n` +
      `📝 *Contenido:*\n_${nota}_`
    )
    return new Response('OK', { status: 200 })
  }

  // ── /score — Calificar cliente directamente sin IA ──────────────────────────────
  // Uso: /score 9631234567 excelente o simplemente /score 9631234567 para menú
  if (slashText.startsWith('/score ')) {
    const rest = slashText.slice(7).trim()
    const match = rest.match(/^(\d[\d\s\-]{8,}\d)(?:\s+(.+))?$/)
    const cTel = match ? extract10Digits(match[1]) : null
    const califStr = match && match[2] ? match[2].trim().toLowerCase() : null
    
    if (!cTel || cTel.length !== 10) {
      await sendWA(fromPhone, `⚠️ Formato: */score 9631234567 [excelente, bueno...]* o solo */score 9631234567* para ver opciones.`)
      return new Response('OK', { status: 200 })
    }

    if (!califStr) {
      await sendInteractiveList(
        fromPhone,
        `⭐ *Calificar Cliente* — \`${cTel}\`\nPor favor selecciona la reputación que le asignarás:`,
        `Elegir Reputación`,
        [{
          title: 'Reputaciones',
          rows: [
            { id: `RATE_EXC_${cTel}`, title: '⭐ Excelente' },
            { id: `RATE_BUE_${cTel}`, title: '👍 Bueno' },
            { id: `RATE_REG_${cTel}`, title: '⚠️ Regular' },
            { id: `RATE_MAL_${cTel}`, title: '❌ Malo' },
            { id: `VETAR_${cTel}`, title: '🚫 Vetado' }
          ]
        }]
      )
      return new Response('OK', { status: 200 })
    }

    const { data: cli } = await supabase.from('clientes')
      .select('id, nombre, reputacion').ilike('telefono', `%${cTel}%`).limit(1).maybeSingle()
    if (!cli) {
      await sendWA(fromPhone, `❌ Cliente ${cTel} no encontrado.`)
      return new Response('OK', { status: 200 })
    }

    // Mapear el texto a una de las opciones válidas
    let rep: 'excelente' | 'bueno' | 'regular' | 'malo' | 'vetado' = 'bueno'
    if (califStr.includes('excelente') || califStr.includes('bien') || califStr.includes('genial') || califStr.includes('top')) rep = 'excelente'
    else if (califStr.includes('bueno') || califStr.includes('buena')) rep = 'bueno'
    else if (califStr.includes('regular') || califStr.includes('media') || califStr.includes('medio')) rep = 'regular'
    else if (califStr.includes('malo') || califStr.includes('mala') || califStr.includes('mal')) rep = 'malo'
    else if (califStr.includes('vetado') || califStr.includes('bloquear')) rep = 'vetado'

    const REP_ICON = { excelente: '🌟', bueno: '👍', regular: '⚠️', malo: '❌', vetado: '🚫' }

    await supabase.from('clientes').update({ reputacion: rep }).eq('id', cli.id)
    await sendWA(fromPhone, `✅ *REPUTACIÓN ACTUALIZADA*\n───────────────────\n\n${REP_ICON[rep]} *${cli.nombre || cTel}* → *${rep.toUpperCase()}*`)
    
    return new Response('OK', { status: 200 })
    return new Response('OK', { status: 200 })
  }

  // ── /info — Ver perfil de cliente directamente sin IA ──────────────────────
  // Uso: /info 9631234567
  if (slashText.startsWith('/info ')) {
    const cTel = extract10Digits(slashText.slice(6).trim())
    if (!cTel || cTel.length !== 10) {
      await sendWA(fromPhone, `⚠️ Formato: */info 9631234567*`)
      return new Response('OK', { status: 200 })
    }

    const { data: c } = await supabase.from('clientes').select('*').ilike('telefono', `%${cTel}%`).limit(1).maybeSingle()
    if (c) {
      const repIcon = c.reputacion === 'excelente' ? '🌟' : c.reputacion === 'bueno' ? '👍' : c.reputacion === 'malo' ? '❌' : c.reputacion === 'regular' ? '⚠️' : '➖'
      let msg = `🔍 *FICHA DE CLIENTE*\n───────────────────\n`
      msg += `👤 *${c.nombre || 'Sin nombre'}*\n`
      msg += `📱 ${c.telefono}\n`
      msg += `⭐ Puntos: *${c.puntos}* | Rango: *${c.rango || 'bronce'}*\n`
      
      const enviosGratisPorPuntos = Math.floor((c.puntos || 0) / 5)
      const enviosGratisExtra = c.envios_gratis_disponibles || 0
      const totalGratis = enviosGratisPorPuntos + enviosGratisExtra
      
      if (totalGratis > 0) {
        msg += `🎁 *¡TIENE ${totalGratis} ENVÍO(S) GRATIS DISPONIBLE(S)!* 🎁\n`
      } else {
        msg += `🛵 Entregas: ${c.envios_totales || 0} | Envíos gratis extra: 0\n`
      }
      
      msg += `${c.es_vip ? '👑 *VIP*\n' : ''}`
      msg += `${repIcon} Reputación: *${c.reputacion || 'sin calificar'}*\n`
      msg += `💰 Billetera: *$${c.saldo_billetera || 0}*\n`
      if (c.direccion) msg += `🏠 Dirección: ${c.direccion}\n`
      if (c.cupon_activo) msg += `🎟️ Cupón: ${c.cupon_activo}\n`
      if (c.notas_crm) msg += `📝 ${c.notas_crm.slice(0, 200)}\n`
      msg += `📋 T&C: ${c.acepta_terminos ? '✅ Aceptados' : '❌ Pendientes'}`

      await sendWA(fromPhone, msg)

      // Enviar foto si existe
      if (c.foto_fachada_url) {
        const { enviarFotoCliente } = await import('./media-handler.ts')
        await enviarFotoCliente(fromPhone, c.foto_fachada_url, c.nombre || cTel)
      }

      // Guardar contexto último cliente
      const admin10 = extract10Digits(fromPhone)
      await supabase.from('bot_memory').upsert({
        phone: `admin_last_client_${admin10}`,
        history: [{ clienteTel: cTel, nombre: c.nombre }],
        updated_at: new Date().toISOString()
      })
    } else {
      await sendWA(fromPhone, `🔍 Cliente ${cTel} no encontrado.`)
    }
    return new Response('OK', { status: 200 })
  }

  // ── /qr — Enviar tarjeta QR al cliente directamente sin IA ──────────────────────
  // Uso: /qr 9631234567
  if (slashText.startsWith('/qr ')) {
    const cTel = extract10Digits(slashText.slice(4).trim())
    if (!cTel || cTel.length !== 10) {
      await sendWA(fromPhone, `⚠️ Formato: */qr 9631234567*`)
      return new Response('OK', { status: 200 })
    }

    const { data: cli } = await supabase.from('clientes')
      .select('nombre, puntos, acepta_terminos').ilike('telefono', `%${cTel}%`).limit(1).maybeSingle()
    
    if (!cli) {
      await sendWA(fromPhone, `🔍 Cliente ${cTel} no encontrado. Regístralo primero con /fachada.`)
      return new Response('OK', { status: 200 })
    }

    if (cli.acepta_terminos === false) {
      const { sendWATemplate } = await import('./whatsapp.ts')
      await sendWATemplate(`52${cTel}`, 'estrella_terminos_condiciones', [cli.nombre || 'Cliente'])
      await sendWA(fromPhone, `⏳ El cliente *${cTel}* aún no acepta los términos.\nLe he enviado la solicitud. El QR se enviará automáticamente cuando acepte.`)

      await supabase.from('bot_memory').upsert({
        phone: `pending_qr_${cTel}`,
        history: [{ admin: fromPhone }],
        updated_at: new Date().toISOString()
      })
      return new Response('OK', { status: 200 })
    }

    const nombreCli = cli.nombre ? cli.nombre.split(' ')[0] : 'Cliente'
    const qrImageUrl = generateCloudinaryVIPCard(cTel, nombreCli, cli.puntos || 0, 0, false)
    const { sendVIPCardSmart } = await import('./whatsapp.ts')
    
    const result = await sendVIPCardSmart(`52${cTel}`, qrImageUrl, cli.nombre || 'Cliente', cli.puntos || 0, cTel)

    if (result && result.ok === false) {
      await sendWA(fromPhone, `❌ Hubo un error al enviar la plantilla: ${result.error}`)
    } else {
      await sendWA(fromPhone, `✅ ¡Tarjeta QR enviada exitosamente a ${cli.nombre || cTel}!`)
    }
    
    return new Response('OK', { status: 200 })
  }

  // ── /modo ─────────────────────────────────────────────────────────────────
  // Fuerza el rol activo de un número sin tocar la BD (para testing)
  // Uso (el admin lo escribe): /modo 9631234567 cliente
  //                            /modo 9631234567 restaurante
  //                            /modo 9631234567 auto  ← quita el override
  if (slashText.startsWith('/modo ')) {
    const args = slashText.slice(6).trim().split(/\s+/)
    const cTel = extract10Digits(args[0])
    const nuevoModo = (args[1] || '').toLowerCase()

    if (!cTel || cTel.length !== 10 || !['cliente', 'restaurante', 'repartidor', 'auto'].includes(nuevoModo)) {
      await sendWA(fromPhone,
        `⚠️ Uso: */modo 9631234567 [modo]*\n\n` +
        `Modos disponibles:\n` +
        `👤 *cliente* — fuerza modo cliente\n` +
        `🏪 *restaurante* — fuerza modo restaurante\n` +
        `🛵 *repartidor* — fuerza modo repartidor\n` +
        `🔄 *auto* — quitar override, vuelve al rol normal`
      )
      return new Response('OK', { status: 200 })
    }

    const memKey = `modo_activo_${cTel}`
    if (nuevoModo === 'auto') {
      await supabase.from('bot_memory').delete().eq('phone', memKey)
      await sendWA(fromPhone,
        `🔄 *MODO AUTOMÁTICO RESTABLECIDO*\n───────────────────\n\n` +
        `👤 *Número:* \`${cTel}\`\n\n` +
        `_El bot ahora usará el rol original registrado en la base de datos._`
      )
    } else {
      await supabase.from('bot_memory').upsert({
        phone: memKey,
        history: [{ modo: nuevoModo, forzado_por: from10, at: new Date().toISOString() }],
        updated_at: new Date().toISOString()
      })
      await sendWA(fromPhone,
        `✅ *MODO FORZADO APLICADO*\n───────────────────\n\n` +
        `👤 *Número:* \`${cTel}\`\n` +
        `🔧 *Rol Forzado:* ${nuevoModo.toUpperCase()}\n\n` +
        `_El bot atenderá este número como ${nuevoModo} temporalmente._\n\n` +
        `Para revertir: */modo ${cTel} auto*`
      )
    }
    return new Response('OK', { status: 200 })
  }

  if (slashText.startsWith('/usar ')) {
    const codigo = slashText.replace('/usar ', '').trim().toUpperCase()
    const { data, error } = await supabase.rpc('usar_cupon', { p_codigo: codigo })
    if (error) await sendWA(fromPhone, `❌ Error interno: ${error.message}`)
    else if (!data?.ok) await sendWA(fromPhone, `❌ Error: ${data?.error || 'Cupón no encontrado'}`)
    else await sendWA(fromPhone,
      `✅ *CUPÓN APLICADO*\n───────────────────\n\n` +
      `🎟️ *Código:* \`${codigo}\`\n` +
      `👤 *Cliente:* ${data.cliente_nombre} (\`${data.cliente_tel}\`)\n\n` +
      `_El cupón se ha marcado como USADO exitosamente._`
    )
    return new Response('OK', { status: 200 })
  }

  if (slashText.startsWith('/cancelar ')) {
    const codigo = slashText.replace('/cancelar ', '').trim().toUpperCase()
    const { data: adminUser } = await supabase.from('admins').select('id').eq('telefono', from10).maybeSingle()
    const { data, error } = await supabase.rpc('cancelar_cupon', {
      p_codigo: codigo,
      p_admin_id: adminUser?.id || null
    })
    if (error) await sendWA(fromPhone, `❌ Error interno: ${error.message}`)
    else if (!data?.ok) await sendWA(fromPhone, `❌ Error: ${data?.error || 'Cupón no encontrado'}`)
    else await sendWA(fromPhone,
      `✅ *CUPÓN CANCELADO*\n───────────────────\n\n` +
      `🎟️ *Código:* \`${codigo}\`\n` +
      `👤 *Cliente:* ${data.cliente_nombre}\n` +
      `💵 *Reembolso:* $${data.monto_reembolsado} a billetera\n\n` +
      `_El cupón fue invalidado y el saldo regresó al cliente._`
    )
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
  if (slashText.startsWith('/pedido ')) {
    // Formato: /pedido 9631234567 2 tacos pastor de Makitan
    const args = slashText.slice(8).trim()
    const telMatch = args.match(/^(\d{10})\s+(.+)$/s)
    if (!telMatch) {
      await sendWA(fromPhone, `⚠️ Formato: */pedido 9631234567 descripción del pedido*`)
      return new Response('OK', { status: 200 })
    }
    const [, cTel, desc] = telMatch
    const pData = { clienteTel: cTel, clienteNombre: null, restaurante: null, descripcion: desc, direccion: null, repartidorAlias: null }
    const r = await crearPedidoDesdeBot(supabase, pData, undefined, undefined, messageId)
    if (r.ok && r.pedidoId) {
      await sendWA(fromPhone,
        `✅ *PEDIDO CREADO (MANUAL)*\n───────────────────\n\n` +
        `📞 *Cliente:* \`${cTel}\`\n` +
        `📦 *Descripción:*\n_${desc}_\n\n` +
        `🔗 *Enlace:* ${pedidoLink(r.pedidoId)}`
      )
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
    const { data, error } = await supabase.rpc('fn_registrar_entrega_bulk', { p_cliente_tel: cTel, p_cantidad: cant })
    if (data?.ok) {
      await sendWA(fromPhone, `✅ *PUNTOS AÑADIDOS*\n───────────────────\n\n👤 *Cliente:* \`${cTel}\`\n➕ *Agregados:* ${cant} punto(s)\n⭐ *Total Actual:* ${data.puntos} pts\n\n_Los puntos ya están reflejados en su cuenta._`)
      if (data.recien_ascendido) {
        try {
          await sendWA(`52${cTel}`, `👑 *¡Felicidades!* 👑\n\nHas sido promovido a *Cliente VIP* ⭐ de Estrella Delivery.\n\nA partir de ahora acumularás *saldo real* en tu billetera. 💰`)
          
          // Enviar la nueva tarjeta digital con el diseño VIP
          const { data: c } = await supabase.from('clientes').select('nombre, puntos, saldo_billetera').eq('telefono', cTel).single()
          if (c) {
            const qrCode = generateCloudinaryVIPCard(cTel, c.nombre || 'Cliente VIP', c.puntos, c.saldo_billetera || 0, true)
            const { sendWAImage } = await import('./whatsapp.ts')
            await sendWAImage(`52${cTel}`, qrCode, `🌟 *¡Aquí tienes tu nueva Tarjeta Digital VIP!* 🌟\n\nMuestra este código QR a nuestros repartidores al recibir tus pedidos para seguir acumulando saldo en tu billetera.`)
          }
        } catch (e) {
          console.error('[PUNTOS MANUALES] Error enviando bienvenida VIP al cliente:', e)
        }
      }
    } else {
      await sendWA(fromPhone, `❌ Error: ${error?.message || data?.error || 'Cliente no encontrado'}`)
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
      const cuponTxt = c.cupon_activo ? `\n🎟️ *Cupón Activo:* \`${c.cupon_activo}\`` : ''
      const notasTxt = c.notas_crm ? `\n\n📝 *Notas CRM:*\n_${c.notas_crm.slice(0, 200)}_` : ''
      const vipTxt = c.es_vip ? `👑 *NIVEL VIP* 👑\n` : ''

      await sendWA(fromPhone,
        `🔍 *INFORMACIÓN DEL CLIENTE*\n───────────────────\n\n` +
        `👤 *Nombre:* ${c.nombre || 'Sin registrar'}\n` +
        `📞 *Teléfono:* \`${c.telefono}\`\n\n` +
        vipTxt +
        `⭐ *Puntos:* ${c.puntos}\n` +
        `📊 *Rango:* ${String(c.rango || 'bronce').toUpperCase()}\n` +
        `💰 *Billetera:* $${c.saldo_billetera || 0}\n` +
        `🎁 *Envíos Gratis:* ${c.envios_gratis_disponibles}\n` +
        `🛵 *Total Entregas:* ${c.envios_totales}` +
        cuponTxt + notasTxt
      )
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
    if (monto > 10000) {
      await sendWA(fromPhone, `⚠️ El máximo permitido por carga es *$10,000*. Contacta al desarrollador si necesitas más.`)
      return new Response('OK', { status: 200 })
    }
    const { data: c } = await supabase.from('clientes').select('id, nombre, saldo_billetera').ilike('telefono', `%${cTel}%`).limit(1).maybeSingle()
    if (c) {
      const nuevoSaldo = (c.saldo_billetera || 0) + monto
      await supabase.from('clientes').update({ saldo_billetera: nuevoSaldo }).eq('id', c.id)
      // Auditoría: registrar el movimiento en historial
      await supabase.from('registros_puntos').insert({
        cliente_id: c.id,
        tipo: 'acumulacion',
        puntos: 0,
        monto_saldo: monto,
        descripcion: `Carga manual de saldo por admin (${from10})`,
        created_by: null
      })
      await sendWA(fromPhone,
        `✅ *SALDO RECARGADO*\n───────────────────\n\n` +
        `👤 *Cliente:* ${c.nombre || cTel}\n` +
        `➕ *Monto Recargado:* $${monto}\n\n` +
        `💰 *Saldo Anterior:* $${c.saldo_billetera || 0}\n` +
        `💳 *Nuevo Saldo:* *$${nuevoSaldo}*`
      )
      // Notificar al cliente
      try {
        await sendWA(`52${cTel}`, `💰 ¡Hola ${c.nombre || 'Cliente'}! Se han cargado *$${monto}* a tu Billetera VIP.\n💳 Saldo actual: *$${nuevoSaldo}*\n\n¡Gracias por ser parte de Estrella Delivery! ⭐️`)
      } catch (_) { /* no bloquear si falla la notificación */ }
    } else {
      await sendWA(fromPhone, `❌ Cliente no encontrado.`)
    }
    return new Response('OK', { status: 200 })
  }

  // ── /rol ─────────────────────────────────────────────────────────────────
  // Formato: /rol 9631234567 restaurante [Nombre Opcional]
  //          /rol 9631234567 cliente
  //          /rol 9631234567 repartidor [Nombre] [Alias]
  if (slashText.startsWith('/rol ')) {
    const args = slashText.slice(5).trim().split(/\s+/)
    const cTel = extract10Digits(args[0])
    const nuevoRol = (args[1] || '').toLowerCase()
    const extra = slashText.slice(5).trim().split(/\s+/).slice(2).join(' ').trim() // nombre extra

    if (!cTel || cTel.length !== 10 || !['cliente', 'restaurante', 'repartidor'].includes(nuevoRol)) {
      await sendWA(fromPhone,
        `⚠️ Formato: */rol 9631234567 [rol] [nombre opcional]*\n\n` +
        `Roles disponibles:\n` +
        `👤 *cliente* — usuario normal del programa\n` +
        `🏪 *restaurante* — acceso al portal B2B\n` +
        `🛵 *repartidor* — recibe y gestiona pedidos\n\n` +
        `Ejemplo: /rol 9631112233 restaurante Tacos El Gordo`
      )
      return new Response('OK', { status: 200 })
    }

    // Leer estado actual del número en las 3 tablas en paralelo
    const [{ data: cli }, { data: rest }, { data: rep }] = await Promise.all([
      supabase.from('clientes').select('id, nombre').ilike('telefono', `%${cTel}%`).maybeSingle(),
      supabase.from('restaurantes').select('id, nombre').ilike('telefono', `%${cTel}%`).maybeSingle(),
      supabase.from('repartidores').select('id, nombre').ilike('telefono', `%${cTel}%`).maybeSingle(),
    ])

    const rolesActuales = [
      cli ? 'cliente' : null,
      rest ? 'restaurante' : null,
      rep ? 'repartidor' : null,
    ].filter(Boolean).join(', ') || 'ninguno'

    const nombreDetectado = cli?.nombre || rest?.nombre || rep?.nombre || extra || `Usuario ${cTel}`

    if (nuevoRol === 'restaurante') {
      if (rest) {
        await sendWA(fromPhone,
          `ℹ️ *ROL EXISTENTE*\n───────────────────\n\n` +
          `👤 *Número:* \`${cTel}\`\n` +
          `_Ya es un restaurante (${rest.nombre})._`
        )
      } else {
        const nombreRest = extra || nombreDetectado
        const { error } = await supabase.from('restaurantes').insert({
          telefono: cTel,
          nombre: nombreRest,
          activo: true,
          es_socio: false,
          programa_lealtad_activo: false
        })
        if (error) {
          await sendWA(fromPhone, `❌ Error al crear restaurante: ${error.message}`)
        } else {
          await sendWA(fromPhone,
            `✅ *ROL ASIGNADO*\n───────────────────\n\n` +
            `👤 *Número:* \`${cTel}\`\n` +
            `🏪 *Rol:* Restaurante\n` +
            `📝 *Nombre:* ${nombreRest}\n\n` +
            `🔒 *Lealtad:* Pendiente de activar\n` +
            `_Para activar el programa usa:_ */activar-lealtad ${cTel}*`
          )
          // Notificar al número que cambió de rol
          await sendWA(`52${cTel}`, `🏪 *Estrella Delivery* te ha registrado como restaurante asociado.\n\nEscríbenos para activar tu portal de lealtad y empezar a fidelizar a tus clientes. 🌟`)
        }
      }
    } else if (nuevoRol === 'cliente') {
      if (cli) {
        await sendWA(fromPhone,
          `ℹ️ *ROL EXISTENTE*\n───────────────────\n\n` +
          `👤 *Número:* \`${cTel}\`\n` +
          `_Ya es un cliente (${cli.nombre})._`
        )
      } else {
        const nombreCli = extra || nombreDetectado
        const loyaltyUrl = `https://www.app-estrella.shop/loyalty/${cTel}`
        const qrCode = generateCloudinaryVIPCard(cTel, nombreCli, 0, 0, false)
        const { error } = await supabase.from('clientes').insert({
          telefono: cTel,
          nombre: nombreCli,
          acepta_terminos: false,
          puntos: 0,
          qr_code: qrCode
        })
        if (error) {
          await sendWA(fromPhone, `❌ Error al crear cliente: ${error.message}`)
        } else {
          await sendWA(fromPhone,
            `✅ *ROL ASIGNADO*\n───────────────────\n\n` +
            `👤 *Número:* \`${cTel}\`\n` +
            `👤 *Rol:* Cliente\n` +
            `📝 *Nombre:* ${nombreCli}`
          )
        }
      }
    } else if (nuevoRol === 'repartidor') {
      if (rep) {
        await sendWA(fromPhone,
          `ℹ️ *ROL EXISTENTE*\n───────────────────\n\n` +
          `👤 *Número:* \`${cTel}\`\n` +
          `_Ya es un repartidor (${rep.nombre})._`
        )
      } else {
        const nombreRep = extra || nombreDetectado
        const aliasRep = nombreRep.split(' ')[0].toLowerCase()
        const { error } = await supabase.from('repartidores').insert({
          telefono: cTel,
          nombre: nombreRep,
          alias: aliasRep,
          activo: true
        })
        if (error) {
          await sendWA(fromPhone, `❌ Error al crear repartidor: ${error.message}`)
        } else {
          await sendWA(fromPhone,
            `✅ *ROL ASIGNADO*\n───────────────────\n\n` +
            `👤 *Número:* \`${cTel}\`\n` +
            `🛵 *Rol:* Repartidor\n` +
            `📝 *Nombre:* ${nombreRep}\n` +
            `🏷️ *Alias:* ${aliasRep}`
          )
          await sendWA(`52${cTel}`, `🛵 *Estrella Delivery* te ha registrado como repartidor.\n\nEscríbenos para activar tu cuenta y comenzar a recibir pedidos.`)
        }
      }
    }
    return new Response('OK', { status: 200 })
  }

  // ── /quitar-rol ───────────────────────────────────────────────────────────
  // Formato: /quitar-rol 9631234567 restaurante
  if (slashText.startsWith('/quitar-rol ')) {
    const args = slashText.slice(12).trim().split(/\s+/)
    const cTel = extract10Digits(args[0])
    const rolAQuitar = (args[1] || '').toLowerCase()

    if (!cTel || cTel.length !== 10 || !['cliente', 'restaurante', 'repartidor'].includes(rolAQuitar)) {
      await sendWA(fromPhone, `⚠️ Formato: */quitar-rol 9631234567 [rol]*\nRoles: cliente, restaurante, repartidor`)
      return new Response('OK', { status: 200 })
    }

    let tabla = rolAQuitar === 'cliente' ? 'clientes' : rolAQuitar === 'restaurante' ? 'restaurantes' : 'repartidores'
    const { data: existe } = await supabase.from(tabla).select('id, nombre').ilike('telefono', `%${cTel}%`).maybeSingle()

    if (!existe) {
      await sendWA(fromPhone,
        `⚠️ *ERROR*\n───────────────────\n\n` +
        `El número *\`${cTel}\`* no tiene el rol de *${rolAQuitar}*.`
      )
    } else {
      if (rolAQuitar === 'restaurante') {
        await supabase.from('restaurantes').update({ activo: false, programa_lealtad_activo: false }).eq('id', existe.id)
      } else if (rolAQuitar === 'repartidor') {
        await supabase.from('repartidores').update({ activo: false }).eq('id', existe.id)
      } else {
        // Para clientes solo desactivamos términos y puntos (nunca se borra historial)
        await sendWA(fromPhone,
          `⚠️ *ACCIÓN DENEGADA*\n───────────────────\n\n` +
          `Los clientes no se pueden eliminar para preservar el historial.\n` +
          `_Si quieres bloquearlo, usa:_ */vetar ${cTel}*`
        )
        return new Response('OK', { status: 200 })
      }
      await sendWA(fromPhone,
        `✅ *ROL DESACTIVADO*\n───────────────────\n\n` +
        `👤 *Número:* \`${cTel}\` (${existe.nombre})\n` +
        `❌ *Rol quitado:* ${rolAQuitar.toUpperCase()}\n\n` +
        `_El registro histórico se ha conservado._`
      )
    }
    return new Response('OK', { status: 200 })
  }

  // /ayuda y /help ya se manejan al inicio del archivo (líneas 14 y 24)
  // No duplicar aquí.

  return null
}

// ── Procesador de botones/listas interactivas para Administrador ───────────────
export async function handleAdminInteractive(
  supabase: any,
  fromPhone: string,
  from10: string,
  buttonId: string
): Promise<Response | null> {
  const actionsMap: Record<string, { cmd: string; desc: string }> = {
    'ACT_MENU_NOREGO': { cmd: 'Registro Silencioso', desc: 'iniciar la sesión de captura silenciosa' },
    'ACT_MENU_LOYALTY': { cmd: 'Registro Loyalty', desc: 'enviar invitación y abrir captura' },
    'ACT_MENU_INFO': { cmd: 'Ficha de Cliente', desc: 'ver su perfil' },
    'ACT_MENU_QR': { cmd: 'Enviar Tarjeta VIP', desc: 'enviarle su QR' },
    'ACT_MENU_SCORE': { cmd: 'Calificar Cliente', desc: 'asignarle una reputación (escribe el número)' }
  }

  const actionInfo = actionsMap[buttonId]
  if (actionInfo) {
    // Guardar estado en memoria
    await supabase.from('bot_memory').upsert({
      phone: `admin_action_state_${from10}`,
      history: [{ action: buttonId }],
      updated_at: new Date().toISOString()
    })

    await sendWA(
      fromPhone,
      `📝 *${actionInfo.cmd}*\n───────────────────\n\nPor favor, escribe el *número a 10 dígitos* del cliente para ${actionInfo.desc}:`
    )
    return new Response('OK', { status: 200 })
  }

  // Cerrar Sesión (viniendo del botón)
  if (buttonId === 'ACT_CERRAR_SESION') {
    const { handleSlashCommands } = await import('./slash-commands-handler.ts')
    return await handleSlashCommands(supabase, fromPhone, from10, '/fin', 'btn_' + Date.now())
  }

  return null
}
