import { sendWA, sendInteractiveButtons } from './whatsapp.ts'
import { downloadWhatsAppMedia, uploadToStorage } from './media-handler.ts'

// Usa la misma variable de entorno que index.ts para evitar inconsistencias
function getAdminPhone(): string {
  const env = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''
  return env.split(',')[0]?.trim() || ''
}

export async function handleRestaurantOnboarding(
  supabase: any,
  fromPhone: string,
  from10: string,
  msgType: string,
  msg: any,
  stateObj: any
): Promise<Response> {
  const state = stateObj.state
  const userInput = msgType === 'text' ? (msg.text?.body as string).trim() : ''

  // 1. Preguntar Nombre del Responsable
  if (state === 'REST_REG_RESPONSABLE') {
    if (!userInput) {
      await sendWA(fromPhone, `⚠️ Por favor, escríbenos el nombre de la persona responsable:`)
      return new Response('OK', { status: 200 })
    }
    stateObj.state = 'REST_REG_NOMBRE'
    stateObj.responsable = userInput
    await supabase.from('bot_memory').update({ history: [stateObj], updated_at: new Date().toISOString() }).eq('phone', `reg_rest_${from10}`)
    await sendWA(fromPhone, `Gracias *${userInput}*. Ahora, por favor escribe el *Nombre de tu Restaurante*:`)
    return new Response('OK', { status: 200 })
  }

  // 2. Preguntar Nombre del Restaurante
  if (state === 'REST_REG_NOMBRE') {
    if (!userInput) {
      await sendWA(fromPhone, `⚠️ Por favor, escríbenos el nombre de tu restaurante:`)
      return new Response('OK', { status: 200 })
    }
    stateObj.state = 'REST_REG_UBICACION'
    stateObj.nombreRest = userInput
    await supabase.from('bot_memory').update({ history: [stateObj], updated_at: new Date().toISOString() }).eq('phone', `reg_rest_${from10}`)
    await sendWA(fromPhone, `Perfecto. Por último, ¿cuál es la *Dirección o Colonia* de tu local?\n_(Puedes escribirla o enviarnos tu 📍 ubicación por GPS)_`)
    return new Response('OK', { status: 200 })
  }

  // 3. Recibir Ubicación y Finalizar
  if (state === 'REST_REG_UBICACION') {
    let ubicacion = ''
    if (msgType === 'location') {
      ubicacion = `https://maps.google.com/?q=${msg.location.latitude},${msg.location.longitude}`
    } else if (msgType === 'text' && userInput) {
      ubicacion = userInput
    } else {
      await sendWA(fromPhone, `⚠️ Por favor, envíanos la ubicación o escribe la colonia de tu local:`)
      return new Response('OK', { status: 200 })
    }

    stateObj.state = 'REST_REG_FOTO'
    stateObj.ubicacion = ubicacion
    await supabase.from('bot_memory').update({ history: [stateObj], updated_at: new Date().toISOString() }).eq('phone', `reg_rest_${from10}`)
    
    await sendWA(fromPhone, `📍 Excelente. Por último, envíanos una *Foto de tu logotipo o de tu local* 📸.\n\n_(Es opcional. Si prefieres hacerlo después, simplemente escribe la palabra *omitir*)_`)
    return new Response('OK', { status: 200 })
  }

  // 4. Recibir Foto y Finalizar
  if (state === 'REST_REG_FOTO') {
    let tieneFoto = false
    let fotoUrl = ''

    if (msgType === 'image') {
      tieneFoto = true
      await sendWA(fromPhone, `📸 Guardando foto... por favor espera un momento.`)
      
      const media = await downloadWhatsAppMedia(msg.image.id)
      if (media) {
        const ext = media.mimeType.includes('png') ? 'png' : 'jpg'
        const filePath = `fachadas/${from10}_${Date.now()}.${ext}`
        const url = await uploadToStorage(supabase, 'restaurantes', filePath, media.buffer, media.mimeType)
        if (url) fotoUrl = url
      }

      if (!fotoUrl) {
        await sendWA(fromPhone, `⚠️ Hubo un error procesando tu foto, pero continuaremos con el registro.`)
      }
    } else if (msgType === 'text' && userInput.toLowerCase() === 'omitir') {
      tieneFoto = false
    } else {
      await sendWA(fromPhone, `⚠️ Por favor, envía una imagen o escribe *omitir* para saltar este paso.`)
      return new Response('OK', { status: 200 })
    }

    // Limpiar estado
    await supabase.from('bot_memory').delete().eq('phone', `reg_rest_${from10}`)

    // Enviar confirmación al restaurante
    await sendWA(fromPhone, `✅ ¡Muchas gracias, ${stateObj.responsable}! Tu solicitud ha sido enviada a nuestro equipo de afiliaciones.\n\nTe notificaremos por este medio en cuanto tu perfil comercial esté activo. 🚀`)

    const adminPhone = getAdminPhone()
    console.log(`[RestOnboarding] Notificando admin: ${adminPhone}`)

    let fotoText = tieneFoto ? (fotoUrl ? `Sí ✅ (Adjunta arriba)` : 'Sí ✅ (Error al guardar)') : 'No ❌'

    const adminMsg = `⚠️ *NUEVA SOLICITUD DE RESTAURANTE*\n\n` +
                     `📱 Teléfono: \`${from10}\`\n` +
                     `👤 Responsable: *${stateObj.responsable}*\n` +
                     `🏪 Restaurante: *${stateObj.nombreRest}*\n` +
                     `📍 Ubicación: ${stateObj.ubicacion}\n` +
                     `📸 Foto enviada: ${fotoText}\n\n` +
                     `¿Deseas aprobar esta solicitud?`

    if (adminPhone) {
      // Guardamos la info temporalmente para que los botones sepan de quién es
      await supabase.from('bot_memory').upsert({
        phone: `pending_rest_${from10}`,
        history: [{ 
          responsable: stateObj.responsable, 
          nombreRest: stateObj.nombreRest, 
          tel: from10,
          fotoUrl: fotoUrl
        }],
        updated_at: new Date().toISOString()
      })

      await sendInteractiveButtons(adminPhone, adminMsg, [
        { id: `rest_accept_${from10}`, title: '✅ Aprobar' },
        { id: `rest_reject_${from10}`, title: '❌ Rechazar' }
      ], fotoUrl || undefined)
    } else {
      console.error('[RestOnboarding] ADMIN_PHONES no está configurado — no se pudo notificar al admin.')
    }

    // Opcional: guardarlo en una tabla de prospectos si la tienes, por ahora solo memoria/admin.
    return new Response('OK', { status: 200 })
  }

  return new Response('OK', { status: 200 })
}

// ── Iniciar el flujo de onboarding ────────────────────────────────────────────
export async function startRestaurantOnboarding(supabase: any, fromPhone: string, from10: string): Promise<Response> {
  await supabase.from('bot_memory').upsert({
    phone: `reg_rest_${from10}`,
    history: [{ state: 'REST_REG_RESPONSABLE' }],
    updated_at: new Date().toISOString()
  })

  await sendWA(fromPhone, `¡Excelente! Queremos trabajar contigo. 🤝\n\n*(Hemos detectado automáticamente tu número de teléfono: ${from10})*\n\nPara iniciar tu afiliación, por favor escribe el *Nombre de la persona responsable*:`)
  return new Response('OK', { status: 200 })
}
