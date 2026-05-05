// ══════════════════════════════════════════════════════════════════════════════
// db.ts — Helpers reutilizables para queries a Supabase
// ══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type SupabaseClient = ReturnType<typeof createClient>

export interface PedidoData {
  clienteTel: string | null
  clienteNombre: string | null
  restaurante: string | null
  descripcion: string
  direccion: string | null
  repartidorAlias: string | null
  puntosASumar?: number
  montoSaldo?: number
}

// ── Normalizar teléfono a 10 dígitos ─────────────────────────────────────────
export function extract10Digits(phone: string | null | undefined): string {
  return String(phone || '').replace(/\D/g, '').slice(-10)
}

// ── Buscar repartidor por alias o nombre ──────────────────────────────────────
export async function buscarRepartidor(supabase: SupabaseClient, alias: string | null) {
  if (!alias) return null
  const cleanAlias = alias.trim().split(' ')[0]
  const { data } = await supabase
    .from('repartidores')
    .select('id, user_id, telefono, nombre')
    .or(`alias.ilike.%${cleanAlias}%,nombre.ilike.%${cleanAlias}%`)
    .eq('activo', true)
    .limit(1)
    .maybeSingle()
  return data
}

// ── Crear pedido en DB y lanzar notificaciones ────────────────────────────────
export async function crearPedidoDesdeBot(
  supabase: SupabaseClient,
  datos: PedidoData,
  lat?: number,
  lng?: number,
  messageId?: string,
): Promise<{ ok: boolean; pedidoId?: string; error?: string; repartidorInfo?: string }> {
  try {
    const rep = await buscarRepartidor(supabase, datos.repartidorAlias)
    
    // Si se especificó un repartidor pero no se encontró, devolvemos error para evitar confusiones.
    if (datos.repartidorAlias && !rep) {
      return { ok: false, error: `Repartidor "${datos.repartidorAlias}" no encontrado en el equipo activo.` }
    }

    const repartidorInfo = rep ? datos.repartidorAlias! : ''

    // CACHÉ GPS: Si no hay lat/lng explícitos, intentar obtener de caché
    let finalLat = lat
    let finalLng = lng
    if (finalLat === undefined || finalLng === undefined) {
      const telLimpio = extract10Digits(datos.clienteTel || '0000000000')
      const { data: clienteCache } = await supabase.from('clientes').select('lat_frecuente, lng_frecuente').eq('telefono', telLimpio).maybeSingle()
      if (clienteCache?.lat_frecuente && clienteCache?.lng_frecuente) {
        finalLat = clienteCache.lat_frecuente
        finalLng = clienteCache.lng_frecuente
      }
    }

    const insertData: Record<string, unknown> = {
      cliente_tel: datos.clienteTel ?? '0000000000',
      descripcion: datos.descripcion,
    }
    if (datos.clienteNombre) insertData.cliente_nombre = datos.clienteNombre
    if (datos.restaurante)   insertData.restaurante = datos.restaurante
    if (datos.direccion)     insertData.direccion = datos.direccion
    if (finalLat !== undefined)   insertData.lat = finalLat
    if (finalLng !== undefined)   insertData.lng = finalLng
    if (messageId)           insertData.wb_message_id = messageId
    if (rep?.user_id)        insertData.repartidor_id = rep.user_id

    const { data: inserted, error } = await supabase
      .from('pedidos')
      .insert(insertData)
      .select('id')
      .single()

    if (error) throw error

    const pedidoId = inserted.id as string

    if (rep?.telefono) {
      const invokeRes = await supabase.functions.invoke('notificar-whatsapp', {
        body: { pedido_id: pedidoId, tipo: 'asignacion', repartidor_tel: rep.telefono },
      })
      if (invokeRes.error) console.error('[NOTIFICACIÓN] Error:', invokeRes.error)
    }

    if (datos.clienteTel) {
      await supabase.functions.invoke('notificar-whatsapp', {
        body: { pedido_id: pedidoId, tipo: 'creado' },
      })
    }

    return { ok: true, pedidoId, repartidorInfo }
  } catch (e: any) {
    const msg = e?.message || String(e)
    console.error('Error en crearPedidoDesdeBot:', e)
    if (msg.includes('unique') || msg.includes('duplicate')) return { ok: false, error: 'Pedido duplicado — ya fue procesado anteriormente.' }
    return { ok: false, error: msg }
  }
}

// ── Guardar / limpiar memoria conversacional ──────────────────────────────────
export async function guardarMemoria(supabase: SupabaseClient, phone: string, history: any[]) {
  try {
    // GC (Garbage Collection): Mantener solo últimos 35 items para prevenir DB bloating + AI limits
    const safeHistory = history.length > 35 ? history.slice(-35) : history
    await supabase.from('bot_memory').upsert({
      phone: extract10Digits(phone),
      history: safeHistory,
      updated_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('Fallo guardando memoria:', e)
  }
}

export async function limpiarMemoria(supabase: SupabaseClient, phone: string) {
  try {
    await supabase.from('bot_memory').delete().eq('phone', extract10Digits(phone))
  } catch (_) { /* silencioso */ }
}

// ── Barra ASCII para reportes ─────────────────────────────────────────────────
export function barChart(label: string, value: number, max: number, width = 10): string {
  const filled = max > 0 ? Math.round((value / max) * width) : 0
  return `${label.padEnd(12)} |${'█'.repeat(filled)}${'░'.repeat(width - filled)}| ${value}`
}
