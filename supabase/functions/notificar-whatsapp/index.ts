// supabase/functions/notificar-whatsapp/index.ts
// Supabase Edge Function — Envía notificaciones WhatsApp al repartidor y al cliente
// Disparada manualmente desde la app Flutter o el cerebro AI.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WA_TOKEN    = Deno.env.get('WHATSAPP_TOKEN')!
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function formatTel(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return `52${digits.slice(-10)}`
}

function extract10Digits(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  bodyParams: string[],
  headerParams?: string[]
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
  
  console.log(`Sending Template [${templateName}] to ${to}`, JSON.stringify(components))

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template',
      template: { name: templateName, language: { code: 'es_MX' }, components }
    }),
  })
  const textBody = await res.text()
  console.log(`WA Template API Response [${res.status}]:`, textBody)
  if (!res.ok) throw new Error(`WhatsApp API error (${templateName}): ${textBody}`)
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
        body: { text },
        action: {
          buttons: [ { type: 'reply', reply: { id: buttonId, title: buttonTitle } } ]
        }
      }
    }),
  })
  const textBody = await res.text()
  console.log(`WA Interactive API Response [${res.status}]:`, textBody)
  if (!res.ok) throw new Error(`WhatsApp Interactive API error: ${textBody}`)
}

async function notificarCliente(estado: string, tel: string, desc: string, nombre?: string, direccion?: string, restaurante?: string, repartidorNombre?: string): Promise<string> {
  const telFormateado = formatTel(tel)
  const nombreC = nombre || 'Cliente'
  const restC = restaurante || 'Restaurante'
  const repC = repartidorNombre || 'tu repartidor'
  
  switch (estado) {
    case 'creado': {
      const res0 = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: telFormateado,
          type: 'text',
          text: { body: `⭐ *Confirmación de Pedido — Estrella Delivery*\n\n¡Hola ${nombreC}! 👋\nRecibimos exitosamente tu orden de *${restC}*.\n\nTe avisaremos en cuanto el repartidor acepte tu servicio. 🛵💨` }
        })
      })
      if (!res0.ok) console.error(`Error enviando text 'creado':`, await res0.text())
      return `✅ Mensaje de confirmación 'creado' enviado al cliente`
    }
    case 'aceptado': {
      // Plantilla: ¡Hola {{1}}! 👋 Tu pedido de *{{2}}* ya fue asignado a nuestro repartidor: *{{3}}*. 🛵
      const components = [
        { type: 'header', parameters: [{ type: 'image', image: { link: 'https://jdrrkpvodnqoljycixbg.supabase.co/storage/v1/object/public/public-assets/logo.png' } }] },
        { type: 'body', parameters: [
          { type: 'text', text: nombreC }, // {{1}}
          { type: 'text', text: restC },   // {{2}}
          { type: 'text', text: repC }    // {{3}}
        ]}
      ]
      const res = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: telFormateado, type: 'template', template: { name: 'pedido_aceptado_v2', language: { code: 'es_MX' }, components } })
      })
      if (!res.ok) console.error(`WA error (pedido_aceptado_v2):`, await res.text())
      return `✅ Plantilla 'pedido_aceptado_v2' enviada`
    }
    case 'en_camino':
    case 'recibido': {
      // Plantilla: ¡Buenas noticias {{1}}! 🥡 Tu repartidor *{{2}}* ya recogió tu pedido en *{{3}}* y va directo a tu domicilio. 🏠
      const components = [
        { type: 'header', parameters: [{ type: 'image', image: { link: 'https://jdrrkpvodnqoljycixbg.supabase.co/storage/v1/object/public/public-assets/logo.png' } }] },
        { type: 'body', parameters: [
          { type: 'text', text: nombreC }, // {{1}}
          { type: 'text', text: repC },    // {{2}}
          { type: 'text', text: restC }   // {{3}}
        ]}
      ]
      const res = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: telFormateado, type: 'template', template: { name: 'pedido_en_camino_v2', language: { code: 'es_MX' }, components } })
      })
      if (!res.ok) console.error(`WA error (pedido_en_camino_v2):`, await res.text())
      return `✅ Plantilla 'pedido_en_camino_v2' enviada`
    }
    case 'entregado': {
      // Plantilla: Hola {{1}} 👋, tu pedido de *{{2}}* Ha sido entregado...
      const components = [
        { type: 'header', parameters: [{ type: 'image', image: { link: 'https://jdrrkpvodnqoljycixbg.supabase.co/storage/v1/object/public/public-assets/logo.png' } }] },
        { type: 'body', parameters: [
          { type: 'text', text: nombreC }, // {{1}}
          { type: 'text', text: restC }    // {{2}}
        ]}
      ]
      const res = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: telFormateado, type: 'template', template: { name: 'pedido_entregado_v2', language: { code: 'es_MX' }, components } })
      })
      if (!res.ok) console.error(`WA error (pedido_entregado_v2):`, await res.text())
      return `✅ Plantilla 'pedido_entregado_v2' enviada`
    }
    default:
      return `ℹ️ Estado '${estado}' no dispara plantilla de cliente`
  }
}

function buildRepartidorAsignacionText(
  pedidoId: string, descripcion: string, direccion: string | null, restaurante: string | null, clienteNombre: string | null,
): string {
  return [
    `📦 *Nuevo Pedido Asignado — Estrella Delivery*`,
    ``,
    restaurante ? `🍽️ *Restaurante:* ${restaurante}` : null,
    clienteNombre ? `👤 *Cliente:* ${clienteNombre}` : null,
    `📝 *Pedido:* ${descripcion}`,
    direccion ? `📍 *Dirección:* ${direccion}` : null,
  ].filter(Boolean).join('\n')
}

// ── Handler principal ────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const bodyText = await req.text()
    console.log("NOTIFICAR_WHATSAPP INCOMING BODY:", bodyText)
    if (!bodyText) return new Response(JSON.stringify({ error: 'Body vacio' }), { status: 400 })
    
    const { pedido_id, tipo, repartidor_tel } = JSON.parse(bodyText) as {
      pedido_id: string
      tipo: 'asignacion' | 'recibido' | 'en_camino' | 'entregado' | 'creado'
      repartidor_tel?: string
    }

    if (!pedido_id || !tipo) {
      console.error("Falta pedido_id o tipo")
      return new Response(JSON.stringify({ error: 'pedido_id y tipo requeridos' }), { status: 400 })
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

    console.log("PEDIDO FOUND:", pedido.id, "ESTADO:", pedido.estado, "TIPO_NOTIFICACION:", tipo)

    const results: string[] = []

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
        // Enviar plantilla de NUEVA ORDEN al Repartidor
        // Header ({{1}}): Hola {{1}}, tienes un servicio asignado: 📦
        // Body ({{1}}, {{2}}): *Pedido:* {{1}} 📍 *Referencia:* {{2}}
        const rawDesc = pedido.descripcion || 'Paquete'
        const descT = pedido.restaurante ? `🍽️ ${pedido.restaurante} - ${rawDesc}` : rawDesc
        // Combinamos dirección de entrega con ubicación del restaurante
        const dirT = (pedido.direccion || 'Revisar detalles') + restLoc
        
        await sendWhatsAppTemplate(
          formatTel(repTelefono), 
          'estrella_delivery__nueva_orden', 
          [descT.substring(0, 1024), dirT.substring(0, 1024)], // Limitar para evitar errores de API
          [repNombre]    // Header Param {{1}}
        )
        
        const msg = buildRepartidorAsignacionText(pedido.id, descT, dirT, pedido.restaurante, pedido.cliente_nombre)
        try {
          await sendInteractiveButton(formatTel(repTelefono), msg, `BTN_ACEPTAR_${pedido.id}`, 'Aceptar Servicio')
        } catch (e) { console.log('El boton interactivo no pudo salir, posible ventana cerrada de 24h', e) }
        results.push(`✅ WA template y/o interactivo enviado al repartidor: ${repTelefono}`)
      } else {
        results.push('⚠️ Repartidor sin teléfono o no encontrado')
      }
    } else {
    // B. Notificar al Cliente (Si no es una asignación directa al repartidor)
    if (tipo !== 'asignacion' && pedido.cliente_tel) {
      // Intentar obtener nombre del repartidor asignado para las plantillas v2
      let repNom = 'tu repartidor'
      if (pedido.repartidor_id) {
        const { data: r } = await supabase.from('repartidores').select('nombre').eq('user_id', pedido.repartidor_id).limit(1).maybeSingle()
        if (r?.nombre) repNom = r.nombre
      }

      const resCli = await notificarCliente(
        tipo, 
        pedido.cliente_tel, 
        pedido.descripcion, 
        pedido.cliente_nombre ?? undefined, 
        pedido.direccion ?? undefined,
        pedido.restaurante ?? undefined,
        repNom
      )
      results.push(resCli)
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
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
