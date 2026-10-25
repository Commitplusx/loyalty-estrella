import { handleGenericNotification, notificationSender } from '../functions/_shared/notification-messaging.ts';

const config = {apiKey: 'fixture-key', sender: '+522205550000'};
const payload = {cliente_tel: '5550000000', mensaje: 'Notificación de prueba'};
const cors = {'Access-Control-Allow-Origin': '*'};
function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('Unexpected result');
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw Error('Expected object');
  return Object.fromEntries(Object.entries(value));
}

Deno.test('notification sender requires explicit E.164; missing or Meta ID never falls back', () => {
  equal(notificationSender(config.sender), config.sender);
  for (const invalid of [undefined, '', '1368485043011935', '522205550000', '  +522205550000']) {
    let rejected = false;
    try { notificationSender(invalid); } catch (_error: unknown) { rejected = true; }
    equal(rejected, true);
  }
});

Deno.test('notification sends once from configured 220, normalizes MX target and returns provider ID', async () => {
  for (const target of ['5550000000', '+525550000000', '+5215550000000', '(555) 000-0000']) {
    let requests = 0;
    const transport: typeof fetch = (url, init) => {
      requests++;
      equal(url, 'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly');
      equal(init?.method, 'POST');
      if (typeof init?.body !== 'string') throw Error('Missing body');
      equal(JSON.parse(init.body), {from: config.sender, to: '+525550000000', type: 'text', text: {body: payload.mensaje}});
      equal(init.signal instanceof AbortSignal, true);
      return Promise.resolve(Response.json({id: 'fixture-id', status: 'sent'}));
    };
    const response = await handleGenericNotification({...payload, cliente_tel: target}, config, cors, transport);
    equal(response.status, 200);
    equal(await response.json(), {ok: true, provider: 'ycloud', message_id: 'fixture-id', provider_status: 'sent', delivered: false});
    equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    equal(requests, 1);
  }
});

Deno.test('invalid recipient/message/config never reaches provider', async () => {
  let sends = 0;
  const transport: typeof fetch = () => { sends++; throw Error('Provider must not be called'); };
  for (const patch of [{cliente_tel: 5550000000}, {cliente_tel: '1'}, {cliente_tel: 'bad5550000000'},
    {mensaje: ''}, {mensaje: '  '}, {mensaje: 123}, {mensaje: 'x'.repeat(4097)}]) {
    const response = await handleGenericNotification({...payload, ...patch}, config, cors, transport);
    equal(response.status, 400);
    equal(record(await response.json()).ok, false);
  }
  for (const patch of [{sender: ''}, {sender: '1368485043011935'}, {apiKey: ''}]) {
    const response = await handleGenericNotification(payload, {...config, ...patch}, cors, transport);
    equal(response.status, 503);
    equal(record(await response.json()).ok, false);
  }
  equal(sends, 0);
});

Deno.test('actual unregistered sender HTTP 403 cannot produce false HTTP 200 or leak provider payload', async () => {
  let requests = 0;
  const transport: typeof fetch = () => {
    requests++;
    return Promise.resolve(Response.json({error: {code: 'WHATSAPP_PHONE_NUMBER_UNAVAILABLE',
      message: 'Private provider payload'}}, {status: 403}));
  };
  const response = await handleGenericNotification(payload, config, cors, transport);
  equal(response.status, 502);
  equal(await response.json(), {ok: false, error: 'WhatsApp no aceptó la notificación.', code: 'PROVIDER_REJECTED',
    provider_status: 403, provider_code: 'WHATSAPP_PHONE_NUMBER_UNAVAILABLE'});
  equal(requests, 1);
});

Deno.test('HTTP 200 with failed, missing ID, unknown status, error envelope or malformed JSON is rejected', async () => {
  const invalid: unknown[] = [{id: 'fixture-id', status: 'failed'}, {status: 'sent'}, {id: '', status: 'sent'},
    {id: 'fixture-id', status: 'pending'}, {id: 'fixture-id', status: 'sent', error: {code: 'REJECTED'}}, null, []];
  for (const body of invalid) {
    const response = await handleGenericNotification(payload, config, cors, () => Promise.resolve(Response.json(body)));
    equal(response.status, 502);
    equal(record(await response.json()).ok, false);
  }
  const malformed = await handleGenericNotification(payload, config, cors, () => Promise.resolve(new Response('broken')));
  equal(malformed.status, 502);
  await malformed.arrayBuffer();
});

Deno.test('acceptance differs from delivery; only delivered/read confirms provider delivery', async () => {
  for (const status of ['accepted', 'sent', 'delivered', 'read']) {
    const response = await handleGenericNotification(payload, config, cors, () => Promise.resolve(Response.json({id: 'fixture-id', status})));
    const body = record(await response.json());
    equal(response.status, 200);
    equal(body.provider_status, status);
    equal(body.delivered, status === 'delivered' || status === 'read');
  }
});

Deno.test('timeout and network failure are explicit; uncertain sends are never automatically repeated', async () => {
  for (const failure of [new DOMException('timeout', 'TimeoutError'), new DOMException('abort', 'AbortError'),
    new TypeError('Private network payload')]) {
    let requests = 0;
    const transport: typeof fetch = () => { requests++; return Promise.reject(failure); };
    const response = await handleGenericNotification(payload, config, cors, transport);
    equal(response.status, failure instanceof DOMException ? 504 : 502);
    equal(record(await response.json()).ok, false);
    equal(requests, 1);
  }
});
