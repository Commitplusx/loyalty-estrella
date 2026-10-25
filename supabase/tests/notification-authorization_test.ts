import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { authorizeNotificationRequest, type NotificationAuthorizationConfig, type NotificationAuthorizationGateway,
  type NotificationDriverScope, type NotificationOrderScope } from "../functions/_shared/notification-authorization.ts";

const user = "24000000-0000-4000-8000-000000000001", orderId = "24000000-0000-4000-8000-000000000002";
const config: NotificationAuthorizationConfig = { dispatchToken: "fixture-internal-token-32-characters", serviceKey: "fixture-service-key-32-characters", supabaseUrl: "https://project.invalid" };
class Gateway implements NotificationAuthorizationGateway {
  userId: string | null = user;
  isAdmin = false;
  isOwner = false;
  driverIdentity: NotificationDriverScope | null = { name: "Verified Driver" };
  scope: NotificationOrderScope | null = { owner: user, restaurantId: "24000000-0000-4000-8000-000000000003", state: "asignado", kitchenState: "en_cocina", restaurant: "Verified Restaurant", preparationMinutes: 20 };
  lookups = 0;
  fail = false;
  user(_token: string): Promise<string | null> { this.lookups++; return this.fail ? Promise.reject(new Error("offline")) : Promise.resolve(this.userId); }
  admin(_userId: string): Promise<boolean> { return Promise.resolve(this.isAdmin); }
  driver(_userId: string): Promise<NotificationDriverScope | null> { return Promise.resolve(this.driverIdentity); }
  order(_orderId: string): Promise<NotificationOrderScope | null> { return Promise.resolve(this.scope); }
  managesRestaurant(_userId: string, _restaurantId: string): Promise<boolean> { return Promise.resolve(this.isOwner); }
}
function request(payload: unknown, headers: Record<string,string> = { authorization: "Bearer fixture-user-token" }): Request {
  return new Request("https://example.invalid/notificar-whatsapp", { method: "POST", headers, body: JSON.stringify(payload) });
}
Deno.test("anonymous cannot trigger a message even with a forged database event", async () => {
  const gateway = new Gateway();
  const result = await authorizeNotificationRequest(request({ type: "INSERT", table: "pedidos", record: {} }, {}), gateway, config);
  assertEquals(result, { allowed: false, status: 401, code: "notification_unauthorized" });
  assertEquals(gateway.lookups, 0);
});
Deno.test("invalid JWT and absent server secrets never bypass identity", async () => {
  const gateway = new Gateway(); gateway.userId = null;
  const attempts: Record<string,string>[] = [{ authorization: "Bearer forged" }, { "x-dispatch-token": "" }, { "x-dispatch-token": "forged" }];
  for (const headers of attempts) {
    const result = await authorizeNotificationRequest(request({}, headers), gateway, { ...config, serviceKey: undefined, dispatchToken: undefined });
    assertEquals(result.allowed, false);
  }
});
Deno.test("server transport accepts only the exact configured secret and skips user lookup", async () => {
  const attempts: Record<string,string>[] = [{ "x-dispatch-token": config.dispatchToken! }, { authorization: `Bearer ${config.serviceKey}` }];
  for (const headers of attempts) {
    const gateway = new Gateway(); gateway.fail = true;
    const result = await authorizeNotificationRequest(request({ type: "INSERT", table: "pedidos", record: { id: orderId } }, headers), gateway, config);
    assertEquals(result.allowed, true);
    assertEquals(gateway.lookups, 0);
  }
});
Deno.test("even an authenticated administrator cannot forge a database snapshot", async () => {
  const gateway = new Gateway(); gateway.isAdmin = true;
  const result = await authorizeNotificationRequest(request({ type: "INSERT", table: "pedidos", record: {} }), gateway, config);
  assertEquals(result, { allowed: false, status: 403, code: "notification_server_event_only" });
});
Deno.test("administrator retains operational notification access", async () => {
  const gateway = new Gateway(); gateway.isAdmin = true;
  const result = await authorizeNotificationRequest(request({ tipo: "nueva_orden_admin", restaurante: "Verified Restaurant" }), gateway, config);
  assertEquals(result.allowed, true);
});
Deno.test("driver cannot notify a different driver's order", async () => {
  const gateway = new Gateway(); gateway.scope = { ...gateway.scope!, owner: "other-owner" };
  const result = await authorizeNotificationRequest(request({ tipo: "asignacion", pedido_id: orderId }), gateway, config);
  assertEquals(result, { allowed: false, status: 403, code: "notification_scope_denied" });
});
Deno.test("ordinary authenticated account cannot send arbitrary customer or wallet messages", async () => {
  const gateway = new Gateway(); gateway.driverIdentity = null;
  for (const tipo of ["notificacion_generica", "cupon_generado", "bienvenida_vip", "canje_billetera", "asignacion"]) {
    const result = await authorizeNotificationRequest(request({ tipo, pedido_id: orderId, cliente_tel: "0000000000" }), gateway, config);
    assertEquals(result.allowed, false);
  }
});
Deno.test("owned order resolves recipients on the server and drops spoofed fields", async () => {
  const gateway = new Gateway();
  const result = await authorizeNotificationRequest(request({ tipo: "asignacion", pedido_id: orderId, repartidor_tel: "0000000000", cliente_tel: "0000000000", descripcion: "forged" }), gateway, config);
  assertEquals(result.allowed, true);
  if (result.allowed) assertEquals(await result.request.json(), { tipo: "asignacion", pedido_id: orderId });
});
Deno.test("all driver state notices require the corresponding persisted state", async () => {
  for (const tipo of ["asignacion", "asignado", "recibido", "en_camino", "entregado"]) {
    const gateway = new Gateway(); gateway.scope = { ...gateway.scope!, state: tipo === "asignacion" ? "asignado" : tipo };
    assertEquals((await authorizeNotificationRequest(request({ tipo, pedido_id: orderId }), gateway, config)).allowed, true);
    gateway.scope.state = "cancelado";
    assertEquals(await authorizeNotificationRequest(request({ tipo, pedido_id: orderId }), gateway, config), { allowed: false, status: 409, code: "notification_stale_state" });
  }
});
Deno.test("missing and invalid order IDs never become authorized targets", async () => {
  const gateway = new Gateway();
  for (const pedido_id of [undefined, "invalid", 14]) assertEquals((await authorizeNotificationRequest(request({ tipo: "asignacion", pedido_id }), gateway, config)).allowed, false);
  gateway.scope = null;
  assertEquals(await authorizeNotificationRequest(request({ tipo: "asignacion", pedido_id: orderId }), gateway, config), { allowed: false, status: 404, code: "notification_order_unavailable" });
});
Deno.test("location relay uses driver identity and only an active owned order", async () => {
  const gateway = new Gateway();
  const result = await authorizeNotificationRequest(request({ tipo: "no_encuentro_dir", pedido_id: orderId, repartidor_nombre: "Impersonated Driver" }), gateway, config);
  if (!result.allowed) throw new Error("Expected authorized relay");
  assertEquals(await result.request.json(), { tipo: "no_encuentro_dir", pedido_id: orderId, repartidor_nombre: "Verified Driver" });
  gateway.scope = { ...gateway.scope!, state: "entregado" };
  assertEquals((await authorizeNotificationRequest(request({ tipo: "no_encuentro_dir", pedido_id: orderId }), gateway, config)).allowed, false);
});
Deno.test("SOS requires a driver profile and ignores forged display names", async () => {
  const gateway = new Gateway();
  const result = await authorizeNotificationRequest(request({ tipo: "sos", repartidor_nombre: "forged", lat: 16, lng: -92 }), gateway, config);
  if (!result.allowed) throw new Error("Expected owned SOS");
  assertEquals(await result.request.json(), { tipo: "sos", repartidor_nombre: "Verified Driver", lat: 16, lng: -92 });
  gateway.driverIdentity = null;
  assertEquals((await authorizeNotificationRequest(request({ tipo: "sos" }), gateway, config)).allowed, false);
});
Deno.test("SOS rejects invalid coordinates rather than inventing a location", async () => {
  const gateway = new Gateway();
  for (const location of [{ lat: 100, lng: 0 }, { lat: "16", lng: -92 }, { lat: 16 }, { lng: 200 }]) {
    assertEquals((await authorizeNotificationRequest(request({ tipo: "sos", ...location }), gateway, config)).allowed, false);
  }
});
Deno.test("evidence must belong to the same order and configured storage", async () => {
  const gateway = new Gateway();
  const path = `/storage/v1/object/public/admin_assets/evidencias/${orderId}/fixture.jpg`;
  const result = await authorizeNotificationRequest(request({ tipo: "evidencia_foto", pedido_id: orderId, foto_url: `https://project.invalid${path}`, caption: "Delivery evidence" }), gateway, config);
  assertEquals(result.allowed, true);
  for (const foto_url of [`https://external.invalid${path}`, "https://project.invalid/other-order/fixture.jpg", `https://project.invalid${path}?external=1`, `http://project.invalid${path}`]) {
    assertEquals((await authorizeNotificationRequest(request({ tipo: "evidencia_foto", pedido_id: orderId, foto_url }), gateway, config)).allowed, false);
  }
});
Deno.test("restaurant notifications require ownership and canonical kitchen state", async () => {
  const gateway = new Gateway(); gateway.driverIdentity = null; gateway.isOwner = true;
  for (const tipo of ["preparando", "comida_lista"]) {
    gateway.scope = { ...gateway.scope!, kitchenState: tipo === "preparando" ? "en_cocina" : "listo_para_recoger" };
    const result = await authorizeNotificationRequest(request({ tipo, pedido_id: orderId, restaurante: "forged", tiempo_preparacion_minutos: 1 }), gateway, config);
    if (!result.allowed) throw new Error("Expected owned kitchen notice");
    assertEquals(await result.request.json(), { tipo, pedido_id: orderId, restaurante: "Verified Restaurant", tiempo_preparacion_minutos: 20 });
  }
  gateway.isOwner = false;
  assertEquals((await authorizeNotificationRequest(request({ tipo: "comida_lista", pedido_id: orderId }), gateway, config)).allowed, false);
});
Deno.test("identity lookup failure is explicit and fails closed", async () => {
  const gateway = new Gateway(); gateway.fail = true;
  assertEquals(await authorizeNotificationRequest(request({ tipo: "sos" }), gateway, config), { allowed: false, status: 503, code: "notification_authorization_unavailable" });
});
Deno.test("malformed, scalar and oversized bodies fail without processing", async () => {
  const gateway = new Gateway();
  for (const body of ["broken JSON", "null", "[]", JSON.stringify({ padding: "x".repeat(131072) })]) {
    const req = new Request("https://example.invalid", { method: "POST", headers: { "x-dispatch-token": config.dispatchToken! }, body });
    const result = await authorizeNotificationRequest(req, gateway, config);
    assertEquals(result.allowed, false);
  }
});
