// supabase/functions/notificar-whatsapp/index.ts
// Supabase Edge Function — Envía notificaciones WhatsApp al repartidor y al cliente
// Disparada manualmente desde la app Flutter con el estado del pedido.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WA_TOKEN    = Deno.env.get('WHATSAPP_TOKEN')!
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const BASE_LINK = 'https://www.app-estrella.shop/pedido'

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTel(raw: string): string {
  // Asegura que el número tenga prefijo México (+52)
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('52')) return digits
  return `52${digits}`
}

async function sendWhatsApp(to: string, body: string): Promise<void> {
  const url = `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`
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
      type: 'text',
      text: { preview_url: true, body },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`WhatsApp API error: ${err}`)
  }
}

// ── Mensajes por estado ──────────────────────────────────────────────────────

function mensajeCliente(estado: string, descripcion: string, clienteNombre?: string): string | null {
  const saludo = clienteNombre ? `Hola *${clienteNombre}* 👋` : 'Hola 👋'
  switch (estado) {
    case 'recibido':
      return `🛵 *Estrella Delivery*\n${saludo}, tu pedido fue recibido por el repartidor.\n📦 *${descripcion}*\n\nEn camino muy pronto.`
    case 'en_camino':
      return `🚀 *Estrella Delivery*\n${saludo}, ¡tu pedido está en camino!\n📦 *${descripcion}*\n\nEspéralo muy pronto.`
    case 'entregado':
      return `✅ *Estrella Delivery*\n${saludo}, ¡tu pedido fue entregado!\n📦 *${descripcion}*\n\n¡Gracias por preferirnos! 🌟`
    default:
      return null
  }
}

function mensajeRepartidor(
  pedidoId: string,
  descripcion: string,
  direccion: string | null,
  restaurante: string | null,
  clienteNombre: string | null,
): string {
  const link = `${BASE_LINK}/${pedidoId}`
  return [
    `📦 *Nuevo Pedido Asignado — Estrella Delivery*`,
    ``,
    restaurante ? `🍽️ *Restaurante:* ${restaurante}` : null,
    clienteNombre ? `👤 *Cliente:* ${clienteNombre}` : null,
    `📝 *Pedido:* ${descripcion}`,
    direccion ? `📍 *Dirección:* ${direccion}` : null,
    ``,
    `Toca el link para ver los detalles y actualizar el estado:`,
    link,
  ].filter(Boolean).join('\n')
}

// ── Handler principal ────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { pedido_id, tipo } = await req.json() as {
      pedido_id: string
      tipo: 'asignacion' | 'recibido' | 'en_camino' | 'entregado'
    }

    if (!pedido_id || !tipo) {
      return new Response(JSON.stringify({ error: 'pedido_id y tipo son requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Obtener datos del pedido
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data: pedido, error } = await supabase
      .from('pedidos')
      .select('*, auth_user:repartidor_id(email, raw_user_meta_data)')
      .eq('id', pedido_id)
      .single()

    if (error || !pedido) {
      return new Response(JSON.stringify({ error: 'Pedido no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const results: string[] = []

    if (tipo === 'asignacion') {
      // Buscar el teléfono del repartidor en la tabla repartidores
      const { data: rep } = await supabase
        .from('repartidores')
        .select('telefono')
        .eq('user_id', pedido.repartidor_id)
        .maybeSingle()

      if (rep?.telefono) {
        const msg = mensajeRepartidor(
          pedido_id,
          pedido.descripcion,
          pedido.direccion ?? null,
          pedido.restaurante ?? null,
          pedido.cliente_nombre ?? null,
        )
        await sendWhatsApp(formatTel(rep.telefono), msg)
        results.push(`✅ WhatsApp enviado al repartidor (${rep.telefono})`)
      } else {
        results.push('⚠️ Repartidor sin teléfono registrado, no se envió WA')
      }
    } else {
      // Notificar al cliente
      const msg = mensajeCliente(tipo, pedido.descripcion, pedido.cliente_nombre ?? undefined)
      if (msg && pedido.cliente_tel) {
        await sendWhatsApp(formatTel(pedido.cliente_tel), msg)
        results.push(`✅ WhatsApp enviado al cliente (${pedido.cliente_tel})`)
      }
    }

    return new Response(JSON.stringify({ ok: true, actions: results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
