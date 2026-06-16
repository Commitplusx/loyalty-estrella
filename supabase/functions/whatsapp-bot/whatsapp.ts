// ══════════════════════════════════════════════════════════════════════════════
// whatsapp.ts — Helpers para enviar mensajes via WhatsApp Cloud API
// ══════════════════════════════════════════════════════════════════════════════

import { syncOutgoingToChatwoot } from './chatwoot-sync.ts'
import { logError } from '../_shared/utils.ts'
const WA_TOKEN    = Deno.env.get('WHATSAPP_TOKEN')!
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')!

const WA_BASE = `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`
const WA_HEADERS = () => ({
  Authorization: `Bearer ${WA_TOKEN}`,
  'Content-Type': 'application/json',
})

// ── Realizamos la petición con reintentos para manejar fallos temporales de la red ──
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
export async function sendWA(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
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
    if (!res.ok) {
      const errText = await res.text();
      console.error('WA Error:', errText);
      await logError('whatsapp-bot', `WhatsApp API Error (Text)`, { phone: to, error: errText }, 'error');
      return { ok: false, error: errText }
    }
    else {
      syncOutgoingToChatwoot(to, body).catch(e => console.error(e))
      return { ok: true }
    }
  } catch (e: any) {
    console.error('WA Fatal Net Error:', e)
    await logError('whatsapp-bot', `WhatsApp Fatal Net Error (Text)`, { phone: to, error: String(e) }, 'critical');
    return { ok: false, error: e.message }
  }
}


// ── Imagen con caption ────────────────────────────────────────────────────────
export async function sendWAImage(to: string, url: string, caption?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchConReintento(WA_BASE, {
      method: 'POST',
      headers: WA_HEADERS(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'image',
        image: { link: url, caption: caption?.substring(0, 1000) },
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      console.error('WA Image Error:', errText)
      return { ok: false, error: errText }
    }
    else {
      syncOutgoingToChatwoot(to, `📷 [Imagen enviada] ${caption || ''}`).catch(e => console.error(e))
      return { ok: true }
    }
  } catch (e) {
    console.error('WA Fatal Net Error (Image):', e)
    return { ok: false, error: String(e) }
  }
}

// ── Documento (PDF) ───────────────────────────────────────────────────────────
export async function sendWADocument(to: string, url: string, filename: string, caption: string = ''): Promise<void> {
  try {
    const res = await fetchConReintento(WA_BASE, {
      method: 'POST',
      headers: WA_HEADERS(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: { link: url, caption: caption.substring(0, 1024), filename }
      })
    })
    if (!res.ok) console.error('WA Document Error:', await res.text())
    else syncOutgoingToChatwoot(to, `📄 [Documento enviado: ${filename}] ${caption}`).catch(e => console.error(e))
  } catch (e) {
    console.error('WA Fatal Net Error (Document):', e)
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
    else syncOutgoingToChatwoot(to, `📍 [Ubicación enviada] ${name}`).catch(e => console.error(e))
  } catch (e) {
    console.error('WA Fatal Net Error (Location):', e)
  }
}

// ── Pedir Ubicación (Location Request Message) ─────────────────────────────────
export async function sendLocationRequest(to: string, text: string): Promise<void> {
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
          type: 'location_request_message',
          body: { text: text.substring(0, 1024) },
          action: { name: 'send_location' }
        },
      }),
    })
    if (!res.ok) console.error('WA Location Request Error:', await res.text())
    else syncOutgoingToChatwoot(to, `${text}\n[Botón: 📍 Enviar Ubicación]`).catch(e => console.error(e))
  } catch (e) {
    console.error('WA Fatal Net Error (Location Request):', e)
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
          body: { text: text.substring(0, 1024) },
          action: { buttons: [{ type: 'reply', reply: { id: buttonId, title: buttonTitle } }] },
        },
      }),
    })
    if (!res.ok) console.error('WA Interactive Error:', await res.text())
    else syncOutgoingToChatwoot(to, `${text}\n[Botón] ${buttonTitle}`).catch(e => console.error(e))
  } catch (e) {
    console.error('WA Fatal Net Error (Interactive):', e)
  }
}

// ── Múltiples botones interactivos (hasta 3) ──────────────────────────────────
// Intento 1: con imagen en header (si aplica)
// Intento 2: sin imagen en header
// Intento 3: texto plano con las opciones escritas
export async function sendInteractiveButtons(
  to: string,
  text: string,
  buttons: { id: string; title: string }[],
  headerImageUrl?: string
): Promise<boolean> {
  const btns = buttons.slice(0, 3).map(b => ({
    type: 'reply',
    reply: { id: b.id.substring(0, 256), title: b.title.substring(0, 20) }
  }))

  if (btns.length === 0) {
    console.warn('⚠️ sendInteractiveButtons: botones vacíos, mandando como texto.')
    await sendWA(to, text)
    return true
  }

  const buildPayload = (withImage: boolean): any => {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: text.substring(0, 1024) },
        action: { buttons: btns },
      },
    }
    if (withImage && headerImageUrl) {
      payload.interactive.header = { type: 'image', image: { link: headerImageUrl } }
    }
    return payload
  }

  // Intento 1: con imagen
  if (headerImageUrl) {
    try {
      const res = await fetchConReintento(WA_BASE, { method: 'POST', headers: WA_HEADERS(), body: JSON.stringify(buildPayload(true)) })
      if (res.ok) {
        syncOutgoingToChatwoot(to, `${text}\n[Botones+Imagen] ${buttons.map(b => b.title).join(' | ')}`).catch(console.error)
        return true
      }
      console.warn('WA Buttons+Image failed:', await res.text())
    } catch (e) { console.error('WA Buttons+Image exception:', e) }
  }

  // Intento 2: sin imagen
  try {
    const res = await fetchConReintento(WA_BASE, { method: 'POST', headers: WA_HEADERS(), body: JSON.stringify(buildPayload(false)) })
    if (res.ok) {
      syncOutgoingToChatwoot(to, `${text}\n[Botones] ${buttons.map(b => b.title).join(' | ')}`).catch(console.error)
      return true
    }
    console.warn('WA Buttons (no image) failed:', await res.text())
  } catch (e) { console.error('WA Buttons exception:', e) }

  // Intento 3: texto plano con las opciones
  console.warn('⚠️ Botones interactivos fallaron en todos los intentos. Mandando como texto plano.')
  try {
    const opts = buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n')
    await sendWA(to, `${text}\n\n${opts}`)
    return true
  } catch (e) {
    console.error('WA Fallback text also failed:', e)
    return false
  }
}

// ── Lista interactiva (hasta 10 opciones) ─────────────────────────────────────
export async function sendInteractiveList(
  to: string,
  text: string,
  buttonText: string,
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]
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
          type: 'list',
          body: { text: text.substring(0, 1024) },
          action: {
            button: buttonText.substring(0, 20),
            sections: sections.map(s => ({
              title: s.title.substring(0, 24),
              rows: s.rows.slice(0, 10).map(r => ({
                id: r.id.substring(0, 200),
                title: r.title.substring(0, 24),
                description: (r.description || '').substring(0, 72)
              }))
            }))
          },
        },
      }),
    })
    if (!res.ok) console.error('WA InteractiveList Error:', await res.text())
    else syncOutgoingToChatwoot(to, `${text}\n[Lista] ${buttonText}`).catch(e => console.error(e))
  } catch (e) {
    console.error('WA Fatal Net Error (InteractiveList):', e)
  }
}

// ── CTA URL Button (Abrir enlace) ─────────────────────────────────────────────
export async function sendInteractiveCtaUrl(
  to: string,
  text: string,
  buttonText: string,
  url: string,
  headerText?: string
): Promise<void> {
  try {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: text.substring(0, 1024) },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: buttonText.substring(0, 20),
            url: url
          }
        }
      }
    }
    
    if (headerText) {
      payload.interactive.header = {
        type: 'text',
        text: headerText.substring(0, 60)
      }
    }

    const res = await fetchConReintento(WA_BASE, {
      method: 'POST',
      headers: WA_HEADERS(),
      body: JSON.stringify(payload),
    })
    if (!res.ok) console.error('WA CTA URL Error:', await res.text())
    else syncOutgoingToChatwoot(to, `${text}\n[Enlace: ${url}]`).catch(e => console.error(e))
  } catch (e) {
    console.error('WA Fatal Net Error (CTA URL):', e)
  }
}

// ── Plantilla Meta (WhatsApp Template) ────────────────────────────────────────
export async function sendWATemplate(
  to: string,
  templateName: string,
  params: string[],
  mediaUrl?: string,
  buttonParam?: string,
  language: string = 'es_MX'
): Promise<{ ok: boolean; error?: string }> {
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

    // Botón URL dinámico (Opcional)
    if (buttonParam) {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: buttonParam }]
      })
    }

    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: templateName, language: { code: language }, components }
    }
    console.log(`[TEMPLATE] Enviando '${templateName}' a ${to} | componentes: ${JSON.stringify(components)}`)

    const res = await fetchConReintento(WA_BASE, {
      method: 'POST',
      headers: WA_HEADERS(),
      body: JSON.stringify(payload),
    })

    const respText = await res.text()
    if (!res.ok) {
      console.error(`[TEMPLATE] ❌ '${templateName}' HTTP ${res.status} → ${respText}`)
      await logError('whatsapp-bot', `WhatsApp Template Error: ${templateName}`, { phone: to, error: respText }, 'critical');
      return { ok: false, error: respText }
    }
    console.log(`[TEMPLATE] ✅ '${templateName}' enviada → ${respText.substring(0, 120)}`)
    syncOutgoingToChatwoot(to, `📲 [Plantilla] ${templateName}\n${params.join(' | ')}`).catch(e => console.error(e))
    return { ok: true }
  } catch (e: any) {
    console.error(`[TEMPLATE] 💥 Error fatal '${templateName}':`, e)
    await logError('whatsapp-bot', `WhatsApp Template Fatal Error: ${templateName}`, { phone: to, error: String(e) }, 'critical');
    return { ok: false, error: e.message }
  }
}

// ── Smart VIP Card Sender (Try Free-Form, Fallback to Template) ───────────────
export async function sendVIPCardSmart(
  to: string, // format 529631444160
  qrImageUrl: string,
  nombre: string,
  puntos: number,
  cTel: string
): Promise<{ ok: boolean; error?: string }> {
  // 1. Try sending as Free-Form Image message first (Requires 24h window open)
  const loyaltyUrl = `https://www.app-estrella.shop/loyalty/${cTel}`
  const caption = `🌟 *¡Hola, ${nombre}!* Aquí tienes tu *Tarjeta VIP Digital* actualizada.\n\n⭐ Puntos actuales: *${puntos}*\n\n🔗 *Abre tu Tarjeta VIP interactiva aquí:* ${loyaltyUrl}`
  
  const freeFormResult = await sendWAImage(to, qrImageUrl, caption)
  
  if (freeFormResult.ok) {
    console.log(`[VIP_SMART] ✅ Imagen VIP enviada como texto libre a ${to}. (Ventana 24h abierta)`)
    return { ok: true }
  }

  // 2. If it fails (probably due to 24h window, error 131047), fallback to Template
  console.warn(`[VIP_SMART] ⚠️ Envío libre falló. Intentando con plantilla estrella_loyalty_welcome...`)
  const templateResult = await sendWATemplate(
    to,
    'estrella_loyalty_welcome',
    [nombre, puntos.toString()],
    qrImageUrl,
    cTel
  )

  return templateResult
}

// ── Marcar mensaje como leído (Double Blue Ticks) ────────────────────────────
export async function markMessageAsRead(messageId: string): Promise<void> {
  try {
    const res = await fetchConReintento(WA_BASE, {
      method: 'POST',
      headers: WA_HEADERS(),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    })
    if (!res.ok) console.error('WA Read Receipt Error:', await res.text())
  } catch (e) {
    console.error('WA Fatal Net Error (Read Receipt):', e)
  }
}

// ── Notificar al Admin (Alertas de B2B y Críticas) ──────────────────────────
export async function notifyAdmin(message: string): Promise<void> {
  const adminPhonesStr = Deno.env.get('ADMIN_PHONES') || Deno.env.get('ADMIN_PHONE') || ''
  const adminPhones = adminPhonesStr.split(',').map(p => p.trim()).filter(Boolean)
  
  if (adminPhones.length === 0) {
    console.warn('⚠️ No hay ADMIN_PHONES/ADMIN_PHONE configurados para notifyAdmin')
    return
  }

  // Solo notificamos al primer admin para evitar spam
  const primaryAdmin = adminPhones[0]
  let admin10 = primaryAdmin
  if (primaryAdmin.length > 10) admin10 = primaryAdmin.slice(-10)

  try {
    await sendWA(`52${admin10}`, `🚨 *ALERTA DEL SISTEMA*\n\n${message}`)
  } catch (e) {
    console.error('Error enviando notifyAdmin:', e)
  }
}
