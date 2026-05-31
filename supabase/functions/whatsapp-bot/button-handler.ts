import { sendWA, sendInteractiveButtons, sendWADocument } from './whatsapp.ts'
import { handleAdminInteractive } from './slash-commands-handler.ts'
import { handleRepButtons } from './rep-handler.ts'
import { handleCalificacion, handleTerminos, handleAdminCommands } from './admin-handler.ts'
import { startRestaurantOnboarding } from './restaurant-onboarding.ts'

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

  // ── Admin: Estadísticas interactive actions (EST_VER_) ──
  if (esAdmin && buttonId.startsWith('EST_VER_')) {
    const { handleAdminMessage } = await import('./admin-handler.ts')
    if (buttonId === 'EST_VER_VIPS') await handleAdminMessage(supabase, fromPhone, 'VER_VIPS', null)
    else if (buttonId === 'EST_VER_REST') await handleAdminMessage(supabase, fromPhone, 'VER_RESTAURANTES', null)
    else if (buttonId === 'EST_VER_REPS') await handleAdminMessage(supabase, fromPhone, 'VER_REPARTIDORES', null)
    return new Response('OK', { status: 200 })
  }

  // ── Registro: confirmación SI/NO ──
  if (buttonId.toUpperCase().startsWith('REG_CONFIRM_')) {
    const esSi = buttonId.toUpperCase().startsWith('REG_CONFIRM_SI_')
    const SUPABASE_PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
    const { data: regData } = await supabase.from('bot_memory')
      .select('history').eq('phone', `reg_state_${from10}`).maybeSingle()
    const regState = regData?.history?.[0] ?? { tel: from10, step: 3 }

    fetch(`${SUPABASE_PROJECT_URL}/functions/v1/whatsapp-ai`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromPhone, from10, texto: esSi ? 'sí' : 'no',
        isRepartidor: false, repartidorInfo: null, isClient: true, clienteCtx: null, regState })
    }).catch(err => console.error('Error REG_CONFIRM:', err))
    return new Response('OK', { status: 200 })
  }

  // ── Embudo inicial: elección de tipo de usuario ──
  if (buttonId === 'REG_TIPO_CLIENTE') {
    const SUPABASE_PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
    fetch(`${SUPABASE_PROJECT_URL}/functions/v1/whatsapp-ai`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromPhone, from10, texto: 'hola',
        isRepartidor: false, repartidorInfo: null, isClient: false, clienteCtx: null,
        regState: { tel: from10, step: 0 } })
    }).catch(err => console.error('Error REG_TIPO_CLIENTE:', err))
    return new Response('OK', { status: 200 })
  }

  if (buttonId === 'REG_TIPO_RESTAURANTE') {
    await startRestaurantOnboarding(supabase, fromPhone, from10)
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

      const { error: insertErr } = await supabase.from('clientes').upsert({
        telefono: clientTel, nombre: regInfo.nombre,
        direccion: regInfo.colonia ? `${regInfo.colonia}, ${regInfo.direccion || ''}`.trim() : (regInfo.direccion || null),
        lat_frecuente: regInfo.lat || null, lng_frecuente: regInfo.lng || null,
        puntos: 0, es_vip: false, acepta_terminos: false,
        qr_code: qrCode, created_at: new Date().toISOString()
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
        await sendWA(fromPhone, `✅ *Cliente Registrado: ${regInfo.nombre}* (${clientTel})\n\n📋 T&C enviados. ⏳ Cuando acepte, recibirá su QR automáticamente.`)
      }
      return new Response('OK', { status: 200 })
    } else {
      await supabase.from('bot_memory').delete().eq('phone', `pending_reg_${clientTel}`)
      await sendWA(`52${clientTel}`, `Lo sentimos 🙏 Tu solicitud no pudo ser aprobada.\nSi crees que es un error, contáctanos directamente.`)
      await sendWA(fromPhone, `❌ Solicitud de *${regInfo?.nombre || clientTel}* rechazada. El cliente fue notificado.`)
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

      const { error } = await supabase.from('restaurantes').insert({
        telefono: restTel,
        nombre: restInfo.nombreRest,
        programa_lealtad_activo: true,
        activo: true
      })

      if (error) {
        if (error.code === '23505') await sendWA(fromPhone, `⚠️ El restaurante con teléfono ${restTel} ya existe en el sistema.`)
        else await sendWA(fromPhone, `❌ Error al guardar el restaurante: ${error.message}`)
        return new Response('OK', { status: 200 })
      }

      await supabase.from('bot_memory').delete().eq('phone', `pending_rest_${restTel}`)
      
      await sendWA(fromPhone, `✅ Restaurante *${restInfo.nombreRest}* aprobado y registrado en el sistema.`)
      await sendWA(`52${restTel}`, `🎉 *¡Felicidades, ${restInfo.responsable}!*\n\nTu restaurante ha sido aprobado por la administración. Ya eres parte oficial de Estrella Delivery.\n\nEnvía la palabra *Hola* o *Menú* para abrir tu Portal de Aliados B2B.`)
      
      // Enviar documento (Sube tu PDF a Supabase Storage y pon el link aquí)
      const pdfUrl = "https://jdrrkpvodnqoljycixbg.supabase.co/storage/v1/object/public/restaurantes/pdf-restaurantes/pdf-restaurante.pdf" 
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

  // ── Términos y Condiciones ──
  const upId = buttonId.toUpperCase()
  if (upId === 'ACEPTAR_TERMINOS' || upId === 'RECHAZAR_TERMINOS' || upId === 'ACEPTAR' || upId === 'RECHAZAR') {
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
