import { dispatchOrder, object, uuid } from "../_shared/driver-dispatch.ts";
import {
  authorized,
  response,
  serviceClient,
  SupabaseDispatchGateway,
} from "../_shared/driver-dispatch-gateway.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ error: "POST requerido" }, 405);
  if (!authorized(req)) return response({ error: "No autorizado" }, 401);
  try {
    const payload = object(await req.json());
    const id = uuid(payload.pedido_uuid),
      driver = uuid(payload.repartidor_actual_id),
      token = uuid(payload.oferta_token);
    const client = serviceClient();
    const gateway = new SupabaseDispatchGateway(client);
    const expired = await gateway.boolRpc("expirar_oferta_pedido", {
      p_pedido_id: id,
      p_repartidor_id: driver,
      p_oferta_token: token,
    });
    if (!expired) return response({ status: "ignorado_por_estado_o_vigencia" });
    // Reuse the existing ranking and atomic assignment path. Never assign the
    // second driver from an old timeout payload or overwrite an accepted job.
    return response(await dispatchOrder(id, gateway));
  } catch (_) {
    console.error("offer_timeout_failed");
    return response({
      error: "Expiración no confirmada; recuperación pendiente",
    }, 500);
  }
});
