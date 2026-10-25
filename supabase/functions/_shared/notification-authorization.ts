import { readBoundedJson } from './http-request.ts';

export interface NotificationOrderScope {
  owner: string | null;
  restaurantId: string | null;
  state: string;
  kitchenState: string | null;
  restaurant: string | null;
  preparationMinutes: number | null;
}
export interface NotificationDriverScope { name: string }
export interface NotificationAuthorizationGateway {
  user(token: string): Promise<string | null>;
  admin(userId: string): Promise<boolean>;
  driver(userId: string): Promise<NotificationDriverScope | null>;
  order(orderId: string): Promise<NotificationOrderScope | null>;
  managesRestaurant(userId: string, restaurantId: string): Promise<boolean>;
}
export interface NotificationAuthorizationConfig {
  dispatchToken: string | undefined;
  serviceKey: string | undefined;
  supabaseUrl: string;
}
export type NotificationAuthorization =
  | { allowed: true; request: Request }
  | { allowed: false; status: number; code: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stateTypes = new Set(["asignacion", "asignado", "recibido", "en_camino", "entregado"]);
const driverTypes = new Set([...stateTypes, "no_encuentro_dir", "evidencia_foto"]);
const activeStates = new Set(["asignado", "recibido", "en_camino"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
async function equalSecret(provided: string | null, expected: string | undefined): Promise<boolean> {
  if (!provided || !expected || expected.length < 32) return false;
  const encoder = new TextEncoder();
  const hashes = await Promise.all([provided, expected].map(value => crypto.subtle.digest("SHA-256", encoder.encode(value))));
  const first = new Uint8Array(hashes[0]), second = new Uint8Array(hashes[1]);
  let difference = 0;
  for (let i = 0; i < first.length; i++) difference |= first[i] ^ second[i];
  return difference === 0;
}
function allow(req: Request, payload: Record<string, unknown>): NotificationAuthorization {
  return { allowed: true, request: new Request(req.url, {
    method: "POST", headers: req.headers, body: JSON.stringify(payload),
  }) };
}
function deny(status: number, code: string): NotificationAuthorization {
  return { allowed: false, status, code };
}
function evidenceUrl(value: unknown, orderId: string, supabaseUrl: string): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value), origin = new URL(supabaseUrl);
    const path = decodeURIComponent(url.pathname);
    if (url.protocol !== "https:" || url.origin !== origin.origin || url.username || url.password || url.search || url.hash) return null;
    if (!path.startsWith(`/storage/v1/object/public/admin_assets/evidencias/${orderId}/`) || path.includes("..") || !/\.(jpg|jpeg|png)$/i.test(path)) return null;
    return url.href;
  } catch { return null; }
}

export async function authorizeNotificationRequest(
  req: Request,
  gateway: NotificationAuthorizationGateway,
  config: NotificationAuthorizationConfig,
): Promise<NotificationAuthorization> {
  try {
    const bearer = req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1] ?? null;
    const internal = await equalSecret(req.headers.get("x-dispatch-token"), config.dispatchToken)
      || await equalSecret(bearer, config.serviceKey);
    const userId = internal ? null : bearer ? await gateway.user(bearer) : null;
    if (!internal && !userId) return deny(401, "notification_unauthorized");
    let body: unknown;
    try { body = await readBoundedJson(req); }
    catch (error: unknown) {
      const reason = error instanceof Error ? error.message : "invalid_body";
      return deny(reason === "body_too_large" ? 413 : reason === "body_timeout" ? 408 : 400, "notification_invalid_body");
    }
    if (!isRecord(body)) return deny(400, "notification_invalid_body");
    const payload = body;
    if (internal) return allow(req, payload);
    if (!userId) return deny(401, "notification_unauthorized");
    // Database event snapshots can only come from a server, even for administrators.
    if ("record" in payload || "old_record" in payload || "table" in payload) return deny(403, "notification_server_event_only");
    if (typeof payload.tipo !== "string") return deny(400, "notification_invalid_type");
    if (await gateway.admin(userId)) return allow(req, payload);
    const driver = await gateway.driver(userId);
    if (payload.tipo === "sos") {
      if (!driver) return deny(403, "notification_driver_required");
      const lat = payload.lat, lng = payload.lng;
      if ((lat !== undefined || lng !== undefined) &&
          (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) return deny(400, "notification_invalid_location");
      return allow(req, { tipo: "sos", repartidor_nombre: driver.name, ...(lat !== undefined ? { lat, lng } : {}) });
    }
    const orderId = payload.pedido_id;
    if (typeof orderId !== "string" || !uuid.test(orderId)) return deny(403, "notification_order_required");
    const order = await gateway.order(orderId);
    if (!order) return deny(404, "notification_order_unavailable");
    if (driver && order.owner === userId && driverTypes.has(payload.tipo)) {
      if (stateTypes.has(payload.tipo)) {
        const expected = payload.tipo === "asignacion" ? "asignado" : payload.tipo;
        if (order.state !== expected) return deny(409, "notification_stale_state");
        // Never trust a recipient or a name supplied by the mobile app.
        return allow(req, { tipo: payload.tipo, pedido_id: orderId });
      }
      if (payload.tipo === "no_encuentro_dir") {
        if (!activeStates.has(order.state)) return deny(409, "notification_stale_state");
        return allow(req, { tipo: payload.tipo, pedido_id: orderId, repartidor_nombre: driver.name });
      }
      if (!activeStates.has(order.state) && order.state !== "entregado") return deny(409, "notification_stale_state");
      const photo = evidenceUrl(payload.foto_url, orderId, config.supabaseUrl);
      if (!photo || (payload.caption !== undefined && (typeof payload.caption !== "string" || payload.caption.length > 1000))) return deny(400, "notification_invalid_evidence");
      return allow(req, { tipo: payload.tipo, pedido_id: orderId, foto_url: photo, ...(payload.caption !== undefined ? { caption: payload.caption } : {}) });
    }
    if (order.restaurantId && ["preparando", "comida_lista"].includes(payload.tipo)
        && await gateway.managesRestaurant(userId, order.restaurantId)) {
      if (order.kitchenState !== (payload.tipo === "preparando" ? "en_cocina" : "listo_para_recoger")) return deny(409, "notification_stale_state");
      return allow(req, { tipo: payload.tipo, pedido_id: orderId, restaurante: order.restaurant,
        tiempo_preparacion_minutos: order.preparationMinutes });
    }
    return deny(403, "notification_scope_denied");
  } catch (_error: unknown) {
    // A failed identity/ownership lookup must never turn into permission.
    console.error(JSON.stringify({ event: "notification_authorization_unavailable" }));
    return deny(503, "notification_authorization_unavailable");
  }
}
