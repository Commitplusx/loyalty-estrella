import { sendWA, sendInteractiveList, sendInteractiveButton } from './whatsapp.ts'
import { extract10Digits, crearPedidoDesdeBot } from './db.ts'
import { pedidoLink, logError, generateCloudinaryVIPCard } from '../_shared/utils.ts'
import { syncBotImageByPhone } from './chatwoot-sync.ts'

export async function handleSlashCommands(
  supabase: any,
  fromPhone: string,
  from10: string,
  slashText: string,
  messageId: string,
  esAdmin: boolean = true
): Promise<Response | null> {

  if (slashText === '/repartidor') {
    if (!esAdmin) return null
    await supabase.from('bot_memory').upsert({
      phone: `admin_mode_${from10}`,
      history: [{ mode: 'repartidor', activado: Date.now() }],
      updated_at: new Date().toISOString()
    })
    await sendWA(fromPhone, `🛵 *Modo Repartidor activado.*\nAhora recibirás pedidos como mensajero y puedes aceptarlos con el botón.\n\nEscribe */admin* para regresar a modo administrador.`)
    return new Response('OK', { status: 200 })
  }

  if (slashText === '/admin') {
    if (!esAdmin) return null
    await supabase.from('bot_memory').delete().eq('phone', `admin_mode_${from10}`)
    await sendWA(fromPhone, `👔 *Modo Admin activado.*\nYa tienes acceso completo al panel de administración.`)
    return new Response('OK', { status: 200 })
  }

  // ── /reset — Reinicia la sesión actual del usuario (sin afectar Loyalty) ──
  if (slashText === '/reset' || slashText === '/reiniciar') {
    // Borra todas las claves de estado que contengan su número (mandadito_state, capture_mode, etc)
    await supabase.from('bot_memory').delete().like('phone', `%${from10}%`)
    await sendWA(fromPhone, `🧹 *Sesión reiniciada.*\nHe borrado mi memoria a corto plazo sobre lo que estábamos haciendo. ¡Empecemos de cero!\n_(Tus datos, perfil y puntos de Loyalty están intactos)_.`)
    return new Response('OK', { status: 200 })
  }

  // ── /reset_cache — Borra la caché de Maps (solo admins) ───────────────────
  if (slashText === '/reset_cache' || slashText === '/limpiar_cache') {
    if (!esAdmin) return null
    await supabase.from('bot_memory').delete().like('phone', `mandadito_txt_%`)
    await sendWA(fromPhone, `🧠 *Caché de inteligencia artificial y Maps borrada masivamente.*\nTodo texto nuevo se procesará desde cero.`)
    return new Response('OK', { status: 200 })
  }

  // ── /fin — Cerrar sesión de captura activa ────────────────────────────────
  if (slashText === '/fin' || slashText === '/listo' || slashText === '/salir') {
    // Cerrar captura (fachada)
    const { data: capSesion } = await supabase.from('bot_memory').select('history').eq('phone', `capture_mode_${from10}`).maybeSingle()
    if (capSesion?.history?.[0]) {
      const { clienteNombre, clienteTel } = capSesion.history[0]
      await supabase.from('bot_memory').delete().eq('phone', `capture_mode_${from10}`)
      await sendWA(fromPhone, `✅ *SESIÓN CERRADA*\n───────────────────\n\n📋 *Cliente:* ${clienteNombre || clienteTel}\n\n_Todo el contenido enviado ha sido guardado exitosamente._ 👍`)
      return new Response('OK', { status: 200 })
    }
    
    // Cerrar mapeo
    const { data: mapSesion } = await supabase.from('bot_memory').select('history').eq('phone', `mapear_mode_${from10}`).maybeSingle()
    if (mapSesion?.history?.[0]) {
      await supabase.from('bot_memory').delete().eq('phone', `mapear_mode_${from10}`)
      await sendWA(fromPhone, `✅ *Modo Mapeo Finalizado.*`)
      return new Response('OK', { status: 200 })
    }
    
    await sendWA(fromPhone, `ℹ️ No hay ninguna sesión activa.`)
    return new Response('OK', { status: 200 })
  }

  // ── /mapear — Iniciar sesión de mapeo de precios ────────────────────────
  if (slashText === '/mapear') {
    if (!esAdmin) return null
    const { data: col } = await supabase.from('colonias').select('id, nombre').is('precio', null).limit(1).maybeSingle()
    const { count: faltan } = await supabase.from('colonias').select('*', { count: 'exact', head: true }).is('precio', null)
    
    if (!col) {
      await sendWA(fromPhone, `🎉 ¡Excelente! No hay colonias pendientes por mapear. Todas tienen precio.`)
      return new Response('OK', { status: 200 })
    }

    await supabase.from('bot_memory').upsert({
      phone: `mapear_mode_${from10}`,
      history: [{ coloniaId: col.id, coloniaNombre: col.nombre }],
      updated_at: new Date().toISOString()
    })

    await sendWA(fromPhone, `📍 *MODO MAPEO INICIADO*\n_Faltan ${faltan} colonias._\n\nPara salir escribe */salir*.\n\n¿Cuánto cuesta el envío para:\n🏙️ *${col.nombre}*?`)
    return new Response('OK', { status: 200 })
  }

  // ── /mis_pedidos — Ver pedidos activos de un repartidor ────────────────────
  if (slashText === '/mis_pedidos') {
    const { data: repData } = await supabase.from('repartidores')
      .select('id, user_id, nombre').eq('telefono', from10).limit(1).maybeSingle()
    if (repData) {
      // Buscar por user_id O por id (fallback para repartidores sin Auth)
      const repIdFilter = repData.user_id
        ? `repartidor_id.eq.${repData.user_id},repartidor_id.eq.${repData.id}`
        : `repartidor_id.eq.${repData.id}`
      const { data: activos } = await supabase.from('pedidos')
        .select('id, descripcion, estado, cliente_nombre, cliente_tel, direccion')
        .or(repIdFilter)
        .in('estado', ['asignado', 'recibido', 'en_camino'])
        .order('created_at', { ascending: true })
        .limit(10)
      if (!activos?.length) {
        await sendWA(fromPhone, `✅ *${repData.nombre}*, no tienes pedidos activos ahora. ¡Quedas libre!`)
      } else {
        const icons: Record<string, string> = { asignado: '🕘', recibido: '🛍️', en_camino: '🚀' }
        let msg = `📋 *TUS PEDIDOS ACTIVOS (${activos.length})*\n\n`
        ;(activos as any[]).forEach((p: any, i: number) => {
          msg += `${i + 1}️⃣ ${icons[p.estado] || '📦'} *${p.estado.toUpperCase()}*\n`
          msg += `   📦 ${(p.descripcion || 'Sin descripción').slice(0, 40)}\n`
          if (p.cliente_nombre) msg += `   👤 ${p.cliente_nombre}\n`
          if (p.cliente_tel) msg += `   📞 ${p.cliente_tel}\n`
          if (p.direccion) msg += `   📍 ${p.direccion.slice(0, 50)}\n`
          msg += '\n'
        })
        await sendWA(fromPhone, msg.trimEnd())
      }
    } else {
      await sendWA(fromPhone, '❌ No encontré tus datos de repartidor. Contacta al admin.')
    }
    return new Response('OK', { status: 200 })
  }

  // ── /libre — Notificar disponibilidad ──────────────────────────────────────
  if (slashText === '/libre') {
    const { data: rep } = await supabase.from('repartidores')
      .select('nombre').eq('telefono', from10).limit(1).maybeSingle()
    const repNombre = rep?.nombre || 'Repartidor'

    const ADMIN_PHONES_ENV = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''
    const _adminMain10 = ADMIN_PHONES_ENV.split(',').map((s: string) => extract10Digits(s)).filter(Boolean)[0] ?? ''
    const ADMIN_PHONE_MAIN = _adminMain10 ? `52${_adminMain10}` : ''

    if (ADMIN_PHONE_MAIN) {
      await sendWA(ADMIN_PHONE_MAIN, `🟢 *${repNombre}* está libre y disponible para el próximo pedido.`)
    }
    await sendWA(fromPhone, `✅ Le avisé al admin que quedas libre. ¡Espera el próximo pedido!`)
    return new Response('OK', { status: 200 })
  }

  // ── /set_field — Comando interno para edición desde botones ──────────────────────
  if (slashText.startsWith('/set_field ')) {
    // /set_field EDIT_NOM 9631234567 Juan Perez
    // /set_field EDIT_NOT 9631234567 borrar
    const parts = slashText.split(' ')
    const fieldAction = parts[1]
    const tel10 = parts[2]
    const val = parts.slice(3).join(' ').trim()
    
    let updateData: any = {}
    let successMsg = ''
    if (fieldAction === 'EDIT_NOM') { updateData = { nombre: val }; successMsg = `Nombre actualizado a *${val}*` }
    else if (fieldAction === 'EDIT_DIR') { updateData = { direccion: val }; successMsg = `Dirección actualizada` }
    else if (fieldAction === 'EDIT_NOT') { 
      const isBorrar = val.toLowerCase() === 'borrar' || val.toLowerCase() === 'eliminar'
      updateData = { notas_crm: isBorrar ? null : val }
      successMsg = isBorrar ? `Notas CRM borradas` : `Notas CRM actualizadas` 
    }
    
    await supabase.from('clientes').update(updateData).eq('telefono', tel10)
    await sendWA(fromPhone, `✅ ${successMsg}.\n_Tip: Envía /info ${tel10} para ver los cambios._`)
    return new Response('OK', { status: 200 })
  }

  // ── /opciones — Menú principal interactivo del administrador/repartidor ────────────────
  if (slashText === '/opciones' || slashText === '/menu') {
    const listTitle = esAdmin ? '⚙️ *MENÚ DE ADMINISTRADOR*' : '⚙️ *MENÚ DE OPCIONES*'
    await sendInteractiveList(
      fromPhone,
      `${listTitle}\n───────────────────\nBienvenido a tu panel de control.\nSelecciona la acción rápida que deseas realizar:`,
      `Elegir Acción`,
      [
        {
          title: 'Loyalty VIP',
          rows: [
            { id: 'ACT_MENU_LOYALTY', title: '📱 Registro Loyalty', description: 'Crea y envía invitación T&C (Sesión)' },
            { id: 'ACT_MENU_QR', title: '🎟️ Enviar Tarjeta VIP', description: 'Manda el QR de lealtad por WA' },
            { id: 'ACT_MENU_SUMAR', title: '⭐ Sumar Puntos', description: 'Añadir puntos manualmente' }
          ]
        },
        {
          title: 'Gestión CRM',
          rows: [
            { id: 'ACT_MENU_INFO', title: '📊 Ver Ficha del Cliente', description: 'Puntos, reputación, notas' },
            { id: 'ACT_MENU_SCORE', title: '🏆 Calificar Cliente', description: 'Asignar Excelente, Bueno, Malo' },
            { id: 'ACT_MENU_NOREGO', title: '👻 Registro Silencioso', description: 'Crea cliente sin notificar' }
          ]
        },
        ...(esAdmin ? [{
          title: 'Operaciones Especiales',
          rows: [
            { id: 'ACT_MENU_REGALAR', title: '🎁 Regalar Envío', description: 'Patrocinar un envío gratis' },
            { id: 'ACT_MENU_REST', title: '🏪 Ver Clientes Restaurante', description: 'Consulta clientes B2B' }
          ]
        }] : [])
      ]
    )
    return new Response('OK', { status: 200 })
  }

  // ── /fachada — Activar sesión de captura de fachada ──────────────────────
  // Uso: /fachada 9631234567
  // Después: manda foto → se guarda como fachada del cliente
  //          manda texto → se guarda como nota_crm
  //          manda /fin  → cierra la sesión

  // ── /rest_accept — Aprobar solicitud B2B por texto (fallback de botones) ─────────
  if (slashText.startsWith('/rest_accept_') && esAdmin) {
    const restTel = slashText.replace('/rest_accept_', '').trim()
    
    if (!restTel || restTel.length !== 10) {
      await sendWA(fromPhone, `⚠️ Formato incorrecto. El teléfono debe ser de 10 dígitos.`)
      return new Response('OK', { status: 200 })
    }

    const { data: pendingRest } = await supabase.from('bot_memory')
      .select('history').eq('phone', `pending_rest_${restTel}`).maybeSingle()
    const restInfo = pendingRest?.history?.[0]

    if (!restInfo) {
      await sendWA(fromPhone, `⚠️ No encontré la solicitud para ${restTel}. Es posible que ya fue procesada.`)
      return new Response('OK', { status: 200 })
    }

    // Insertar con todos los datos
    const { error } = await supabase.from('restaurantes').insert({
      telefono: restTel,
      nombre: restInfo.nombreRest,
      direccion: restInfo.ubicacion,
      foto_fachada_url: restInfo.fotoUrl,
      programa_lealtad_activo: true,
      activo: true
    })

    if (error) {
      if (error.code === '23505') await sendWA(fromPhone, `⚠️ El restaurante con teléfono ${restTel} ya existe.`)
      else await sendWA(fromPhone, `❌ Error al guardar el restaurante: ${error.message}`)
      return new Response('OK', { status: 200 })
    }

    await supabase.from('bot_memory').delete().eq('phone', `pending_rest_${restTel}`)
    
    await sendWA(fromPhone, `✅ Restaurante *${restInfo.nombreRest}* aprobado y registrado (vía comando de texto).`)
    await sendWA(`52${restTel}`, `🎉 *¡Felicidades, ${restInfo.responsable || 'aliado'}!*\n\nTu restaurante ha sido aprobado por la administración. Ya eres parte oficial de Estrella Delivery.\n\nEnvía la palabra *Hola* o *Menú* para abrir tu Portal de Aliados B2B.`)
    
    const pdfUrl = Deno.env.get('PDF_BIENVENIDA_URL') || "https://jdrrkpvodnqoljycixbg.supabase.co/storage/v1/object/public/restaurantes/pdf-restaurantes/pdf-restaurante.pdf"
    await sendWADocument(`52${restTel}`, pdfUrl, "Guia_Restaurantes.pdf", "📖 Te enviamos esta pequeña guía en PDF para que sepas cómo sacarle el máximo provecho a tu Portal de Aliados.")

    return new Response('OK', { status: 200 })
  }

  // ── /rest_reject — Rechazar solicitud B2B por texto (fallback de botones) ─────────
  if (slashText.startsWith('/rest_reject_') && esAdmin) {
    const restTel = slashText.replace('/rest_reject_', '').trim()
    
    if (!restTel || restTel.length !== 10) {
      await sendWA(fromPhone, `⚠️ Formato incorrecto. El teléfono debe ser de 10 dígitos.`)
      return new Response('OK', { status: 200 })
    }

    const { data: pendingRest } = await supabase.from('bot_memory')
      .select('history').eq('phone', `pending_rest_${restTel}`).maybeSingle()
    const restInfo = pendingRest?.history?.[0]

    await supabase.from('bot_memory').delete().eq('phone', `pending_rest_${restTel}`)
    await sendWA(`52${restTel}`, `Lo sentimos 🙏 Tu solicitud de afiliación no pudo ser aprobada.\nSi crees que es un error, contáctanos directamente.`)
    await sendWA(fromPhone, `❌ Solicitud del restaurante *${restInfo?.nombreRest || restTel}* rechazada (vía comando de texto).`)
    return new Response('OK', { status: 200 })
  }

  // ── /pausa — Silencia el bot para un cliente (admin habla directo desde Chatwoot) ────
  // Uso: /pausa 9631234567
  if (slashText.startsWith('/pausa ') && esAdmin) {
    const cTel = extract10Digits(slashText.replace('/pausa ', '').trim())
    if (!cTel || cTel.length !== 10) {
      await sendWA(fromPhone, `⚠️ Uso: */pausa 9631234567*`)
      return new Response('OK', { status: 200 })
    }
    await supabase.from('bot_memory').upsert({
      phone: `bot_pausa_${cTel}`,
      history: [{ pausado_por: fromPhone, desde: new Date().toISOString() }],
      updated_at: new Date().toISOString()
    })
    await sendWA(fromPhone,
      `🔕 *Bot PAUSADO* para \`${cTel}\`.\n\nEl bot ya no responderá a este cliente.\nEscríbele directo desde Chatwoot con total libertad.\n\n_Usa */bot ${cTel}* para reactivarlo cuando termines._`
    )
    return new Response('OK', { status: 200 })
  }

  // ── /bot — Reactiva el bot para un cliente ────────────────────────────────
  // Uso: /bot 9631234567
  if (slashText.startsWith('/bot ') && esAdmin) {
    const cTel = extract10Digits(slashText.replace('/bot ', '').trim())
    if (!cTel || cTel.length !== 10) {
      await sendWA(fromPhone, `⚠️ Uso: */bot 9631234567*`)
      return new Response('OK', { status: 200 })
    }
    await supabase.from('bot_memory').delete().eq('phone', `bot_pausa_${cTel}`)
    await sendWA(fromPhone,
      `🟢 *Bot REACTIVADO* para \`${cTel}\`.\n\nEl bot volverá a responder automáticamente a este cliente.`
    )
    return new Response('OK', { status: 200 })
  }

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
      .eq('telefono', cTel).limit(1).maybeSingle()

    let clienteId = cliente?.id
    let clienteNombre = cliente?.nombre
    let tieneFotoMsg = cliente?.foto_fachada_url ? `✅ Ya tiene foto guardada.` : `📷 Sin foto aún.`
    let tieneNotaMsg = cliente?.notas_crm ? `📝 Nota actual: _${cliente.notas_crm.slice(0, 80)}_` : `📝 Sin notas.`

    if (!cliente) {
      const loyaltyUrl = `https://www.app-estrella.shop/loyalty/${cTel}`

      if (isLoyalty) {
        // ── Loyalty: registrar con nombre genérico pero NO mostrar "REGISTRO SILENCIOSO"
        // El cliente recibirá los T&C y su nombre real se guardará cuando acepte.
        const { data: nuevo, error } = await supabase.from('clientes').insert({
          telefono: cTel,
          nombre: 'Nuevo Cliente',
          puntos: 0,
          acepta_terminos: false,
          qr_code: loyaltyUrl
        }).select('id, nombre').maybeSingle()

        if (nuevo) {
          clienteId = nuevo.id
          clienteNombre = nuevo.nombre
          tieneFotoMsg = `📷 Sin foto aún.`
          tieneNotaMsg = `📝 Sin notas.`
          // SIN mensaje de "Registro Silencioso" — el aviso Loyalty viene más abajo
        } else {
          await sendWA(fromPhone, `❌ Error al crear el cliente: ${error?.message}`)
          return new Response('OK', { status: 200 })
        }
      } else {
        // ── Silencioso (/noregistrado o /fachada): crear como "Cliente Express" sin notificar al cliente
        const { data: nuevo, error } = await supabase.from('clientes').insert({
          telefono: cTel,
          nombre: 'Cliente Express',
          puntos: 0,
          acepta_terminos: false,
          qr_code: loyaltyUrl
        }).select('id, nombre').maybeSingle()

        if (nuevo) {
          clienteId = nuevo.id
          clienteNombre = nuevo.nombre
          tieneFotoMsg = `📷 Sin foto aún.`
          tieneNotaMsg = `📝 Sin notas.`
          await sendWA(fromPhone, `ℹ️ *REGISTRO SILENCIOSO*\nEl cliente no existía, lo he registrado automáticamente como *Cliente Express* para poder guardar sus datos. No se le envió ningún mensaje.`)
        } else {
          await sendWA(fromPhone, `❌ Error al crear el cliente: ${error?.message}`)
          return new Response('OK', { status: 200 })
        }
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
      .select('id, nombre, notas_crm').eq('telefono', cTel).limit(1).maybeSingle()
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





  // ── /rest_clientes — Ver clientes afiliados a un restaurante ──────────────────────
  // Uso: /rest_clientes 9631234567
  if (slashText.startsWith('/rest_clientes ')) {
    if (!esAdmin) return null
    const cTel = extract10Digits(slashText.slice(15).trim())
    if (!cTel || cTel.length !== 10) {
      await sendWA(fromPhone, `⚠️ Formato: */rest_clientes 9631234567* (teléfono del restaurante)`)
      return new Response('OK', { status: 200 })
    }

    const { data: rest, error: restErr } = await supabase.from('restaurantes')
      .select('id, nombre, activo')
      .eq('telefono', cTel)
      .limit(1)
      .maybeSingle()

    if (restErr) {
      console.error(`[rest_clientes] DB Error al buscar ${cTel}:`, restErr)
      await sendWA(fromPhone, `❌ Error en DB buscando el restaurante: ${restErr.message}`)
      return new Response('OK', { status: 200 })
    }

    if (!rest) {
      console.log(`[rest_clientes] Restaurante no encontrado para ${cTel}`)
      await sendWA(fromPhone, `❌ No encontré ningún restaurante registrado con el número *${cTel}*.`)
      return new Response('OK', { status: 200 })
    }

    console.log(`[rest_clientes] Restaurante encontrado: ${rest.nombre} (${rest.id})`)

    const { data: clientes } = await supabase
      .from('restaurante_clientes_puntos')
      .select('cliente_tel, puntos, visitas')
      .eq('restaurante_id', rest.id)
      .order('puntos', { ascending: false })
      .limit(10)

    if (!clientes?.length) {
      await sendWA(fromPhone,
        `🏪 *${rest.nombre}*\n` +
        `${rest.activo ? '✅ Restaurante Activo' : '⚠️ Restaurante Inactivo'}\n\n` +
        `👥 Aún no tiene clientes afiliados.`
      )
      return new Response('OK', { status: 200 })
    }

    // Enriquecer con nombres
    const tels = clientes.map((c: any) => c.cliente_tel)
    const { data: clientesInfo } = await supabase.from('clientes')
      .select('telefono, nombre').in('telefono', tels)
    const nameMap: Record<string, string> = {}
    clientesInfo?.forEach((c: any) => { nameMap[c.telefono] = c.nombre })

    let msg = `🏪 *${rest.nombre}*\n`
    msg += `${rest.activo ? '✅ Restaurante Activo' : '⚠️ Restaurante Inactivo'}\n`
    msg += `───────────────────\n\n`
    msg += `👥 *Top ${clientes.length} Clientes afiliados:*\n\n`
    clientes.forEach((c: any, i: number) => {
      const nombre = nameMap[c.cliente_tel] || c.cliente_tel
      msg += `${i + 1}️⃣ *${nombre}*\n`
      msg += `   ⭐ ${c.puntos} pts • 👁️ ${c.visitas} visitas • \`${c.cliente_tel}\`\n\n`
    })
    await sendWA(fromPhone, msg)

    // Lista interactiva para ver ficha individual
    const rows = clientes.slice(0, 10).map((c: any) => ({
      id: `ADMIN_REST_CLI_${c.cliente_tel}`,
      title: (nameMap[c.cliente_tel] || c.cliente_tel).slice(0, 24),
      description: `⭐ ${c.puntos} pts • 👁️ ${c.visitas} visitas`
    }))
    await sendInteractiveList(
      fromPhone,
      `¿Deseas ver la ficha de alguno?`,
      'Ver Cliente',
      [{ title: 'Clientes del Restaurante', rows }]
    )

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
          const { data: c } = await supabase.from('clientes').select('nombre, puntos, saldo_billetera').eq('telefono', cTel).maybeSingle()
          if (c) {
            const qrCode = generateCloudinaryVIPCard(cTel, c.nombre || 'Cliente VIP', c.puntos, c.saldo_billetera || 0, true)
            const { sendWAImage } = await import('./whatsapp.ts')
            const captionVip = `🌟 *¡Aquí tienes tu nueva Tarjeta Digital VIP!* 🌟\n\nMuestra este código QR a nuestros repartidores al recibir tus pedidos para seguir acumulando saldo en tu billetera.`
            await sendWAImage(`52${cTel}`, qrCode, captionVip)
            // Espejo en Chatwoot
            syncBotImageByPhone(`52${cTel}`, qrCode, '👑 Cliente ascendido a VIP — Tarjeta enviada').catch(console.error)
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
      .eq('telefono', cTel).limit(1).maybeSingle()
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



  // ── /rol ─────────────────────────────────────────────────────────────────
  // Formato: /rol 9631234567 restaurante [Nombre Opcional]
  //          /rol 9631234567 cliente
  //          /rol 9631234567 repartidor [Nombre] [Alias]
  if (slashText.startsWith('/rol ')) {
    if (!esAdmin) {
      await sendWA(fromPhone, `🚫 Solo los administradores pueden asignar roles.`);
      return new Response('OK', { status: 200 })
    }
    const args = slashText.slice(5).trim().split(/\s+/)
    const cTel = extract10Digits(args[0])
    const nuevoRol = (args[1] || '').toLowerCase()
    const extra = slashText.slice(5).trim().split(/\s+/).slice(2).join(' ').trim() // nombre extra

    if (!cTel || cTel.length !== 10 || !['cliente', /*'restaurante',*/ 'repartidor'].includes(nuevoRol)) {
      await sendWA(fromPhone,
        `⚠️ Formato: */rol 9631234567 [rol] [nombre opcional]*\n\n` +
        `Roles disponibles:\n` +
        `👤 *cliente* — usuario normal del programa\n` +
        /*`🏪 *restaurante* — acceso al portal B2B\n` +*/
        `🛵 *repartidor* — recibe y gestiona pedidos\n\n` +
        `Ejemplo: /rol 9631112233 cliente Maria`
      )
      return new Response('OK', { status: 200 })
    }

    // Leer estado actual del número en las 3 tablas en paralelo
    const [{ data: cli }, { data: rest }, { data: rep }] = await Promise.all([
      supabase.from('clientes').select('id, nombre').eq('telefono', cTel).maybeSingle(),
      supabase.from('restaurantes').select('id, nombre').eq('telefono', cTel).maybeSingle(),
      supabase.from('repartidores').select('id, nombre').eq('telefono', cTel).maybeSingle(),
    ])

    const nombreDetectado = cli?.nombre || rest?.nombre || rep?.nombre || extra || `Usuario ${cTel}`

    if (nuevoRol === 'cliente') {
      if (cli) {
        await sendWA(fromPhone,
          `ℹ️ *ROL EXISTENTE*\n───────────────────\n\n` +
          `👤 *Número:* \`${cTel}\`\n` +
          `_Ya es un cliente (${cli.nombre})._`
        )
      } else {
        const nombreCli = extra || nombreDetectado
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
    if (!esAdmin) {
      await sendWA(fromPhone, `🚫 Solo los administradores pueden quitar roles.`);
      return new Response('OK', { status: 200 })
    }
    const args = slashText.slice(12).trim().split(/\s+/)
    const cTel = extract10Digits(args[0])
    const rolAQuitar = (args[1] || '').toLowerCase()

    if (!cTel || cTel.length !== 10 || !['cliente', /*'restaurante',*/ 'repartidor'].includes(rolAQuitar)) {
      await sendWA(fromPhone, `⚠️ Formato: */quitar-rol 9631234567 [rol]*\nRoles: cliente, /*restaurante,*/ repartidor`)
      return new Response('OK', { status: 200 })
    }

    let tabla = rolAQuitar === 'cliente' ? 'clientes' : /*rolAQuitar === 'restaurante' ? 'restaurantes' :*/ 'repartidores'
    const { data: existe } = await supabase.from(tabla).select('id, nombre').eq('telefono', cTel).maybeSingle()

    if (!existe) {
      await sendWA(fromPhone,
        `⚠️ *ERROR*\n───────────────────\n\n` +
        `El número *\`${cTel}\`* no tiene el rol de *${rolAQuitar}*.`
      )
    } else {
      if (rolAQuitar === 'repartidor') {
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

  // ── Menú Jerárquico de Gestión (Interceptor Numérico) ──
  if (buttonId.startsWith('ACT_CLI_')) {
    const actionParts = buttonId.split('_')
    const actionType = actionParts[2]
    const telReal = buttonId.match(/(\d{10})$/)?.[1] || ''
    
    switch (actionType) {
      case 'INFO': return await handleSlashCommands(supabase, fromPhone, from10, `/info ${telReal}`, 'btn_' + Date.now(), true)
      case 'QR': return await handleSlashCommands(supabase, fromPhone, from10, `/qr ${telReal}`, 'btn_' + Date.now(), true)
      case 'SESS': return await handleSlashCommands(supabase, fromPhone, from10, `/fachada ${telReal}`, 'btn_' + Date.now(), true)
      
      case 'SUBPTS':
        await sendInteractiveList(
          fromPhone, `*Recargas y Puntos* para ${telReal}`, 'Seleccionar',
          [{ title: 'Abonos', rows: [
            { id: `ACT_CLI_ADDPT_${telReal}`, title: '➕ Sumar 1 Punto' },
            { id: `ACT_CLI_ADDSALDO_${telReal}`, title: '💰 Cargar Saldo VIP' },
            { id: `ACT_CLI_GIVENV_${telReal}`, title: '🎁 Regalar Envío Gratis' }
          ]}]
        )
        return new Response('OK', { status: 200 })
      
      case 'SUBPAY':
        await sendInteractiveList(
          fromPhone, `*Cobros y Canjes* para ${telReal}`, 'Seleccionar',
          [{ title: 'Descuentos', rows: [
            { id: `ACT_CLI_SUBSALDO_${telReal}`, title: '📉 Descontar Saldo VIP' },
            { id: `ACT_CLI_RMVENV_${telReal}`, title: '🎟️ Quitar Envío Gratis' }
          ]}]
        )
        return new Response('OK', { status: 200 })

      case 'SUBREP':
        await sendInteractiveList(
          fromPhone, `*Reputación* para ${telReal}`, 'Seleccionar',
          [{ title: 'Asignar', rows: [
            { id: `ACT_CLI_SETREP_EXC_${telReal}`, title: '⭐ Excelente' },
            { id: `ACT_CLI_SETREP_REG_${telReal}`, title: '⚠️ Regular' },
            { id: `ACT_CLI_SETREP_VET_${telReal}`, title: '🚫 Vetar' }
          ]}]
        )
        return new Response('OK', { status: 200 })

      case 'SUBROL':
        await sendInteractiveList(
          fromPhone, `*Roles y Accesos* para ${telReal}`, 'Seleccionar',
          [{ title: 'Modificar Rol', rows: [
            { id: `ACT_CLI_TOGVIP_${telReal}`, title: '👑 Hacer VIP / Quitar' },
            { id: `ACT_CLI_SETREPART_${telReal}`, title: '🛵 Hacer Repartidor' },
            { id: `ACT_CLI_RMVROL_${telReal}`, title: '❌ Limpiar Roles' }
          ]}]
        )
        return new Response('OK', { status: 200 })
      
      // -- ACCIONES DIRECTAS DESDE SUBMENUS --
      case 'ADDPT':
        return await handleSlashCommands(supabase, fromPhone, from10, `/puntos ${telReal} 1`, 'btn_' + Date.now(), true)
      case 'GIVENV': {
        const { data: c } = await supabase.from('clientes').select('nombre').eq('telefono', telReal).maybeSingle()
        if (c) {
          const { error } = await supabase.rpc('increment_cliente_envios_gratis', { p_tel: telReal, p_amount: 1 })
          if (!error) {
            await sendWA(fromPhone, `✅ *Envío gratis regalado* a ${c.nombre} (${telReal}).`)
            await sendWA(`52${telReal}`, `🎉 *¡Sorpresa!*\n\nEl equipo de Estrella Delivery te acaba de obsequiar un *Envío Gratis*. 🎁`)
          } else await sendWA(fromPhone, `❌ Error: ${error.message}`)
        } else await sendWA(fromPhone, `❌ Cliente no encontrado.`)
        return new Response('OK', { status: 200 })
      }
      case 'RMVENV': {
        const { error } = await supabase.rpc('increment_cliente_envios_gratis', { p_tel: telReal, p_amount: -1 })
        if (!error) await sendWA(fromPhone, `✅ Se ha descontado 1 envío gratis a ${telReal}.`)
        else await sendWA(fromPhone, `❌ Error: ${error.message}`)
        return new Response('OK', { status: 200 })
      }
      case 'ADDSALDO':
        await supabase.from('bot_memory').upsert({ phone: `admin_action_state_${from10}`, history: [{ action: `ESPERANDO_SALDO_SUMA_${telReal}` }], updated_at: new Date().toISOString() })
        await sendWA(fromPhone, `💰 *Recargar Saldo*\nEscribe la cantidad en MXN a recargar a ${telReal} (ej. \`50\`):`)
        return new Response('OK', { status: 200 })
      case 'SUBSALDO':
        await supabase.from('bot_memory').upsert({ phone: `admin_action_state_${from10}`, history: [{ action: `ESPERANDO_SALDO_RESTA_${telReal}` }], updated_at: new Date().toISOString() })
        await sendWA(fromPhone, `📉 *Descontar Saldo*\nEscribe la cantidad en MXN a descontar a ${telReal} (ej. \`50\`):`)
        return new Response('OK', { status: 200 })
        
      case 'SETREP': {
        const rptType = buttonId.split('_')[3]
        if (rptType === 'EXC') return await handleSlashCommands(supabase, fromPhone, from10, `/score ${telReal} excelente`, 'btn_' + Date.now(), true)
        if (rptType === 'REG') return await handleSlashCommands(supabase, fromPhone, from10, `/score ${telReal} regular`, 'btn_' + Date.now(), true)
        if (rptType === 'VET') return await handleSlashCommands(supabase, fromPhone, from10, `/vetar ${telReal}`, 'btn_' + Date.now(), true)
        return new Response('OK', { status: 200 })
      }
      case 'TOGVIP': return await handleSlashCommands(supabase, fromPhone, from10, `/score ${telReal} vip`, 'btn_' + Date.now(), true)
      case 'SETREPART': return await handleSlashCommands(supabase, fromPhone, from10, `/rol ${telReal} repartidor`, 'btn_' + Date.now(), true)
      case 'RMVROL': return await handleSlashCommands(supabase, fromPhone, from10, `/rol ${telReal} quitar`, 'btn_' + Date.now(), true)
    }
  }

  const actionsMap: Record<string, { cmd: string; desc: string }> = {
    'ACT_MENU_NOREGO': { cmd: 'Registro Silencioso', desc: 'iniciar la sesión de captura silenciosa' },
    'ACT_MENU_LOYALTY': { cmd: 'Registro Loyalty', desc: 'enviar invitación y abrir captura' },
    'ACT_MENU_INFO': { cmd: 'Ficha de Cliente', desc: 'ver su perfil completo' },
    'ACT_MENU_QR': { cmd: 'Enviar Tarjeta VIP', desc: 'enviarle su QR' },
    'ACT_MENU_SCORE': { cmd: 'Calificar Cliente', desc: 'asignarle una reputación' },
    'ACT_MENU_SUMAR': { cmd: 'Sumar Puntos', desc: 'sumarle 1 punto (o más con /puntos 963... 3)' },
    'ACT_MENU_REGALAR': { cmd: 'Regalar Envío', desc: 'obsequiarle un envío gratis' },
    'ACT_MENU_REST': { cmd: 'Ver Clientes de Restaurante', desc: 'escribir el teléfono del restaurante a consultar' },
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

  // Editar campos específicos de cliente
  if (buttonId.startsWith('EDIT_')) {
    const action = buttonId.slice(0, 8) // e.g., EDIT_NOM, EDIT_SCO
    const tel10 = buttonId.slice(9)
    
    // Si la acción es SCORE, mostrar directamente la lista de calificaciones
    if (action === 'EDIT_SCO') {
      await sendInteractiveList(
        fromPhone,
        `⭐ *Calificar Cliente* — \`${tel10}\`\nPor favor selecciona la reputación que le asignarás:`,
        `Elegir Reputación`,
        [{
          title: 'Reputaciones',
          rows: [
            { id: `RATE_EXC_${tel10}`, title: '⭐ Excelente' },
            { id: `RATE_BUE_${tel10}`, title: '👍 Bueno' },
            { id: `RATE_REG_${tel10}`, title: '⚠️ Regular' },
            { id: `RATE_MAL_${tel10}`, title: '❌ Malo' },
            { id: `VETAR_${tel10}`, title: '🚫 Vetado' }
          ]
        }]
      )
      return new Response('OK', { status: 200 })
    }

    let desc = ''
    if (action === 'EDIT_NOM') desc = 'el nuevo NOMBRE del cliente'
    else if (action === 'EDIT_DIR') desc = 'la nueva DIRECCIÓN (colonia, calle, ref)'
    else if (action === 'EDIT_NOT') desc = 'las nuevas NOTAS CRM (o escribe "borrar" para eliminarlas)'
    
    if (desc) {
      await supabase.from('bot_memory').upsert({
        phone: `admin_action_state_${from10}`,
        history: [{ action, tel: tel10 }],
        updated_at: new Date().toISOString()
      })
      await sendWA(fromPhone, `✏️ Escribe ${desc}:`)
      return new Response('OK', { status: 200 })
    }
  }

  // Drill-down: el admin seleccionó un cliente de la lista del restaurante
  if (buttonId.startsWith('ADMIN_REST_CLI_')) {
    const tel10 = buttonId.replace('ADMIN_REST_CLI_', '').trim()
    // Redirige al mismo flujo que /info
    return await handleSlashCommands(supabase, fromPhone, from10, `/info ${tel10}`, 'btn_' + Date.now(), true)
  }

  // Cerrar Sesión (viniendo del botón)
  if (buttonId === 'ACT_CERRAR_SESION') {
    return await handleSlashCommands(supabase, fromPhone, from10, '/fin', 'btn_' + Date.now(), true)
  }

  return null
}
