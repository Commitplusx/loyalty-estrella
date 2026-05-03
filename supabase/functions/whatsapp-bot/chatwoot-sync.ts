// chatwoot-sync.ts — Sync WhatsApp messages to Chatwoot API inbox (CRM bridge)

const CW_BASE      = Deno.env.get('CHATWOOT_BASE_URL')   ?? 'https://app.chatwoot.com'
const CW_ACCOUNT   = Deno.env.get('CHATWOOT_ACCOUNT_ID') ?? '162525'
// Admin token: puede crear contactos/conversaciones y postear mensajes
const CW_TOKEN     = Deno.env.get('CHATWOOT_API_TOKEN')  ?? Deno.env.get('CHATWOOT_BOT_TOKEN') ?? ''
// Bot token: postea mensajes como "agent_bot" → evita que chatwoot-bot lo reenvíe por WA
const CW_BOT_TOKEN = Deno.env.get('CHATWOOT_BOT_TOKEN')  ?? CW_TOKEN
const CW_INBOX     = Deno.env.get('CHATWOOT_INBOX_ID')   ?? ''

const CW_TIMEOUT_MS = 5000

// AbortSignal.timeout auto-cleans — no dangling setTimeout after successful fetches
function cwSignal(): AbortSignal {
  return AbortSignal.timeout(CW_TIMEOUT_MS)
}

async function cwGet(path: string): Promise<any> {
  if (!CW_TOKEN) return null
  try {
    const res = await fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}${path}`, {
      headers: { api_access_token: CW_TOKEN },
      signal: cwAbort().signal,
    })
    if (!res.ok) return null
    return res.json()
  } catch (e: any) {
    console.warn('[CW Sync] GET timeout/error:', e?.name === 'AbortError' ? 'timeout 5s' : e?.message)
    return null
  }
}

async function cwPost(path: string, body: unknown): Promise<any> {
  if (!CW_TOKEN) return null
  try {
    const res = await fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}${path}`, {
      method: 'POST',
      headers: { api_access_token: CW_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: cwSignal(),
    })
    if (!res.ok) {
      const txt = await res.text()
      console.warn('[CW Sync] POST error', res.status, txt.substring(0, 200))
      return null
    }
    return res.json()
  } catch (e: any) {
    console.warn('[CW Sync] POST timeout/error:', e?.name === 'AbortError' ? 'timeout 5s' : e?.message)
    return null
  }
}

async function cwPut(path: string, body: unknown): Promise<any> {
  if (!CW_TOKEN) return null
  try {
    const res = await fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}${path}`, {
      method: 'PUT',
      headers: { api_access_token: CW_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: cwSignal(),
    })
    if (!res.ok) {
      const txt = await res.text()
      console.warn('[CW Sync] PUT error', res.status, txt.substring(0, 200))
      return null
    }
    return res.json()
  } catch (e: any) {
    console.warn('[CW Sync] PUT timeout/error:', e?.name === 'AbortError' ? 'timeout 5s' : e?.message)
    return null
  }
}

async function findOrCreateContact(phone: string, name?: string): Promise<number | null> {
  const digits = phone.replace(/\D/g, '')
  const e164   = `+${digits}`

  // Buscar por teléfono
  const sr = await cwGet(`/contacts/search?q=${encodeURIComponent(e164)}&page=1`)
  if (sr?.payload?.length) {
    const match = sr.payload.find((c: any) => {
      const cp = String(c.phone_number ?? '').replace(/\D/g, '')
      return cp.endsWith(digits.slice(-10)) || digits.endsWith(cp.slice(-10))
    })
    if (match) return match.id as number
  }

  // Crear contacto — Chatwoot devuelve {payload: {contact: {id, ...}}}
  const raw = await cwPost('/contacts', {
    name: name || digits.slice(-10),
    phone_number: e164,
    identifier: digits,
  })
  const id = raw?.payload?.contact?.id ?? raw?.id ?? null
  console.log(`[CW Sync] Contacto creado id=${id} para ${digits}`)
  return id
}

async function findOrCreateConversation(contactId: number): Promise<number | null> {
  const inboxId = parseInt(CW_INBOX)
  if (!inboxId) {
    console.warn('[CW Sync] CHATWOOT_INBOX_ID no configurado')
    return null
  }

  // Buscar conversación abierta en el inbox de API
  const convData = await cwGet(`/contacts/${contactId}/conversations`)
  if (convData?.payload) {
    const open = convData.payload.find(
      (c: any) => c.inbox_id === inboxId && c.status !== 'resolved'
    )
    if (open) return open.id as number
  }

  // Crear nueva conversación
  const conv = await cwPost('/conversations', { inbox_id: inboxId, contact_id: contactId })
  return conv?.id ?? null
}

/**
 * Sincroniza un mensaje entrante de WhatsApp al inbox de API de Chatwoot.
 * Retorna el conversation ID para poder postear la respuesta del bot sin race condition.
 */
export async function syncToChatwoot(
  fromPhone: string,
  text: string,
  profileName?: string,
  label?: string
): Promise<number | null> {
  if (!CW_TOKEN || !CW_INBOX) {
    console.warn(`[CW Sync] Saltado: token=${!!CW_TOKEN} inbox=${CW_INBOX || 'VACIO'}`)
    return null
  }
  try {
    const contactId = await findOrCreateContact(fromPhone, profileName)
    if (!contactId) return null
    const convId = await findOrCreateConversation(contactId)
    if (!convId) return null
    await cwPost(`/conversations/${convId}/messages`, {
      content: text,
      message_type: 'incoming',
      private: false,
    })
    console.log(`[CW Sync] ✅ msg de ${fromPhone} → conv #${convId}`)
    
    if (label) {
      cwPost(`/conversations/${convId}/labels`, { labels: [label] }).catch(e => console.error('[CW Sync] Lables Error:', e))
    }
    
    return convId
  } catch (e) {
    console.error('[CW Sync] Error inesperado:', e)
    return null
  }
}

/**
 * Postea la respuesta del bot en una conversación de Chatwoot ya conocida.
 * Usa el BOT TOKEN para que sender.type = "agent_bot" y chatwoot-bot
 * no lo reenvíe por WhatsApp (evita respuestas duplicadas).
 */
export async function syncBotReplyByConvId(
  convId: number,
  botReply: string,
): Promise<void> {
  if (!CW_BOT_TOKEN) return
  try {
    const res = await fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { api_access_token: CW_BOT_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: botReply, message_type: 'outgoing', private: false }),
    })
    if (!res.ok) console.warn('[CW Sync Bot Reply] Error', res.status, await res.text())
    else console.log(`[CW Sync] ✅ respuesta bot → conv #${convId}`)
  } catch (e) {
    console.error('[CW Sync Bot Reply] Error:', e)
  }
}

/**
 * Sincroniza un mensaje SALIENTE del bot a Chatwoot para cualquier número.
 * Crea el contacto y conversación si no existen. Fire-and-forget.
 */
export async function syncOutgoingToChatwoot(
  toPhone: string,
  botReply: string,
): Promise<void> {
  if (!CW_BOT_TOKEN || !CW_INBOX) return
  try {
    const contactId = await findOrCreateContact(toPhone)
    if (!contactId) return
    const convId = await findOrCreateConversation(contactId)
    if (!convId) return
    await syncBotReplyByConvId(convId, botReply)
  } catch (e) {
    console.error('[CW Sync Outgoing] Error:', e)
  }
}

/**
 * Actualiza los atributos personalizados (Custom Attributes) de un contacto en Chatwoot.
 */
export async function syncContactAttributes(phone: string, attributes: Record<string, any>): Promise<void> {
  if (!CW_TOKEN) return
  try {
    const contactId = await findOrCreateContact(phone)
    if (!contactId) return
    await cwPut(`/contacts/${contactId}`, { custom_attributes: attributes })
    console.log(`[CW Sync] Perfil actualizado en Chatwoot para ${phone}`)
  } catch (e) {
    console.error('[CW Sync] Error actualizando atributos:', e)
  }
}

/**
 * Busca al cliente en Supabase y sincroniza sus datos financieros/lealtad hacia Chatwoot.
 */
export async function updateChatwootProfile(supabase: any, phone: string): Promise<void> {
  const p10 = phone.replace(/\D/g, '').slice(-10)
  const { data: c } = await supabase.from('clientes')
    .select('puntos, es_vip, saldo_billetera, reputacion')
    .ilike('telefono', `%${p10}%`)
    .limit(1).maybeSingle()
  
  if (c) {
    await syncContactAttributes(phone, {
      puntos_lealtad: c.puntos || 0,
      es_vip: c.es_vip ? 'Sí ⭐' : 'No',
      saldo_billetera: c.saldo_billetera || 0,
      reputacion: c.reputacion || 'Sin calificar'
    })
  }
}

/**
 * Agrega una Nota Privada a la conversación de un cliente buscando por su teléfono.
 */
export async function addPrivateNoteByPhone(phone: string, note: string): Promise<void> {
  if (!CW_BOT_TOKEN || !CW_INBOX) return
  try {
    const contactId = await findOrCreateContact(phone)
    if (!contactId) return
    const convId = await findOrCreateConversation(contactId)
    if (!convId) return
    
    await fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { api_access_token: CW_BOT_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: note, message_type: 'outgoing', private: true }),
    })
    console.log(`[CW Sync] 🟨 Nota Privada añadida a conv #${convId}`)
  } catch (e) {
    console.error('[CW Sync] Error agregando nota privada:', e)
  }
}
