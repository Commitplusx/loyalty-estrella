// restaurant-delivery-handler.ts
// Flujo B2B: Restaurante solicita un repartidor via WhatsApp.
// El restaurante puede mandar telefono, ubicacion y tiempo en 1-3 mensajes libres.
// El bot acumula, extrae con NLP (DeepSeek) y pide confirmacion antes de crear el pedido.

import { sendWA, sendInteractiveButtons } from './whatsapp.ts'
import { resolveH3Location } from './mandadito-handler.ts'
import * as h3 from 'npm:h3-js@4.1.0'

// ── Tipos internos ────────────────────────────────────────────────────────────

interface DeliveryDraft {
  clienteTel:     string | null
  destinoTexto:   string | null
  destinoLat:     number | null
  destinoLng:     number | null
  referencias:    string | null
  tiempoEstimado: string | null
  descripcion:    string | null
}

// ── Helpers de bot_memory ─────────────────────────────────────────────────────

const BUF_PREFIX     = 'rest_delivery_buf_'
const CONFIRM_PREFIX = 'rest_delivery_confirm_'
const DEBOUNCE_MS    = 8000  // 8 segundos para dar tiempo a que lleguen varios mensajes

async function getBuf(supabase: any, from10: string): Promise<string[]> {
  const { data } = await supabase.from('bot_memory').select('history').eq('phone', `${BUF_PREFIX}${from10}`).maybeSingle()
  return (data?.history as string[]) ?? []
}

async function pushBuf(supabase: any, from10: string, text: string) {
  const current = await getBuf(supabase, from10)
  current.push(text)
  await supabase.from('bot_memory').upsert({ phone: `${BUF_PREFIX}${from10}`, history: current, updated_at: new Date().toISOString() })
}

async function clearBuf(supabase: any, from10: string) {
  await supabase.from('bot_memory').delete().eq('phone', `${BUF_PREFIX}${from10}`)
}

async function getConfirm(supabase: any, from10: string): Promise<DeliveryDraft | null> {
  const { data } = await supabase.from('bot_memory').select('history').eq('phone', `${CONFIRM_PREFIX}${from10}`).maybeSingle()
  return (data?.history?.[0] as DeliveryDraft) ?? null
}

async function setConfirm(supabase: any, from10: string, draft: DeliveryDraft) {
  await supabase.from('bot_memory').upsert({ phone: `${CONFIRM_PREFIX}${from10}`, history: [draft], updated_at: new Date().toISOString() })
}

async function clearConfirm(supabase: any, from10: string) {
  await supabase.from('bot_memory').delete().eq('phone', `${CONFIRM_PREFIX}${from10}`)
}

// ── Extracción NLP con DeepSeek ───────────────────────────────────────────────
// Recibe todos los mensajes acumulados y devuelve un JSON estructurado.

async function extraerDatosDeliveryIA(textos: string[]): Promise<Partial<DeliveryDraft>> {
  try {
    const key = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('OPENAI_API_KEY')
    if (!key) return {}
    const url   = Deno.env.get('DEEPSEEK_API_KEY') ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions'
    const model = Deno.env.get('DEEPSEEK_API_KEY') ? 'deepseek-chat' : 'gpt-4o-mini'

    const mensajeJunto = textos.join('\n')

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Eres un asistente que extrae datos de pedidos de delivery de restaurantes en México.
Del texto del restaurante extrae EXACTAMENTE estos campos en JSON:
- "clienteTel": número de teléfono del CLIENTE (10 dígitos, sin prefijo 52, o null si no aparece)
- "destinoTexto": dirección o referencia del destino del CLIENTE (calle, colonia, referencia). Si es un link de Google Maps, ponlo aquí. null si no aparece.
- "tiempoEstimado": tiempo que tardará el pedido en estar listo (ej: "15 min", "30 min", "ya está listo"). null si no se menciona.
- "referencias": notas extra para el repartidor (color de puerta, referencias visuales). null si no aplica.
- "descripcion": breve descripción del pedido si la mencionan (ej: "2 hamburguesas"). null si no mencionan.
Responde SOLO JSON válido, sin texto extra.`
          },
          { role: 'user', content: mensajeJunto }
        ]
      })
    })

    const json = await res.json()
    const content = json.choices?.[0]?.message?.content?.trim().replace(/```json/gi, '').replace(/```/g, '')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

// ── Detectar link de Google Maps en texto ────────────────────────────────────
// Extrae lat/lng de links como maps.google.com/?q=16.2516,-92.1332

function extraerCoordsDeLink(texto: string): { lat: number; lng: number } | null {
  const patterns = [
    /maps\.google\.com\/\?q=([-\d.]+),([-\d.]+)/,
    /maps\.app\.goo\.gl/,   // shortlink — no extraíble sin resolver
    /google\.com\/maps\/place\/[^/]+\/@([-\d.]+),([-\d.]+)/,
    /\?q=([-\d.]+),([-\d.]+)/,
    /ll=([-\d.]+),([-\d.]+)/,
  ]
  for (const p of patterns) {
    const m = texto.match(p)
    if (m?.[1] && m?.[2]) {
      const lat = parseFloat(m[1])
      const lng = parseFloat(m[2])
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng }
    }
  }
  return null
}

// ── Resolver ubicación destino (texto → coords → H3 → precio) ───────────────

async function resolverDestino(
  supabase: any,
  textoDestino: string | null,
  latGps: number | null,
  lngGps: number | null
): Promise<{ lat: number | null; lng: number | null; nombreDisplay: string | null; precio: number | null }> {

  // 1. Prioridad: coords GPS directas (pin de WhatsApp ya procesado por el caller)
  if (latGps && lngGps) {
    const resolved = await resolveH3Location(supabase, latGps, lngGps)
    return {
      lat: latGps,
      lng: lngGps,
      nombreDisplay: resolved?.colonia_nombre ?? 'GPS recibido',
      precio: resolved?.precio ?? null
    }
  }

  // 2. Link de Google Maps embebido en texto
  if (textoDestino) {
    const coords = extraerCoordsDeLink(textoDestino)
    if (coords) {
      const resolved = await resolveH3Location(supabase, coords.lat, coords.lng)
      return {
        lat: coords.lat,
        lng: coords.lng,
        nombreDisplay: resolved?.colonia_nombre ?? textoDestino,
        precio: resolved?.precio ?? null
      }
    }
  }

  // 3. Texto libre → Google Maps API
  if (textoDestino && textoDestino.length > 3) {
    try {
      const MAPS_KEY = Deno.env.get('GOOGLE_MAPS_KEY') ?? ''
      if (MAPS_KEY) {
        const query = encodeURIComponent(`${textoDestino}, Comitán, Chiapas`)
        const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${MAPS_KEY}`, { signal: AbortSignal.timeout(3000) })
        const geoJson = await geoRes.json()
        if (geoJson.status === 'OK' && geoJson.results?.length > 0) {
          const loc = geoJson.results[0].geometry.location
          const resolved = await resolveH3Location(supabase, loc.lat, loc.lng)
          return {
            lat: loc.lat,
            lng: loc.lng,
            nombreDisplay: resolved?.colonia_nombre ? `${textoDestino} (${resolved.colonia_nombre})` : textoDestino,
            precio: resolved?.precio ?? null
          }
        }
      }
    } catch { /* no bloquear */ }

    // Sin coords — aceptar como texto, sin precio calculado todavía
    return { lat: null, lng: null, nombreDisplay: textoDestino, precio: null }
  }

  return { lat: null, lng: null, nombreDisplay: null, precio: null }
}

// ── Calcular precio (origen restaurante → destino cliente via H3) ─────────────

async function calcularPrecio(
  supabase: any,
  restLat: number | null,
  restLng: number | null,
  destLat: number | null,
  destLng: number | null,
  precioPorColonia: number | null
): Promise<number> {
  // Si tenemos destino, la tarifa la da el H3 del destino (precio por colonia)
  // El origen del restaurante se usa solo como referencia, no incrementa el precio.
  // En futuro se puede calcular por distancia también.
  if (precioPorColonia && precioPorColonia > 0) return precioPorColonia

  // Fallback: leer precio base de app_config
  try {
    const { data } = await supabase.from('app_config').select('configuracion_precios').eq('id', 'default').maybeSingle()
    const precioBase = data?.configuracion_precios?.precio_base ?? 45
    return precioBase
  } catch {
    return 45
  }
}

// ── Mensaje de confirmación ───────────────────────────────────────────────────

function buildConfirmMsg(
  restNombre: string,
  draft: DeliveryDraft,
  destinoDisplay: string,
  precio: number,
  clienteNombre: string | null,
  usoAutocompletado: boolean
): string {
  const clienteStr = clienteNombre ? `${clienteNombre} | ${draft.clienteTel}` : draft.clienteTel
  const refStr     = draft.referencias ? `\n📝 Referencia: ${draft.referencias}` : ''
  const descStr    = draft.descripcion ? `\n🛍️ Pedido: ${draft.descripcion}` : ''
  const tiempoStr  = draft.tiempoEstimado ? `\n⏱️ Listo en: ${draft.tiempoEstimado}` : ''
  const autoStr    = usoAutocompletado ? `\n🔄 _Se autocompletó con la última dirección registrada._` : ''
  return (
    `📋 *Resumen del envío*\n\n` +
    `🏪 Restaurante: ${restNombre}\n` +
    `👤 Cliente: ${clienteStr}\n` +
    `📍 Destino: ${destinoDisplay}${refStr}${descStr}${tiempoStr}${autoStr}\n` +
    `💰 Costo de envío: *$${precio}*\n\n` +
    `¿Lo confirmamos?`
  )
}

// ── Handler principal ─────────────────────────────────────────────────────────
// Llamado desde index.ts cuando userLabel === 'restaurante' y msgType es text o location.

export async function handleRestaurantDeliveryMessage(
  supabase: any,
  fromPhone: string,
  from10: string,
  restData: { id: string; nombre: string },
  msgType: string,
  msg: any
): Promise<Response | null> {

  const texto = (msg.text?.body as string ?? '').trim()
  const lowerTexto = texto.toLowerCase()

  // ── Cancelar ─────────────────────────────────────────────────────────────
  if (lowerTexto === 'cancelar' || lowerTexto === '/cancelar') {
    await clearBuf(supabase, from10)
    await clearConfirm(supabase, from10)
    await sendWA(fromPhone, `❌ Solicitud de envío cancelada.`)
    return new Response('OK', { status: 200 })
  }

  // ── ¿Hay un borrador esperando confirmación? ─────────────────────────────
  const pendingConfirm = await getConfirm(supabase, from10)
  if (pendingConfirm) {
    // No esperamos botón, simplemente ignoramos texto libre mientras hay confirmación pendiente
    // (Los botones los maneja button-handler.ts → REST_DELIVERY_CONFIRM / REST_DELIVERY_CANCEL)
    await sendWA(fromPhone, `Por favor confirma o cancela el envío anterior con los botones de arriba. Escribe *cancelar* para descartarlo.`)
    return new Response('OK', { status: 200 })
  }

  // ── Acumular mensaje en buffer ────────────────────────────────────────────
  if (msgType === 'location') {
    const loc = msg.location as { latitude?: number; longitude?: number } | undefined
    if (loc?.latitude && loc?.longitude) {
      await pushBuf(supabase, from10, `GPS:${loc.latitude},${loc.longitude}`)
    }
  } else if (texto.length > 0) {
    await pushBuf(supabase, from10, texto)
  }

  // ── Debounce: esperar 2s por si llegan más mensajes ──────────────────────
  const uniqueId = `${Date.now()}`
  const debounceKey = `rest_delivery_debounce_${from10}`
  await supabase.from('bot_memory').upsert({ phone: debounceKey, history: [uniqueId], updated_at: new Date().toISOString() })
  await new Promise(r => setTimeout(r, DEBOUNCE_MS))

  // ¿Soy el último mensaje (ganador del debounce)?
  const { data: latestDebounce } = await supabase.from('bot_memory').select('history').eq('phone', debounceKey).maybeSingle()
  if (latestDebounce?.history?.[0] !== uniqueId) return new Response('OK', { status: 200 }) // otro mensaje ganó

  // ── Procesar buffer acumulado ─────────────────────────────────────────────
  const buffer = await getBuf(supabase, from10)
  await clearBuf(supabase, from10)
  await supabase.from('bot_memory').delete().eq('phone', debounceKey)

  if (buffer.length === 0) return null

  // Separar líneas GPS del texto libre
  let latGps: number | null = null
  let lngGps: number | null = null
  const textosMensajes: string[] = []

  for (const line of buffer) {
    if (line.startsWith('GPS:')) {
      const [, coords] = line.split(':')
      const [lat, lng] = coords.split(',').map(Number)
      if (!isNaN(lat) && !isNaN(lng)) { latGps = lat; lngGps = lng }
    } else {
      textosMensajes.push(line)
    }
  }

  // ── NLP: extraer datos del texto ──────────────────────────────────────────
  const extracted = textosMensajes.length > 0
    ? await extraerDatosDeliveryIA(textosMensajes)
    : {}

  // Si el GPS vino en este batch, usarlo como destino
  if (latGps && lngGps && !extracted.destinoLat) {
    extracted.destinoLat = latGps
    extracted.destinoLng = lngGps
  }

  // ── Validar datos mínimos obligatorios ────────────────────────────────────
  // OBLIGATORIO: clienteTel + (destino en texto O coords GPS)
  const tieneTel    = !!extracted.clienteTel && /^\d{10}$/.test(extracted.clienteTel.replace(/\D/g, '').slice(-10))
  const tieneDestino = !!(extracted.destinoTexto || extracted.destinoLat || latGps)

  if (!tieneTel || !tieneDestino) {
    let faltantes = []
    if (!tieneTel)    faltantes.push('el *número de teléfono del cliente* (10 dígitos)')
    if (!tieneDestino) faltantes.push('la *dirección o ubicación del cliente* (texto, pin GPS o link de Maps)')
    await sendWA(fromPhone,
      `⚠️ Faltan datos para crear el envío:\n\n${faltantes.map(f => `• ${f}`).join('\n')}\n\nMándame esa información y te preparo el resumen.`
    )
    // Re-guardar lo que sí obtuvimos para el próximo mensaje
    await supabase.from('bot_memory').upsert({
      phone: `${BUF_PREFIX}${from10}`,
      history: [JSON.stringify(extracted)],
      updated_at: new Date().toISOString()
    })
    return new Response('OK', { status: 200 })
  }

  // ── Resolver destino → coords + precio ───────────────────────────────────
  const clienteTel = extracted.clienteTel!.replace(/\D/g, '').slice(-10)

  // Buscar cliente en BD si existe o crearlo si es nuevo
  let { data: clienteRow } = await supabase.from('clientes').select('id, nombre, notas_crm').eq('telefono', clienteTel).maybeSingle()
  let clienteNombre = clienteRow?.nombre ?? null

  if (!clienteRow) {
    const qrCode = `EXPRESS-${clienteTel}-${Date.now()}`
    const { data: newCli } = await supabase.from('clientes').insert({
      telefono: clienteTel,
      nombre: 'Cliente Express',
      qr_code: qrCode,
      acepta_terminos: false,
      puntos: 0,
      etiquetas: ['express']
    }).select('id, nombre, notas_crm').maybeSingle()
    clienteRow = newCli
    clienteNombre = newCli?.nombre ?? null
  }

  // Autocompletado de dirección desde notas_crm si no envió ubicación
  let destinoFinalText = extracted.destinoTexto ?? null
  let usoAutocompletado = false
  if (!destinoFinalText && !latGps && !extracted.destinoLat && clienteRow?.notas_crm?.includes('📍 Última entrega:')) {
    const parts = clienteRow.notas_crm.split('📍 Última entrega:')
    if (parts.length > 1) {
       destinoFinalText = parts[1].trim()
       usoAutocompletado = true
    }
  }

  const destinoResuelto = await resolverDestino(
    supabase,
    destinoFinalText,
    latGps ?? extracted.destinoLat ?? null,
    lngGps ?? extracted.destinoLng ?? null
  )

  // Validar si al final obtuvimos dirección (ya sea nueva o reciclada)
  if (!destinoResuelto.nombreDisplay && !destinoResuelto.lat) {
    await sendWA(fromPhone, `⚠️ No logré ubicar la dirección. Por favor manda un texto más claro o un PIN de GPS.`)
    await supabase.from('bot_memory').upsert({
      phone: `${BUF_PREFIX}${from10}`,
      history: [JSON.stringify(extracted)],
      updated_at: new Date().toISOString()
    })
    return new Response('OK', { status: 200 })
  }

  // Leer datos del restaurante (para coords de origen y precio)
  const { data: restRow } = await supabase.from('restaurantes').select('lat, lng').eq('id', restData.id).maybeSingle()
  const precio = await calcularPrecio(supabase, restRow?.lat ?? null, restRow?.lng ?? null, destinoResuelto.lat, destinoResuelto.lng, destinoResuelto.precio)

  // ── Armar borrador completo ───────────────────────────────────────────────
  const draft: DeliveryDraft = {
    clienteTel,
    destinoTexto:   destinoResuelto.nombreDisplay ?? destinoFinalText ?? null,
    destinoLat:     destinoResuelto.lat,
    destinoLng:     destinoResuelto.lng,
    referencias:    extracted.referencias ?? null,
    tiempoEstimado: extracted.tiempoEstimado ?? null,
    descripcion:    extracted.descripcion ?? null,
  }

  await setConfirm(supabase, from10, draft)

  // ── Enviar resumen con botones Confirmar / Cancelar ───────────────────────
  const msg_resumen = buildConfirmMsg(restData.nombre, draft, destinoResuelto.nombreDisplay ?? draft.destinoTexto ?? 'Sin dirección', precio, clienteNombre, usoAutocompletado)

  await sendInteractiveButtons(fromPhone, msg_resumen, [
    { id: `REST_DELIVERY_CONFIRM_${precio}`, title: '✅ Confirmar' },
    { id: 'REST_DELIVERY_CANCEL',            title: '❌ Cancelar' },
  ])

  return new Response('OK', { status: 200 })
}

// ── Confirmar y crear el pedido en BD ─────────────────────────────────────────
// Llamado desde button-handler.ts cuando buttonId.startsWith('REST_DELIVERY_CONFIRM')

export async function confirmarRestaurantDelivery(
  supabase: any,
  fromPhone: string,
  from10: string,
  restData: { id: string; nombre: string },
  buttonId: string
): Promise<Response> {

  const draft = await getConfirm(supabase, from10)
  if (!draft) {
    await sendWA(fromPhone, `⚠️ No encontré el borrador del envío. Por favor vuelve a enviarlo.`)
    return new Response('OK', { status: 200 })
  }

  // Extraer precio del buttonId (REST_DELIVERY_CONFIRM_{precio})
  const precioStr = buttonId.replace('REST_DELIVERY_CONFIRM_', '')
  const precio = parseFloat(precioStr) || 45

  // Generar ID de ticket corto (6 chars alfanumérico)
  const ticketBytes = crypto.getRandomValues(new Uint8Array(3))
  const ticketId    = Array.from(ticketBytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()

  // Buscar nombre del cliente
  const { data: clienteRow } = await supabase.from('clientes').select('nombre').eq('telefono', draft.clienteTel).maybeSingle()
  const clienteNombre = clienteRow?.nombre ?? null

  // Crear pedido en BD
  const { data: pedido, error } = await supabase.from('pedidos').insert({
    wb_message_id:  ticketId,
    restaurante_id: restData.id,
    restaurante:    restData.nombre,
    cliente_tel:    draft.clienteTel,
    cliente_nombre: clienteNombre,
    descripcion:    draft.descripcion ?? `Envío solicitado por ${restData.nombre}`,
    direccion:      draft.destinoTexto,
    lat:            draft.destinoLat,
    lng:            draft.destinoLng,
    referencias:    draft.referencias,
    tiempo_estimado: draft.tiempoEstimado,
    total:          precio,
    precio_entrega: precio,
    estado:         'pendiente',
    estado_pago:    'efectivo',
    tipo_pedido:    'restaurante_delivery',
    metodo_pago:    'efectivo',
    origen:         restData.nombre,
    created_at:     new Date().toISOString(),
    updated_at:     new Date().toISOString(),
  }).select('id').maybeSingle()

  await clearConfirm(supabase, from10)

  // Guardar última dirección en notas_crm
  if (draft.destinoTexto) {
    const { data: cliInfo } = await supabase.from('clientes').select('notas_crm').eq('telefono', draft.clienteTel).maybeSingle()
    if (cliInfo) {
      const notasSinDir = (cliInfo.notas_crm ?? '').split('📍 Última entrega:')[0].trim()
      const nuevasNotas = `${notasSinDir}\n\n📍 Última entrega: ${draft.destinoTexto}`.trim()
      await supabase.from('clientes').update({ notas_crm: nuevasNotas }).eq('telefono', draft.clienteTel)
    }
  }

  if (error) {
    await sendWA(fromPhone, `❌ Error al crear el pedido: ${error.message}`)
    return new Response('OK', { status: 200 })
  }

  await sendWA(fromPhone,
    `🚀 *¡Pedido creado!*\n\n` +
    `🎟️ Ticket: *#${ticketId}*\n` +
    `📍 Destino: ${draft.destinoTexto ?? 'Sin dirección'}\n` +
    `💰 Costo: $${precio}\n\n` +
    `Un repartidor de Estrella Delivery pasará pronto a recogerlo. 🛵`
  )

  return new Response('OK', { status: 200 })
}
