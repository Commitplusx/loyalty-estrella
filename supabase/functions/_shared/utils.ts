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
 * Base image: vip-nuevo (diseño horizontal Estrella Delivery)
 */
export function generateCloudinaryVIPCard(
  telefono: string,
  nombreRaw: string,
  puntos: number,
  saldo: number,
  esVip: boolean = false
): string {
  const tel10 = extract10Digits(telefono);
  const loyaltyUrl = `https://app-estrella.shop/loyalty/${tel10}`;

  // QR generado con QuickChart (sin margin para acortar URL)
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(loyaltyUrl)}`;

  // Codificar la URL del QR en base64url para el fetch layer de Cloudinary
  let qrB64 = btoa(qrUrl).replace(/\+/g, '-').replace(/\//g, '_');

  const baseCloudinary = `https://res.cloudinary.com/dlgcf3cht/image/upload`;

  // Escalar la imagen base a 1000px de ancho para estabilizar coordenadas.
  // El QR se posiciona sobre el recuadro blanco de la derecha.
  const transforms = [
    `c_scale,w_1000`,
    `l_fetch:${qrB64}/c_scale,w_220/fl_layer_apply,g_north_west,x_695,y_305`
  ].join('/');

  return `${baseCloudinary}/${transforms}/vip-nuevo`;
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

