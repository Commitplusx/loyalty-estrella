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
    const raw: unknown = await req.json();
    const payload = object(raw);
    const record = payload.record == null ? payload : object(payload.record);
    const id = uuid(record.id);
    const outcome = await dispatchOrder(
      id,
      new SupabaseDispatchGateway(serviceClient()),
    );
    console.log(
      JSON.stringify({ event: "dispatch_result", order_id: id, ...outcome }),
    );
    return response(outcome);
  } catch (_) {
    console.error("dispatch_failed");
    return response({
      error: "No se pudo completar el despacho. Revisar recuperación.",
    }, 500);
  }
});
