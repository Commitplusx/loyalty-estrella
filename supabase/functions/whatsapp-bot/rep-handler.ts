// rep-handler.ts — Lógica del repartidor: botones y mensajes de texto
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWA, sendInteractiveButton, sendInteractiveButtons, sendWATemplate, sendWAImage } from './whatsapp.ts'
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
export async function handleRepButtons(
  supabase: Supa, 
  fromPhone: string, 
  buttonId: string,
  repData?: { nombre: string } | null
): Promise<boolean> {
  const [action, ...rest] = buttonId.split('_')
  if (action !== 'BTN') return false

  const tipo = rest[0]
  const pedidoId = rest.slice(1).join('_')

  // ─── FLUJO DE PEDIDOS DESHABILITADO (LOYALTY ONLY) ───
  /*
    if (tipo === 'ACEPTAR') {
      if (p.estado !== 'asignado') {
        await sendWA(fromPhone, `⚠️ El pedido ya no está disponible (Estado actual: ${p.estado}).`)
        return true
      }
      const { data: updated, error } = await supabase.from('pedidos')
        .update({ estado: 'aceptado' }).eq('id', pedidoId).eq('estado', 'asignado').select()
      if (error || !updated?.length) { await sendWA(fromPhone, `⚠️ Alguien más aceptó el pedido o hubo un error.`); return true }
      invokeAsync(supabase, 'notificar-whatsapp', { pedido_id: pedidoId, tipo: 'aceptacion' })
      const m = `✅ *PEDIDO ACEPTADO*\n\nN°: *${numOrden}*\nCliente: *${p.cliente_nombre || p.cliente_tel}*\n\nVe a recogerlo y marca cuando lo tengas.`
      await sendInteractiveButton(fromPhone, m, `BTN_RECOGER_${pedidoId}`, '↑ Recoger')
    }
    else if (tipo === 'RECOGER') {
      const { data: updated, error } = await supabase.from('pedidos')
        .update({ estado: 'recibido' }).eq('id', pedidoId).eq('estado', 'aceptado').select()
      if (error || !updated?.length) { await sendWA(fromPhone, `⚠️ Error o ya marcado recolectado.`); return true }
      invokeAsync(supabase, 'notificar-whatsapp', { pedido_id: pedidoId, tipo: 'recibido' })
      if (p.cliente_tel) {
        await supabase.rpc('incrementar_entregas_repartidor', {
          p_tel_rep: extract10Digits(fromPhone),
          p_tel_cli: p.cliente_tel
        })
      }
      const dest = p.direccion || 'Sin dirección'
      const m = `🛍️ *PAQUETE EN MANO*\n\nDestino: *${dest}*${mapLink}\n\nMarca cuando inicies el viaje al cliente.`
      await sendInteractiveButton(fromPhone, m, `BTN_ENCAMINO_${pedidoId}`, '↑ En Camino')
    }
    else if (tipo === 'ENCAMINO') {
      const { data: updated, error } = await supabase.from('pedidos')
        .update({ estado: 'en_camino' }).eq('id', pedidoId).in('estado', ['recibido', 'aceptado']).select()
      if (error || !updated?.length) { await sendWA(fromPhone, `⚠️ Error o ya en camino.`); return true }
      invokeAsync(supabase, 'notificar-whatsapp', { pedido_id: pedidoId, tipo: 'en_camino' })
      const m = `🚀 *EN CAMINO AL DESTINO*\n\nConduce con cuidado.\nMarca cuando hayas entregado el paquete.`
      await sendInteractiveButton(fromPhone, m, `BTN_ENTREGADO_${pedidoId}`, '↑ Entregado')
    }
    else if (tipo === 'ENTREGADO') {
      const { data: updated, error } = await supabase.from('pedidos')
        .update({ estado: 'entregado' }).eq('id', pedidoId).eq('estado', 'en_camino').select()
      if (error || !updated?.length) { await sendWA(fromPhone, `⚠️ Error o ya entregado.`); return true }
      invokeAsync(supabase, 'notificar-whatsapp', { pedido_id: pedidoId, tipo: 'entregado' })
      const m = `✅ *ENTREGADO CON ÉXITO*\nN°: *${numOrden}*\n\n¡Gran trabajo, ${nombreRep}! 🌟`
      
      const rateBtns = [
        { id: `RATE_EXC_${p.cliente_tel}`, title: '⭐ Excelente' },
        { id: `RATE_BUE_${p.cliente_tel}`, title: '👍 Bueno' },
        { id: `RATE_PRB_${p.cliente_tel}`, title: '⚠️ Problemático' }
      ]
      await sendInteractiveButtons(fromPhone, m + '\n\n¿Cómo fue tu experiencia entregando a este cliente?', rateBtns)
    }
    */

  try {
    if (tipo === 'CUPON') {
      const codigo = rest.join('_')
      const { data: cupon } = await supabase.from('cupones')
        .update({ estado: 'usado', used_at: new Date().toISOString() })
        .eq('codigo', codigo).eq('estado', 'activo').select().maybeSingle()
      if (cupon) {
        // Limpiar cupon_activo del cliente para que desaparezca de la Web App
        if (cupon.cliente_tel) {
          await supabase.from('clientes')
            .update({ cupon_activo: null })
            .eq('telefono', cupon.cliente_tel)
        }
        await sendWA(fromPhone, `✅ Cupón *${codigo}* marcado como usado. ¡Buen trabajo!`)
        if (ADMIN_PHONE_MAIN) await sendWA(ADMIN_PHONE_MAIN, `🎟️ [OP] Repartidor marcó cupón ${codigo} como usado.`)
      } else {
        await sendWA(fromPhone, `⚠️ Ese cupón ya fue usado o no existe.`)
      }
      return true
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
      `🎟️ */usar CODIGO* — Marcar un cupón de canje como usado\n` +
      `\n─── *Gestión de Clientes* ───\n` +
      `🔍 */info [tel]* — Ver ficha de un cliente\n` +
      `✉️ */qr [tel]* — Enviar tarjeta VIP al cliente\n` +
      `📝 */score [tel]* — Calificar cliente\n` +
      `🏠 */direccion [tel]* — Actualizar dirección\n` +
      `🌟 */noregistrado [tel]* — Registro silencioso\n` +
      `🚨 */sos [mensaje]* — Enviar alerta al admin\n` +
      `\n─── *Lealtad (vía IA)* ───\n` +
      `💬 _"Suma 3 puntos a 9631234567"_\n` +
      `💬 _"Busca al cliente 9631234567"_\n` +
      `💬 _"Carga $50 de saldo a 9631234567"_\n` +
      `💬 _"Registra a Juan López 9631234567"_\n` +
      `\n❓ */help* — Esta ayuda\n\n` +
      `_Usa los botones de pedido para avanzar los estados._`
    )
    return new Response('OK', { status: 200 })
  }

  // ── ─── COMANDOS DE PEDIDOS DESHABILITADOS ───
  /*
  if (trimCmd === '/mis_pedidos') {
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
  */

  // ── /sos [mensaje] — Alerta de emergencia al admin ──
  if (trimCmd.toLowerCase().startsWith('/sos')) {
    const sosMsg = trimCmd.slice(4).trim() || 'Emergencia sin detalles'
    if (ADMIN_PHONE_MAIN) {
      await sendWA(ADMIN_PHONE_MAIN, `🚨 *SOS de ${isRep.nombre}*\n\n${sosMsg}`)
    }
    await sendWA(fromPhone, `✅ Alerta enviada al admin.`)
    return new Response('OK', { status: 200 })
  }

  // ── /usar CODIGO — el repartidor marca un código de canje del cliente como usado ──
  if (trimCmd.toLowerCase().startsWith('/usar ')) {
    const codigo = trimCmd.slice(6).trim().toUpperCase()
    if (!codigo) {
      await sendWA(fromPhone, `⚠️ Formato: */usar CODIGO*\n\nEjemplo: /usar EST-ABC123`)
      return new Response('OK', { status: 200 })
    }

    const { data, error } = await (supabase as any).rpc('usar_cupon', { p_codigo: codigo })

    if (error) {
      await sendWA(fromPhone, `❌ *Error interno:* ${error.message}`)
    } else if (data?.ok) {
      // Notificar al repartidor
      await sendWA(fromPhone,
        `✅ *CUPÓN APLICADO*\n` +
        `🎟️ Código: *${codigo}*\n` +
        `👤 Cliente: ${data.cliente_nombre || 'Desconocido'}\n` +
        `📱 Tel: ${data.cliente_tel || '-'}\n\n` +
        `El cupón ha sido marcado como usado. ¡Gracias!`
      )
      // Notificar al admin también
      if (ADMIN_PHONE_MAIN) {
        await sendWA(ADMIN_PHONE_MAIN,
          `🎟️ *[OP] Cupón Usado*\n` +
          `🛵 Repartidor: *${isRep.nombre}*\n` +
          `🎟️ Código: *${codigo}*\n` +
          `👤 Cliente: ${data.cliente_nombre || 'Desconocido'} (${data.cliente_tel || '-'})`
        )
      }
    } else {
      await sendWA(fromPhone,
        `⚠️ *Cupón no válido:*\n${data?.error || 'No se encontró o ya fue usado.'}\n\n` +
        `Verifica que el código esté bien escrito. Ejemplo: */usar EST-ABC123*`
      )
    }
    return new Response('OK', { status: 200 })
  }

  // ── Flujo IA (para cualquier otro mensaje de texto) ───────────────────────────
  const ai = await conversacionDeepSeek(supabase, fromPhone, msgText, true, isRep)
  const action = ai?.respuesta?.accion
  const d: any = ai?.respuesta?.datosAExtraer || {}

  const { executeAdminAction } = await import('./admin-handler.ts')
  const res = await executeAdminAction(supabase, fromPhone, 'rep_' + Date.now(), ai)

  // Notificación operativa post-ejecución si aplica
  if (action === 'SUMAR_PUNTOS' && d.clienteTel && ADMIN_PHONE_MAIN && from10 !== extract10Digits(ADMIN_PHONE_MAIN)) {
    const { data: c } = await supabase.from('clientes').select('nombre').ilike('telefono', `%${d.clienteTel}%`).limit(1).maybeSingle()
    const cant = Number(d.puntosASumar) || 1
    await sendWA(ADMIN_PHONE_MAIN, `🌟 [OP] *${isRep.nombre}* sumó ${cant} pts a ${c?.nombre || d.clienteTel}.`)
  } else if (action === 'CARGAR_SALDO' && d.clienteTel && ADMIN_PHONE_MAIN && from10 !== extract10Digits(ADMIN_PHONE_MAIN)) {
    const { data: c } = await supabase.from('clientes').select('nombre').ilike('telefono', `%${d.clienteTel}%`).limit(1).maybeSingle()
    const monto = parseFloat(String(d.montoSaldo)) || 0
    await sendWA(ADMIN_PHONE_MAIN, `💲 [OP] *${isRep.nombre}* cargó $${monto} de saldo a ${c?.nombre || d.clienteTel}.`)
  } else if (action === 'RESPONDER') {
    const esOperativo = /problem|error|accidente|no encuentro|cancelar|ayuda|tardare|tarde|demora|perdido|falla/i.test(msgText)
    if (esOperativo && ADMIN_PHONE_MAIN && from10 !== extract10Digits(ADMIN_PHONE_MAIN)) {
      await sendWA(ADMIN_PHONE_MAIN, `⚠️ *[Alerta de ${isRep.nombre}]*:\n${msgText}`)
    }
  }

  return res
}
