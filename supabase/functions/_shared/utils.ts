// ══════════════════════════════════════════════════════════════════════════════
// _shared/utils.ts — Utilidades compartidas entre Edge Functions
// ══════════════════════════════════════════════════════════════════════════════
// Elimina código duplicado entre whatsapp-bot y notificar-whatsapp.

/** Extrae los últimos 10 dígitos de un teléfono (estándar MX) */
export function extract10Digits(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

/** Formatea un teléfono a formato internacional MX (52 + 10 dígitos) */
export function formatTel(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return `52${digits.slice(-10)}`
}

/** Genera número de orden legible: EST-00123 (últimos 5 chars del UUID) */
export function generarNumeroOrden(pedidoId: string): string {
  const shortId = pedidoId.replace(/-/g, '').slice(-5).toUpperCase()
  return `EST-${shortId}`
}

/**
 * Genera la URL de la Tarjeta VIP compuesta con Cloudinary
 */
export function generateCloudinaryVIPCard(
  telefono: string,
  nombreRaw: string,
  puntos: number,
  saldo: number,
  esVip: boolean = false
): string {
  const nombre = encodeURIComponent((nombreRaw || 'Cliente').toUpperCase().substring(0, 26));
  const tel10 = extract10Digits(telefono);
  const loyaltyUrl = `https://www.app-estrella.shop/loyalty/${tel10}`;

  // URL del QR de QuickChart
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(loyaltyUrl)}&size=180&margin=0&dark=0a0a0a`;

  // Convertimos a base64url estándar
  let qrB64 = btoa(qrUrl).replace(/\+/g, '-').replace(/\//g, '_');

  const baseCloudinary = `https://res.cloudinary.com/dlgcf3cht/image/upload`;
  const transforms = [
    // 1. Nombre (Más pequeño para que quepan apellidos)
    `co_white,l_text:Montserrat_42_bold:${nombre}/fl_layer_apply,g_north_west,x_60,y_360`,
    // 2. Teléfono (Debajo del QR)
    `co_black,l_text:Roboto%20Mono_20_bold:${tel10}/fl_layer_apply,g_north_west,x_770,y_550`,
    // 3. Puntos
    `co_rgb:FFD700,l_text:Roboto%20Mono_48_bold:${puntos}/fl_layer_apply,g_north_west,x_60,y_495`,
    // 4. Billetera y Textos VIP (Solo VIP)
    esVip ? `co_rgb:00e676,l_text:Roboto%20Mono_48_bold:%24${saldo.toFixed(2)}/fl_layer_apply,g_north_west,x_240,y_495/co_rgb:FFD700,l_text:Montserrat_20_bold:SOCIO%20VIP/fl_layer_apply,g_north_west,x_140,y_110/co_rgb:FFD700,l_text:Montserrat_20_bold:CLIENTE%20VIP/fl_layer_apply,g_north_west,x_760,y_490` : '',
    // 5. Código QR (180x180 centrado en la caja blanca de 220, posicion y_260)
    `l_fetch:${qrB64}/c_scale,w_180,h_180/fl_layer_apply,g_north_west,x_740,y_260`
  ].filter(Boolean).join('/');

  return `${baseCloudinary}/${transforms}/tarjeta_base_v3.png`;
}

/** Genera link al pedido con key de acceso (primeros 8 chars del UUID sin guiones) */
export function pedidoLink(pedidoId: string): string {
  const BASE_LINK = 'https://www.app-estrella.shop/pedido'
  const key = pedidoId.replace(/-/g, '').slice(0, 8)
  return `${BASE_LINK}/${pedidoId}?key=${key}`
}

/** 
 * Registra un error en la base de datos y opcionalmente envía alerta a Discord
 * si la severidad es 'critical'.
 */
export async function logError(
  source: 'whatsapp-bot' | 'frontend' | 'notificar-whatsapp',
  message: string,
  metadata: Record<string, any> = {},
  severity: 'info' | 'warn' | 'error' | 'critical' = 'error'
) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';

    if (supabaseUrl && supabaseKey) {
      // Intentar escribir en la tabla system_logs mediante REST
      await fetch(`${supabaseUrl}/rest/v1/system_logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ level: severity, source, message, metadata })
      }).catch(e => console.error('Failed to write to system_logs', e));
    } else {
      console.error(`[${severity.toUpperCase()}] ${source}: ${message}`, metadata);
    }

    // Alerta a Discord solo si es crítico
    if (severity === 'critical') {
      const webhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL');
      if (webhookUrl) {
        const rawContent = `🚨 **ALERTA CRÍTICA** en \`${source}\`\n**Error:** ${message}\n\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\``
        const discordMsg = {
          content: rawContent.substring(0, 1900) // Discord hard limit is 2000 chars
        };
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(discordMsg)
        }).catch(e => console.error('Failed to send discord webhook', e));
      }
    }
  } catch (err) {
    console.error('Crash in logError helper:', err);
  }
}

