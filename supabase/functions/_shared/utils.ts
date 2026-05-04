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
      fetch(`${supabaseUrl}/rest/v1/system_logs`, {
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
        const discordMsg = {
          content: `🚨 **ALERTA CRÍTICA** en \`${source}\`\n**Error:** ${message}\n\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\``
        };
        fetch(webhookUrl, {
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

