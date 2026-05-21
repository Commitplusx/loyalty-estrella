import { sendWA, sendWAImage } from './whatsapp.ts'
import { extract10Digits } from './db.ts'

// Límites de seguridad para evitar abuso
const MAX_PUNTOS_POR_ACCION = 10   // un restaurante no puede dar más de 10 puntos de golpe
const MAX_REGALOS_POR_DIA = 5       // límite de envíos gratis por restaurante por día

// ── Auditoría B2B (nunca bloquea el flujo principal) ────────────────────────
async function _log(
  supabase: any,
  restauranteId: string,
  clienteTel: string,
  accion: 'afiliar' | 'regalar_envio' | 'sumar_puntos',
  valor: number,
  descripcion: string
): Promise<void> {
  try {
    await supabase.from('restaurante_loyalty_log').insert({
      restaurante_id: restauranteId,
      cliente_tel: clienteTel,
      accion,
      valor,
      descripcion
    })

    // Contadores atómicos en la tabla restaurantes
    const columnMap: Record<string, string> = {
      afiliar: 'clientes_afiliados_count',
      regalar_envio: 'envios_gratis_patrocinados',
      sumar_puntos: 'puntos_otorgados_total'
    }
    await supabase.rpc('increment_restaurante_counter', {
      p_id: restauranteId,
      p_column: columnMap[accion],
      p_amount: valor
    })
  } catch (e) {
    // El log nunca debe tumbar el flujo principal
    console.error('[RestaurantLog] Error al guardar auditoría:', e)
  }
}

// ── Verificar cuántos regalos hizo el restaurante hoy (anti-abuso) ──────────
async function _regalosHoy(supabase: any, restauranteId: string): Promise<number> {
  try {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('restaurante_loyalty_log')
      .select('id', { count: 'exact', head: true })
      .eq('restaurante_id', restauranteId)
      .eq('accion', 'regalar_envio')
      .gte('created_at', hoy.toISOString())
    return count || 0
  } catch {
    return 0
  }
}

// ── Verificar si el restaurante tiene acceso al programa ────────────────────
async function _verificarAcceso(
  supabase: any,
  restauranteId: string
): Promise<{ permitido: boolean; nombre: string }> {
  const { data } = await supabase
    .from('restaurantes')
    .select('nombre, programa_lealtad_activo')
    .eq('id', restauranteId)
    .maybeSingle()

  return {
    permitido: data?.programa_lealtad_activo === true,
    nombre: data?.nombre || 'Restaurante'
  }
}

// ── Handler principal ────────────────────────────────────────────────────────
export async function handleRestaurantCommand(
  supabase: any,
  fromPhone: string,
  restauranteId: string,
  texto: string
): Promise<Response | null> {
  const cmdLine = texto.trim().toLowerCase()

  // GUARDIA: Solo restaurantes aprobados con el programa activo
  const { permitido, nombre: nombreRest } = await _verificarAcceso(supabase, restauranteId)

  if (!permitido && cmdLine !== '/ayuda' && cmdLine !== '/help') {
    await sendWA(fromPhone, `🔒 Tu restaurante aún no tiene activo el programa de lealtad.\n\nContacta al equipo de *Estrella Delivery* para activarlo. Una vez activo, podrás afiliar clientes, regalar envíos y sumar puntos directamente desde aquí. 🌟`)
    return new Response('OK', { status: 200 })
  }

  // ── /info ────────────────────────────────────────────────────────────────
  if (cmdLine.startsWith('/info ')) {
    const tel10 = extract10Digits(texto.slice(6).trim())
    if (!tel10 || tel10.length !== 10) {
      await sendWA(fromPhone, `⚠️ Formato incorrecto. Usa: */info 9631234567*`)
      return new Response('OK', { status: 200 })
    }

    const { data: c } = await supabase.from('clientes')
      .select('nombre, puntos, es_vip, rango, reputacion, envios_totales, foto_fachada_url')
      .ilike('telefono', `%${tel10}%`).limit(1).maybeSingle()

    if (!c) {
      await sendWA(fromPhone, `🔍 No encontramos información de un cliente con el número ${tel10}.\n\nSi es cliente nuevo, puedes afiliarlo con */afiliar ${tel10} Nombre*`)
      return new Response('OK', { status: 200 })
    }

    const primerNombre = c.nombre ? c.nombre.split(' ')[0] : 'Cliente'
    const repEmojis: Record<string, string> = {
      excelente: '⭐⭐⭐⭐⭐ Excelente',
      bueno: '⭐⭐⭐⭐ Bueno',
      regular: '⭐⭐⭐ Regular',
      malo: '⭐ Malo',
      vetado: '🚫 VETADO — NO ATENDER',
      sin_calificar: '❔ Sin calificar'
    }
    const repVisual = repEmojis[c.reputacion] || repEmojis['sin_calificar']

    const infoTexto = `📊 *Perfil Estrella Delivery*
👤 Cliente: *${primerNombre}*
👑 Rango: ${c.es_vip ? 'VIP ⭐' : c.rango || 'Bronce'}
📦 Total entregas: ${c.envios_totales || 0}
🗣️ Reputación: ${repVisual}
🎁 Puntos: ${c.puntos || 0}`

    if (c.foto_fachada_url) await sendWAImage(fromPhone, c.foto_fachada_url, infoTexto)
    else await sendWA(fromPhone, infoTexto)
    return new Response('OK', { status: 200 })
  }

  // ── /afiliar ─────────────────────────────────────────────────────────────
  if (cmdLine.startsWith('/afiliar ')) {
    const args = texto.slice(9).trim()
    // Regex: 10 dígitos, espacio, y el nombre (permite caracteres especiales y acentos)
    const match = args.match(/^(\d{10})\s+(.{2,60})$/)
    if (!match) {
      await sendWA(fromPhone, `⚠️ Formato incorrecto.\n\nUsa: */afiliar 9631234567 Nombre Apellido*\nEjemplo: /afiliar 9631112233 María López`)
      return new Response('OK', { status: 200 })
    }
    const [, cTel, cNombre] = match
    const nombreLimpio = cNombre.trim()

    const { data: exist } = await supabase.from('clientes')
      .select('id, acepta_terminos')
      .ilike('telefono', `%${cTel}%`).maybeSingle()

    if (exist) {
      const estado = exist.acepta_terminos ? '✅ ya aceptó los términos.' : '⏳ aún tiene pendiente aceptar los términos.'
      await sendWA(fromPhone, `ℹ️ El cliente ${cTel} ya estaba registrado en Estrella Delivery (${estado})`)
    } else {
      const loyaltyUrl = `https://www.app-estrella.shop/loyalty/${cTel}`
      const qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=10&data=${encodeURIComponent(loyaltyUrl)}`
      const { error: insertErr } = await supabase.from('clientes').insert({
        telefono: cTel,
        nombre: nombreLimpio,
        acepta_terminos: false,
        puntos: 0,
        qr_code: qrCode
      })

      if (insertErr) {
        console.error('[B2B /afiliar] Error insertando cliente:', insertErr.message)
        await sendWA(fromPhone, `❌ Error al registrar al cliente. Intenta de nuevo en un momento.`)
        return new Response('OK', { status: 200 })
      }

      // Log de auditoría (no-blocking)
      _log(supabase, restauranteId, cTel, 'afiliar', 1, `Afiliado por restaurante ${nombreRest}: ${nombreLimpio}`)

      await sendWA(fromPhone, `🎉 *${nombreLimpio}* ha sido afiliado al programa.\n\nLe estoy enviando su invitación y los Términos y Condiciones ahora mismo. 📲`)

      // T&C al cliente — botones con IDs correctos que reconoce handleTerminos
      const { sendInteractiveButtons } = await import('./whatsapp.ts')
      const tcMsg = `👋 ¡Hola *${nombreLimpio}*!\n\n*${nombreRest}* te ha invitado al programa de lealtad VIP de *Estrella Delivery* 🌟\n\nPodrás acumular *puntos*, *envíos gratis* y *saldo real* en cada pedido. 🛵\n\n¿Deseas unirte al programa?`
      await sendInteractiveButtons(`52${cTel}`, tcMsg, [
        { id: 'ACEPTAR_TERMINOS', title: '✅ Sí, unirme' },
        { id: 'RECHAZAR_TERMINOS', title: '❌ No, gracias' }
      ])
    }
    return new Response('OK', { status: 200 })
  }

  // ── /regalar ─────────────────────────────────────────────────────────────
  if (cmdLine.startsWith('/regalar ')) {
    const tel10 = extract10Digits(texto.slice(9).trim())
    if (!tel10 || tel10.length !== 10) {
      await sendWA(fromPhone, `⚠️ Formato incorrecto. Usa: */regalar 9631234567*`)
      return new Response('OK', { status: 200 })
    }

    // Límite anti-abuso: máximo MAX_REGALOS_POR_DIA regalos por día
    const regalosHoy = await _regalosHoy(supabase, restauranteId)
    if (regalosHoy >= MAX_REGALOS_POR_DIA) {
      await sendWA(fromPhone, `⚠️ Has alcanzado el límite de *${MAX_REGALOS_POR_DIA} envíos gratis patrocinados por hoy*.\n\nPodrás regalar más mañana. 😊`)
      return new Response('OK', { status: 200 })
    }

    const { data: c } = await supabase.from('clientes')
      .select('id, nombre, acepta_terminos')
      .ilike('telefono', `%${tel10}%`).maybeSingle()

    if (!c) {
      await sendWA(fromPhone, `❌ Cliente no encontrado. Afílalo primero con */afiliar ${tel10} Nombre*`)
      return new Response('OK', { status: 200 })
    }

    if (!c.acepta_terminos) {
      await sendWA(fromPhone, `⏳ El cliente aún no aceptó los Términos y Condiciones.\n\nEl envío gratis quedará pendiente hasta que acepte.`)
      // Guardar envío gratis pendiente para aplicar cuando acepte
      await supabase.from('bot_memory').upsert({
        phone: `pending_gift_${tel10}`,
        history: [{ envios: 1, restaurante: nombreRest, admin: fromPhone }],
        updated_at: new Date().toISOString()
      })
      return new Response('OK', { status: 200 })
    }

    // Incremento ATÓMICO para evitar race conditions
    const { error: updateErr } = await supabase.rpc('increment_cliente_envios_gratis', {
      p_tel: tel10,
      p_amount: 1
    })

    if (updateErr) {
      console.error('[B2B /regalar] Error incrementando envíos:', updateErr.message)
      await sendWA(fromPhone, `❌ Error al procesar el regalo. Intenta de nuevo.`)
      return new Response('OK', { status: 200 })
    }

    _log(supabase, restauranteId, tel10, 'regalar_envio', 1, `Envío gratis patrocinado por ${nombreRest}`)

    const primerNombre = c.nombre ? c.nombre.split(' ')[0] : 'Cliente'
    await sendWA(fromPhone, `✅ ¡Listo! Has regalado 1 envío gratis a *${c.nombre || tel10}*.\n\nSu lealtad hacia ti acaba de subir. 🚀 (${regalosHoy + 1}/${MAX_REGALOS_POR_DIA} hoy)`)
    await sendWA(`52${tel10}`, `🎁 *¡Sorpresa, ${primerNombre}!*\n\n*${nombreRest}* te acaba de patrocinar un *Envío Gratis* como agradecimiento por tu preferencia. 🎉\n\n¡Pídeles algo rico hoy a través de Estrella Delivery! 🛵🍔`)
    return new Response('OK', { status: 200 })
  }

  // ── /puntos ──────────────────────────────────────────────────────────────
  if (cmdLine.startsWith('/puntos ')) {
    const args = texto.slice(8).trim().split(/\s+/)
    const cTel = extract10Digits(args[0])
    const cant = Math.min(parseInt(args[1] || '1') || 1, MAX_PUNTOS_POR_ACCION)

    if (!cTel || cTel.length !== 10) {
      await sendWA(fromPhone, `⚠️ Formato incorrecto. Usa: */puntos 9631234567* o */puntos 9631234567 3*`)
      return new Response('OK', { status: 200 })
    }

    if (cant !== (parseInt(args[1] || '1') || 1)) {
      await sendWA(fromPhone, `⚠️ El máximo de puntos por acción es *${MAX_PUNTOS_POR_ACCION}*. Procesando ${cant} puntos.`)
    }

    const { data: c } = await supabase.from('clientes')
      .select('id, nombre, acepta_terminos')
      .ilike('telefono', `%${cTel}%`).maybeSingle()

    if (!c) {
      await sendWA(fromPhone, `❌ Cliente no encontrado. Afílalo primero con */afiliar ${cTel} Nombre*`)
      return new Response('OK', { status: 200 })
    }

    if (!c.acepta_terminos) {
      await supabase.from('bot_memory').upsert({
        phone: `pending_pts_${cTel}`,
        history: [{ puntos: cant, admin: fromPhone }],
        updated_at: new Date().toISOString()
      })
      await sendWA(fromPhone, `⏳ El cliente aún no acepta los Términos y Condiciones.\n\n*${cant} punto(s)* quedan pendientes y se sumarán automáticamente cuando acepte. ✅`)
      return new Response('OK', { status: 200 })
    }

    let lastRes: any = null, rpcErr: any = null
    let vipAscendido = false
    for (let i = 0; i < cant; i++) {
      const { data, error } = await supabase.rpc('fn_registrar_entrega', { p_cliente_tel: cTel })
      if (error) { rpcErr = error; break }
      if (data?.ok) {
        lastRes = data
        if (data.recien_ascendido) vipAscendido = true
      } else break
    }

    if (!lastRes) {
      console.error(`[B2B /puntos] RPC falló para ${cTel}:`, rpcErr?.message)
      await sendWA(fromPhone, `❌ Error al sumar puntos: ${rpcErr?.message || 'Respuesta inesperada del servidor'}`)
      return new Response('OK', { status: 200 })
    }

    _log(supabase, restauranteId, cTel, 'sumar_puntos', cant, `${cant} puntos otorgados por ${nombreRest}`)
    await sendWA(fromPhone, `✅ *${cant} punto(s)* sumados a ${c.nombre || cTel}.\n📊 Total acumulado: *${lastRes.puntos} pts*`)
    await sendWA(`52${cTel}`, `⭐ *${nombreRest}* te acaba de sumar *${cant} punto(s)* en Estrella Delivery.\n🎁 Ya tienes *${lastRes.puntos} puntos* acumulados.`)

    if (vipAscendido) {
      await sendWA(`52${cTel}`, `👑 *¡Felicidades!* 👑\n\nHas sido promovido a *Cliente VIP* ⭐ de Estrella Delivery.\n\nA partir de ahora acumularás *saldo real en pesos* en tu billetera. 💰🎉`)
    }
    return new Response('OK', { status: 200 })
  }

  // ── Menú de ayuda ────────────────────────────────────────────────────────
  await sendWA(fromPhone, `🏪 *Portal B2B — Estrella Delivery*
Restaurante: *${nombreRest}*

Con estos comandos puedes fidelizar a tus clientes:

🔍 */info 9631234567* — Ver perfil y reputación.
➕ */afiliar 9631234567 Nombre* — Invitar al programa VIP.
🎁 */regalar 9631234567* — Patrocinar 1 envío gratis.
⭐ */puntos 9631234567 [cant]* — Sumar puntos (máx. ${MAX_PUNTOS_POR_ACCION}).

_Límite de regalos diarios: ${MAX_REGALOS_POR_DIA} envíos._`)
  return new Response('OK', { status: 200 })
}
