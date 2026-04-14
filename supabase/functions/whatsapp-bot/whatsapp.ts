// ══════════════════════════════════════════════════════════════════════════════
// whatsapp.ts — Helpers para enviar mensajes via WhatsApp Cloud API
// ══════════════════════════════════════════════════════════════════════════════

const WA_TOKEN    = Deno.env.get('WHATSAPP_TOKEN')!
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')!

const WA_BASE = `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`
const WA_HEADERS = () => ({
  Authorization: `Bearer ${WA_TOKEN}`,
  'Content-Type': 'application/json',
})

// ── Fetch con reintento exponencial ──────────────────────────────────────────
export async function fetchConReintento(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)
      const res = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeoutId)

      if (res.ok) return res
      if (res.status >= 500 || res.status === 429) {
        console.warn(`⚠️ [REINTENTO ${i + 1}/${retries}] WA API HTTP ${res.status}`)
        await new Promise(r => setTimeout(r, 1000 * (i + 1)))
        continue
      }
      return res
    } catch (err: any) {
      console.warn(`⚠️ [REINTENTO ${i + 1}/${retries}] Network error: ${err.message}`)
      if (i === retries - 1) throw err
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
  throw new Error('Agotado máximo de reintentos WA')
}

// ── Texto simple ──────────────────────────────────────────────────────────────
export async function sendWA(to: string, body: string): Promise<void> {
  try {
    const res = await fetchConReintento(WA_BASE, {
      method: 'POST',
      headers: WA_HEADERS(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: true, body },
      }),
    })
    if (!res.ok) console.error('WA Error:', await res.text())
  } catch (e) {
    console.error('WA Fatal Net Error:', e)
  }
}

// ── Imagen con caption ────────────────────────────────────────────────────────
export async function sendWAImage(to: string, url: string, caption?: string): Promise<void> {
  try {
    const res = await fetchConReintento(WA_BASE, {
      method: 'POST',
      headers: WA_HEADERS(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'image',
        image: { url, caption: caption?.substring(0, 1000) },
      }),
    })
    if (!res.ok) console.error('WA Image Error:', await res.text())
  } catch (e) {
    console.error('WA Fatal Net Error (Image):', e)
  }
}

// ── Ubicación GPS ─────────────────────────────────────────────────────────────
export async function sendWALocation(to: string, lat: number, lng: number, name: string, address: string): Promise<void> {
  try {
    const res = await fetchConReintento(WA_BASE, {
      method: 'POST',
      headers: WA_HEADERS(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'location',
        location: {
          latitude: lat,
          longitude: lng,
          name: name.substring(0, 1000),
          address: address.substring(0, 1000),
        },
      }),
    })
    if (!res.ok) console.error('WA Location Error:', await res.text())
  } catch (e) {
    console.error('WA Fatal Net Error (Location):', e)
  }
}

// ── Botón interactivo ─────────────────────────────────────────────────────────
export async function sendInteractiveButton(
  to: string,
  text: string,
  buttonId: string,
  buttonTitle: string,
): Promise<void> {
  try {
    const res = await fetchConReintento(WA_BASE, {
      method: 'POST',
      headers: WA_HEADERS(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text },
          action: { buttons: [{ type: 'reply', reply: { id: buttonId, title: buttonTitle } }] },
        },
      }),
    })
    if (!res.ok) console.error('WA Interactive Error:', await res.text())
  } catch (e) {
    console.error('WA Fatal Net Error (Interactive):', e)
  }
}
// ── Plantilla Meta (WhatsApp Template) ────────────────────────────────────────
export async function sendWATemplate(
  to: string,
  templateName: string,
  params: string[],
  mediaUrl?: string
): Promise<void> {
  try {
    const components: any[] = []

    // Si hay imagen (Header)
    if (mediaUrl) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: mediaUrl } }]
      })
    }

    // Cuerpo (Body Params)
    if (params.length > 0) {
      components.push({
        type: 'body',
        parameters: params.map(p => ({ type: 'text', text: p }))
      })
    }

    const res = await fetchConReintento(WA_BASE, {
      method: 'POST',
      headers: WA_HEADERS(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'es' },
          components
        }
      }),
    })
    if (!res.ok) console.error('WA Template Error:', await res.text())
  } catch (e) {
    console.error('WA Fatal Net Error (Template):', e)
  }
}
