type ProviderStatus = 'accepted' | 'sent' | 'delivered' | 'read';

interface NotificationConfig {
  apiKey: string;
  sender: string;
}

export class NotificationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly providerStatus?: number,
    readonly providerCode?: string,
  ) { super(message); }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
}

// YCloud expects an E.164 phone, not a Meta phone-number ID. No provider fallback.
export function notificationSender(value: string | undefined): string {
  if (!value || !/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new NotificationError('El emisor de notificaciones no está configurado.', 503, 'SENDER_UNCONFIGURED');
  }
  return value;
}

function targetPhone(value: unknown): string {
  if (typeof value !== 'string' || !/^\+?[\d\s()-]+$/.test(value)) {
    throw new NotificationError('El teléfono de destino no es válido.', 400, 'INVALID_RECIPIENT');
  }
  const digits = value.replace(/\D/g, '');
  if (!/^(?:52|521)?\d{10}$/.test(digits)) {
    throw new NotificationError('El teléfono de destino no es válido.', 400, 'INVALID_RECIPIENT');
  }
  return '+52' + digits.slice(-10);
}

function providerStatus(value: unknown): value is ProviderStatus {
  return value === 'accepted' || value === 'sent' || value === 'delivered' || value === 'read';
}

function safeCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_]{1,100}$/.test(value) ? value : undefined;
}

export async function handleGenericNotification(
  payload: unknown,
  config: NotificationConfig,
  corsHeaders: Record<string, string>,
  transport: typeof fetch = fetch,
): Promise<Response> {
  const headers = {...corsHeaders, 'Content-Type': 'application/json'};
  try {
    const input = record(payload);
    const to = targetPhone(input.cliente_tel);
    if (typeof input.mensaje !== 'string' || !input.mensaje.trim() || input.mensaje.length > 4096) {
      throw new NotificationError('El mensaje debe contener entre 1 y 4096 caracteres.', 400, 'INVALID_MESSAGE');
    }
    const from = notificationSender(config.sender);
    if (!config.apiKey) {
      throw new NotificationError('El proveedor de notificaciones no está configurado.', 503, 'PROVIDER_UNCONFIGURED');
    }
    // One attempt only: a network timeout can occur after the provider accepted the message.
    const response = await transport('https://api.ycloud.com/v2/whatsapp/messages/sendDirectly', {
      method: 'POST',
      headers: {'X-API-Key': config.apiKey, 'Content-Type': 'application/json'},
      body: JSON.stringify({from, to, type: 'text', text: {body: input.mensaje}}),
      signal: AbortSignal.timeout(15000),
    });
    const data: unknown = await response.json().catch(() => null);
    const result = record(data);
    const error = record(result.error);
    if (!response.ok || result.error !== undefined || typeof result.id !== 'string' || !result.id.trim()
        || !providerStatus(result.status)) {
      throw new NotificationError('WhatsApp no aceptó la notificación.', 502, 'PROVIDER_REJECTED',
        response.status, safeCode(error.code) || safeCode(result.errorCode));
    }
    console.log(JSON.stringify({event: 'notification_provider_accepted', message_id: result.id,
      provider_status: result.status, sender_suffix: from.slice(-4)}));
    return new Response(JSON.stringify({ok: true, provider: 'ycloud', message_id: result.id,
      provider_status: result.status, delivered: result.status === 'delivered' || result.status === 'read'}),
      {status: 200, headers});
  } catch (error: unknown) {
    const failure = error instanceof NotificationError ? error
      : error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
      ? new NotificationError('No se pudo confirmar el envío de WhatsApp.', 504, 'PROVIDER_TIMEOUT')
      : new NotificationError('No se pudo confirmar el envío de WhatsApp.', 502, 'PROVIDER_UNAVAILABLE');
    console.error(JSON.stringify({event: 'notification_failed', code: failure.code,
      provider_status: failure.providerStatus, provider_code: failure.providerCode}));
    return new Response(JSON.stringify({ok: false, error: failure.message, code: failure.code,
      provider_status: failure.providerStatus, provider_code: failure.providerCode}), {status: failure.status, headers});
  }
}
