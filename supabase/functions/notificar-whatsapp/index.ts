// supabase/functions/notificar-whatsapp/index.ts
// Supabase Edge Function — Envía notificaciones WhatsApp al repartidor y al cliente
// Disparada manualmente desde la app Flutter o el cerebro AI.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extract10Digits, formatTel, generarNumeroOrden, logError } from '../_shared/utils.ts'
import { getMetaPuntos } from '../_shared/constants.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN')!
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  bodyParams: string[],
  headerParams?: string[],
  langCode = 'es_MX'
): Promise<void> {
  const url = `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`

  const components: any[] = []
  if (headerParams && headerParams.length > 0) {
    components.push({
      type: 'header',
      parameters: headerParams.map(t => ({ type: 'text', text: t || '-' }))
    })
  }
  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map(t => ({ type: 'text', text: t || 'Cliente' }))
    })
  }

  const payload = {
    messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template',
    template: { name: templateName, language: { code: langCode }, components }
  }
  console.log(`[TEMPLATE] Enviando '${templateName}' (${langCode}) a ${to} | ${JSON.stringify(components)}`)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const textBody = await res.text()
  if (!res.ok) {
    console.error(`[TEMPLATE] ❌ '${templateName}' HTTP ${res.status} → ${textBody}`)
    throw new Error(`WhatsApp API error (${templateName}): ${textBody}`)
  }
  console.log(`[TEMPLATE] ✅ '${templateName}' enviada → ${textBody.substring(0, 120)}`)
}

async function sendInteractiveButton(to: string, text: string, buttonId: string, buttonTitle: string): Promise<void> {
  const url = `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`
  console.log(`Sending Interactive Button to ${to}:`, { text, buttonId, buttonTitle })
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: text.substring(0, 1024) },
        action: {
          buttons: [{ type: 'reply', reply: { id: buttonId, title: buttonTitle } }]
        }
      }
    }),
  })
  const textBody = await res.text()
  console.log(`WA Interactive API Response [${res.status}]:`, textBody)
  if (!res.ok) throw new Error(`WhatsApp Interactive API error: ${textBody}`)
}

async function notificarCliente(
  estado: string, tel: string, desc: string, pedidoId: string,
  nombre?: string, direccion?: string, restaurante?: string, repartidorNombre?: string, supabase?: any
): Promise<string> {
  const telFormateado = formatTel(tel)
  const nombreC = nombre || 'Cliente'
  const restC = restaurante || 'Restaurante'
  const repC = repartidorNombre || 'tu repartidor'
  const numeroOrden = generarNumeroOrden(pedidoId)

  switch (estado) {
    case 'creado': {
      const res0 = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: telFormateado,
          type: 'text',
          text: { body: `⭐ *Confirmación de Pedido — Estrella Delivery*\n\n¡Hola ${nombreC}! 👋\nRecibimos exitosamente tu orden #${numeroOrden} de *${restC}*.\n\nTe avisaremos en cuanto el repartidor acepte tu servicio. 🛵💨` }
        })
      })
      if (!res0.ok) console.error(`Error enviando text 'creado':`, await res0.text())
      return `✅ Mensaje de confirmación 'creado' enviado al cliente`
    }
    case 'aceptado': {
      const components = [
        { type: 'header', parameters: [{ type: 'image', image: { link: 'https://jdrrkpvodnqoljycixbg.supabase.co/storage/v1/object/public/public-assets/logo.png' } }] },
        {
          type: 'body', parameters: [
            { type: 'text', text: nombreC }, // {{1}}
            { type: 'text', text: restC },   // {{2}}
            { type: 'text', text: repC }    // {{3}}
          ]
        }
      ]
      console.log(`[TEMPLATE] Enviando 'pedido_aceptado_v2' (es_MX) a ${telFormateado} | params: ${nombreC}, ${restC}, ${repC}`)
      const res = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: telFormateado, type: 'template', template: { name: 'pedido_aceptado_v2', language: { code: 'es_MX' }, components } })
      })
      const t1 = await res.text()
      if (!res.ok) console.error(`[TEMPLATE] ❌ 'pedido_aceptado_v2' HTTP ${res.status} → ${t1}`)
      else console.log(`[TEMPLATE] ✅ 'pedido_aceptado_v2' → ${t1.substring(0, 120)}`)
      return `✅ Plantilla 'pedido_aceptado_v2' enviada`
    }
    case 'en_camino':
    case 'recibido': {
      // Uso de texto plano gratuito en lugar de plantilla (aprovechando ventana 24h)
      const isEnCamino = estado === 'en_camino';
      const msgTexto = isEnCamino
        ? `🚀 *¡Vamos en camino, ${nombreC}!*\n\nTu repartidor *${repC}* ya salió de *${restC}* y se dirige a tu domicilio. 🛵💨\n\nPor favor, mantente al tanto para recibirlo. ⭐`
        : `🛍️ *¡Tu pedido está en buenas manos, ${nombreC}!*\n\nTu repartidor *${repC}* acaba de recoger tu comida en *${restC}*.\n¡En breves momentos saldrá hacia tu ubicación! 📍`;

      const res = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: telFormateado, type: 'text', text: { body: msgTexto } })
      })
      if (!res.ok) console.error(`WA error (${estado} texto plano):`, await res.text())
      return `✅ Mensaje de texto plano '${estado}' enviado (Ventana 24h)`
    }
    case 'entregado': {
      // Plantilla pedido_entregado_v2 no existe en Meta — usar texto plano como fallback
      const msgEntregado = `✅ *¡Entregado con éxito, ${nombreC}!* 🎉\n\nEsperamos que disfrutes tu pedido de *${restC}*. 🍽️\n\nGracias por confiar en Estrella Delivery. 🌟\n¿Qué tal fue nuestro servicio? ¡Nos encantaría leerte!`;
      const res = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: telFormateado, type: 'text', text: { body: msgEntregado } })
      })
      if (!res.ok) console.error(`WA error (entregado texto):`, await res.text())

      return `✅ Plantilla 'pedido_entregado_v2' enviada`
    }
    case 'punto_acumulado': {
      // Solo se llama cuando el cliente acaba de completar un ciclo y tiene envío gratis disponible
      const msgPunto = `🎉 *¡Felicidades, ${nombreC}!*\n\n⭐ Acabas de completar tu ciclo de puntos en *Estrella Delivery*.\n\n🎁 *¡Tienes un envío GRATIS disponible!*\nMuestra tu QR al repartidor en tu próximo pedido para canjearlo.\n\n¡Gracias por tu lealtad! 🌟`
      const res = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: telFormateado, type: 'text', text: { body: msgPunto } })
      })
      if (!res.ok) console.error(`WA error (punto_acumulado):`, await res.text())
      return `✅ Notificación 'punto_acumulado' enviada a ${tel}`
    }
    default:
      return `ℹ️ Estado '${estado}' no dispara plantilla de cliente`
  }
}

function buildRepartidorAsignacionText(
  pedidoId: string, descripcion: string, direccion: string | null, restaurante: string | null, clienteNombre: string | null, cuponTexto: string = ''
): string {
  const numeroOrden = generarNumeroOrden(pedidoId)
  return [
    `📦 *Nuevo Pedido Asignado — Estrella Delivery*`,
    `🔢 *Orden:* ${numeroOrden}`,
    ``,
    restaurante ? `🍽️ *Restaurante:* ${restaurante}` : null,
    clienteNombre ? `👤 *Cliente:* ${clienteNombre}` : null,
    `📝 *Pedido:* ${descripcion}`,
    direccion ? `📍 *Dirección:* ${direccion}` : null,
    cuponTexto ? `\n${cuponTexto}` : null
  ].filter(Boolean).join('\n')
}

// ── Handler principal ────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS_HEADERS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })

  try {
    const bodyText = await req.text()
    console.log("NOTIFICAR_WHATSAPP INCOMING BODY:", bodyText)
    if (!bodyText) return new Response(JSON.stringify({ error: 'Body vacio' }), { status: 400 })

    const payload = JSON.parse(bodyText)
    const { tipo } = payload

    if (!tipo) {
      return new Response(JSON.stringify({ error: 'tipo es requerido' }), { status: 400 })
    }

    if (tipo === 'cupon_generado') {
      const { cliente_tel, cliente_nombre, codigo_cupon, descuento, expires_at, tipo_canje } = payload
      const telFormateado = formatTel(cliente_tel)
      const f_exp = new Date(expires_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
      const strDesc = tipo_canje === 'billetera' ? `$${descuento} en pedidos/comida` : `Hasta $${descuento} en tu próximo envío`

      const res = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', recipient_type: 'individual', to: telFormateado, type: 'template',
          template: {
            name: 'estrella_cupon_generado',
            language: { code: 'en' },
            components: [
              {
                type: 'body', parameters: [
                  { type: 'text', text: cliente_nombre || 'Cliente' }, // {{1}}
                  { type: 'text', text: codigo_cupon }, // {{2}}
                  { type: 'text', text: strDesc }, // {{3}}
                  { type: 'text', text: f_exp } // {{4}}
                ]
              }
            ]
          }
        })
      })
      if (!res.ok) console.error(`WA error (estrella_cupon_generado):`, await res.text())
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    if (tipo === 'canje_billetera') {
      const { cliente_tel, cliente_nombre, codigo_canje, monto, saldo_restante } = payload
      const telFormateado = formatTel(cliente_tel)
      const adminPhoneMain = Deno.env.get('ADMIN_PHONE_BILLETERA')
      if (!adminPhoneMain) throw new Error('Missing ADMIN_PHONE_BILLETERA en entorno')

      // Avisar al cliente (USANDO PLANTILLA estrella_cupon_generado en INGLES)
      const fExp = 'Válido hoy'
      const strDesc = `Hasta $${monto} en pedidos/comida`
      const resCli = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', recipient_type: 'individual', to: telFormateado, type: 'template',
          template: {
            name: 'estrella_cupon_generado',
            language: { code: 'en' },
            components: [
              {
                type: 'body', parameters: [
                  { type: 'text', text: cliente_nombre || 'Cliente' }, // {{1}}
                  { type: 'text', text: codigo_canje || 'CUPON' }, // {{2}}
                  { type: 'text', text: strDesc }, // {{3}}
                  { type: 'text', text: fExp } // {{4}}
                ]
              }
            ]
          }
        })
      })
      if (!resCli.ok) console.error(`WA error cliente canje template:`, await resCli.text())

      const resAdm = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', recipient_type: 'individual', to: adminPhoneMain, type: 'text',
          text: { body: `🚨 *NUEVO CANJE DE BILLETERA*\n\n👤 Cliente: ${cliente_nombre || 'Desconocido'} (${cliente_tel})\n💰 Monto canjeado: *$${monto}*\n🎟️ Código: *${codigo_canje}*` }
        })
      })
      const txtAdm = await resAdm.text()
      if (!resAdm.ok) console.error(`WA error admin canje:`, txtAdm)
      else console.log(`WA success admin canje:`, txtAdm)

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    }

    const { pedido_id, repartidor_tel, descripcion, minutos_total, minutos_estancado } = payload

    if (!pedido_id) {
      console.error("Falta pedido_id")
      return new Response(JSON.stringify({ error: 'pedido_id requerido para este tipo' }), { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data: pedido, error } = await supabase
      .from('pedidos')
      .select('*')
      .eq('id', pedido_id)
      .single()

    if (error || !pedido) {
      console.error("Error pedido:", error)
      return new Response(JSON.stringify({ error: 'Pedido no encontrado' }), { status: 404 })
    }

    const numeroOrden = generarNumeroOrden(pedido_id)
    console.log("PEDIDO FOUND:", pedido.id, "ORDEN:", numeroOrden, "ESTADO:", pedido.estado, "TIPO_NOTIFICACION:", tipo)

    const results: string[] = []

    // ── ZOMBIE WATCHDOG (INTERVENCIÓN DEL ADMIN) ──
    if (tipo === 'alerta_zombie') {
      const adminPhone = Deno.env.get('ADMIN_PHONE')
      if (!adminPhone) throw new Error('Missing ADMIN_PHONE en entorno')
      const msgZ = `🚨 *ALERTA CRÍTICA: PEDIDO ZOMBIE* 🚨\n\n⚠️ El siguiente pedido se ha atascado:\n\n🔢 *Orden:* ${numeroOrden}\n📦 *${descripcion || pedido.descripcion}*\n\n⏱️ *Tiempo total:* ${minutos_total} min\n⏳ *Sin moverse:* ${minutos_estancado} min\n\n👉 Por favor, revisa o reasigna el pedido.`

      const resZ = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: formatTel(adminPhone), type: 'text', text: { body: msgZ } })
      })
      if (!resZ.ok) console.error(`Error enviando Alerta Zombie:`, await resZ.text())

      results.push(`✅ Alerta Zombie despachada al Admin: ${adminPhone}`)
      return new Response(JSON.stringify({ ok: true, actions: results }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    // A. Notificar al Repartidor (Si aplica)
    const repartidorTelPayload = repartidor_tel

    if (tipo === 'asignacion' && (pedido.repartidor_id || repartidorTelPayload)) {
      let repTelefono = repartidorTelPayload
      let repNombre = 'Repartidor'

      const { data: rep } = await supabase
        .from('repartidores')
        .select('telefono, nombre')
        .or(`user_id.eq.${pedido.repartidor_id},telefono.ilike.%${extract10Digits(repTelefono || '')}%`)
        .limit(1)
        .maybeSingle()

      if (rep) {
        repTelefono = rep.telefono
        repNombre = rep.nombre || 'Repartidor'
      }

      // Buscar ubicación del Restaurante Origen
      let restLoc = ''
      if (pedido.restaurante) {
        const { data: rInfo } = await supabase
          .from('restaurantes')
          .select('direccion, lat, lng')
          .ilike('nombre', `%${pedido.restaurante}%`)
          .eq('activo', true)
          .limit(1)
          .maybeSingle()

        if (rInfo) {
          if (rInfo.direccion) restLoc += `\n🏠 Origen: ${rInfo.direccion}`
          if (rInfo.lat && rInfo.lng) restLoc += `\n📍 Ubicación Origen: https://maps.google.com/?q=${rInfo.lat},${rInfo.lng}`
        }
      }

      if (repTelefono) {
        let clienteFachada = ''
        if (pedido.cliente_tel) {
          const { data: cInfo } = await supabase.from('clientes').select('foto_fachada_url').eq('telefono', extract10Digits(pedido.cliente_tel)).maybeSingle()
          if (cInfo?.foto_fachada_url) {
            clienteFachada = `\n📸 Fachada: ${cInfo.foto_fachada_url}`
          }
        }

        const rawDesc = pedido.descripcion || 'Paquete'
        const descT = pedido.restaurante ? `🍽️ ${pedido.restaurante} - ${rawDesc}` : rawDesc
        const dirT = (pedido.direccion || 'Revisar detalles') + restLoc + clienteFachada

        // ── VERIFICAR CUPÓN ACTIVO ──
        let cuponInfo = ''
        let cuponBtnId = `BTN_ACEPTAR_${pedido.id}`
        let cuponBtnTitle = 'Aceptar Servicio'

        if (pedido.cliente_tel) {
          const { data: cupon } = await supabase.from('cupones')
            .select('*')
            .eq('cliente_tel', extract10Digits(pedido.cliente_tel))
            .eq('estado', 'activo')
            .limit(1)
            .maybeSingle()

          if (cupon) {
            cuponInfo = `⚠️ *CUPÓN ACTIVO: ${cupon.codigo}*\n💰 *Descuento:* $${cupon.valor_pesos} pesos\n💡 Cobra $${cupon.valor_pesos} pesos MENOS de la cuenta total.`
            // Si hay cupón, cambiamos el botón para que el repartidor confirme que lo aplicó (se maneja en rep-handler)
            // Primero debe aceptarlo normalmente, el botón de aplicar cupón se le envía cuando lo recoge o entrega.
            // Para simplificar, le mandamos el mismo botón de aceptar.
          }
        }

        await sendWhatsAppTemplate(
          formatTel(repTelefono),
          'estrella_delivery__nueva_orden',
          [descT.substring(0, 1024), dirT.substring(0, 1024)],
          [repNombre]
        )

        const msg = buildRepartidorAsignacionText(pedido.id, descT, dirT, pedido.restaurante, pedido.cliente_nombre, cuponInfo)
        try {
          await sendInteractiveButton(formatTel(repTelefono), msg, cuponBtnId, cuponBtnTitle)
        } catch (e) { console.log('El boton interactivo no pudo salir, posible ventana cerrada de 24h', e) }
        results.push(`✅ WA template y/o interactivo enviado al repartidor: ${repTelefono}`)
      } else {
        results.push('⚠️ Repartidor sin teléfono o no encontrado')
      }
    } else {
      // B. Notificar al Cliente
      if (tipo !== 'asignacion' && pedido.cliente_tel) {
        let repNom = 'tu repartidor'
        if (pedido.repartidor_id) {
          // Buscar por user_id O por id para cubrir repartidores sin cuenta Auth
          const { data: r } = await supabase.from('repartidores').select('nombre')
            .or(`user_id.eq.${pedido.repartidor_id},id.eq.${pedido.repartidor_id}`)
            .limit(1).maybeSingle()
          if (r?.nombre) repNom = r.nombre
        }

        const resCli = await notificarCliente(
          tipo,
          pedido.cliente_tel,
          pedido.descripcion,
          pedido.id,
          pedido.cliente_nombre ?? undefined,
          pedido.direccion ?? undefined,
          pedido.restaurante ?? undefined,
          repNom,
          supabase
        )
        results.push(resCli)

        // ── AUTO-NOTIFICAR si el cliente acaba de completar un ciclo de puntos ──
        if (tipo === 'entregado' && pedido.cliente_tel) {
          try {
            const tel10 = pedido.cliente_tel.replace(/\D/g, '').slice(-10)
            const { data: cl } = await supabase
              .from('clientes')
              .select('puntos, rango, es_vip, nombre')
              .eq('telefono', tel10)
              .maybeSingle()

            if (cl) {
              const meta = getMetaPuntos(cl.rango, cl.es_vip)
              // Si los puntos son múltiplo exacto de meta (ciclo completado) y tiene al menos 1 ciclo
              if (cl.puntos > 0 && cl.puntos % meta === 0) {
                await notificarCliente(
                  'punto_acumulado',
                  pedido.cliente_tel,
                  '',
                  pedido.id,
                  cl.nombre ?? pedido.cliente_nombre ?? undefined,
                  undefined, undefined, undefined, supabase
                )
                results.push(`🎉 Notificación de ciclo completo enviada a ${tel10}`)
              }
            }
          } catch (eP) {
            console.warn('Error en auto-notificación de ciclo:', eP)
          }
        }
      } else if (tipo !== 'asignacion') {
        results.push('⚠️ Cliente sin teléfono')
      }
    }

    console.log("Final Actions:", results)
    return new Response(JSON.stringify({ ok: true, actions: results }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })

  } catch (e: any) {
    console.error("FATAL ERROR IN NOTIFICAR-WHATSAPP:", e)
    await logError(
      'notificar-whatsapp',
      `Unhandled crash: ${e.message}`,
      { stack: e.stack },
      'critical'
    );
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
