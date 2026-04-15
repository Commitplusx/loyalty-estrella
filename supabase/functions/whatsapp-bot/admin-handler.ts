// admin-handler.ts — Manejador de las acciones del Administrador (Comandante Alpha)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWA, sendWAImage, sendWALocation, sendWATemplate } from './whatsapp.ts'
import { extract10Digits, guardarMemoria, limpiarMemoria, buscarRepartidor, crearPedidoDesdeBot, barChart } from './db.ts'
import { conversacionDeepSeek } from './ai.ts'

type Supa = ReturnType<typeof createClient>
const BASE_LINK = 'https://www.app-estrella.shop/pedido'

export async function handleAdminGPS(
  supabase: Supa, fromPhone: string, admin10: string,
  lat: number, lng: number, contextText: string, messageId: string
): Promise<Response> {
  // BUG FIX #1: Verificar si hay un pedido pendiente del restaurante que esté procesando el admin.
  // Por simplicidad de refactor, este modo directo asume contexto de creación,
  // pero ahora exigiremos que asocie el GPS a un pedido *activo* sin ubicación o creamos
  // pidiendo el número del cliente post-creación en un flujo real.
  // Para no romper la funcionalidad, lo dejaremos parecido pero le agregaremos una advertencia de que falta el cliente.
  const pData = {
    clienteTel: null, clienteNombre: null, restaurante: null,
    descripcion: contextText || 'Entrega en coordenadas GPS',
    direccion: null, repartidorAlias: null,
  }
  const r = await crearPedidoDesdeBot(supabase, pData, lat, lng, messageId)
  if (r.ok && r.pedidoId) {
    await sendWA(fromPhone, `✅ Mapa 📍 recibido.\n\n*Pedido creado en GPS local.*\n⚠️ *[SISTEMA]*: Alerta: El pedido quedó sin número de cliente. Por favor asigna uno con la web app.\n🔗 ${BASE_LINK}/${r.pedidoId}`)
  }
  return new Response('OK', { status: 200 })
}

export async function handleAdminAssignRest(
  supabase: Supa, fromPhone: string, admin10: string, textoAdmin: string, pendingState: any
): Promise<Response | null> {
  const pedidosPendientes: any[] = pendingState.pedidos
  // BUG FIX #5: Regex restrictiva para evitar falsos positivos con cualquier dígito.
  // Solo hace match si hay "todos" o empieza con "1 jorge", etc.
  const esAsignacion = /^(todos\s+\w+|\d+\s+\w+)/i.test(textoAdmin)
  
  if (!esAsignacion) return null // Pasa al flujo de DeepSeek

  const asignaciones: Record<number, string> = {}
  if (/^todos\s+\w+/i.test(textoAdmin)) {
    const nombreRep = textoAdmin.replace(/^todos\s+/i, '').trim()
    pedidosPendientes.forEach((_, i) => asignaciones[i + 1] = nombreRep)
  } else {
    const partes = textoAdmin.split(',')
    for (const parte of partes) {
      const match = parte.trim().match(/^(\d+)\s+(\w+)/)
      if (match) asignaciones[parseInt(match[1])] = match[2]
    }
  }

  if (Object.keys(asignaciones).length === 0) {
    await sendWA(fromPhone, `🤔 No entendí la asignación.\nUsa: *"todos Jorge"* o *"1 Jorge, 2 María"*.`)
    return new Response('OK', { status: 200 })
  }

  let resumen = `📋 *PEDIDOS ASIGNADOS — ${pendingState.restaurante_nombre}*\n\n`
  let errores = 0

  for (const [idxStr, repAlias] of Object.entries(asignaciones)) {
    const idx = parseInt(idxStr) - 1
    const pedido = pedidosPendientes[idx]
    if (!pedido) continue

    const rep = await buscarRepartidor(supabase, repAlias)
    if (!rep) {
      resumen += `${idx + 1}️⃣ ❌ Repartidor *${repAlias}* no encontrado.\n`
      errores++
      continue
    }

    const { data: nuevo, error: pedErr } = await supabase.from('pedidos').insert({
      cliente_tel: pedido.clienteTel || '0000000000',
      descripcion: pedido.descripcion || 'Pedido de restaurante',
      direccion: pedido.direccion || null,
      restaurante: pendingState.restaurante_nombre,
      repartidor_id: rep.user_id || null,
      estado: 'asignado',
    }).select('id').single()

    if (pedErr || !nuevo) {
      resumen += `${idx + 1}️⃣ ❌ Error guardando: ${pedErr?.message}\n`; errores++
      continue
    }
    if (rep.telefono) {
      await supabase.functions.invoke('notificar-whatsapp', {
        body: { pedido_id: nuevo.id, tipo: 'asignacion', repartidor_tel: rep.telefono }
      })
    }
    resumen += `${idx + 1}️⃣ ✅ a *${rep.nombre}* → Cliente ${pedido.clienteTel}\n`
  }
  resumen += errores > 0 ? `\n⚠️ ${errores} error(es).` : `\n🚀 Notificaciones enviadas.`
  await limpiarMemoria(supabase, `admin_rest_pending_${admin10}`)
  await sendWA(fromPhone, resumen)
  return new Response('OK', { status: 200 })
}

export async function handleAdminMessage(
  supabase: Supa, fromPhone: string, messageId: string, texto: string
): Promise<Response> {
  const chat = await conversacionDeepSeek(supabase, fromPhone, texto, false, { id: 'admin', nombre: 'Admin Jorge' })
  if (!chat) {
    await sendWA(fromPhone, '❌ Cerebro AI devolvió un valor nulo.')
    return new Response('OK', { status: 200 })
  }
  if (chat.errorObj) {
    await sendWA(fromPhone, `❌ *Error DeepSeek API:*\n${chat.errorObj}`)
    return new Response('OK', { status: 200 })
  }

  const { accion, mensajeUsuario } = chat.respuesta!
  const d: any = chat.respuesta?.datosAExtraer || {}

  // Flujos simples que solo responden
  if (['RESPONDER', 'CONSULTA_GENERAL'].includes(accion)) {
    await guardarMemoria(supabase, fromPhone, chat.nuevoHistorial || [])
    await sendWA(fromPhone, mensajeUsuario || '¿Me lo repites?')
    return new Response('OK', { status: 200 })
  }

  // Ejecución de acciones específicas
  switch (accion) {
    case 'VER_RESTAURANTES': {
      const { data: locals } = await supabase
        .from('restaurantes')
        .select('nombre, telefono, activo')
        .eq('activo', true)
        .order('nombre')
      
      if (!locals?.length) {
        await sendWA(fromPhone, '📍 *RESTAURANTES*\n\n⚠️ No hay locales activos registrados actualmente.')
        break
      }
      
      let msg = '📍 *RESTAURANTES ASOCIADOS*\n'
      msg += '───────────────────\n\n'
      locals.forEach((l: any, i: number) => {
        msg += `${i + 1}️⃣ *${l.nombre.toUpperCase()}*\n`
        msg += l.telefono ? `📞 \`52${extract10Digits(l.telefono)}\`\n` : '📞 _Sin teléfono_\n'
        msg += '\n'
      })
      msg += '───────────────────\n'
      msg += '_Para ver la ubicación de uno, escribe: "Mapa de [Nombre]"_'
      await sendWA(fromPhone, msg)
      break
    }
    case 'VER_VIPS': {
      const { data: vips } = await supabase.from('clientes').select('nombre, telefono, puntos, es_vip')
        .order('puntos', { ascending: false }).limit(10)
      
      if (!vips?.length) {
        await sendWA(fromPhone, '🏆 *RANKING VIP*\n\n⚠️ No hay clientes registrados con puntos actualmente.')
        break
      }

      let msg = '🏆 *RANKING VIP (Top 10)*\n'
      msg += '───────────────────\n\n'
      vips.forEach((v: any, i: number) => {
        const icon = v.es_vip ? '⭐' : '👤'
        msg += `${i + 1}️⃣ ${icon} *${v.nombre?.toUpperCase() || 'SIN NOMBRE'}*\n`
        msg += `   🌟 ${v.puntos} pts | \`${extract10Digits(v.telefono)}\`\n\n`
      })
      msg += '───────────────────\n'
      msg += '_Para buscar a uno específico: "Resumen de [Teléfono]"_'
      await sendWA(fromPhone, msg)
      break
    }
    case 'SUMAR_PUNTOS': {
      const tel10 = extract10Digits(d.clienteTel)
      const { data: c } = await supabase.from('clientes').select('id, puntos').ilike('telefono', `%${tel10}%`).limit(1).maybeSingle()
      if (c) {
        const nr = (c.puntos || 0) + d.puntosASumar
        await supabase.from('clientes').update({ puntos: nr }).eq('id', c.id)
        await supabase.from('registros_puntos').insert({
          cliente_id: c.id, tipo: 'acumulacion', puntos: d.puntosASumar, monto_saldo: 0,
          descripcion: `+${d.puntosASumar} admin vía WhatsApp`
        })
        await sendWA(fromPhone, `🌟 Sumados ${d.puntosASumar} pts al ${d.clienteTel}.\nTotal: *${nr} pts*!`)
        if (nr === d.puntosASumar || d.puntosASumar >= 10) {
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://www.app-estrella.shop/loyalty/${tel10}`
          await sendWAImage(`52${tel10}`, qrUrl, `¡Bienvenido a Estrella Delivery! 🏆✨\n\nTu QR personal. Puntos: ${nr}`)
        }
      } else { await sendWA(fromPhone, `🤖 Cliente no encontrado.`) }
      await limpiarMemoria(supabase, fromPhone)
      return new Response('OK', { status: 200 })
    }
    case 'ENVIAR_QR': {
      const tel10 = extract10Digits(d.clienteTel)
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://www.app-estrella.shop/loyalty/?tel=${tel10}`
      await sendWAImage(`52${tel10}`, qrUrl, `Aquí tienes tu código QR personal. ⭐\n\nPreséntalo en tus entregas para sumar puntos.`)
      await sendWA(fromPhone, `✅ QR enviado a *${tel10}*.`)
      break
    }
    case 'VER_PEDIDOS': {
      const { data: activos } = await supabase.from('pedidos')
        .select('id, descripcion, estado, cliente_nombre, cliente_tel, created_at')
        .in('estado', ['asignado', 'recibido', 'en_camino'])
        .order('created_at', { ascending: false })
        .limit(10)

      if (!activos?.length) {
        await sendWA(fromPhone, '📦 *OPERACIÓN DE HOY*\n\n✅ Todo bajo control. No hay pedidos activos pendientes.')
        break
      }

      let msg = '📦 *PEDIDOS EN CURSO*\n'
      msg += '───────────────────\n\n'
      const emo: any = { asignado: '🕘', recibido: '🛍️', en_camino: '🚀' }
      
      activos.forEach((p: any) => {
        const statusIcon = emo[p.estado] || '📦'
        const cliente = p.cliente_nombre || p.cliente_tel || '?'
        msg += `${statusIcon} *${p.descripcion?.toUpperCase().slice(0, 30)}...*\n`
        msg += `   ↳ _${cliente}_ | *${p.estado.toUpperCase()}*\n\n`
      })
      
      msg += '───────────────────\n'
      msg += '_Actualiza estados desde la App Admin o vía WhatsApp._'
      await sendWA(fromPhone, msg)
      break
    }
    case 'BUSCAR_CLIENTE': {
      const { data: c } = await supabase.from('clientes').select('*').ilike('telefono', `%${extract10Digits(d.clienteTel)}%`).limit(1).maybeSingle()
      if (c) {
        await sendWA(fromPhone, `🔍 *ENCONTRADO*\n👤 ${c.nombre}\n📱 ${c.telefono}\n⭐ Puntos: ${c.puntos}\nVIP: ${c.es_vip?'Sí':'No'}\n📝 ${c.notas_crm||'-'}`)
      } else { await sendWA(fromPhone, `🔍 No encontrado.`) }
      break
    }
    case 'VER_REPARTIDORES': {
      const { data: reps } = await supabase
        .from('repartidores')
        .select('nombre, alias, telefono')
        .eq('activo', true)
        .order('nombre')
        .limit(20)
      if (!reps?.length) {
        await sendWA(fromPhone, '🛵 *EQUIPO*\n\n⚠️ No hay personal activo registrado en este momento.')
        break
      }
      let msgRep = '🛵 *EQUIPO ACTIVO*\n'
      msgRep += '───────────────────\n\n'
      reps.forEach((r: any, i: number) => {
        const alias = r.alias ? ` (${r.alias})` : ''
        msgRep += `${i + 1}️⃣ *${r.nombre.toUpperCase()}*${alias}\n`
        msgRep += r.telefono ? `📱 \`52${extract10Digits(r.telefono)}\`\n` : '📱 _Sin teléfono_\n'
        msgRep += '\n'
      })
      msgRep += '───────────────────\n'
      msgRep += '_¿Deseas enviar un anuncio a todos? Escribe: "Anuncio: [mensaje]"_'
      await sendWA(fromPhone, msgRep)
      break
    }
    case 'AGREGAR_CLIENTE': {
      const tel10 = extract10Digits(d.clienteTel)
      if (!tel10 || tel10.length < 10) {
        await sendWA(fromPhone, '⚠️ El número de teléfono es inválido o no tiene 10 dígitos.')
        break
      }

      // 1. Verificar si ya existe
      const { data: existente } = await supabase.from('clientes').select('id, nombre').ilike('telefono', `%${tel10}%`).limit(1).maybeSingle()
      
      let clientId = existente?.id
      if (existente) {
        await sendWA(fromPhone, `ℹ️ El cliente *${existente.nombre}* ya estaba registrado. Actualizando datos...`)
        await supabase.from('clientes').update({
          nombre: d.clienteNombre || existente.nombre,
          colonia: d.colonia || undefined
        }).eq('id', existente.id)
      } else {
        // 2. Crear nuevo cliente
        const qrContent = `https://www.app-estrella.shop/loyalty/${tel10}`
        const { data: nuevo, error } = await supabase.from('clientes').insert({
          nombre: d.clienteNombre || 'Cliente Nuevo',
          telefono: tel10,
          colonia: d.colonia || null,
          puntos: d.puntosASumar || 0,
          qr_code: qrContent
        }).select().single()
        
        if (error) {
          await sendWA(fromPhone, `❌ Error al crear cliente: ${error.message}`)
          break
        }
        clientId = nuevo.id
      }

      // 3. Generar QR de Bienvenida (con autocompletado tel)
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=https://www.app-estrella.shop/loyalty/?tel=${tel10}`
      
      // 4. Enviar vía PLANTILLA META (Para abrir ventana de 24h)
      // Plantilla: estrella_loyalty_welcome
      // {{1}}: Teléfono, {{2}}: Puntos
      await sendWATemplate(
        `52${tel10}`, 
        'estrella_loyalty_welcome', 
        [tel10, (d.puntosASumar || 0).toString()],
        qrUrl
      )

      await sendWA(fromPhone, `✅ *Cliente Registrado: ${d.clienteNombre}*\n📱 ${tel10}\n🌟 Puntos: ${d.puntosASumar || 0}\n\nSe ha enviado el QR de bienvenida vía plantilla automática.`)
      
      if (d.puntosASumar > 0 && clientId) {
        await supabase.from('registros_puntos').insert({
          cliente_id: clientId, tipo: 'acumulacion', puntos: d.puntosASumar,
          descripcion: `Puntos iniciales de registro vía WhatsApp`
        })
      }
      
      await limpiarMemoria(supabase, fromPhone)
      return new Response('OK', { status: 200 })
    }
    case 'CANCELAR_PEDIDO': {
      // BUG FIX #4: Usar update en lugar de delete
      const tel10 = extract10Digits(d.clienteTel)
      const { data: ped } = await supabase.from('pedidos').select('id, descripcion')
        .ilike('cliente_tel', `%${tel10}%`).in('estado', ['asignado', 'recibido']).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (ped) {
        await supabase.from('pedidos').update({ estado: 'cancelado' }).eq('id', ped.id)
        await sendWA(fromPhone, `❌ *Cancelado*\nDe: ${d.clienteTel}\n📦 _${ped.descripcion?.slice(0,60)}_`)
      } else { await sendWA(fromPhone, `🔍 No encontré pedidos activos.`) }
      break
    }
    case 'REASIGNAR_PEDIDO': {
      const { data: ped } = await supabase.from('pedidos').select('id').ilike('cliente_tel', `%${extract10Digits(d.clienteTel)}%`).in('estado', ['asignado', 'recibido']).order('created_at', { ascending: false }).limit(1).maybeSingle()
      const nuevoRep = await buscarRepartidor(supabase, d.repartidorAlias)
      if (ped && nuevoRep) {
        await supabase.from('pedidos').update({ repartidor_id: nuevoRep.user_id }).eq('id', ped.id)
        if (nuevoRep.telefono) await supabase.functions.invoke('notificar-whatsapp', { body: { pedido_id: ped.id, tipo: 'asignacion' } })
        await sendWA(fromPhone, `🔀 *Reasignado* a *${d.repartidorAlias}*. 🛵`)
      } else { await sendWA(fromPhone, `⚠️ Falla localizando pedido o repartidor.`) }
      break
    }
    case 'AGREGAR_NOTA_CLIENTE': {
      const { data: cli } = await supabase.from('clientes').select('id, nombre').ilike('telefono', `%${extract10Digits(d.clienteTel)}%`).limit(1).maybeSingle()
      if (cli) {
        await supabase.from('clientes').update({ notas_crm: d.descripcion }).eq('id', cli.id)
        await sendWA(fromPhone, `📝 *Nota a ${cli.nombre || d.clienteTel}*\n✅ Anotado.`)
      } else { await sendWA(fromPhone, `🔍 No encontrado.`) }
      break
    }
    case 'MARCAR_VIP': {
      const { data: cli } = await supabase.from('clientes').select('id, nombre, es_vip').ilike('telefono', `%${extract10Digits(d.clienteTel)}%`).limit(1).maybeSingle()
      if (cli) {
        await supabase.from('clientes').update({ es_vip: !cli.es_vip }).eq('id', cli.id)
        await sendWA(fromPhone, `⭐ *VIP*\n${!cli.es_vip ? 'Es VIP' : 'Ya no es VIP'}`)
      } else { await sendWA(fromPhone, `🔍 No encontrado.`) }
      break
    }
    case 'VER_HISTORIAL_CLIENTE': {
      const { data: hist } = await supabase.from('pedidos').select('descripcion, estado, created_at')
        .ilike('cliente_tel', `%${extract10Digits(d.clienteTel)}%`).order('created_at', { ascending: false }).limit(7)
      let msg = `📄 *HISTORIAL*\n\n`
      hist?.forEach((h: any) => msg += `- [${h.estado}] ${h.descripcion?.slice(0, 40)}\n`)
      await sendWA(fromPhone, hist?.length ? msg : 'Sin pedidos.')
      break
    }
    case 'RECORDATORIO_REPARTIDOR': {
      const rep = await buscarRepartidor(supabase, d.repartidorAlias)
      if (rep?.telefono) {
        await sendWA(`52${extract10Digits(rep.telefono)}`, `📩 *Central:*\n_${d.descripcion}_`)
        await sendWA(fromPhone, `✅ Enviado a *${rep.nombre}*.`)
      } else { await sendWA(fromPhone, `⚠️ Repartidor no hallado.`) }
      break
    }
    case 'REVISAR_ENTREGADOS': {
      const dias = d.diasAtras || 0
      const dIni = new Date(); dIni.setDate(dIni.getDate() - dias); dIni.setHours(0, 0, 0, 0)
      const dFin = new Date(dIni); dFin.setHours(23, 59, 59, 999)
      
      const { data: e } = await supabase.from('pedidos')
        .select('descripcion, cliente_nombre, updated_at')
        .eq('estado', 'entregado')
        .gte('updated_at', dIni.toISOString())
        .lte('updated_at', dFin.toISOString())
        .order('updated_at', { ascending: false })
      
      const label = dias === 0 ? 'HOY' : dias === 1 ? 'AYER' : `HACE ${dias} DÍA(S)`
      let msg = `✅ *${label} (${e?.length||0})*\n\n`
      e?.forEach((p: any) => msg += `💚 [${new Date(p.updated_at).toTimeString().slice(0,5)}] ${p.cliente_nombre||''} - ${p.descripcion?.slice(0,35)}\n`)
      await sendWA(fromPhone, msg)
      break
    }
    case 'ENTREGAR_TODOS': {
      let q = supabase.from('pedidos').update({ estado: 'entregado' }).in('estado', ['pendiente', 'en_camino', 'asignado', 'recibido'])
      if (d?.restaurante) q = q.ilike('restaurante', `%${d.restaurante}%`)
      const { error } = await q
      if (error) await sendWA(fromPhone, `❌ Error: ${error.message}`)
      else await sendWA(fromPhone, `✅ Marcados como entregados.`)
      break
    }
    case 'CANCELAR_TODOS': {
      let q = supabase.from('pedidos').update({ estado: 'cancelado' }).in('estado', ['pendiente', 'en_camino', 'asignado', 'recibido'])
      if (d?.restaurante) q = q.ilike('restaurante', `%${d.restaurante}%`)
      const { error } = await q
      if (error) await sendWA(fromPhone, `❌ Error: ${error.message}`)
      else await sendWA(fromPhone, `🚫 Cancelados.`)
      break
    }
    case 'ESTADISTICAS': {
      const hoy = new Date(); hoy.setHours(0,0,0,0)
      const { data: today } = await supabase.from('pedidos').select('estado').gte('created_at', hoy.toISOString())
      const t = today?.length||0, e = today?.filter(x=>x.estado==='entregado').length||0, c = today?.filter(x=>x.estado==='en_camino').length||0
      const { count: tc } = await supabase.from('clientes').select('*', { count: 'exact', head: true })
      await sendWA(fromPhone, `📊 *HOY*\n\`\`\`\n${barChart('Entregados',e,t)}\n${barChart('En Camino',c,t)}\n${barChart('Pendiente',t-e-c,t)}\n\`\`\`\nClientes: ${tc||'?'}`)
      break
    }
    case 'REPORTE_SEMANAL': {
      const hace7 = new Date(); hace7.setDate(hace7.getDate() - 6); hace7.setHours(0, 0, 0, 0)
      const { data: semana } = await supabase.from('pedidos').select('estado, created_at').gte('created_at', hace7.toISOString())
      if (!semana) { await sendWA(fromPhone, '⚠️ No pude obtener los datos.'); break }
      const diasMap: Record<string, { total: number; entregados: number }> = {}
      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
      semana.forEach((p: any) => {
        const key = dayNames[new Date(p.created_at).getDay()]
        if (!diasMap[key]) diasMap[key] = { total: 0, entregados: 0 }
        diasMap[key].total++
        if (p.estado === 'entregado') diasMap[key].entregados++
      })
      const mx = Math.max(...Object.values(diasMap).map(v => v.total), 1), ts = semana.length
      const es = semana.filter((p: any) => p.estado === 'entregado').length
      const lines = ['📈 *REPORTE SEMANAL*', '', '```']
      Object.entries(diasMap).forEach(([day, v]) => lines.push(barChart(day, v.total, mx, 8)))
      lines.push('```', '', `📦 Pedidos: *${ts}*`, `✅ Entregados: *${es}*`, `📉 Tasa: *${ts>0?Math.round((es/ts)*100):0}%*`)
      await sendWA(fromPhone, lines.join('\n'))
      break
    }
    case 'AGREGAR_REPARTIDOR': {
      const nombre = d?.clienteNombre ? String(d.clienteNombre).trim() : null
      if (!nombre) {
        await sendWA(fromPhone, `🛵 Para agregar personal necesito el *nombre completo*.\n\nEjemplo: _"Agregar a Juan González, tel 5541234567"_`)
        break
      }
      const tel   = d.clienteTel ? extract10Digits(String(d.clienteTel)) : null
      const alias = d.repartidorAlias ? String(d.repartidorAlias).trim() : null
      const { error: insErr } = await supabase.from('repartidores').insert({
        nombre,
        telefono: tel || null,
        alias: alias || null,
        activo: true,
      })
      if (insErr) {
        await sendWA(fromPhone, `❌ Error al registrar: ${insErr.message}`)
      } else {
        const telInfo = tel ? `\n📱 Tel: *${tel}*` : '\n⚠️ Sin teléfono — puedes agregarlo luego desde Herramientas en la app.'
        await sendWA(fromPhone, `🛵✨ *Repartidor Registrado*\n👤 Nombre: *${nombre}*${telInfo}\n\nYa está activo para recibir pedidos.`)
      }
      break
    }
    case 'ELIMINAR_REPARTIDOR': {
      let q = supabase.from('repartidores').select('id, nombre').eq('activo', true)
      if (d?.repartidorAlias) q = q.or(`alias.ilike.%${d.repartidorAlias}%,nombre.ilike.%${d.repartidorAlias}%`) as any
      else if (d?.clienteTel) q = q.ilike('telefono', `%${extract10Digits(d.clienteTel)}%`) as any
      const { data: rep } = await q.order('creado_en', { ascending: false }).limit(1).maybeSingle() as any
      if (rep) {
        await supabase.from('repartidores').update({ activo: false }).eq('id', rep.id)
        await sendWA(fromPhone, `🛵❌ *Desactivado*\nAl repartidor *${rep.nombre}*`)
      } else { await sendWA(fromPhone, `⚠️ No encontré a ese repartidor activo.`) }
      break
    }
    case 'CARGAR_SALDO': {
      const tel10 = extract10Digits(d.clienteTel)
      const { data: cli } = await supabase.from('clientes').select('id, nombre, saldo_billetera').ilike('telefono', `%${tel10}%`).limit(1).maybeSingle()
      if (cli) {
        const ns = (parseFloat(cli.saldo_billetera) || 0) + (d.montoSaldo || 0)
        await supabase.from('clientes').update({ saldo_billetera: ns }).eq('id', cli.id)
        await supabase.from('registros_puntos').insert({ cliente_id: cli.id, tipo: 'acumulacion', puntos: 0, monto_saldo: d.montoSaldo, descripcion: `Ajuste admin: $${d.montoSaldo}` })
        await sendWA(fromPhone, `💲 *Billetera*\nCargado $${d.montoSaldo} al cliente ${cli.nombre || tel10}.\nSaldo final: *$${ns}*`)
      } else { await sendWA(fromPhone, `🔍 No encontrado.`) }
      break
    }
    case 'VER_ATRASOS': {
      const c = new Date(Date.now() - 45 * 60000).toISOString()
      const { data: at } = await supabase.from('pedidos').select('descripcion, estado, created_at').not('estado','in','("entregado","cancelado")').lt('created_at', c)
      if (at?.length) {
        let msg = `🚨 *ATRASOS (+45 mins)*\n\n`
        at.forEach((p:any) => msg += `⏱️ ${Math.floor((Date.now()-new Date(p.created_at).getTime())/60000)}m : _${p.descripcion?.substring(0,25)}_\nEstado: ${p.estado}\n\n`)
        await sendWA(fromPhone, msg)
      } else { await sendWA(fromPhone, `✅ Operación sana. Sin atrasos.`) }
      break
    }
    case 'ESTADO_REPARTIDOR': {
      const repAlias = d?.repartidorAlias
      const repTel   = d?.clienteTel
      if (!repAlias && !repTel) {
        await sendWA(fromPhone, `⚠️ Dime el nombre o alias del repartidor para consultar.\n\nEj: _"Estado de Jorge"_`)
        break
      }
      let repQuery = supabase.from('repartidores').select('id, user_id, nombre, telefono').eq('activo', true)
      if (repAlias) {
        repQuery = repQuery.or(`alias.ilike.%${repAlias}%,nombre.ilike.%${repAlias}%`) as any
      } else if (repTel) {
        repQuery = repQuery.ilike('telefono', `%${extract10Digits(String(repTel))}%`) as any
      }
      const { data: rep } = await (repQuery as any).limit(1).maybeSingle()
      if (!rep) {
        await sendWA(fromPhone, `🔍 No encontré a "${repAlias || repTel}" en el equipo activo.`)
        break
      }
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
      // Buscar por user_id O por id (fallback para repartidores sin Auth)
      const orFilter = rep.user_id
        ? `repartidor_id.eq.${rep.user_id},repartidor_id.eq.${rep.id}`
        : `repartidor_id.eq.${rep.id}`
      const { data: pt } = await supabase
        .from('pedidos')
        .select('estado')
        .or(orFilter)
        .gte('created_at', hoy.toISOString())
      const entregados = pt?.filter((p: any) => p.estado === 'entregado').length || 0
      const pendientes = pt?.filter((p: any) => !['entregado', 'cancelado'].includes(p.estado)).length || 0
      const total      = pt?.length || 0
      const telInfo    = rep.telefono ? `📱 ${rep.telefono}` : '_Sin teléfono_'
      await sendWA(fromPhone, `📋 *ESTADO: ${rep.nombre.toUpperCase()}*\n${telInfo}\n\n✅ Entregados hoy: *${entregados}*\n⏳ En curso: *${pendientes}*\n📦 Total asignados: *${total}*`)
      break
    }
    case 'UBICACION_RESTAURANTE': {
      const { data: res } = await supabase.from('restaurantes').select('nombre, lat, lng, direccion').or(`nombre.ilike.%${d.restaurante}%,direccion.ilike.%${d.restaurante}%`).order('lat', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
      if (res?.lat && res?.lng) await sendWALocation(fromPhone, Number(res.lat), Number(res.lng), res.nombre, res.direccion || 'Ubicación')
      else if (res) await sendWA(fromPhone, `Ubicación de *${res.nombre}* no registrada (Dirección txt: ${res.direccion || 'N/A'})`) 
      else await sendWA(fromPhone, `🔍 No encontré el restaurante.`)
      break
    }
    case 'ANUNCIO_REPARTIDORES': {
      const { data: ra } = await supabase.from('repartidores').select('telefono').eq('activo', true).not('telefono', 'is', null)
      if (ra?.length) {
        let sent = 0
        for (const r of ra) {
           await sendWA(`52${extract10Digits(r.telefono)}`, `📢 *ANUNCIO DE BASE*\n\n${d.descripcion}`)
           sent++
        }
        await sendWA(fromPhone, `✅ Radiado a *${sent}* miembros activos.`)
      } else { await sendWA(fromPhone, `⚠️ Ningún repartidor con tel válido.`) }
      break
    }
    case 'CREAR_PEDIDO': {
      const result = await crearPedidoDesdeBot(supabase, d, undefined, undefined, messageId)
      if (result.ok && result.pedidoId) {
        await limpiarMemoria(supabase, fromPhone)
        await sendWA(fromPhone, `${mensajeUsuario}\n\n✅ *Creado*\n📦 ${d.descripcion}\n🔗 ${BASE_LINK}/${result.pedidoId}`)
      } else { await sendWA(fromPhone, `❌ Error: ${result.error}`) }
      return new Response('OK', { status: 200 })
    }
  }

  await guardarMemoria(supabase, fromPhone, chat.nuevoHistorial || [])
  return new Response('OK', { status: 200 })
}
