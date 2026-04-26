// rep-handler.ts — Lógica del repartidor: botones y mensajes de texto
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWA, sendInteractiveButton } from './whatsapp.ts'
import { extract10Digits, guardarMemoria } from './db.ts'
import { conversacionDeepSeek } from './ai.ts'

type Supa = ReturnType<typeof createClient>
const ADMIN_PHONES_ENV = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''
const ADMIN_PHONE_MAIN = ADMIN_PHONES_ENV.split(',').map((s: string) => extract10Digits(s)).filter(Boolean)[0] ? `52${ADMIN_PHONES_ENV.split(',').map((s: string) => extract10Digits(s)).filter(Boolean)[0]}` : ''

// ── Botones ciclo de vida del pedido ─────────────────────────────────────────
export async function handleRepButtons(supabase: Supa, fromPhone: string, buttonId: string): Promise<boolean> {
  const [action, ...rest] = buttonId.split('_')
  if (action !== 'BTN') return false

  const tipo = rest[0]
  const pedidoId = rest.slice(1).join('_')

  try {
    if (tipo === 'CUPON') {
      const codigo = rest.join('_')
      const { data: cupon, error } = await supabase.from('cupones').update({ estado: 'usado', used_at: new Date().toISOString() }).eq('codigo', codigo).eq('estado', 'activo').select().maybeSingle()
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

    if (tipo === 'ACEPTAR') {
      if (p.estado !== 'asignado' && p.estado !== 'recibido') {
        await sendWA(fromPhone, '⚠️ Ya has aceptado o avanzado este pedido previamente.')
        return true
      }
      const text = `📋 *Detalle del Pedido*\n\n📦 ${p.descripcion}\n` +
        (p.cliente_nombre ? `👤 ${p.cliente_nombre}\n` : '') +
        (p.cliente_tel    ? `📞 ${p.cliente_tel}\n` : '') +
        (p.restaurante    ? `🍽️ Origen: ${p.restaurante}\n` : '') +
        (p.direccion      ? `🏠 Ref: ${p.direccion}` : '') + mapLink
      await sendInteractiveButton(fromPhone, text, `BTN_RECOGER_${pedidoId}`, 'Recoger Pedido')
      
      // Notificación centralizada al cliente vía plantilla (tipo 'aceptado')
      await supabase.functions.invoke('notificar-whatsapp', { body: { pedido_id: pedidoId, tipo: 'aceptado' } })

      if (ADMIN_PHONE_MAIN) await sendWA(ADMIN_PHONE_MAIN,
        `👁️ [OP] Repartidor aceptó orden de *${p.cliente_nombre || 'cliente'}* (${p.descripcion}).`)
    }
    else if (tipo === 'RECOGER') {
      const { data: updated, error } = await supabase.from('pedidos').update({ estado: 'recibido' }).eq('id', pedidoId).in('estado', ['asignado', 'pendiente']).select()
      if (error || !updated?.length) { await sendWA(fromPhone, `⚠️ Error o ya marcado recolectado.`); return true }
      
      // Notificación centralizada al cliente vía plantilla (tipo 'recibido')
      await supabase.functions.invoke('notificar-whatsapp', { body: { pedido_id: pedidoId, tipo: 'recibido' } })

      if (p.cliente_tel) {
        const telExtraido = extract10Digits(p.cliente_tel)
        if (telExtraido.length === 10) {
          const { data: cupon } = await supabase.from('cupones').select('*').eq('cliente_tel', telExtraido).eq('estado', 'activo').limit(1).maybeSingle()
          if (cupon) {
            await sendInteractiveButton(fromPhone, `🎟️ El cliente tiene un cupón activo ($${cupon.valor_pesos} pesos). ¿Lo descontaste de la cuenta?`, `BTN_CUPON_${cupon.codigo}`, '✅ Cupón aplicado')
          }
        }
      }

      if (ADMIN_PHONE_MAIN) await sendWA(ADMIN_PHONE_MAIN,
        `👁️ [OP] Repartidor tiene en manos el pedido de *${p.cliente_nombre || 'cliente'}*.`)
      await sendInteractiveButton(fromPhone, `🏍️ Pedido marcado como *Recibido*. ¡Sal con cuidado!`,
        `BTN_ENCAMINO_${pedidoId}`, 'En Camino')
    }
    else if (tipo === 'ENCAMINO') {
      const { data: updated, error } = await supabase.from('pedidos').update({ estado: 'en_camino' }).eq('id', pedidoId).eq('estado', 'recibido').select()
      if (error || !updated?.length) { await sendWA(fromPhone, `⚠️ Error o ya marcado en camino.`); return true }
      await supabase.functions.invoke('notificar-whatsapp', { body: { pedido_id: pedidoId, tipo: 'en_camino' } })
      if (ADMIN_PHONE_MAIN) await sendWA(ADMIN_PHONE_MAIN,
        `👁️ [OP] Repartidor va en camino a *${p.cliente_nombre || 'cliente'}*.`)
      await sendInteractiveButton(fromPhone, `🚀 El cliente ya sabe que vas en camino.`,
        `BTN_ENTREGADO_${pedidoId}`, 'Entregado')
    }
    else if (tipo === 'ENTREGADO') {
      const { data: updated, error } = await supabase.from('pedidos').update({ estado: 'entregado' }).eq('id', pedidoId).eq('estado', 'en_camino').select()
      if (error || !updated?.length) { await sendWA(fromPhone, `⚠️ Error o ya entregado.`); return true }
      await supabase.functions.invoke('notificar-whatsapp', { body: { pedido_id: pedidoId, tipo: 'entregado' } })
      if (ADMIN_PHONE_MAIN) await sendWA(ADMIN_PHONE_MAIN,
        `✅ [OP] Orden entregada exitosamente.`)
      await sendWA(fromPhone, `✅ ¡Excelente trabajo! El pedido ha sido entregado. Quedas libre. 🌟`)
    }
  } catch (err) {
    console.error('[REP HANDLER] Button Error:', err)
    // BUG FIX #5: Notificar al repartidor en lugar de quedar en silencio
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
  const ai = await conversacionDeepSeek(supabase, fromPhone, msgText, true, isRep)
  const accion = ai?.respuesta?.accion || 'RESPONDER'
  const usrMsg = ai?.respuesta?.mensajeUsuario || 'No entendí el mensaje.'
  const d: any  = ai?.respuesta?.datosAExtraer || {}

  if (accion === 'ESTADO_REPARTIDOR') {
    // BUG FIX #6: seleccionar id y user_id correctamente
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
  } else if (accion === 'SUMAR_PUNTOS' && d.clienteTel && d.puntosASumar) {
    const { data: c } = await supabase.from('clientes').select('id, puntos')
      .ilike('telefono', `%${d.clienteTel}%`).limit(1).maybeSingle()
    if (c) {
      const cant = Number(d.puntosASumar) || 1
      let lastRes: any = null
      for (let i = 0; i < cant; i++) {
        // BUG FIX #3: Pasar from10 como p_admin_id para auditoría (quién sumó los puntos)
        const { data, error } = await supabase.rpc('fn_registrar_entrega', {
          p_cliente_tel: d.clienteTel,
          p_admin_id: from10,
          p_descripcion: `Repartidor ${isRep.nombre}`
        })
        if (!error && data?.ok) lastRes = data
      }
      const nuevo = lastRes ? lastRes.puntos : ((c.puntos || 0) + cant)
      await sendWA(fromPhone, `✅ *${d.puntosASumar} pts* sumados. Total: *${nuevo}* pts.`)
      // Notificar al admin solo si sumó puntos (acción significativa)
      if (ADMIN_PHONE_MAIN && from10 !== extract10Digits(ADMIN_PHONE_MAIN)) {
        await sendWA(ADMIN_PHONE_MAIN, `🌟 [OP] *${isRep.nombre}* sumó ${d.puntosASumar} pts al cliente ${d.clienteTel}.`)
      }
    } else {
      await sendWA(fromPhone, `❌ No encontré ese cliente. Pídele que use la Web App primero.`)
    }
  } else {
    await sendWA(fromPhone, usrMsg)
    // BUG FIX #1: Solo notificar al admin si el repartidor reporta algo operativo
    // (no reenviar mensajes casuales como "ok", "ya voy", "sale", etc.)
    const esOperativo = /problem|error|accidente|no encuentro|cancelar|ayuda|tardare|tarde|demora|perdido|falla/i.test(msgText)
    if (esOperativo && ADMIN_PHONE_MAIN && from10 !== extract10Digits(ADMIN_PHONE_MAIN)) {
      await sendWA(ADMIN_PHONE_MAIN, `⚠️ *[Alerta de ${isRep.nombre}]*:\n${msgText}`)
    }
  }

  await guardarMemoria(supabase, from10, ai?.nuevoHistorial || [])
  return new Response('OK', { status: 200 })
}
