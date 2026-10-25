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
    const client = serviceClient(),
      gateway = new SupabaseDispatchGateway(client);
    const started = performance.now();
    const { data, error } = await client.rpc("eats_dispatch_recovery_batch", {
      p_limit: 50,
    });
    if (error) throw new Error("Consulta de recuperación falló");
    let offered = 0, failed = 0, ignored = 0, processed = 0;
    // Bounded batch/concurrency. A crash leaves the durable retry deadline.
    const rows: unknown = data;
    if (!Array.isArray(rows)) throw new Error("Lote de recuperación inválido");
    for (let offset = 0; offset < rows.length; offset += 3) {
      // Stop claiming more work before the Edge wall-clock budget is exhausted.
      // Unprocessed rows remain due for the next invocation.
      if (performance.now() - started >= 45000) break;
      await Promise.all(
        rows.slice(offset, offset + 3).map(async (value: unknown) => {
          try {
            processed++;
            const row = object(value), id = uuid(row.id);
            if (row.estado === "ofrecido") {
              const expired = await gateway.boolRpc("expirar_oferta_pedido", {
                p_pedido_id: id,
                p_repartidor_id: uuid(row.repartidor_id),
                p_oferta_token: uuid(row.oferta_token),
              });
              if (!expired) {
                ignored++;
                return;
              }
            }
            const result = await dispatchOrder(id, gateway);
            if (result.status === "offered") offered++;
            else ignored++;
          } catch (_) {
            failed++;
          }
        }),
      );
    }
    console.log(
      JSON.stringify({
        event: "dispatch_recovery",
        scanned: rows.length,
        processed,
        offered,
        failed,
        ignored,
      }),
    );
    return response(
      { scanned: rows.length, processed, offered, failed, ignored },
      failed > 0 ? 503 : 200,
    );
  } catch (_) {
    console.error("dispatch_recovery_failed");
    return response({ error: "Recuperación no completada" }, 500);
  }
});
