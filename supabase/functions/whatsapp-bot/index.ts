// supabase/functions/whatsapp-bot/index.ts
// WhatsApp AI Bot — Edge Function
// Recibe mensajes del admin vía webhook de Meta,
// usa Gemini para extraer datos del pedido,
// crea el pedido en Supabase y notifica al repartidor.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.2.0'

// ── Env vars ────────────────────────────────────────────────────────────────
const WA_TOKEN       = Deno.env.get('WHATSAPP_TOKEN')!
const WA_PHONE_ID    = Deno.env.get('WHATSAPP_PHONE_ID')!
const WA_VERIFY_TOKEN = Deno.env.get('WA_VERIFY_TOKEN') ?? 'estrella_bot_secret'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
// Número del admin en formato 52XXXXXXXXXX (sin +)
// Si está vacío, acepta mensajes de cualquier número (solo para desarrollo)
const ADMIN_PHONE    = Deno.env.get('ADMIN_PHONE') ?? ''

const BASE_LINK = 'https://www.app-estrella.shop/pedido'

// ── Helper: enviar WhatsApp ──────────────────────────────────────────────────
async function sendWA(to: string, body: string): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
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
    console.error('WA Error:', err)
  }
}

// ── Gemini: extrae JSON estructurado del texto ───────────────────────────────
interface PedidoData {
  clienteTel: string | null
  clienteNombre: string | null
  restaurante: string | null
  descripcion: string
  direccion: string | null
  repartidorAlias: string | null
}

async function extraerConGemini(texto: string): Promise<PedidoData | null> {
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = `Eres un asistente de logística de la empresa Estrella Delivery. 
Tu tarea es extraer información de pedidos de mensajes de WhatsApp enviados por un administrador.

Lee el siguiente mensaje y devuelve ÚNICAMENTE un objeto JSON válido (sin markdown, sin explicaciones) con exactamente este formato:
{
  "clienteTel": "número de 10 dígitos del cliente, solo números, null si no se menciona",
  "clienteNombre": "nombre completo del cliente, null si no se menciona",
  "restaurante": "nombre del restaurante de donde proviene el pedido, null si no aplica",
  "descripcion": "descripción breve de qué contiene el pedido o a dónde va",
  "direccion": "dirección de entrega si se menciona, null si no",
  "repartidorAlias": "nombre o alias del repartidor a quien se asigna, null si no se menciona"
}

Reglas:
- "clienteTel" debe ser exactamente 10 dígitos sin espacios ni guiones
- Si el mensaje es poco claro, deduce lo más probable
- "descripcion" nunca debe ser null, usa un resumen del mensaje
- Responde SOLO con el JSON, sin texto adicional

Mensaje del administrador:
"${texto.replace(/"/g, "'")}"
`

    const result = await model.generateContent(prompt)
    const text = result.response.text().trim()

    // Limpiar posible markdown ```json...```
    const clean = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
    return JSON.parse(clean) as PedidoData
  } catch (e) {
    console.error('Gemini error:', e)
    return null
  }
}

// ── Buscar repartidor por alias o nombre ─────────────────────────────────────
async function buscarRepartidor(supabase: ReturnType<typeof createClient>, alias: string | null) {
  if (!alias) return null
  const { data } = await supabase
    .from('repartidores')
    .select('id, user_id, telefono')
    .or(`alias.ilike.%${alias}%,nombre.ilike.%${alias}%`)
    .eq('activo', true)
    .limit(1)
    .maybeSingle()
  return data
}

// ── Crear pedido y notificar ──────────────────────────────────────────────────
async function crearPedidoDesdeBot(
  supabase: ReturnType<typeof createClient>,
  datos: PedidoData,
  lat?: number,
  lng?: number,
  messageId?: string,
  fromPhone?: string,
): Promise<{ ok: boolean; pedidoId?: string; error?: string }> {
  try {
    // Buscar repartidor
    const rep = await buscarRepartidor(supabase, datos.repartidorAlias)

    const insertData: Record<string, unknown> = {
      cliente_tel: datos.clienteTel ?? '0000000000',
      descripcion: datos.descripcion,
    }
    if (datos.clienteNombre) insertData.cliente_nombre = datos.clienteNombre
    if (datos.restaurante) insertData.restaurante = datos.restaurante
    if (datos.direccion) insertData.direccion = datos.direccion
    if (lat !== undefined) insertData.lat = lat
    if (lng !== undefined) insertData.lng = lng
    if (messageId) insertData.wb_message_id = messageId
    if (rep?.user_id) insertData.repartidor_id = rep.user_id

    const { data: inserted, error } = await supabase
      .from('pedidos')
      .insert(insertData)
      .select('id')
      .single()

    if (error) throw error

    const pedidoId = inserted.id as string

    // Notificar al repartidor si fue asignado
    if (rep?.telefono) {
      await supabase.functions.invoke('notificar-whatsapp', {
        body: { pedido_id: pedidoId, tipo: 'asignacion' },
      })
    }

    return { ok: true, pedidoId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Si es duplicado (wb_message_id ya existe), ignorar silenciosamente
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return { ok: true, pedidoId: undefined }
    }
    return { ok: false, error: msg }
  }
}

// ── Handler principal ────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // ── GET: verificación del webhook por Meta ──────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode      = url.searchParams.get('hub.mode')
    const token     = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  // ── POST: mensajes entrantes ────────────────────────────────────────────
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const body = await req.json()
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Extraer el mensaje del payload de Meta
    const entry = body?.entry?.[0]
    const change = entry?.changes?.[0]
    const value = change?.value
    const messages = value?.messages

    if (!messages || messages.length === 0) {
      return new Response('No messages', { status: 200 })
    }

    const msg = messages[0]
    const fromPhone = msg.from as string  // número del remitente (sin +)
    const messageId = msg.id as string

    // Filtro de seguridad: solo procesar mensajes del admin
    if (ADMIN_PHONE && !fromPhone.includes(ADMIN_PHONE.replace(/\D/g, ''))) {
      console.log(`Mensaje ignorado de ${fromPhone} — no es el admin (${ADMIN_PHONE})`)
      return new Response('OK', { status: 200 })
    }

    const msgType = msg.type as string
    let pedidoData: PedidoData | null = null
    let lat: number | undefined
    let lng: number | undefined

    // ── Caso 1: Ubicación GPS de WhatsApp ────────────────────────────────
    if (msgType === 'location') {
      lat = msg.location.latitude as number
      lng = msg.location.longitude as number

      // Intentamos leer el texto de contexto en el mensaje de respuesta (si hay)
      const contextText = msg.location.name ?? msg.location.address ?? ''

      pedidoData = {
        clienteTel: null,
        clienteNombre: null,
        restaurante: null,
        descripcion: contextText || `Entrega en coordenadas ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        direccion: msg.location.address ?? null,
        repartidorAlias: null,
      }
    }

    // ── Caso 2: Texto libre → Gemini ─────────────────────────────────────
    else if (msgType === 'text') {
      const texto = msg.text.body as string
      pedidoData = await extraerConGemini(texto)
    }

    // ── Caso 3: Imagen / audio / etc. → ignorar ──────────────────────────
    else {
      return new Response('OK — tipo de mensaje no soportado', { status: 200 })
    }

    if (!pedidoData) {
      // Gemini falló, informar al admin
      await sendWA(fromPhone, '❌ No pude entender el pedido. Por favor escribe los datos más claramente:\n- Nombre y teléfono del cliente\n- Restaurante (si aplica)\n- Descripción del pedido\n- Dirección de entrega\n- Nombre del repartidor')
      return new Response('OK', { status: 200 })
    }

    // Crear el pedido
    const result = await crearPedidoDesdeBot(supabase, pedidoData, lat, lng, messageId, fromPhone)

    if (result.ok && result.pedidoId) {
      const link = `${BASE_LINK}/${result.pedidoId}`
      const hasGps = lat !== undefined ? `\n📍 GPS: https://maps.google.com/?q=${lat},${lng}` : ''
      const repInfo = pedidoData.repartidorAlias ? `\n🚴 Asignado a: ${pedidoData.repartidorAlias}` : '\n⚠️ Sin repartidor asignado'

      await sendWA(fromPhone,
        `✅ *Pedido creado correctamente*${repInfo}\n` +
        `📦 ${pedidoData.descripcion}` +
        (pedidoData.clienteNombre ? `\n👤 ${pedidoData.clienteNombre}` : '') +
        (pedidoData.clienteTel ? ` (${pedidoData.clienteTel})` : '') +
        (pedidoData.restaurante ? `\n🍽️ ${pedidoData.restaurante}` : '') +
        (pedidoData.direccion ? `\n📍 ${pedidoData.direccion}` : '') +
        hasGps +
        `\n\n🔗 ${link}`
      )
    } else if (!result.ok) {
      await sendWA(fromPhone, `❌ Error al crear el pedido: ${result.error}`)
    }

    return new Response('OK', { status: 200 })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Error en whatsapp-bot:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
