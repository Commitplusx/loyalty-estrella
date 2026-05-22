import { sendWA } from './whatsapp.ts'
import { extract10Digits, crearPedidoDesdeBot } from './db.ts'
import { pedidoLink } from '../_shared/utils.ts'
import { logError } from '../_shared/utils.ts'

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
      await sendWA(fromPhone, `✅ Sesión de captura cerrada.\n📋 Cliente: *${clienteNombre || clienteTel}*\n\nTodo lo que enviaste quedó guardado. 👍`)
    } else {
      await sendWA(fromPhone, `ℹ️ No hay ninguna sesión de captura activa.`)
    }
    return new Response('OK', { status: 200 })
  }

  // ── /fachada — Activar sesión de captura de fachada ──────────────────────
  // Uso: /fachada 9631234567
  // Después: manda foto → se guarda como fachada del cliente
  //          manda texto → se guarda como nota_crm
  //          manda /fin  → cierra la sesión

  // ── /noregistrado — Registro Silencioso Manual ──────────────────────────────
  if (slashText.startsWith('/noregistrado ')) {
    const cTel = extract10Digits(slashText.slice(14).trim())
    if (!cTel || cTel.length !== 10) {
      await sendWA(fromPhone, `⚠️ Número inválido. Uso correcto: */noregistrado 9631234567*`)
      return new Response('OK', { status: 200 })
    }

    const { data: c } = await supabase.from('clientes')
      .select('id, nombre').ilike('telefono', `%${cTel}%`).limit(1).maybeSingle()

    if (c) {
      await sendWA(fromPhone, `ℹ️ El cliente *${c.nombre || cTel}* ya estaba en la base de datos. Listo para recibir fotos.`)
    } else {
      const loyaltyUrl = `https://www.app-estrella.shop/loyalty/${cTel}`
      await supabase.from('clientes').insert({
        telefono: cTel,
        nombre: 'Cliente Express',
        puntos: 0,
        acepta_terminos: false,
        qr_code: loyaltyUrl
      })
      await sendWA(fromPhone, `✅ *Cliente Silencioso guardado* (${cTel}).\nNo se le mandará ningún mensaje.`)
    }

    await sendWA(fromPhone, `📸 Ya puedes enviar su foto de fachada adjuntando el número *${cTel}*.\n\n⚠️ *RECORDATORIO:* Las fotos deben ser 100% exteriores (fachada/portón). Está estrictamente prohibido tomar rostros, placas o interiores.`)
    return new Response('OK', { status: 200 })
  }
  if (slashText.startsWith('/fachada ')) {
    const cTel = extract10Digits(slashText.slice(9).trim())
    if (!cTel || cTel.length !== 10) {
      await sendWA(fromPhone, `⚠️ Formato: */fachada 9631234567*`)
      return new Response('OK', { status: 200 })
    }
    const { data: cliente } = await supabase.from('clientes')
      .select('id, nombre, foto_fachada_url, notas_crm')
      .ilike('telefono', `%${cTel}%`).limit(1).maybeSingle()
    if (!cliente) {
      await sendWA(fromPhone, `❌ No encontré un cliente con el número *${cTel}*.`)
      return new Response('OK', { status: 200 })
    }
    // Guardar sesión de captura con TTL
    const SESION_TTL_MS = 2 * 60 * 60 * 1000 // 2 horas
    await supabase.from('bot_memory').upsert({
      phone: `capture_mode_${from10}`,
      history: [{
        mode: 'fachada',
        clienteTel: cTel,
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        capturedBy: from10,      // quién activó la sesión
        iniciado: Date.now(),    // timestamp para TTL
        expira: Date.now() + SESION_TTL_MS
      }],
      updated_at: new Date().toISOString()
    })
    const tieneFoto = cliente.foto_fachada_url ? `✅ Ya tiene foto guardada.` : `📷 Sin foto aún.`
    const tieneNota = cliente.notas_crm ? `📝 Nota actual: _${cliente.notas_crm.slice(0, 80)}_` : `📝 Sin notas.`
    await sendWA(fromPhone,
      `📸 *Sesión activa para ${cliente.nombre}* (${cTel})\n\n` +
      `${tieneFoto}\n${tieneNota}\n\n` +
      `Ahora puedes:\n` +
      `📷 *Mandar foto* → se guarda como fachada del domicilio\n` +
      `💬 *Escribir texto* → se guarda como nota del cliente\n` +
      `✅ *Escribe /fin* cuando termines`
    )
    return new Response('OK', { status: 200 })
  }

  // ── /nota — Guardar nota directa sin sesión ───────────────────────────────
  // Uso: /nota 9631234567 Casa azul con portón negro, perro grande
  if (slashText.startsWith('/nota ')) {
    const rest = slashText.slice(6).trim()
    const match = rest.match(/^(\d[\d\s\-]{8,}\d)\s+(.+)$/s)
    const cTel  = match ? extract10Digits(match[1]) : null
    const nota  = match ? match[2].trim() : null
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
    await sendWA(fromPhone, `✅ Nota guardada para *${c.nombre}*:\n_${nota}_`)
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
      await sendWA(fromPhone, `🔄 Modo de *${cTel}* restablecido a *automático*.\nEl bot usará el rol registrado en la base de datos.`)
    } else {
      await supabase.from('bot_memory').upsert({
        phone: memKey,
        history: [{ modo: nuevoModo, forzado_por: from10, at: new Date().toISOString() }],
        updated_at: new Date().toISOString()
      })
      await sendWA(fromPhone, `✅ Modo de *${cTel}* forzado a *${nuevoModo}* 🔧\n\nAhora cuando ese número escriba al bot, lo atenderá como *${nuevoModo}* aunque tenga otro rol en la BD.\n\nPara revertir: */modo ${cTel} auto*`)
    }
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
    const { data: adminUser } = await supabase.from('admins').select('id').eq('telefono', from10).maybeSingle()
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
    const { data, error } = await supabase.rpc('fn_registrar_entrega_bulk', { p_cliente_tel: cTel, p_cantidad: cant })
    if (data?.ok) {
      await sendWA(fromPhone, `✅ *${cant} punto(s)* sumados a ${cTel}. Total: *${data.puntos} pts*`)
      if (data.recien_ascendido) {
        try {
          await sendWA(`52${cTel}`, `👑 *¡Felicidades!* 👑\n\nHas sido promovido a *Cliente VIP* ⭐ de Estrella Delivery.\n\nA partir de ahora acumularás *saldo real* en tu billetera. 💰`)
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
        await sendWA(fromPhone, `ℹ️ El número *${cTel}* ya es un restaurante (*${rest.nombre}*).`)
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
            `✅ *${cTel}* ahora es *Restaurante* 🏪\n` +
            `📝 Nombre: *${nombreRest}*\n` +
            `🔒 Programa de lealtad: *pendiente de activar*\n\n` +
            `Rol anterior: ${rolesActuales}\n` +
            `Para activar el programa usa: */activar-lealtad ${cTel}*`
          )
          // Notificar al número que cambió de rol
          await sendWA(`52${cTel}`, `🏪 *Estrella Delivery* te ha registrado como restaurante asociado.\n\nEscríbenos para activar tu portal de lealtad y empezar a fidelizar a tus clientes. 🌟`)
        }
      }
    } else if (nuevoRol === 'cliente') {
      if (cli) {
        await sendWA(fromPhone, `ℹ️ El número *${cTel}* ya es cliente (*${cli.nombre}*).`)
      } else {
        const nombreCli = extra || nombreDetectado
        const loyaltyUrl = `https://www.app-estrella.shop/loyalty/${cTel}`
        const qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=10&data=${encodeURIComponent(loyaltyUrl)}`
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
            `✅ *${cTel}* ahora es *Cliente* 👤\n` +
            `📝 Nombre: *${nombreCli}*\n` +
            `Rol anterior: ${rolesActuales}`
          )
        }
      }
    } else if (nuevoRol === 'repartidor') {
      if (rep) {
        await sendWA(fromPhone, `ℹ️ El número *${cTel}* ya es repartidor (*${rep.nombre}*).`)
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
            `✅ *${cTel}* ahora es *Repartidor* 🛵\n` +
            `📝 Nombre: *${nombreRep}*\n` +
            `🏷️ Alias: *${aliasRep}*\n` +
            `Rol anterior: ${rolesActuales}`
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
      await sendWA(fromPhone, `⚠️ El número *${cTel}* no tiene el rol de *${rolAQuitar}*.`)
    } else {
      // Desactivar en lugar de borrar para mantener historial
      if (rolAQuitar === 'restaurante') {
        await supabase.from('restaurantes').update({ activo: false, programa_lealtad_activo: false }).eq('id', existe.id)
      } else if (rolAQuitar === 'repartidor') {
        await supabase.from('repartidores').update({ activo: false }).eq('id', existe.id)
      } else {
        // Para clientes solo desactivamos términos y puntos (nunca se borra historial)
        await sendWA(fromPhone, `⚠️ Los clientes no se pueden eliminar para preservar el historial. Si quieres bloquearlo, usa */vetar ${cTel}*.`)
        return new Response('OK', { status: 200 })
      }
      await sendWA(fromPhone, `✅ Rol *${rolAQuitar}* quitado a *${cTel}* (*${existe.nombre}*).\n\nEl registro histórico se conserva.`)
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
      `🔄 */rol 963XXXXXXX [cliente|restaurante|repartidor] [nombre]* — Cambiar rol\n` +
      `❌ */quitar-rol 963XXXXXXX [rol]* — Quitar rol\n` +
      `🛵 */repartidor* — Modo repartidor\n` +
      `👔 */admin* — Modo administrador\n\n` +
      `_Estos comandos no requieren IA y siempre funcionan._`)
    return new Response('OK', { status: 200 })
  }

  return null
}
