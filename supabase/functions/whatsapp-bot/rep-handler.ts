// rep-handler.ts — Lógica del repartidor: botones y mensajes de texto
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWA, sendInteractiveButton, sendInteractiveButtons, sendWATemplate } from './whatsapp.ts'
import { extract10Digits, guardarMemoria } from './db.ts'
import { generarNumeroOrden } from '../_shared/utils.ts'
import { conversacionDeepSeek } from './ai.ts'

type Supa = ReturnType<typeof createClient>
const ADMIN_PHONES_ENV = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''
const _adminMain10 = ADMIN_PHONES_ENV.split(',').map((s: string) => extract10Digits(s)).filter(Boolean)[0] ?? ''
const ADMIN_PHONE_MAIN = _adminMain10 ? `52${_adminMain10}` : ''

// Invoca una función en segundo plano para no hacer esperar al repartidor.
// Las notificaciones al cliente son importantes pero la rapidez para el repartidor es prioridad.
function invokeAsync(supabase: Supa, fn: string, body: object): void {
  supabase.functions.invoke(fn, { body })
    .catch((e: any) => console.error(`[ASYNC INVOKE] ${fn}:`, e?.message))
}



// ── Botones ciclo de vida del pedido ─────────────────────────────────────────
export async function handleRepButtons(supabase: Supa, fromPhone: string, buttonId: string): Promise<boolean> {
  const [action, ...rest] = buttonId.split('_')
  if (action !== 'BTN') return false

  const tipo = rest[0]
  const pedidoId = rest.slice(1).join('_')

  try {
    if (tipo === 'CUPON') {
      const codigo = rest.join('_')
      const { data: cupon } = await supabase.from('cupones')
        .update({ estado: 'usado', used_at: new Date().toISOString() })
        .eq('codigo', codigo).eq('estado', 'activo').select().maybeSingle()
      if (cupon) {
        await sendWA(fromPhone, `✅ Cupón *${codigo}* marcado como usado. ¡Buen trabajo!`)
        if (ADMIN_PHONE_MAIN) await sendWA(ADMIN_PHONE_MAIN, `🎟️ [OP] Repartidor marcó cupón ${codigo} como usado.`)
      } else {
        await sendWA(fromPhone, `⚠️ Ese cupón ya fue usado o no existe.`)
      }
      return true
    }

    const { data: p } = await supabase.from('pedidos').select('*').eq('id', pedidoId).maybeSingle()
    if (!p) {
      await sendWA(fromPhone, '❌ Este pedido no se encontró en la central.')
      return true
    }
    const mapLink = p.lat ? `\n📍 GPS: https://maps.google.com/?q=${p.lat},${p.lng}` : ''

    const numOrden = generarNumeroOrden(pedidoId)
    const { data: repInfo } = await supabase.from('repartidores')
      .select('nombre').ilike('telefono', `%${extract10Digits(fromPhone)}%`).limit(1).maybeSingle()
    const nombreRep = repInfo?.nombre || 'Repartidor'

    if (tipo === 'ACEPTAR') {
      if (p.estado !== 'asignado') {
        await sendWA(fromPhone, '⚠️ Ya has aceptado o avanzado este pedido previamente.')
        return true
      }
      // Actualizar estado a 'aceptado' para reflejar que el repartidor confirmó
      await supabase.from('pedidos').update({ estado: 'aceptado' }).eq('id', pedidoId).eq('estado', 'asignado')
      const text = `📋 *Detalle del Pedido*\n\n📦 ${p.descripcion}\n` +
        (p.cliente_nombre ? `👤 ${p.cliente_nombre}\n` : '') +
        (p.cliente_tel    ? `📞 ${p.cliente_tel}\n` : '') +
        (p.restaurante    ? `🍽️ Origen: ${p.restaurante}\n` : '') +
        (p.direccion      ? `🏠 Ref: ${p.direccion}` : '') + mapLink
      await sendInteractiveButton(fromPhone, text, `BTN_RECOGER_${pedidoId}`, 'Recoger Pedido')
      invokeAsync(supabase, 'notificar-whatsapp', { pedido_id: pedidoId, tipo: 'aceptado' })
      if (ADMIN_PHONE_MAIN) await sendWA(ADMIN_PHONE_MAIN,
        `🟢 *[OPERACIÓN] Pedido Aceptado*\n🛵 *Repartidor:* ${nombreRep}\n🔢 *Orden:* ${numOrden}\n👤 *Cliente:* ${p.cliente_nombre || 'Desconocido'}\n📦 *Detalle:* ${p.descripcion}`)
    }
    else if (tipo === 'RECOGER') {
      const { data: updated, error } = await supabase.from('pedidos')
        .update({ estado: 'recibido' }).eq('id', pedidoId).in('estado', ['aceptado', 'asignado', 'pendiente']).select()
      if (error || !updated?.length) { await sendWA(fromPhone, `⚠️ Error o ya marcado recolectado.`); return true }
      invokeAsync(supabase, 'notificar-whatsapp', { pedido_id: pedidoId, tipo: 'recibido' })
      if (p.cliente_tel) {
        const telExtraido = extract10Digits(p.cliente_tel)
        if (telExtraido.length === 10) {
          const { data: cupon } = await supabase.from('cupones').select('*')
            .eq('cliente_tel', telExtraido).eq('estado', 'activo').limit(1).maybeSingle()
          if (cupon) {
            await sendInteractiveButton(fromPhone,
              `🎟️ El cliente tiene un cupón activo ($${cupon.valor_pesos} pesos). ¿Lo descontaste de la cuenta?`,
              `BTN_CUPON_${cupon.codigo}`, '✅ Cupón aplicado')
          }
        }
      }
      if (ADMIN_PHONE_MAIN) await sendWA(ADMIN_PHONE_MAIN,
        `🛍️ *[OPERACIÓN] Pedido en Manos*\n🛵 *Repartidor:* ${nombreRep} ya recogió el pedido.\n🔢 *Orden:* ${numOrden}\n👤 *Cliente:* ${p.cliente_nombre || 'Desconocido'}`)
      await sendInteractiveButton(fromPhone, `🏍️ Pedido marcado como *Recibido*. ¡Sal con cuidado!`,
        `BTN_ENCAMINO_${pedidoId}`, 'En Camino')
    }
    else if (tipo === 'ENCAMINO') {
      const { data: updated, error } = await supabase.from('pedidos')
        .update({ estado: 'en_camino' }).eq('id', pedidoId).eq('estado', 'recibido').select()
      if (error || !updated?.length) { await sendWA(fromPhone, `⚠️ Error o ya marcado en camino.`); return true }
      invokeAsync(supabase, 'notificar-whatsapp', { pedido_id: pedidoId, tipo: 'en_camino' })
      if (ADMIN_PHONE_MAIN) await sendWA(ADMIN_PHONE_MAIN,
        `🚀 *[OPERACIÓN] Repartidor en Camino*\n🛵 *Repartidor:* ${nombreRep} va hacia el domicilio.\n🔢 *Orden:* ${numOrden}\n👤 *Cliente:* ${p.cliente_nombre || 'Desconocido'}`)
      await sendInteractiveButton(fromPhone, `🚀 El cliente ya sabe que vas en camino.`,
        `BTN_ENTREGADO_${pedidoId}`, 'Entregado')
    }
    else if (tipo === 'ENTREGADO') {
      const { data: updated, error } = await supabase.from('pedidos')
        .update({ estado: 'entregado' }).eq('id', pedidoId).eq('estado', 'en_camino').select()
      if (error || !updated?.length) { await sendWA(fromPhone, `⚠️ Error o ya entregado.`); return true }
      invokeAsync(supabase, 'notificar-whatsapp', { pedido_id: pedidoId, tipo: 'entregado' })
      
      if (ADMIN_PHONE_MAIN) await sendWA(ADMIN_PHONE_MAIN, 
        `✅ *[OPERACIÓN] Orden Entregada*\n🛵 *Repartidor:* ${nombreRep} ha finalizado el servicio.\n🔢 *Orden:* ${numOrden}\n👤 *Cliente:* ${p.cliente_nombre || 'Desconocido'}`)
      
      await sendWA(fromPhone, `✅ ¡Excelente trabajo! El pedido ha sido entregado. Quedas libre. 🌟`)
      
      // Pedimos al repartidor que califique su experiencia con el cliente (UX post-entrega).
      if (p.cliente_tel) {
        const tel10 = extract10Digits(p.cliente_tel)
        if (tel10.length === 10) {
          await sendInteractiveButtons(fromPhone,
            `📦 Orden ${numOrden} entregada a *${p.cliente_nombre || tel10}*.\n¿Cómo fue tu experiencia con este cliente?`,
            [
              { id: `RATE_EXC_${tel10}`, title: '⭐ Excelente' },
              { id: `RATE_BUE_${tel10}`, title: '👍 Bueno' },
              { id: `RATE_PRB_${tel10}`, title: '⚠️ Problemático' },
            ]
          )
        }
      }
    }
  } catch (err) {
    console.error('[REP HANDLER] Button Error:', err)
    try {
      await sendWA(fromPhone, `⚠️ Ocurrió un error procesando esa acción. Por favor intenta de nuevo o contacta al administrador.`)
    } catch (_) { /* silencioso si WA también falla */ }
  }
  return true
}

// ── Mensajes de texto del repartidor ─────────────────────────────────────────
export async function handleRepMessage(
  supabase: Supa,
  fromPhone: string,
  from10: string,
  msgText: string,
  isRep: { id: string; nombre: string; alias: string },
): Promise<Response> {

  // ── Slash Commands (respuesta instantánea, sin costo de IA) ──────────────────
  const trimCmd = msgText.trim()

  if (trimCmd === '/help' || trimCmd === '/ayuda') {
    await sendWA(fromPhone,
      `🛵 *COMANDOS RÁPIDOS — Estrella Delivery*\n\n` +
      `📋 */mis_pedidos* — Ver tus pedidos activos ahora\n` +
      `🟢 */libre* — Avisar al admin que quedas disponible\n` +
      `❓ */help* — Esta ayuda\n\n` +
      `_Usa los botones de pedido para avanzar los estados._`
    )
    return new Response('OK', { status: 200 })
  }

  if (trimCmd === '/mis_pedidos') {
    const { data: repData } = await supabase.from('repartidores')
      .select('id, user_id, nombre').ilike('telefono', `%${from10}%`).limit(1).maybeSingle()
    if (repData?.user_id) {
      const { data: activos } = await supabase.from('pedidos')
        .select('id, descripcion, estado, cliente_nombre, cliente_tel, direccion')
        .eq('repartidor_id', repData.user_id)
        .in('estado', ['asignado', 'recibido', 'en_camino'])
        .order('created_at', { ascending: true })
        .limit(10)
      if (!activos?.length) {
        await sendWA(fromPhone, `✅ *${repData.nombre}*, no tienes pedidos activos ahora. ¡Quedas libre!`)
      } else {
        const icons: Record<string, string> = { asignado: '🕘', recibido: '🛍️', en_camino: '🚀' }
        let msg = `📋 *TUS PEDIDOS ACTIVOS (${activos.length})*\n\n`
        activos.forEach((p: any, i: number) => {
          msg += `${i + 1}️⃣ ${icons[p.estado] || '📦'} *${p.estado.toUpperCase()}*\n`
          msg += `   📦 ${(p.descripcion || 'Sin descripción').slice(0, 40)}\n`
          if (p.cliente_nombre) msg += `   👤 ${p.cliente_nombre}\n`
          if (p.cliente_tel)   msg += `   📞 ${p.cliente_tel}\n`
          if (p.direccion)     msg += `   📍 ${p.direccion.slice(0, 50)}\n`
          msg += '\n'
        })
        await sendWA(fromPhone, msg.trimEnd())
      }
    } else {
      await sendWA(fromPhone, '❌ No encontré tus datos de repartidor. Contacta al admin.')
    }
    return new Response('OK', { status: 200 })
  }

  if (trimCmd === '/libre') {
    if (ADMIN_PHONE_MAIN) {
      await sendWA(ADMIN_PHONE_MAIN, `🟢 *${isRep.nombre}* está libre y disponible para el próximo pedido.`)
    }
    await sendWA(fromPhone, `✅ Le avisé al admin que quedas libre. ¡Espera el próximo pedido!`)
    return new Response('OK', { status: 200 })
  }

  // ── Flujo IA (para cualquier otro mensaje de texto) ───────────────────────────
  const ai = await conversacionDeepSeek(supabase, fromPhone, msgText, true, isRep)
  const accion = ai?.respuesta?.accion || 'RESPONDER'
  const usrMsg = ai?.respuesta?.mensajeUsuario || 'No entendí el mensaje.'
  const d: any  = ai?.respuesta?.datosAExtraer || {}

  if (accion === 'ESTADO_REPARTIDOR') {
    const { data: rep } = await supabase.from('repartidores')
      .select('id, user_id, nombre').ilike('telefono', `%${from10}%`).limit(1).maybeSingle()
    if (rep?.user_id) {
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
      const { data: peds } = await supabase.from('pedidos').select('estado')
        .eq('repartidor_id', rep.user_id).gte('created_at', hoy.toISOString())
      const e = peds?.filter((p: any) => p.estado === 'entregado').length || 0
      const pend = peds?.filter((p: any) => !['entregado','cancelado'].includes(p.estado)).length || 0
      await sendWA(fromPhone, `${usrMsg}\n\n🏍️ *${rep.nombre}*\n✅ Entregados hoy: *${e}*\n⏳ Pendientes: *${pend}*`)
    } else {
      await sendWA(fromPhone, `${usrMsg}\n\n❌ No encontré tus datos de staff.`)
    }
  } else if (accion === 'BUSCAR_CLIENTE' && d.clienteTel) {
    const { data: c } = await supabase.from('clientes').select('nombre, puntos, es_vip, notas_crm')
      .ilike('telefono', `%${d.clienteTel}%`).limit(1).maybeSingle()
    await sendWA(fromPhone, c
      ? `${usrMsg}\n\n🔍 *${c.nombre}* — ${c.puntos} pts — VIP: ${c.es_vip ? 'Sí ⭐' : 'No'}\n${c.notas_crm || ''}`
      : `${usrMsg}\n\n❌ Cliente no registrado.`)
  } else if (accion === 'SUMAR_PUNTOS' && d.clienteTel) {
    const { data: c } = await supabase.from('clientes').select('id, nombre, puntos')
      .ilike('telefono', `%${d.clienteTel}%`).limit(1).maybeSingle()
    if (c) {
      const cant = Number(d.puntosASumar) || 1
      let lastRes: any = null
      let rpcErr: any = null
      for (let i = 0; i < cant; i++) {
        const { data, error } = await supabase.rpc('fn_registrar_entrega', {
          p_cliente_tel: d.clienteTel
        })
        if (error) { rpcErr = error; break }
        if (data?.ok) lastRes = data
      }
      if (!lastRes) {
        await sendWA(fromPhone, `❌ No pude sumar los puntos. Error: ${rpcErr?.message || 'RPC falló'}`)
        await guardarMemoria(supabase, from10, ai?.nuevoHistorial || [])
        return new Response('OK', { status: 200 })
      }
      // El procedimiento fn_registrar_entrega actualiza los puntos de forma atómica en la DB.
      // Sincronizar hacia Chatwoot inmediatamente
      try {
        const { updateChatwootProfile } = await import('./chatwoot-sync.ts')
        await updateChatwootProfile(supabase, d.clienteTel)
      } catch (e) {
        console.error('[CW Sync] Error post-sumar rep:', e)
      }

      await sendWA(fromPhone, `✅ *${cant} pts* sumados a ${c.nombre || d.clienteTel}. Total: *${lastRes.puntos} pts*.`)
      await sendWATemplate(`52${d.clienteTel}`, 'estrella_puntos_acumulados', [c.nombre || 'Cliente', cant.toString(), lastRes.puntos.toString()], undefined, d.clienteTel)
      if (ADMIN_PHONE_MAIN && from10 !== extract10Digits(ADMIN_PHONE_MAIN)) {
        await sendWA(ADMIN_PHONE_MAIN, `🌟 [OP] *${isRep.nombre}* sumó ${cant} pts a ${c.nombre || d.clienteTel}.`)
      }
    } else {
      await sendWA(fromPhone, `❌ No encontré ese cliente. Pídele que se registre primero.`)
    }
  } else {
    await sendWA(fromPhone, usrMsg)
    const esOperativo = /problem|error|accidente|no encuentro|cancelar|ayuda|tardare|tarde|demora|perdido|falla/i.test(msgText)
    if (esOperativo && ADMIN_PHONE_MAIN && from10 !== extract10Digits(ADMIN_PHONE_MAIN)) {
      await sendWA(ADMIN_PHONE_MAIN, `⚠️ *[Alerta de ${isRep.nombre}]*:\n${msgText}`)
    }
  }

  await guardarMemoria(supabase, from10, ai?.nuevoHistorial || [])
  return new Response('OK', { status: 200 })
}
