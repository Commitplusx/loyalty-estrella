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
    if (!res.ok) {
      const errText = await res.text();
      console.error('WA Error:', errText);
      await logError('whatsapp-bot', `WhatsApp API Error (Text)`, { phone: to, error: errText }, 'error');
    }
    else syncOutgoingToChatwoot(to, body).catch(e => console.error(e))
  } catch (e) {
    console.error('WA Fatal Net Error:', e)
    await logError('whatsapp-bot', `WhatsApp Fatal Net Error (Text)`, { phone: to, error: String(e) }, 'critical');
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
        image: { link: url, caption: caption?.substring(0, 1000) },
      }),
    })
    if (!res.ok) console.error('WA Image Error:', await res.text())
    else syncOutgoingToChatwoot(to, `📷 [Imagen enviada] ${caption || ''}`).catch(e => console.error(e))
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
    else syncOutgoingToChatwoot(to, `📍 [Ubicación enviada] ${name}`).catch(e => console.error(e))
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
export async function sendInteractiveButtons(
  to: string,
  text: string,
  buttons: { id: string; title: string }[],
): Promise<void> {
  try {
    const btns = buttons.slice(0, 3).map(b => ({
      type: 'reply',
      reply: { id: b.id.substring(0, 256), title: b.title.substring(0, 20) }
    }))
    
    if (btns.length === 0) {
      console.warn('⚠️ sendInteractiveButtons called with empty buttons array. Sending as normal text.')
      return await sendWA(to, text)
    }

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
          action: { buttons: btns },
        },
      }),
    })
    if (!res.ok) console.error('WA InteractiveButtons Error:', await res.text())
    else syncOutgoingToChatwoot(to, `${text}\n[Botones] ${buttons.map(b => b.title).join(' | ')}`).catch(e => console.error(e))
  } catch (e) {
    console.error('WA Fatal Net Error (InteractiveButtons):', e)
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
