import { sendWA, sendInteractiveButton } from './whatsapp.ts'
import { handleAdminGPS, handleAdminMessage } from './admin-handler.ts'
import { handleSlashCommands } from './slash-commands-handler.ts'

export async function handleAdminFlow(
  supabase: any,
  fromPhone: string,
  from10: string,
  admin10: string,
  msgType: string,
  msg: any,
  messageId: string
): Promise<Response | null> {
  // ─── GPS directo del admin (Pedidos Deshabilitados) ───
  /*
  if (msgType === 'location') {
    return await handleAdminGPS(
      supabase, fromPhone, admin10,
      msg.location.latitude, msg.location.longitude,
      msg.location.name ?? msg.location.address ?? '', messageId
    )
  }
  */

  if (msgType !== 'text') return null

  const texto      = msg.text.body as string
  const lowerTexto = texto.toLowerCase()

  // ── Debug rápido de restaurantes ──
  if (lowerTexto === 'debug_restaurantes') {
    const { data } = await supabase.from('restaurantes').select('nombre, telefono, activo').limit(50)
    if (data) await sendWA(fromPhone, `📍 *RESTAURANTES REGISTRADOS:*\n${data.map((r: any) => `- ${r.nombre}: ${r.telefono} [${r.activo ? '✅' : '❌'}]`).join('\n')}`)
    return new Response('OK', { status: 200 })
  }

  // ── Sesión de captura activa (/fachada) ──
  const isAiCommand = lowerTexto.startsWith('actualiza') || lowerTexto.startsWith('califica') ||
                      lowerTexto.startsWith('agrega')    || lowerTexto.startsWith('ponle')

  if (!texto.startsWith('/') && !isAiCommand) {
    const { data: capSesion } = await supabase.from('bot_memory')
      .select('history').eq('phone', `capture_mode_${from10}`).maybeSingle()
    const sesionData = capSesion?.history?.[0]

    // TTL: auto-cerrar si la sesión expiró (2h)
    if (sesionData?.expira && Date.now() > sesionData.expira) {
      await supabase.from('bot_memory').delete().eq('phone', `capture_mode_${from10}`)
      await sendWA(fromPhone, `⏰ La sesión de captura de *${sesionData.clienteNombre}* expiró (2h). Iníciala de nuevo con /fachada si la necesitas.`)
      // Falls through to admin message handler below
    } else if (sesionData?.clienteId) {
      const isMapsLink = texto.includes('maps.app.goo.gl') || texto.includes('maps.google.com') || texto.includes('goo.gl/maps')

      if (isMapsLink) {
        await supabase.from('clientes').update({ direccion: texto.trim() }).eq('id', sesionData.clienteId)
        await sendInteractiveButton(fromPhone, `📍 *Enlace de Maps guardado* para *${sesionData.clienteNombre}*:\n_${texto}_`, 'ACT_CERRAR_SESION', 'Cerrar Sesión')
        return new Response('OK', { status: 200 })
      }

      const { data: cli } = await supabase.from('clientes').select('notas_crm').eq('id', sesionData.clienteId).maybeSingle()
      const notaActual = cli?.notas_crm || ''
      const fecha      = new Date().toLocaleDateString('es-MX')
      const notaNueva  = notaActual ? `${notaActual}\n[${fecha}] 💬 ${texto}` : `[${fecha}] 💬 ${texto}`
      await supabase.from('clientes').update({ notas_crm: notaNueva }).eq('id', sesionData.clienteId)
      await sendInteractiveButton(fromPhone, `📝 Nota guardada para *${sesionData.clienteNombre}*:\n_${texto}_`, 'ACT_CERRAR_SESION', 'Cerrar Sesión')
      return new Response('OK', { status: 200 })
    }
  }

  // ── Estado pendiente de menú interactivo (ACT_MENU_* y ESPERANDO_SALDO_*) ──
  // Se activa cuando el admin elige una opción del menú y el bot le pide el teléfono, o al recargar saldo
  if (!texto.startsWith('/') && !isAiCommand) {
    const { data: actionState } = await supabase.from('bot_memory')
      .select('history').eq('phone', `admin_action_state_${from10}`).maybeSingle()
    const pendingAction = actionState?.history?.[0]?.action

    if (pendingAction) {
      // Flujos de ingreso de saldo (suma o resta)
      if (pendingAction.startsWith('ESPERANDO_SALDO_')) {
        const cliTel = pendingAction.split('_').pop()
        const isSuma = pendingAction.startsWith('ESPERANDO_SALDO_SUMA_')
        const monto = parseFloat(texto.trim().replace('$', '').replace(/,/g, ''))
        
        if (isNaN(monto) || monto <= 0) {
          await sendWA(fromPhone, `⚠️ Por favor escribe una cantidad numérica válida mayor a 0.\nEscribe *cancelar* para volver al menú.`)
          return new Response('OK', { status: 200 })
        }
        
        await supabase.from('bot_memory').delete().eq('phone', `admin_action_state_${from10}`)
        
        const operacion = isSuma ? monto : -monto
        const descLog = isSuma ? 'Recarga manual admin (Menú Interactivo)' : 'Descuento manual admin (Menú Interactivo)'
        const { data: rpcRes, error } = await supabase.rpc('increment_cliente_puntos_v2', { 
          p_tel: cliTel, p_amount: 0, p_saldo_delta: operacion, p_admin_id: null, p_desc: descLog 
        })
        
        if (error) { 
          await sendWA(fromPhone, `❌ Error al actualizar saldo: ${error.message}`)
          return new Response('OK', { status: 200 }) 
        }
        
        const saldoAnterior = isSuma ? (rpcRes?.nuevo_saldo - monto) : (rpcRes?.nuevo_saldo + monto)
        await sendWA(fromPhone, `✅ Saldo de *${rpcRes?.nombre || cliTel}* actualizado.\n\n💰 Saldo Anterior: $${saldoAnterior}\n💳 *Nuevo Saldo: $${rpcRes?.nuevo_saldo}*`)
        
        if (isSuma) {
          try { await sendWA(`52${cliTel}`, `💰 ¡Hola ${rpcRes?.nombre || 'Cliente'}! Se han cargado *$${monto}* a tu Billetera VIP.\n💳 Saldo actual: *$${rpcRes?.nuevo_saldo}*\n\n¡Gracias por ser parte de Estrella Delivery! ⭐️`) } catch (_) { console.error('Error enviando recarga cliente') }
        } else {
          try { await sendWA(`52${cliTel}`, `📉 ¡Hola ${rpcRes?.nombre || 'Cliente'}! Se han descontado *$${monto}* de tu Billetera VIP.\n💳 Saldo restante: *$${rpcRes?.nuevo_saldo}*`) } catch (_) { console.error('Error enviando descuento cliente') }
        }
        return new Response('OK', { status: 200 })
      }

      // Flujos originales de ACT_MENU (pidiendo teléfono)
      const telMatch = texto.trim().replace(/\D/g, '').slice(-10)
      const isTel = telMatch.length === 10

      if (isTel) {
        // Limpiar el estado antes de ejecutar para evitar loops
        await supabase.from('bot_memory').delete().eq('phone', `admin_action_state_${from10}`)

        // Mapear la acción del menú al slash command correspondiente
        const commandMap: Record<string, string> = {
          'ACT_MENU_INFO':    `/info ${telMatch}`,
          'ACT_MENU_QR':      `/qr ${telMatch}`,
          'ACT_MENU_NOREGO':  `/fachada ${telMatch}`,
          'ACT_MENU_LOYALTY': `/loyalty ${telMatch}`,
          'ACT_MENU_SCORE':   `/score ${telMatch}`,
          'ACT_MENU_SUMAR':   `/puntos ${telMatch}`,
          'ACT_MENU_REGALAR': `/saldo_regalar ${telMatch}`,
          'ACT_MENU_REST':    `/rest_clientes ${telMatch}`,
        }

        const slashCmd = commandMap[pendingAction]
        if (slashCmd) {
          // REGALAR desde el menú admin antiguo: usa la misma lógica
          if (pendingAction === 'ACT_MENU_REGALAR') {
            const { data: c } = await supabase.from('clientes').select('nombre').ilike('telefono', `%${telMatch}%`).maybeSingle()
            if (!c) { await sendWA(fromPhone, `❌ Cliente no encontrado.`); return new Response('OK', { status: 200 }) }
            const { error } = await supabase.rpc('increment_cliente_envios_gratis', { p_tel: telMatch, p_amount: 1 })
            if (error) { await sendWA(fromPhone, `❌ Error al regalar envío: ${error.message}`); return new Response('OK', { status: 200 }) }
            await sendWA(fromPhone, `✅ *Envío gratis regalado* a *${c.nombre}* (${telMatch}).`)
            await sendWA(`52${telMatch}`, `🎉 *¡Sorpresa!*\n\nEl equipo de *Estrella Delivery* te acaba de obsequiar un *Envío Gratis*. 🎁\n¡Úsalo cuando quieras con tu próximo pedido! 🚵`)
            return new Response('OK', { status: 200 })
          }

          return await handleSlashCommands(supabase, fromPhone, from10, slashCmd, messageId, true)
        }
      } else {
        // El admin escribió algo que no es un teléfono estando en estado pendiente
        await sendWA(fromPhone, `⚠️ Necesito un número de teléfono a *10 dígitos*.\nEscríbelo o escribe *cancelar* para volver al menú.`)
        return new Response('OK', { status: 200 })
      }
    } else {
      // ── INTERCEPTOR DE NÚMERO DIRECTO PARA MENÚ JERÁRQUICO ──
      // Si no hay acción pendiente, y el texto es un número telefónico (permite +52, etc.)
      const numDigits = texto.replace(/\D/g, '').length
      if (numDigits >= 10 && numDigits <= 15 && texto.length <= 25) {
        const { extract10Digits } = await import('./db.ts')
        const soloNumeros = extract10Digits(texto)
        
        if (soloNumeros && soloNumeros.length === 10) {
          const { sendInteractiveList } = await import('./whatsapp.ts')
          await sendInteractiveList(
            fromPhone,
            `*GESTIÓN DE CLIENTE* ⚙️\n\n¿Qué deseas hacer con el número *${soloNumeros}*?`,
            'Opciones de Gestión',
            [
              {
                title: 'Gestión Principal',
                rows: [
                  { id: `ACT_CLI_INFO_${soloNumeros}`, title: '📋 Ver Perfil', description: 'Ver saldo, puntos y entregas' },
                  { id: `ACT_CLI_QR_${soloNumeros}`, title: '💳 Enviar Tarjeta VIP', description: 'Reenviar código QR' },
                  { id: `ACT_CLI_SESS_${soloNumeros}`, title: '✍️ Abrir Sesión', description: 'Agregar Notas o Foto' },
                ]
              },
              {
                title: 'Finanzas y Beneficios',
                rows: [
                  { id: `ACT_CLI_SUBPTS_${soloNumeros}`, title: '🌟 Puntos y Saldo', description: 'Abonar saldo, puntos o envíos' },
                  { id: `ACT_CLI_SUBPAY_${soloNumeros}`, title: '💸 Aplicar Descuento', description: 'Cobrar saldo VIP o envíos' },
                ]
              },
              {
                title: 'Configuración Avanzada',
                rows: [
                  { id: `ACT_CLI_SUBREP_${soloNumeros}`, title: '🎯 Reputación', description: 'Excelente, Regular, Vetar' },
                  { id: `ACT_CLI_SUBROL_${soloNumeros}`, title: '🛡️ Roles y Estatus', description: 'VIP, Repartidor, etc.' },
                ]
              }
            ]
          )
          return new Response('OK', { status: 200 })
        }
      }
    }
  }

  // ── Cancelar estado pendiente ─────────────────────────────────────────────
  if (texto.toLowerCase() === 'cancelar') {
    const { count } = await supabase.from('bot_memory')
      .select('phone', { count: 'exact', head: true }).eq('phone', `admin_action_state_${from10}`)
    if ((count || 0) > 0) {
      await supabase.from('bot_memory').delete().eq('phone', `admin_action_state_${from10}`)
      await sendWA(fromPhone, `✅ Acción cancelada. Escribe */opciones* para volver al menú.`)
      return new Response('OK', { status: 200 })
    }
  }

  // ── Agente Admin (IA + comandos) ──
  return await handleAdminMessage(supabase, fromPhone, messageId, texto)
}
