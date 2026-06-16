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
      .limit(100)

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
      .limit(50) // BUG FIX: Prevent function timeout

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
        .eq('cliente_tel', c.telefono)
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

  // ── 📊 Reporte Semanal Automático (Lunes 9 AM México) ──────────────────────
  if (body.event === 'CRON_REPORTE_SEMANAL') {
    const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: restaurantes } = await supabase
      .from('restaurantes')
      .select('id, nombre, telefono')
      .eq('activo', true)
      .not('telefono', 'is', null)

    if (!restaurantes?.length) return new Response('Sin restaurantes activos', { status: 200 })

    const { sendWA } = await import('./whatsapp.ts')

    for (const rest of restaurantes) {
      // Métricas de pedidos Y lealtad en paralelo
      const [{ data: pedidos }, { data: logs }] = await Promise.all([
        supabase.from('pedidos').select('id, estado, total')
          .eq('restaurante_id', rest.id).gte('created_at', hace7Dias),
        supabase.from('restaurante_loyalty_log').select('accion, valor, cliente_tel')
          .eq('restaurante_id', rest.id).gte('created_at', hace7Dias)
      ])

      // Si no hubo actividad alguna esa semana, saltar
      if (!pedidos?.length && !logs?.length) continue

      // Métricas de lealtad
      const nuevosAfiliados = logs?.filter((l: any) => l.accion === 'afiliar_cliente').length || 0
      const ptsSumados      = logs?.filter((l: any) => l.accion === 'sumar_puntos').reduce((s: number, l: any) => s + (l.valor || 0), 0) || 0
      const enviosRegalados = logs?.filter((l: any) => l.accion === 'regalar_envio').length || 0
      const visitasUnicas   = new Set(logs?.filter((l: any) => l.accion === 'sumar_puntos').map((l: any) => l.cliente_tel)).size

      // Top 3 clientes más frecuentes de la semana
      const frecuencia: Record<string, number> = {}
      logs?.filter((l: any) => l.accion === 'sumar_puntos').forEach((l: any) => {
        frecuencia[l.cliente_tel] = (frecuencia[l.cliente_tel] || 0) + 1
      })
      const top3 = Object.entries(frecuencia)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([tel, visitas], i) => `  ${['🥇','🥈','🥉'][i]} \`${tel}\` — ${visitas} visita${visitas > 1 ? 's' : ''}`)
        .join('\n')

      // Métricas de pedidos (delivery)
      const totalFacturado = pedidos?.reduce((acc: number, p: any) => acc + (Number(p.total) || 0), 0) || 0
      const entregados = pedidos?.filter((p: any) => p.estado === 'entregado').length || 0

      const fechaInicio = new Date(hace7Dias).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
      const fechaFin    = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

      const reporte = [
        `📊 *REPORTE SEMANAL*`,
        `🏪 *${rest.nombre.toUpperCase()}*`,
        `📅 ${fechaInicio} — ${fechaFin}`,
        `═══════════════════════════`,
        ``,
        `⭐ *Programa de Lealtad:*`,
        `   👥 Visitas únicas: *${visitasUnicas}*`,
        `   🆕 Nuevos clientes: *${nuevosAfiliados}*`,
        `   🏆 Puntos sumados: *${ptsSumados}*`,
        `   🎁 Envíos regalados: *${enviosRegalados}*`,
        pedidos?.length ? `\n🛵 *Delivery:* ${pedidos.length} pedidos — ${entregados} entregados` + (totalFacturado > 0 ? ` — $${totalFacturado.toFixed(0)}` : '') : '',
        top3 ? `\n🏆 *Top clientes de la semana:*\n${top3}` : '',
        ``,
        `═══════════════════════════`,
        `💡 _Reporte automático de Estrella Delivery_`
      ].filter(Boolean).join('\n')

      const tel10 = rest.telefono.slice(-10)
      await sendWA(`52${tel10}`, reporte)
      await new Promise(r => setTimeout(r, 500))
    }

    return new Response('Reportes semanales enviados', { status: 200 })
  }

  // ── 🌧️ Detección automática de lluvia (Open-Meteo) ──────────────────────────
  if (body.event === 'CRON_CLIMA') {
    const lat = 16.2516
    const lng = -92.1332
    
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=precipitation`
      const res = await fetch(url, { headers: { 'User-Agent': 'EstrellaBot/1.0' } })
      
      if (!res.ok) {
        const errText = await res.text()
        console.error(`[CRON_CLIMA] Error de Open-Meteo HTTP ${res.status}: ${errText.substring(0, 100)}`)
        return new Response('Error consultando API clima', { status: 500 })
      }
      
      const data = await res.json()
      const precip = data.current?.precipitation || 0

      // Consideramos lluvia si precipitación > 0.1mm o si estamos en modo prueba
      if (precip > 0.1 || body.testMode) {
        const { data: configRow } = await supabase.from('app_config').select('configuracion_precios').eq('id', 'default').maybeSingle()
        const config = configRow?.configuracion_precios || {}
        
        // Si no está activo el modo lluvia
        if (config.modo_lluvia !== true) {
          const lastAlert = config.ultima_alerta_lluvia
          const twoHours = 2 * 60 * 60 * 1000
          
          if (!lastAlert || (Date.now() - new Date(lastAlert).getTime()) > twoHours || body.testMode) {
            const ADMIN_PHONES_ENV = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''
            const adminPhoneMain = ADMIN_PHONES_ENV.split(',')[0]?.replace(/\D/g, '').slice(-10)
            
            if (adminPhoneMain) {
              const { sendInteractiveList } = await import('./whatsapp.ts')
              await sendInteractiveList(
                `52${adminPhoneMain}`,
                `🌧️ *Alerta de Lluvia:* El sistema detectó lluvia en Comitán (${precip} mm).\n\nElige de la lista de abajo de cuánto quieres que sea el recargo para los mandaditos:`,
                'Activar Modo Lluvia',
                [{
                  title: 'Opciones de Recargo',
                  rows: [
                    { id: 'cmd_lluvia_10', title: '+$10 Pesos', description: 'Lluvia ligera' },
                    { id: 'cmd_lluvia_15', title: '+$15 Pesos', description: 'Lluvia moderada' },
                    { id: 'cmd_lluvia_20', title: '+$20 Pesos', description: 'Lluvia fuerte' },
                    { id: 'cmd_lluvia_0',  title: 'Apagar', description: 'Desactivar recargo' }
                  ]
                }]
              )
              
              config.ultima_alerta_lluvia = new Date().toISOString()
              await supabase.from('app_config').update({ configuracion_precios: config }).eq('id', 'default')
              console.log(`[CRON_CLIMA] Alerta de lluvia enviada al admin (${precip}mm).`)
            }
          } else {
            console.log(`[CRON_CLIMA] Lluvia detectada (${precip}mm), pero ya se avisó hace menos de 2h.`)
          }
        } else {
          console.log(`[CRON_CLIMA] Lluvia detectada (${precip}mm), pero el modo lluvia ya está activo.`)
        }
      } else {
        console.log(`[CRON_CLIMA] Clima despejado (${precip}mm).`)
      }
      return new Response('Cron Clima procesado', { status: 200 })
    } catch (e) {
      console.error('[CRON_CLIMA] Error consultando clima:', e)
      return new Response('Error interno', { status: 500 })
    }
  }

  // ── 🧪 TEST IA REAL ──────────────────────────
  if (body.event === 'CRON_TEST_IA') {
    try {
      const { data: appCfg } = await supabase.from('app_config').select('configuracion_precios').eq('id', 'default').maybeSingle()
      // Ejecutar la simulación importando test_criterio
      const { generarPreguntaReferenciasIA } = await import('./mandadito-handler.ts')
      console.log('--- INICIO TEST DE IA REAL ---')
      
      const esc1 = await generarPreguntaReferenciasIA('Bodega Aurrera', 'Mi casa en las palmas')
      console.log('ESCENARIO 1 (Aurrera -> Casa):', esc1)
      
      const esc2 = await generarPreguntaReferenciasIA("Domino's Pizza a nombre de Juan", "Hospital General")
      console.log('ESCENARIO 2 (Dominos -> Hospital):', esc2)
      
      const esc3 = await generarPreguntaReferenciasIA("mi casa", "4a avenida sur poniente")
      console.log('ESCENARIO 3 (Casa -> Calle):', esc3)
      
      console.log('--- FIN TEST DE IA REAL ---')
      const resultados = `
ESCENARIO 1 (Aurrera -> Casa):\n${esc1}\n
ESCENARIO 2 (Dominos -> Hospital):\n${esc2}\n
ESCENARIO 3 (Casa -> Calle):\n${esc3}
`
      return new Response(resultados, { status: 200 })
    } catch (e) {
      console.error('[CRON_TEST_IA] Error:', e)
      return new Response('Error', { status: 500 })
    }
  }



  // ── ⏱️ Vigía de Logística (SLA Watchdog) ──────────────────────────
  if (body.event === 'CRON_VIGIA_LOGISTICA') {
    const ahora = Date.now()
    const hace10Min = new Date(ahora - 10 * 60 * 1000).toISOString()
    const hace30Min = new Date(ahora - 30 * 60 * 1000).toISOString()
    const hace2Horas = new Date(ahora - 120 * 60 * 1000).toISOString()

    try {
      const { data: pedidos } = await supabase
        .from('pedidos')
        .select('id, estado, updated_at, repartidor_id, repartidores(nombre, telefono)')
        .in('estado', ['buscando_repartidor', 'asignado', 'en_camino'])
        .gte('created_at', hace2Horas)

      if (pedidos && pedidos.length > 0) {
        const ADMIN_PHONES_ENV = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''
        const adminPhoneMain = ADMIN_PHONES_ENV.split(',')[0]?.replace(/\D/g, '').slice(-10)
        const { sendWA } = await import('./whatsapp.ts')

        for (const p of pedidos) {
          const estadoDate = new Date(p.updated_at).getTime()
          
          // 1. Buscando repartidor por >10 min
          if (p.estado === 'buscando_repartidor' && estadoDate < new Date(hace10Min).getTime()) {
             if (adminPhoneMain) await sendWA(`52${adminPhoneMain}`, `🚨 *Vigía Logística:* El pedido #${p.id} lleva más de 10 min "Buscando Repartidor". ¡Revisa el tablero!`)
             await supabase.from('pedidos').update({ updated_at: new Date().toISOString() }).eq('id', p.id)
             await new Promise(r => setTimeout(r, 400))
          }
          
          // 2. Asignado / En camino por >30 min sin entregar
          if ((p.estado === 'asignado' || p.estado === 'en_camino') && estadoDate < new Date(hace30Min).getTime()) {
             const repName = p.repartidores?.nombre || 'Repartidor'
             const repPhone = p.repartidores?.telefono
             if (repPhone) {
               await sendWA(`52${repPhone.slice(-10)}`, `⚠️ *Vigía Logística:* Hola ${repName}, llevas más de 30 minutos con el pedido #${p.id}. ¿Tuviste algún problema? Responde aquí o avisa a base.`)
               await new Promise(r => setTimeout(r, 400))
             }
             if (adminPhoneMain) {
               await sendWA(`52${adminPhoneMain}`, `🚨 *Vigía Logística:* El repartidor ${repName} lleva más de 30 min con el pedido #${p.id}.`)
               await new Promise(r => setTimeout(r, 400))
             }
             await supabase.from('pedidos').update({ updated_at: new Date().toISOString() }).eq('id', p.id)
          }
        }
      }
      return new Response('Cron Vigía Logística procesado', { status: 200 })
    } catch (e) {
      console.error('[CRON_VIGIA_LOGISTICA] Error:', e)
      return new Response('Error interno', { status: 500 })
    }
  }

  return null
}
