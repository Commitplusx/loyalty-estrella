// supabase/functions/asignar-repartidor/index.ts
// Asignación Inteligente (Round-Robin):
// 1. Repartidor más cercano (30s)
// 2. Repartidor con menos pedidos (30s)
// 3. Fallback (Admin)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { initializeApp, cert } from "npm:firebase-admin@11.11.1/app";
import { getMessaging } from "npm:firebase-admin@11.11.1/messaging";

let isFirebaseInitialized = false;

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

// La distancia de Haversine ya no es necesaria, ahora delegamos el cálculo espacial a PostGIS (RPC)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

    try {
    const rawPayload = await req.json();
    console.log("[DEBUG ASIGNAR-REPARTIDOR] Payload recibido:", JSON.stringify(rawPayload));

    // Si es un webhook, el payload viene dentro de `record`
    const payload = rawPayload.record || rawPayload;
    const pedido_uuid = payload.id;

    if (!pedido_uuid) {
      console.error("[DEBUG] pedido_uuid no encontrado en el payload.");
      return new Response(JSON.stringify({ error: 'id requerido' }), { status: 400, headers: CORS_HEADERS })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Determinar si el payload trae un UUID o un ID corto
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(pedido_uuid);
    const searchColumn = isUuid ? 'id' : 'wb_message_id';

    // EXTRAER DATOS DIRECTAMENTE DE LA BD (100% SEGURO)
    const { data: dbPedido, error: dbError } = await supabase
      .from('pedidos')
      .select('id, wb_message_id, restaurante, direccion, total, lat, lng, metodo_pago, estado, tipo_pedido, repartidor_id')
      .eq(searchColumn, pedido_uuid)
      .single();

    if (dbError || !dbPedido) {
      console.error(`[DEBUG] No se pudo obtener el pedido (buscando por ${searchColumn}):`, dbError);
      return new Response(JSON.stringify({ error: 'Pedido no existe en BD' }), { status: 404, headers: CORS_HEADERS })
    }

    if (dbPedido.tipo_pedido !== 'domicilio') {
      console.log("[DEBUG] El pedido no es a domicilio. Se aborta asignación.");
      return new Response(JSON.stringify({ ok: true, message: 'No es domicilio' }), { headers: CORS_HEADERS })
    }

    const ticket_id = dbPedido.wb_message_id || dbPedido.id;
    const restaurante = dbPedido.restaurante || "Estrella";
    const direccion = dbPedido.direccion || "";
    const total = dbPedido.total || "0";
    const lat = dbPedido.lat;
    const lng = dbPedido.lng;

    // EVITAR DOBLE ASIGNACIÓN Y EVENTOS BASURA (ROBUSTEZ)
    if (dbPedido.estado !== 'pendiente' && dbPedido.estado !== 'pagado') {
        console.log("[DEBUG] Estado inválido para asignación (" + dbPedido.estado + "). Ignorando webhook.");
        return new Response(JSON.stringify({ ok: true, message: 'Estado ignorable' }), { headers: CORS_HEADERS })
    }
    
    // Si ya tiene un repartidor asignado, ignorar (esto es por si el webhook se dispara por accidente en un UPDATE)
    if (dbPedido.repartidor_id) {
        console.log("[DEBUG] El pedido ya tiene repartidor asignado. Ignorando webhook.");
        return new Response(JSON.stringify({ ok: true, message: 'Ya asignado' }), { headers: CORS_HEADERS })
    }

    // 1. Obtener Repartidores Cercanos (Vía PostGIS)
    // El RPC 'buscar_repartidores_cercanos' funciona como un pre-filtro súper rápido (Línea Recta 5km)
    let repartidoresValidos: any[] = [];
    
    if (lat && lng) {
        // En tu DB ya tienes el H3 o lat/lng, usamos el RPC para el filtro grueso
        const { data, error: rpcErr } = await supabase.rpc('buscar_repartidores_cercanos', {
            p_lat: lat,
            p_lng: lng,
            p_radio_metros: 5000
        });
        
        if (rpcErr) {
            console.error('[RPC ERROR]', rpcErr);
            throw new Error(`Error en RPC PostGIS: ${rpcErr.message}`);
        }
        repartidoresValidos = data || [];
        
        // 2. Refinamiento con Google Maps Distance Matrix API (ETA Real)
        const googleMapsKey = Deno.env.get('GOOGLE_MAPS_KEY');
        if (googleMapsKey && repartidoresValidos.length > 0) {
            try {
                // Recuperar lat/lng exactos de los candidatos para la API
                const repIds = repartidoresValidos.map(r => r.repartidor_id);
                const { data: repCoords } = await supabase.from('repartidores').select('id, lat, lng').in('id', repIds);
                
                if (repCoords && repCoords.length > 0) {
                    const destinations = repCoords.filter(r => r.lat && r.lng).map(r => `${r.lat},${r.lng}`).join('|');
                    const origin = `${lat},${lng}`;
                    
                    const gmapUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destinations}&key=${googleMapsKey}`;
                    const gmapRes = await fetch(gmapUrl);
                    const gmapData = await gmapRes.json();
                    
                    if (gmapData.status === 'OK') {
                        const elements = gmapData.rows[0].elements;
                        
                        // Map the ETAs back to the drivers
                        repCoords.forEach((coord, idx) => {
                            if (elements[idx] && elements[idx].status === 'OK') {
                                const durationSeconds = elements[idx].duration.value;
                                // Actualizar el score: Reemplazamos la distancia lineal con el ETA real
                                // Score = (ETA_minutos * 10) - (batería * 10) + (carga * 50)
                                const targetRep = repartidoresValidos.find(r => r.repartidor_id === coord.id);
                                if (targetRep) {
                                    const etaMinutos = durationSeconds / 60;
                                    targetRep.eta_minutos = Math.round(etaMinutos);
                                    targetRep.score = (etaMinutos * 10) - ((targetRep.bateria || 0) * 10) + ((targetRep.meta_envios || 0) * 50);
                                }
                            }
                        });
                        
                        // Re-ordenar basado en el nuevo score con ETA real
                        repartidoresValidos.sort((a, b) => (a.score || 0) - (b.score || 0));
                        console.log('[DEBUG] Candidatos re-ordenados con Google Maps ETA:', repartidoresValidos.map(r => `${r.repartidor_id}: ${r.eta_minutos}min`));
                    }
                }
            } catch (err) {
                console.error('[ERROR Google Maps API]', err);
                // Si falla, el arreglo sigue ordenado por la distancia del RPC original (Fallback robusto)
            }
        }
    } else {
        // Fallback si el pedido no tiene lat/lng
        const { data } = await supabase.from('repartidores').select('id, user_id, lat, lng, bateria, meta_envios').eq('activo', true);
        repartidoresValidos = (data || [])
          .filter(r => r.bateria === null || r.bateria >= 15)
          .map(r => ({ ...r, repartidor_id: r.id }));
    }

    if (!repartidoresValidos || repartidoresValidos.length === 0) {
      if (ADMIN_PHONE_MAIN) {
        await sendWA(ADMIN_PHONE_MAIN, `⚠️ *Pedido #${ticket_id} sin repartidor*\n\nNo hay ningún repartidor activo cerca. Asigna manualmente.\n📦 ${restaurante}`)
      }
      return new Response(JSON.stringify({ ok: false, reason: 'no_drivers' }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    }

    // 2. Lógica de Selección (Tomamos los 2 mejores del RPC)
    const repartidor1 = repartidoresValidos[0];
    const repartidor2 = repartidoresValidos[1] ?? null;

    // Patrón "Stateless Event-Driven":
    // 1. Mandamos el Ping al Repartidor 1 por Realtime (para Foreground)
    const repartidor1Id = repartidor1.user_id || repartidor1.id;
    await supabase.channel('repartidores_ping').send({
      type: 'broadcast',
      event: 'order_offered',
      payload: { 
        target_driver_id: repartidor1Id, 
        pedido_id: String(dbPedido.id),
        restaurante: restaurante,
        direccion: direccion,
        total: total
      }
    });

    // 2. Mandamos FCM Push de alta prioridad para despertar la app (Background/Killed)
    try {
      if (!isFirebaseInitialized) {
        const serviceAccountStr = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
        if (serviceAccountStr) {
          initializeApp({ credential: cert(JSON.parse(serviceAccountStr)) });
          isFirebaseInitialized = true;
        } else {
          console.log(`[FCM SNIPER] ⚠️ No se encontró FIREBASE_SERVICE_ACCOUNT. Saltando FCM.`);
        }
      }

      if (isFirebaseInitialized) {
        console.log(`[FCM SNIPER] 🚀 Disparando misil FCM a driver_${repartidor1Id}...`);
        await getMessaging().send({
          topic: `driver_${repartidor1Id}`,
          // No usamos bloque 'notification' para que sea un DATA-ONLY push.
          // Esto obliga a que el handler en background de Flutter se ejecute
          // y podamos disparar el fullScreenIntent manualmente.
          android: {
            priority: "high",
          },
          data: {
            tipo: "pedido_asignado",
            pedido_id: String(dbPedido.id),
            restaurante: String(restaurante || 'Estrella'),
            click_action: "FLUTTER_NOTIFICATION_CLICK",
            target_driver_id: String(repartidor1Id || '')
          }
        });
        console.log(`[FCM SNIPER] ✅ Misil FCM DATA-ONLY disparado a driver_${repartidor1Id} con éxito.`);
      }
    } catch (fcmErr) {
      console.error("[FCM SNIPER] ❌ Error enviando FCM al repartidor:", fcmErr);
    }
    console.log(`[QSTASH INIT] Turno 1: ${repartidor1.nombre} (${repartidor1Id}). Ping enviado.`);

    // 2. Programamos a QStash para que revise la DB en exactamente 15 segundos
    const QSTASH_TOKEN = Deno.env.get('QSTASH_TOKEN');
    if (QSTASH_TOKEN) {
      const qstashUrl = `https://qstash-us-east-1.upstash.io/v2/publish/${SUPABASE_URL}/functions/v1/asignacion-timeout`;
      
      const payload = {
        ticket_id,
        pedido_uuid: dbPedido.id,
        restaurante,
        direccion,
        total,
        repartidor_actual_id: repartidor1Id,
        repartidor_actual_nombre: repartidor1.nombre,
        siguiente_repartidor_id: repartidor2 ? (repartidor2.user_id || repartidor2.id) : null,
        siguiente_repartidor_nombre: repartidor2 ? repartidor2.nombre : null,
        intento: 1
      };

      try {
        const qRes = await fetch(qstashUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${QSTASH_TOKEN}`,
            'Content-Type': 'application/json',
            'Upstash-Delay': '15s' // ¡La magia de QStash!
          },
          body: JSON.stringify(payload)
        });
        
        if (!qRes.ok) {
          const errText = await qRes.text();
          console.error('[QSTASH ERROR]', errText);
        } else {
          console.log(`[QSTASH SUCCESS] Timeout de 15s programado para ${ticket_id}`);
        }
      } catch (e) {
        console.error('[QSTASH FETCH ERROR]', e);
      }
    } else {
      console.warn('[QSTASH] Faltan las llaves de Upstash. El pedido se quedará flotando si no lo aceptan.');
    }

    // Retornamos instantáneamente al cliente (0 milisegundos de espera por timeouts).
    return new Response(JSON.stringify({ ok: true, drivers_planned: repartidor2 ? 2 : 1 }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    console.error('[ASIGNAR-REPARTIDOR] Error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }
})
