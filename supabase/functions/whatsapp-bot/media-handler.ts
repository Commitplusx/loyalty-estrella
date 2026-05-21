// ══════════════════════════════════════════════════════════════════════════════
// media-handler.ts — Descarga de media de WhatsApp y subida a Supabase Storage
// ══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extract10Digits } from './db.ts'
import { sendWA, sendWAImage } from './whatsapp.ts'

type Supa = ReturnType<typeof createClient>

const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN')!
const BUCKET = 'fachadas_clientes'

// ── Descargar media de WhatsApp Cloud API ─────────────────────────────────────
async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  try {
    // 1. Obtener la URL del media
    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` }
    })
    if (!metaRes.ok) {
      console.error('[MEDIA] Error obteniendo URL:', await metaRes.text())
      return null
    }
    const { url, mime_type } = await metaRes.json()

    // 2. Descargar el archivo binario
    const fileRes = await fetch(url, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` }
    })
    if (!fileRes.ok) {
      console.error('[MEDIA] Error descargando archivo:', fileRes.status)
      return null
    }

    return { buffer: await fileRes.arrayBuffer(), mimeType: mime_type || 'image/jpeg' }
  } catch (e) {
    console.error('[MEDIA] Error fatal descargando media:', e)
    return null
  }
}

// ── Subir archivo a Supabase Storage ──────────────────────────────────────────
async function uploadToStorage(
  supabase: Supa,
  filePath: string,
  buffer: ArrayBuffer,
  contentType: string
): Promise<string | null> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType, upsert: true })

  if (error) {
    console.error('[STORAGE] Error subiendo:', error.message)
    return null
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
  return data?.publicUrl || null
}

// ── Handler principal: Admin envía foto para un cliente ───────────────────────
export async function handleAdminPhoto(
  supabase: Supa,
  fromPhone: string,
  imageMsg: any
): Promise<Response> {
  const mediaId = imageMsg.id
  const caption = imageMsg.caption || ''

  // Extraer teléfono del caption (ej: "foto de 9631234567" o solo "9631234567")
  const telMatch = caption.match(/(\d{10,13})/)
  let tel10 = telMatch ? extract10Digits(telMatch[1]) : null

  // Si no hay teléfono en el caption, buscar en el contexto reciente (bot_memory)
  if (!tel10) {
    const adminPhone10 = extract10Digits(fromPhone)
    const { data: ctx } = await supabase.from('bot_memory')
      .select('history')
      .eq('phone', `admin_last_client_${adminPhone10}`)
      .maybeSingle()
    
    if (ctx?.history?.[0]?.clienteTel) {
      tel10 = extract10Digits(ctx.history[0].clienteTel)
    }
  }

  if (!tel10) {
    await sendWA(fromPhone, '⚠️ No pude identificar a qué cliente asociar esta foto.\n\nEnvía la imagen con el teléfono en el caption:\n_Ejemplo: envía la foto con texto "9631234567"_')
    return new Response('OK', { status: 200 })
  }

  // Verificar que el cliente existe
  const { data: cliente } = await supabase.from('clientes')
    .select('id, nombre')
    .ilike('telefono', `%${tel10}%`)
    .limit(1).maybeSingle()

  if (!cliente) {
    await sendWA(fromPhone, `⚠️ No encontré un cliente con el número *${tel10}*. Regístralo primero.`)
    return new Response('OK', { status: 200 })
  }

  await sendWA(fromPhone, `📸 Descargando foto de *${cliente.nombre}*...`)

  // Descargar de WhatsApp
  const media = await downloadWhatsAppMedia(mediaId)
  if (!media) {
    await sendWA(fromPhone, `❌ No pude descargar la imagen de WhatsApp. Intenta de nuevo.`)
    return new Response('OK', { status: 200 })
  }

  // Subir a Storage
  const ext = media.mimeType.includes('png') ? 'png' : 'jpg'
  const filePath = `${tel10}/foto_${Date.now()}.${ext}`
  const publicUrl = await uploadToStorage(supabase, filePath, media.buffer, media.mimeType)

  if (!publicUrl) {
    await sendWA(fromPhone, `❌ Error subiendo la foto al servidor. Intenta de nuevo.`)
    return new Response('OK', { status: 200 })
  }

  // Guardar URL en el cliente
  await supabase.from('clientes')
    .update({ foto_fachada_url: publicUrl })
    .eq('id', cliente.id)

  await sendWA(fromPhone, `✅ *Foto guardada* para ${cliente.nombre} (${tel10}).\n📸 ${publicUrl}`)
  return new Response('OK', { status: 200 })
}

// ── Enviar foto del cliente si existe ─────────────────────────────────────────
export async function enviarFotoCliente(
  fromPhone: string,
  fotoUrl: string | null,
  clienteNombre: string
): Promise<void> {
  if (!fotoUrl) return
  try {
    await sendWAImage(fromPhone, fotoUrl, `📸 Foto de ${clienteNombre}`)
  } catch (e) {
    console.error('[MEDIA] Error enviando foto:', e)
  }
}
