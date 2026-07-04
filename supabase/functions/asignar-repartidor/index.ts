// supabase/functions/asignar-repartidor/index.ts
// Asignación Inteligente (Round-Robin):
// 1. Repartidor más cercano (30s)
// 2. Repartidor con menos pedidos (30s)
// 3. Fallback (Admin)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const WA_TOKEN    = Deno.env.get('WHATSAPP_TOKEN')!
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ADMIN_PHONES_RAW = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''
const ADMIN_PHONE_MAIN = (() => {
  const raw = ADMIN_PHONES_RAW.split(',').map(s => s.replace(/\D/g, '').slice(-10)).filter(s => s.length === 10)[0]
  return raw ? `52${raw}` : ''
})()

const WA_BASE = `https://graph.facebook.com/v22.0/${WA_PHONE_ID}/messages`
const WA_HEADERS = () => ({
  Authorization: `Bearer ${WA_TOKEN}`,
  'Content-Type': 'application/json',
})

async function sendWA(to: string, body: string): Promise<void> {
  await fetch(WA_BASE, {
    method: 'POST',
    headers: WA_HEADERS(),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: body.substring(0, 4096) }
    })
  })
}

// Distancia de Haversine (en km)
function haversineDist(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const { ticket_id, restaurante, direccion, total, lat, lng } = await req.json()

    if (!ticket_id) {
      return new Response(JSON.stringify({ error: 'ticket_id requerido' }), { status: 400, headers: CORS_HEADERS })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // 1. Obtener todos los repartidores activos con sus coordenadas
    const { data: repartidores, error: repErr } = await supabase
      .from('repartidores')
      .select('id, nombre, telefono, lat, lng, bateria')
      .eq('activo', true)

    if (repErr) throw new Error(`Error consultando repartidores: ${repErr.message}`)

    // 1.5 Filtrar repartidores por batería >= 15% (si la batería está registrada)
    const repartidoresValidos = (repartidores || []).filter(r => r.bateria === null || r.bateria === undefined || r.bateria >= 15);

    if (!repartidoresValidos || repartidoresValidos.length === 0) {
      if (ADMIN_PHONE_MAIN) {
        await sendWA(ADMIN_PHONE_MAIN, `⚠️ *Pedido #${ticket_id} sin repartidor*\n\nNo hay ningún repartidor activo con batería suficiente. Asigna manualmente.\n📦 ${restaurante}`)
      }
      return new Response(JSON.stringify({ ok: false, reason: 'no_drivers_or_low_battery' }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    }

    // 2. Obtener Carga de Trabajo (Pedidos Asignados Activos)
    const { data: pedidosActivos } = await supabase
      .from('pedidos')
      .select('repartidor_id')
      .in('estado', ['asignado', 'aceptado', 'en_camino', 'recibido'])
      .not('repartidor_id', 'is', null);

    const cargaTrabajo: Record<string, number> = {};
    repartidoresValidos.forEach(r => cargaTrabajo[r.id] = 0);
    if (pedidosActivos) {
      pedidosActivos.forEach(p => {
        if (cargaTrabajo[p.repartidor_id] !== undefined) {
          cargaTrabajo[p.repartidor_id]++;
        }
      });
    }

    // 3. Lógica de Selección (Round-Robin Inteligente)
    let repartidor1 = null;
    let repartidor2 = null;

    if (repartidoresValidos.length === 1) {
      repartidor1 = repartidoresValidos[0];
    } else {
      if (lat && lng) {
        // Calcular Score (menor es mejor)
        // Nueva Fórmula (Prioridad Distancia): (Distancia en KM * 100) + (Pedidos Activos * 10)
        // Prioriza a los que están cerca, permitiendo que recojan múltiples pedidos si están en la zona.
        const repartidoresConScore = repartidoresValidos.map(r => {
          const d = haversineDist(lat, lng, r.lat ?? 0, r.lng ?? 0);
          const pedidos = cargaTrabajo[r.id];
          const score = (d * 100) + (pedidos * 10);
          return { ...r, score, dist: d, pedidos };
        });

        // Ordenar por score de menor a mayor
        repartidoresConScore.sort((a, b) => a.score - b.score);
        repartidor1 = repartidoresConScore[0];
        repartidor2 = repartidoresConScore[1];
      } else {
        // Fallback si no hay ubicación: elegir al de menor carga de trabajo
        const repartidoresPorCarga = [...repartidoresValidos].sort((a, b) => cargaTrabajo[a.id] - cargaTrabajo[b.id]);
        repartidor1 = repartidoresPorCarga[0];
        repartidor2 = repartidoresPorCarga[1] ?? null;
      }
    }

    // Tarea asíncrona que maneja el Round-Robin con timeouts de 30s
    const roundRobinTask = (async () => {
      const waitAndCheck = async (repartidorId: string) => {
        // Enviar Ping a la App
        await supabase.channel('repartidores_ping').send({
          type: 'broadcast',
          event: 'order_offered',
          payload: { target_driver_id: repartidorId, pedido_id: ticket_id }
        });

        // Esperar 30s (chequeando cada 3s)
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 3000));
          const { data: p } = await supabase.from('pedidos').select('repartidor_id, estado').eq('wb_message_id', ticket_id).maybeSingle();
          if (p && p.repartidor_id) return true; // ¡Alguien lo aceptó!
          if (p && p.estado === 'cancelado') return true;
          
          // FAST REJECT: Si el repartidor rechazó, abortamos su espera
          if (p && p.estado === 'rechazado') {
            console.log(`[FAST REJECT] Repartidor ${repartidorId} rechazó el pedido. Saltando al siguiente...`);
            // Regresamos el estado a pagado/pendiente para que el Turno 2 no lo vea como rechazado
            await supabase.from('pedidos').update({ estado: 'pagado' }).eq('wb_message_id', ticket_id);
            return false;
          }
        }

        // Se acabó el tiempo, apagar alarma
        await supabase.channel('repartidores_ping').send({
          type: 'broadcast',
          event: 'order_canceled',
          payload: { target_driver_id: repartidorId, pedido_id: ticket_id }
        });
        return false;
      };

      // Turno 1
      console.log(`[ROUND-ROBIN] Turno 1: ${repartidor1.nombre}`);
      const accepted1 = await waitAndCheck(repartidor1.id);
      if (accepted1) return;

      // Turno 2
      if (repartidor2) {
        console.log(`[ROUND-ROBIN] Turno 2: ${repartidor2.nombre}`);
        const accepted2 = await waitAndCheck(repartidor2.id);
        if (accepted2) return;
      }

      // Fallback Admin
      console.warn(`[TIMEOUT] Ningún repartidor aceptó el pedido ${ticket_id}`);
      if (ADMIN_PHONE_MAIN) {
        await sendWA(ADMIN_PHONE_MAIN, `⏰ *Pedido #${ticket_id} sin aceptar*\n\nHan pasado 60s (2 intentos) y ningún repartidor aceptó.\n\n🍽️ ${restaurante}\n📍 ${direccion || 'Sin dirección'}\n💰 $${total}\n\nAsigna manualmente desde la app.`);
      }
    })();

    try {
      // @ts-ignore
      EdgeRuntime.waitUntil(roundRobinTask)
    } catch {
      await roundRobinTask
    }

    return new Response(JSON.stringify({ ok: true, drivers_planned: repartidor2 ? 2 : 1 }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    console.error('[ASIGNAR-REPARTIDOR] Error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }
})
