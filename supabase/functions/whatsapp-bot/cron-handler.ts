import { sendWAImage, sendWATemplate } from './whatsapp.ts'

export async function handleCronEvent(supabase: any, body: any): Promise<Response | null> {
  // ── Promo a clientes nuevos (5 horas despues del registro) ──
  if (body.event === 'CRON_PROMO') {
    const limiteSuperior = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
    const limiteInferior  = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()

    const { data: clientes } = await supabase.from('clientes')
      .select('id, telefono, nombre, notas_crm')
      .gte('created_at', limiteInferior)
      .lte('created_at', limiteSuperior)
      .eq('acepta_terminos', true)

    if (clientes) {
      for (const c of clientes) {
        if (c.notas_crm?.includes('[PROMO_5H]')) continue

        const promoImg = body.promoUrl || 'https://res.cloudinary.com/dlgcf3cht/image/upload/v1731610444/promo_doble_puntos.png'
        const nombre   = c.nombre ? c.nombre.split(' ')[0] : 'Cliente'
        const caption  = `🎁 *¡Hola ${nombre}!* Queremos darte una bienvenida especial.\n\nSolo por HOY, si haces tu primer pedido a través de *Estrella Delivery*, ganarás el **DOBLE DE PUNTOS** ⭐⭐ en tu Tarjeta VIP.\n\n¿Qué se te antoja pedir? 🛵💨`

        const res    = await sendWAImage(`52${c.telefono}`, promoImg, caption)
        const status = res.ok ? 'Enviada' : 'Fallida'
        const newNota = c.notas_crm ? `${c.notas_crm}\n[PROMO_5H] ${status}` : `[PROMO_5H] ${status}`
        await supabase.from('clientes').update({ notas_crm: newNota }).eq('id', c.id)
      }
    }
    return new Response('Cron Processed', { status: 200 })
  }

  // ── Reactivación de clientes inactivos (20+ días sin sumar puntos) ──
  if (body.event === 'CRON_REACTIVACION') {
    const hace20Dias = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
    const hace7Dias  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString()

    // Clientes que aceptaron T&C pero que no han recibido el mensaje de reactivación en los últimos 7 días
    const { data: clientesInactivos } = await supabase.from('clientes')
      .select('id, telefono, nombre, notas_crm, puntos')
      .eq('acepta_terminos', true)
      .not('telefono', 'is', null)

    if (!clientesInactivos?.length) return new Response('OK', { status: 200 })

    let enviados = 0
    for (const c of clientesInactivos) {
      // Saltar si ya le enviamos reactivación en los últimos 7 días
      if (c.notas_crm?.includes('[REACTIV]')) {
        const marcaMatch = c.notas_crm.match(/\[REACTIV (\d{4}-\d{2}-\d{2})\]/)
        if (marcaMatch) {
          const fechaMarca = new Date(marcaMatch[1])
          if (fechaMarca > new Date(hace7Dias)) continue
        } else {
          continue
        }
      }

      // Verificar inactividad: última actividad en restaurante_clientes_puntos
      const { data: ultimaActividad } = await supabase
        .from('restaurante_clientes_puntos')
        .select('updated_at')
        .ilike('cliente_tel', `%${c.telefono}%`)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const ultimaFecha = ultimaActividad?.updated_at || null
      if (ultimaFecha && new Date(ultimaFecha) > new Date(hace20Dias)) continue

      const nombre = c.nombre?.split(' ')[0] || 'Cliente'
      const puntos = c.puntos || 0
      const tel    = c.telefono

      try {
        const tplRes = await sendWATemplate(
          `52${tel}`,
          'estrella_puntos_acumulados',
          [nombre, '0', puntos.toString()],
          undefined,
          tel
        )
        if (!tplRes.ok) {
          await sendWAImage(
            `52${tel}`,
            'https://res.cloudinary.com/dlgcf3cht/image/upload/v1731610444/promo_doble_puntos.png',
            `👋 *¡${nombre}, te extrañamos!*\n\nLleva un tiempo que no acumulas puntos en el programa VIP de *Estrella Delivery* 🌟\n\n¡Visita uno de nuestros restaurantes aliados esta semana y gana el *doble de puntos*! ⭐⭐\n\n💳 Tus puntos actuales: *${puntos} pts*`
          )
        }

        const hoy = new Date().toISOString().split('T')[0]
        const nota = c.notas_crm
          ? `${c.notas_crm}\n[REACTIV ${hoy}]`
          : `[REACTIV ${hoy}]`
        await supabase.from('clientes').update({ notas_crm: nota }).eq('id', c.id)
        enviados++

        // Throttle: 400ms entre mensajes para no saturar Meta API
        await new Promise(r => setTimeout(r, 400))
      } catch (e) {
        console.error(`[CRON_REACTIVACION] Error enviando a ${tel}:`, e)
      }
    }

    console.log(`[CRON_REACTIVACION] Completada. Mensajes enviados: ${enviados}`)
    return new Response(`Reactivación procesada: ${enviados} mensajes`, { status: 200 })
  }

  return null
}
