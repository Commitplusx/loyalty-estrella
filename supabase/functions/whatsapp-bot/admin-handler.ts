// admin-handler.ts — Manejador de las acciones del Administrador (Comandante Alpha)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWA, sendWAImage, sendWALocation, sendWATemplate } from './whatsapp.ts'
import { extract10Digits, guardarMemoria, limpiarMemoria, buscarRepartidor, crearPedidoDesdeBot, barChart } from './db.ts'
import { pedidoLink } from '../_shared/utils.ts'
import { conversacionDeepSeek } from './ai.ts'
import { updateChatwootProfile, addPrivateNoteByPhone, syncContactAttributes } from './chatwoot-sync.ts'

type Supa = ReturnType<typeof createClient>

const ADMIN_PHONES_ENV  = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''
const ADMIN_PHONE_MAIN  = (() => {
  const n = ADMIN_PHONES_ENV.split(',')[0]?.replace(/\D/g,'').slice(-10)
  return n ? `52${n}` : ''
})()

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
    clienteTel: '9999999999', clienteNombre: null, restaurante: null,
    descripcion: contextText || 'Entrega en coordenadas GPS',
    direccion: null, repartidorAlias: null,
  }
  const r = await crearPedidoDesdeBot(supabase, pData, lat, lng, messageId)
  if (r.ok && r.pedidoId) {
    await sendWA(fromPhone, `✅ Mapa 📍 recibido.\n\n*Pedido creado en GPS local.*\n⚠️ *[SISTEMA]*: Alerta: El pedido quedó sin número de cliente. Por favor asigna uno con la web app.\n🔗 ${pedidoLink(r.pedidoId)}`)
  }
  return new Response('OK', { status: 200 })
}

export async function handleAdminAssignRest(
  supabase: Supa, fromPhone: string, admin10: string, textoAdmin: string, pendingState: any
): Promise<Response | null> {
  const pedidosPendientes: any[] = pendingState.pedidos
  // Solo hace match si hay "todos" o empieza con "1 jorge", etc., y nada más que eso.
  const esAsignacion = /^(todos\s+[a-zA-ZáéíóúÁÉÍÓÚñÑ]+|(\d+\s+[a-zA-ZáéíóúÁÉÍÓÚñÑ]+(,\s*\d+\s+[a-zA-ZáéíóúÁÉÍÓÚñÑ]+)*))$/i.test(textoAdmin.trim())
  
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

    // CACHÉ GPS: Buscar coordenadas frecuentes del cliente
    const telLimpio = extract10Digits(pedido.clienteTel || '0000000000')
    const { data: clienteCache } = await supabase.from('clientes').select('lat_frecuente, lng_frecuente').eq('telefono', telLimpio).maybeSingle()
    
    const finalLat = pedido.lat || clienteCache?.lat_frecuente || null
    const finalLng = pedido.lng || clienteCache?.lng_frecuente || null

    const { data: nuevo, error: pedErr } = await supabase.from('pedidos').insert({
      cliente_tel: pedido.clienteTel || '0000000000',
      descripcion: pedido.descripcion || 'Pedido de restaurante',
      direccion: pedido.direccion || null,
      restaurante: pendingState.restaurante_nombre,
      repartidor_id: rep.user_id || null,
      estado: 'asignado',
      lat: finalLat,
      lng: finalLng
    }).select('id').single()

    if (pedErr || !nuevo) {
      resumen += `${idx + 1}️⃣ ❌ Error guardando: ${pedErr?.message}\n`; errores++
      continue
    }
    // NOTA ARQUITECTURA: Ya no invocamos a `notificar-whatsapp` manualmente aquí.
    // Ahora existe el Trigger `trg_notify_repartidor` en PostgreSQL que detecta el UPDATE de estado
    // y se encarga de enviar el Webhook automáticamente garantizando un "Single Source of Truth".

    resumen += `${idx + 1}️⃣ ✅ a *${rep.nombre}* → Cliente ${pedido.clienteTel}\n`
  }
  resumen += errores > 0 ? `\n⚠️ ${errores} error(es).` : `\n🚀 Notificaciones enviadas.`
  // BUG FIX: Eliminar el registro pendiente correctamente sin pasar por el limpiador de 10 dígitos
  await supabase.from('bot_memory').delete().eq('phone', `admin_rest_pending_${admin10}`)
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

  if (!chat.respuesta) {
    await sendWA(fromPhone, '❌ Sin respuesta de IA. Intente de nuevo.')
    return new Response('OK', { status: 200 })
  }
  const { accion, mensajeUsuario } = chat.respuesta
  const d: any = chat.respuesta.datosAExtraer || {}

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
      const { data: c } = await supabase.from('clientes').select('id, puntos, acepta_terminos, nombre').ilike('telefono', `%${tel10}%`).limit(1).maybeSingle()
      
      if (c) {
        if (c.acepta_terminos === false) {
           // No ha aceptado términos: Enviar plantilla de términos primero
           await sendWATemplate(`52${tel10}`, 'estrella_terminos_condiciones', [c.nombre || 'Cliente'])
           await sendWA(fromPhone, `⏳ El cliente *${tel10}* aún no acepta los términos y condiciones.\nLe he enviado la solicitud de aceptación. Los puntos se sumarán automáticamente cuando acepte.`)
           
           // Guardar en memoria que hay una suma pendiente
           await supabase.from('bot_memory').upsert({
             phone: `pending_pts_${tel10}`,
             history: [{ puntos: d.puntosASumar, admin: fromPhone }],
             updated_at: new Date().toISOString()
           })
           return new Response('OK', { status: 200 })
        }

        const cant = Number(d.puntosASumar) || 1
        let lastRes: any = null
        let rpcError: any = null
        for (let i = 0; i < cant; i++) {
          const { data, error } = await supabase.rpc('fn_registrar_entrega', {
            p_cliente_tel: tel10
          })
          if (error) { rpcError = error; console.error(`[SUMAR_PUNTOS] RPC error iter ${i}:`, error); break }
          else if (data?.ok) lastRes = data
          else { console.warn(`[SUMAR_PUNTOS] RPC retornó ok=false iter ${i}:`, data); break }
        }

        if (!lastRes) {
          const errMsg = rpcError?.message || 'La función retornó ok=false'
          console.error(`[SUMAR_PUNTOS] RPC falló: ${errMsg}`)
          await sendWA(fromPhone, `❌ No pude sumar los puntos a *${c.nombre || tel10}*.\nError interno: ${errMsg}`)
          await limpiarMemoria(supabase, fromPhone)
          return new Response('OK', { status: 200 })
        }

        // El RPC fn_registrar_entrega ya actualiza clientes.puntos atómicamente.
        // NO hacemos update manual aquí para evitar race conditions.

        // Sincronizar hacia Chatwoot inmediatamente
        try {
          const { updateChatwootProfile } = await import('./chatwoot-sync.ts')
          await updateChatwootProfile(supabase, tel10)
        } catch (e) {
          console.error('[CW Sync] Error post-sumar:', e)
        }

        const saldoInfo = lastRes.saldo_billetera > 0 ? `\n💳 Saldo en billetera: *$${lastRes.saldo_billetera}*` : ''
        await sendWA(fromPhone, `🌟 Sumados *${cant} pts* a ${c.nombre || tel10}.\nTotal: *${lastRes.puntos} pts* ✅${saldoInfo}`)
        const ptsResult = await sendWATemplate(
          `52${tel10}`,
          'estrella_puntos_acumulados',
          [c.nombre || 'Cliente', cant.toString(), lastRes.puntos.toString()],
          undefined, tel10
        )
        if (ptsResult?.ok === false) {
          console.error(`[SUMAR_PUNTOS] Template error:`, ptsResult.error)
        }
      } else { await sendWA(fromPhone, `🤖 Cliente no encontrado.`) }
      await limpiarMemoria(supabase, fromPhone)
      return new Response('OK', { status: 200 })
    }
    case 'ENVIAR_QR': {
      const tel10 = extract10Digits(d.clienteTel)
      const { data: cli } = await supabase.from('clientes').select('nombre, puntos, acepta_terminos').ilike('telefono', `%${tel10}%`).limit(1).maybeSingle()
      
      if (cli && cli.acepta_terminos === false) {
        await sendWATemplate(`52${tel10}`, 'estrella_terminos_condiciones', [cli.nombre || 'Cliente'])
        await sendWA(fromPhone, `⏳ El cliente *${tel10}* aún no acepta los términos.\nLe he enviado la solicitud. El QR se enviará automáticamente cuando acepte.`)
        
        await supabase.from('bot_memory').upsert({
          phone: `pending_qr_${tel10}`,
          history: [{ admin: fromPhone }],
          updated_at: new Date().toISOString()
        })
        break
      }

      const loyaltyUrl = `https://www.app-estrella.shop/loyalty/${tel10}`
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=10&data=${encodeURIComponent(loyaltyUrl)}`
      
      const result = await sendWATemplate(
        `52${tel10}`, 
        'estrella_loyalty_welcome', 
        [cli?.nombre || 'Cliente', (cli?.puntos || 0).toString()],
        qrImageUrl,
        tel10
      )
      
      if (result && result.ok === false) {
          console.error(`[ENVIAR_QR] Error enviando QR a ${tel10}:`, result.error)
          await sendWA(fromPhone, `❌ Error enviando QR al ${tel10}. Meta API lo rechazó.`)
      } else {
          await sendWA(fromPhone, `✅ QR enviado a *${tel10}* mediante plantilla segura.`)
      }
      break
    }
    case 'ENVIAR_TERMINOS': {
      const tel10 = extract10Digits(d.clienteTel)
      const { data: cli } = await supabase.from('clientes').select('nombre').ilike('telefono', `%${tel10}%`).limit(1).maybeSingle()
      if (!cli) {
        await sendWA(fromPhone, `⚠️ El cliente *${tel10}* no está registrado.\nRegístralo primero con "Agregar cliente" antes de enviar los términos, de lo contrario la aceptación se perdería.`)
        break
      }
      const result = await sendWATemplate(`52${tel10}`, 'estrella_terminos_condiciones', [cli.nombre || 'Cliente'])
      if (result?.ok === false) {
        await sendWA(fromPhone, `❌ Error enviando términos a ${tel10}: ${result.error}`)
      } else {
        await sendWA(fromPhone, `✅ Términos y condiciones enviados a *${tel10}*.`)
      }
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
      // URL canónica que identifica al cliente en la Web y se almacena en DB
      const loyaltyUrl = `https://www.app-estrella.shop/loyalty/${tel10}`
      const { data: existente } = await supabase.from('clientes').select('id, nombre').ilike('telefono', `%${tel10}%`).limit(1).maybeSingle()
      
      let clientId = existente?.id
      if (existente) {
        await sendWA(fromPhone, `ℹ️ El cliente *${existente.nombre}* ya estaba registrado. Actualizando datos...`)
        await supabase.from('clientes').update({
          nombre: d.clienteNombre || existente.nombre,
          colonia: d.colonia || undefined,
          // Asegurar que el qr_code apunte a la URL canónica correcta
          qr_code: loyaltyUrl
        }).eq('id', existente.id)
      } else {
        // 2. Crear nuevo cliente — qr_code = URL canónica que la Web renderiza
        const { data: nuevo, error } = await supabase.from('clientes').insert({
          nombre: d.clienteNombre || 'Cliente Nuevo',
          telefono: tel10,
          colonia: d.colonia || null,
          puntos: 0,
          qr_code: loyaltyUrl // <<< MISMO valor que usa QRGenerator.tsx
        }).select().single()
        
        if (error) {
          await sendWA(fromPhone, `❌ Error al crear cliente: ${error.message}`)
          break
        }
        clientId = nuevo.id
      }

      // 3. La imagen QR que va en el header de la plantilla:
      //    Codificamos la URL canónica de lealtad en un QR visual via QR Server
      //    Mismo contenido que la Web muestra al cliente en la App
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=10&data=${encodeURIComponent(loyaltyUrl)}`
      
      // 4. Enviar vía PLANTILLA META (estrella_loyalty_welcome)
      // Header: imagen QR ({{image}})
      // Body {{1}}: Nombre del cliente
      // Body {{2}}: Puntos iniciales
      const result = await sendWATemplate(
        `52${tel10}`,
        'estrella_loyalty_welcome',
        [d.clienteNombre || 'Cliente', (d.puntosASumar || 0).toString()],
        qrImageUrl, tel10
      )

      if (result && result.ok === false) {
        console.error(`[AGREGAR_CLIENTE] Error enviando QR a ${tel10}:`, result.error)
        await sendWA(fromPhone, `✅ *Cliente Registrado: ${d.clienteNombre}*\n📱 ${tel10}\n🌟 Puntos: ${d.puntosASumar || 0}\n\n⚠️ *ERROR AL ENVIAR QR:* Meta rechazó el mensaje de la plantilla. Revisa los logs.`)
        await supabase.from('bot_memory').upsert({
          phone: `syslog_qr_err_${tel10}`,
          history: [{ error: result.error, ts: Date.now() }],
          updated_at: new Date().toISOString()
        })
      } else {
        console.log(`[AGREGAR_CLIENTE] QR enviado exitosamente a ${tel10}.`)
        await sendWA(fromPhone, `✅ *Cliente Registrado: ${d.clienteNombre}*\n📱 ${tel10}\n🌟 Puntos: ${d.puntosASumar || 0}\n\nSe ha enviado el QR de bienvenida vía plantilla automática.`)
        await supabase.from('bot_memory').upsert({
          phone: `syslog_qr_ok_${tel10}`,
          history: [{ status: 'success', ts: Date.now() }],
          updated_at: new Date().toISOString()
        })
      }
      
      if (d.puntosASumar > 0 && clientId) {
        const cant = Number(d.puntosASumar) || 1
        for (let i = 0; i < cant; i++) {
          await supabase.rpc('fn_registrar_entrega', { p_cliente_tel: tel10 })
        }
      }
      
      await limpiarMemoria(supabase, fromPhone)
      return new Response('OK', { status: 200 })
    }
    case 'CANCELAR_PEDIDO': {
      // BUG FIX #4: Usar update en lugar de delete
      const tel10 = extract10Digits(d.clienteTel)
      const { data: peds } = await supabase.from('pedidos').select('id, descripcion')
        .ilike('cliente_tel', `%${tel10}%`).in('estado', ['asignado', 'recibido']).order('created_at', { ascending: false })
      if (peds && peds.length > 0) {
        const ids = peds.map((p: any) => p.id)
        await supabase.from('pedidos').update({ estado: 'cancelado' }).in('id', ids)
        await sendWA(fromPhone, `❌ *Cancelado*\nSe cancelaron ${peds.length} pedido(s) de: ${d.clienteTel}\n📦 _${peds[0].descripcion?.slice(0,60)}_`)
      } else { await sendWA(fromPhone, `🔍 No encontré pedidos activos para ese cliente.`) }
      break
    }
    case 'REASIGNAR_PEDIDO': {
      const { data: peds } = await supabase.from('pedidos').select('id').ilike('cliente_tel', `%${extract10Digits(d.clienteTel)}%`).in('estado', ['asignado', 'recibido']).order('created_at', { ascending: false })
      const nuevoRep = await buscarRepartidor(supabase, d.repartidorAlias)
      if (peds && peds.length > 0 && nuevoRep) {
        const ids = peds.map((p: any) => p.id)
        await supabase.from('pedidos').update({ repartidor_id: nuevoRep.user_id }).in('id', ids)
        if (nuevoRep.telefono) {
          // Fire-and-forget: no bloqueamos al admin esperando que se envíen todas las notificaciones
          for (const id of ids) {
            supabase.functions.invoke('notificar-whatsapp', { body: { pedido_id: id, tipo: 'asignacion' } })
              .catch((e: any) => console.error('[REASIGNAR] notificar error:', e?.message))
          }
        }
        await sendWA(fromPhone, `🔀 *Reasignado*\nSe pasaron ${peds.length} pedido(s) a *${nuevoRep.nombre}*. 🛵`)
      } else { await sendWA(fromPhone, `⚠️ Falla localizando pedido o repartidor.`) }
      break
    }
    case 'AGREGAR_NOTA_CLIENTE': {
      const { data: cli } = await supabase.from('clientes').select('id, nombre').ilike('telefono', `%${extract10Digits(d.clienteTel)}%`).limit(1).maybeSingle()
      if (cli) {
        // Concatenar notas en vez de sobreescribir para mantener historial
        const { data: cliNotas } = await supabase.from('clientes').select('notas_crm').eq('id', cli.id).single()
        const notaExistente = cliNotas?.notas_crm || ''
        const fecha = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })
        const nuevaNota = notaExistente
          ? `${notaExistente}\n[${fecha}] ${d.descripcion}`
          : `[${fecha}] ${d.descripcion}`
        await supabase.from('clientes').update({ notas_crm: nuevaNota }).eq('id', cli.id)
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
        await sendWA(fromPhone, `✅ *Pedido Asignado*\n${mensajeUsuario}\n\n📦 *Detalle:* ${d.descripcion}\n🔗 ${pedidoLink(result.pedidoId)}`)
      } else { await sendWA(fromPhone, `❌ Error: ${result.error}`) }
      return new Response('OK', { status: 200 })
    }
  }

  await guardarMemoria(supabase, fromPhone, chat.nuevoHistorial || [])
  return new Response('OK', { status: 200 })
}

// ─── Buró de Clientes: Procesar botones de calificación ───────────────────────
export async function handleCalificacion(supabase: Supa, fromPhone: string, buttonId: string): Promise<Response> {
  // Formatos de buttonId:
  //   RATE_EXC_9631234567  → reputacion = 'excelente'
  //   RATE_BUE_9631234567  → reputacion = 'bueno'
  //   RATE_PRB_9631234567  → Pedir segunda ronda de etiquetas
  //   TAG_DEMORA_9631234567, TAG_GROSERO_9631234567, etc. → añadir etiqueta
  //   VETAR_9631234567     → reputacion = 'vetado'

  const parts = buttonId.split('_')
  const tel10 = parts[parts.length - 1]  // Último segmento siempre es el teléfono

  if (!tel10 || tel10.length < 10) {
    await sendWA(fromPhone, `⚠️ No pude identificar el número del cliente del botón.`)
    return new Response('OK', { status: 200 })
  }

  // Buscar cliente
  const { data: cli } = await supabase.from('clientes').select('id, nombre, etiquetas, reputacion').ilike('telefono', `%${tel10}%`).limit(1).maybeSingle()
  const clienteId = cli?.id
  const clienteNombre = cli?.nombre || `Cliente ${tel10}`
  const etiquetasActuales: string[] = cli?.etiquetas || []

  // ── RATE: Calificación general ──
  if (buttonId.startsWith('RATE_EXC_')) {
    if (clienteId) {
      await supabase.from('clientes').update({ reputacion: 'excelente' }).eq('id', clienteId)
    } else {
      await supabase.from('clientes').insert({ telefono: tel10, nombre: clienteNombre, reputacion: 'excelente', puntos: 0 })
    }
    // Borrar calificación pendiente si existe
    await supabase.from('calificaciones_pendientes').delete().eq('cliente_tel', tel10)
    await sendWA(fromPhone, `⭐ *${clienteNombre}* → Reputación: *Excelente*\n¡Registrado!`)
    return new Response('OK', { status: 200 })
  }

  if (buttonId.startsWith('RATE_BUE_')) {
    if (clienteId) {
      await supabase.from('clientes').update({ reputacion: 'bueno' }).eq('id', clienteId)
    } else {
      await supabase.from('clientes').insert({ telefono: tel10, nombre: clienteNombre, reputacion: 'bueno', puntos: 0 })
    }
    await supabase.from('calificaciones_pendientes').delete().eq('cliente_tel', tel10)
    await sendWA(fromPhone, `👍 *${clienteNombre}* → Reputación: *Bueno*\n¡Registrado!`)
    return new Response('OK', { status: 200 })
  }

  if (buttonId.startsWith('RATE_PRB_')) {
    // Segunda ronda: enviar botones de etiquetas (máx 3 por mensaje, enviamos 2 mensajes)
    const { sendInteractiveButtons } = await import('./whatsapp.ts')
    await sendInteractiveButtons(fromPhone,
      `¿Qué pasó con *${clienteNombre}*?\nElige la etiqueta que mejor describe el problema:`,
      [
        { id: `TAG_DEMORA_${tel10}`, title: '⏱️ Tardó mucho' },
        { id: `TAG_GROSERO_${tel10}`, title: '😤 Fue grosero' },
        { id: `TAG_NOATIENDE_${tel10}`, title: '📵 No contestó' },
      ]
    )
    await sendInteractiveButtons(fromPhone,
      `Más opciones:`,
      [
        { id: `TAG_DIRMAL_${tel10}`, title: '🏠 Dirección mal' },
        { id: `TAG_PEDFALSO_${tel10}`, title: '🚫 Pedido falso' },
        { id: `VETAR_${tel10}`, title: '🔴 Vetar cliente' },
      ]
    )
    return new Response('OK', { status: 200 })
  }

  // ── TAG: Etiquetas específicas ──
  const TAG_MAP: Record<string, { etiqueta: string; reputacion: string; emoji: string }> = {
    'TAG_DEMORA':    { etiqueta: 'demora',          reputacion: 'regular', emoji: '⏱️' },
    'TAG_GROSERO':   { etiqueta: 'grosero',         reputacion: 'malo',    emoji: '😤' },
    'TAG_NOATIENDE': { etiqueta: 'no_atiende',      reputacion: 'regular', emoji: '📵' },
    'TAG_DIRMAL':    { etiqueta: 'direccion_mal',   reputacion: 'regular', emoji: '🏠' },
    'TAG_PEDFALSO':  { etiqueta: 'pedido_falso',    reputacion: 'malo',    emoji: '🚫' },
  }

  const tagPrefix = Object.keys(TAG_MAP).find(k => buttonId.startsWith(k + '_'))
  if (tagPrefix) {
    const { etiqueta, reputacion, emoji } = TAG_MAP[tagPrefix]
    const nuevasEtiquetas = [...new Set([...etiquetasActuales, etiqueta])]
    if (clienteId) {
      await supabase.from('clientes').update({ reputacion, etiquetas: nuevasEtiquetas }).eq('id', clienteId)
    } else {
      await supabase.from('clientes').insert({ telefono: tel10, nombre: clienteNombre, reputacion, etiquetas: nuevasEtiquetas, puntos: 0 })
    }
    await updateChatwootProfile(supabase, tel10).catch(console.error)
    await addPrivateNoteByPhone(tel10, `⚠️ Alerta: El repartidor acaba de calificar a este cliente con mala actitud: *${etiqueta.toUpperCase()}*`).catch(console.error)
    await syncContactAttributes(tel10, { problemático: true }).catch(console.error)
    
    await supabase.from('calificaciones_pendientes').delete().eq('cliente_tel', tel10)
    await sendWA(fromPhone, `${emoji} *${clienteNombre}* → Reputación: *${reputacion}*\nEtiqueta añadida: *${etiqueta}*\n🏷️ Historial: ${nuevasEtiquetas.join(', ')}`)
    return new Response('OK', { status: 200 })
  }

  // ── VETAR ──
  if (buttonId.startsWith('VETAR_')) {
    const nuevasEtiquetas = [...new Set([...etiquetasActuales, 'vetado'])]
    if (clienteId) {
      await supabase.from('clientes').update({ reputacion: 'vetado', etiquetas: nuevasEtiquetas }).eq('id', clienteId)
    } else {
      await supabase.from('clientes').insert({ telefono: tel10, nombre: clienteNombre, reputacion: 'vetado', etiquetas: nuevasEtiquetas, puntos: 0 })
    }
    await updateChatwootProfile(supabase, tel10).catch(console.error)
    await addPrivateNoteByPhone(tel10, `🔴 ALERTA MÁXIMA: Este cliente ha sido VETADO permanentemente por el repartidor.`).catch(console.error)
    await syncContactAttributes(tel10, { problemático: true, vetado: true }).catch(console.error)

    await supabase.from('calificaciones_pendientes').delete().eq('cliente_tel', tel10)
    await sendWA(fromPhone, `🔴 *${clienteNombre}* → *VETADO*\nEste cliente ya no recibirá servicio. Los restaurantes serán alertados automáticamente.`)
    return new Response('OK', { status: 200 })
  }

  return new Response('OK', { status: 200 })
}

// ─── Términos y Condiciones: Procesar aceptación ──────────────────────────────
export async function handleTerminos(supabase: Supa, fromPhone: string, buttonId: string): Promise<Response> {
  const tel10 = extract10Digits(fromPhone)
  const upId = buttonId.toUpperCase()
  
  if (upId === 'ACEPTAR_TERMINOS' || upId === 'ACEPTAR') {
    // 1. Marcar en DB
    console.log(`✅ [T&C] Cliente ${tel10} HA ACEPTADO los términos.`)
    await supabase.from('clientes').update({ acepta_terminos: true }).ilike('telefono', `%${tel10}%`)
    
    // 2. Avisar al cliente
    await sendWA(fromPhone, "✅ ¡Gracias por aceptar! Ahora ya puedes disfrutar de todos los beneficios de Estrella Delivery. 🌟")
    
    // 3. Revisar acciones pendientes
    // 3.A QR Pendiente
    const { data: pendingQR } = await supabase.from('bot_memory').select('history').eq('phone', `pending_qr_${tel10}`).maybeSingle()
    if (pendingQR?.history?.[0]) {
      console.log(`🔄 [T&C] Ejecutando ENVÍO DE QR PENDIENTE para ${tel10}...`)
      const { data: cli } = await supabase.from('clientes').select('nombre, puntos').ilike('telefono', `%${tel10}%`).limit(1).maybeSingle()
      const loyaltyUrl = `https://www.app-estrella.shop/loyalty/${tel10}`
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=10&data=${encodeURIComponent(loyaltyUrl)}`
      await sendWATemplate(`52${tel10}`, 'estrella_loyalty_welcome', [cli?.nombre || 'Cliente', (cli?.puntos || 0).toString()], qrImageUrl, tel10)
      
      const adminPhone = pendingQR.history[0].admin
      if (adminPhone) await sendWA(adminPhone, `✅ El cliente *${tel10}* aceptó términos. Le envié su QR automáticamente.`)
      await supabase.from('bot_memory').delete().eq('phone', `pending_qr_${tel10}`)
    }
    
    // 3.B Puntos Pendientes
    const { data: pendingPts } = await supabase.from('bot_memory').select('history').eq('phone', `pending_pts_${tel10}`).maybeSingle()
    if (pendingPts?.history?.[0]) {
      console.log(`🔄 [T&C] Ejecutando SUMA DE PUNTOS PENDIENTE para ${tel10}...`)
      const { puntos, admin } = pendingPts.history[0]
      const { data: cli } = await supabase.from('clientes').select('id, nombre, puntos').ilike('telefono', `%${tel10}%`).limit(1).maybeSingle()
      if (cli) {
        const cant = Number(puntos) || 1
        let lastRes: any = null
        let rpcErrTerminos: any = null
        for (let i = 0; i < cant; i++) {
          const { data, error } = await supabase.rpc('fn_registrar_entrega', {
            p_cliente_tel: tel10
          })
          if (error) { rpcErrTerminos = error; break }
          if (data?.ok) lastRes = data
          else break
        }
        if (!lastRes) {
          console.error(`[T&C PUNTOS] RPC falló para ${tel10}:`, rpcErrTerminos?.message)
          if (admin) await sendWA(admin, `⚠️ El cliente *${tel10}* aceptó términos pero no pude sumar los ${puntos} pts pendientes.\nError: ${rpcErrTerminos?.message || 'RPC ok=false'}`)
        } else {
          // El RPC ya actualiza clientes.puntos atómicamente — no hacemos update manual
          await sendWATemplate(`52${tel10}`, 'estrella_puntos_acumulados', [cli.nombre || 'Cliente', puntos.toString(), lastRes.puntos.toString()], undefined, tel10)
          if (admin) await sendWA(admin, `✅ El cliente *${tel10}* aceptó términos. Le sumé los ${puntos} pts pendientes. Total: *${lastRes.puntos} pts*.`)
        }
      }
      await supabase.from('bot_memory').delete().eq('phone', `pending_pts_${tel10}`)
    }
    
    // 4. Notificar al admin principal (siempre, aunque no haya pendientes)
    const { data: cliAcep } = await supabase.from('clientes').select('nombre').ilike('telefono', `%${tel10}%`).limit(1).maybeSingle()
    if (ADMIN_PHONE_MAIN) {
      await sendWA(ADMIN_PHONE_MAIN, `✅ *${cliAcep?.nombre || tel10}* (${tel10}) *aceptó* los términos y condiciones.`)
    }

  } else if (upId === 'RECHAZAR_TERMINOS' || upId === 'RECHAZAR') {
    console.warn(`❌ [T&C] Cliente ${tel10} RECHAZÓ los términos.`)
    await sendWA(fromPhone, "Lamentablemente, para poder usar el sistema de lealtad y beneficios de Estrella Delivery, es necesario aceptar los términos y condiciones. Si cambias de opinión, puedes volver a intentarlo más tarde. ¡Saludos! 👋")
    // Notificar al admin
    if (ADMIN_PHONE_MAIN) {
      const { data: cliRec } = await supabase.from('clientes').select('nombre').ilike('telefono', `%${tel10}%`).limit(1).maybeSingle()
      await sendWA(ADMIN_PHONE_MAIN, `❌ *${cliRec?.nombre || tel10}* (${tel10}) *rechazó* los términos y condiciones.`)
    }
  }

  return new Response('OK', { status: 200 })
}
