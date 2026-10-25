import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { cert, getApps, initializeApp } from "npm:firebase-admin@11.11.1/app";
import { getMessaging } from "npm:firebase-admin@11.11.1/messaging";
import {
  type DispatchCandidate,
  type DispatchGateway,
  type DispatchOrder,
  type NotificationResult,
  object,
  parseDispatchOrder,
  uuid,
} from "./driver-dispatch.ts";

export function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
export function authorized(req: Request): boolean {
  const token = Deno.env.get("DISPATCH_TOKEN");
  return typeof token === "string" && token.length >= 32 &&
    req.headers.get("x-dispatch-token") === token;
}
function deadline<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Notificación sin confirmar")),
      milliseconds,
    );
    work.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Despacho no configurado");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  });
}
export class SupabaseDispatchGateway implements DispatchGateway {
  constructor(readonly client: SupabaseClient) {}
  async boolRpc(name: string, args: Record<string, string>): Promise<boolean> {
    const { data, error } = await this.client.rpc(name, args);
    const result: unknown = data;
    if (error || typeof result !== "boolean") {
      throw new Error("Error en RPC de despacho");
    }
    return result;
  }
  claim(id: string): Promise<boolean> {
    return this.boolRpc("reclamar_despacho_pedido", { p_pedido_id: id });
  }
  offer(id: string, driver: string): Promise<boolean> {
    return this.boolRpc("asignar_pedido_atomico", {
      p_pedido_id: id,
      p_repartidor_id: driver,
    });
  }
  async read(id: string): Promise<DispatchOrder | null> {
    const { data, error } = await this.client.from("pedidos").select(
      "id,estado,repartidor_id,oferta_token,oferta_vence_at,ofertas_rechazadas,restaurante_id,restaurante_lat,restaurante_lng,lat,lng,lat_entrega,lng_entrega,tipo_pedido",
    ).eq("id", id).maybeSingle();
    if (error) throw new Error("Error consultando pedido");
    return data === null ? null : parseDispatchOrder(data);
  }
  async candidates(order: DispatchOrder): Promise<DispatchCandidate[]> {
    let lat = order.pickupLat, lng = order.pickupLng;
    if ((lat === null || lng === null) && order.restaurantId) {
      const { data, error } = await this.client.from("restaurantes").select(
        "lat,lng",
      ).eq("id", order.restaurantId).maybeSingle();
      if (error) throw new Error("Error consultando origen");
      if (data) {
        const coords = object(data);
        if (
          typeof coords.lat === "number" && typeof coords.lng === "number" &&
          Number.isFinite(coords.lat) && Number.isFinite(coords.lng) &&
          Math.abs(coords.lat) <= 90 && Math.abs(coords.lng) <= 180
        ) {
          lat = coords.lat;
          lng = coords.lng;
        }
      }
    }
    const { data, error } = await this.client.rpc(
      "buscar_repartidores_cercanos",
      {
        p_lat: lat !== null && lng !== null ? lat : null,
        p_lng: lat !== null && lng !== null ? lng : null,
        p_radio_metros: 5000,
        p_cliente_lat: order.deliveryLat,
        p_cliente_lng: order.deliveryLng,
        p_excluidos: order.rejected,
      },
    );
    const rows: unknown = data;
    if (error || !Array.isArray(rows)) {
      throw new Error("Error buscando candidatos");
    }
    return rows.map((value: unknown) => {
      const row = object(value);
      if (typeof row.score !== "number" || !Number.isFinite(row.score)) {
        throw new Error("Score inválido");
      }
      return { id: uuid(row.user_id), score: row.score };
    }).sort((a, b) => a.score - b.score);
  }
  async incident(
    id: string,
    reason: string,
    owner: string | null,
    token: string | null,
  ): Promise<void> {
    let query = this.client.from("pedidos").update({
      despacho_incidente: reason,
    }).eq("id", id);
    query = owner === null
      ? query.eq("estado", "buscando_repartidor").is("repartidor_id", null)
      : query.eq("estado", "ofrecido").eq("repartidor_id", owner).eq(
        "oferta_token",
        token,
      );
    const { error } = await query;
    if (error) throw new Error("No se pudo registrar incidente de despacho");
  }
  async notify(order: DispatchOrder): Promise<NotificationResult> {
    const results = await Promise.allSettled([
      this.realtime(order),
      this.push(order),
      this.timeout(order),
    ]);
    return {
      realtime: results[0].status === "fulfilled",
      push: results[1].status === "fulfilled",
      timeout: results[2].status === "fulfilled",
    };
  }
  async realtime(order: DispatchOrder): Promise<void> {
    const channel = this.client.channel("repartidores_ping");
    try {
      const result = await deadline(
        channel.send({
          type: "broadcast",
          event: "order_offered",
          payload: {
            pedido_id: order.id,
            target_driver_id: order.owner,
            oferta_token: order.token,
            oferta_vence_at: order.expiresAt,
          },
        }),
        3000,
      );
      if (result !== "ok") throw new Error("Broadcast no confirmado");
    } finally {
      await deadline(this.client.removeChannel(channel), 3000);
    }
  }
  async push(order: DispatchOrder): Promise<void> {
    if (getApps().length === 0) {
      const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
      if (!raw) throw new Error("FCM no configurado");
      const account = object(JSON.parse(raw));
      if (
        typeof account.project_id !== "string" ||
        typeof account.client_email !== "string" ||
        typeof account.private_key !== "string"
      ) throw new Error("Configuración FCM inválida");
      initializeApp({
        credential: cert({
          projectId: account.project_id,
          clientEmail: account.client_email,
          privateKey: account.private_key,
        }),
      });
    }
    const messaging = getMessaging();
    await deadline(
      messaging.send({
        topic: `driver_${order.owner}`,
        android: { priority: "high", ttl: 25000 },
        data: {
          tipo: "pedido_asignado",
          pedido_id: order.id,
          target_driver_id: order.owner ?? "",
          oferta_token: order.token ?? "",
          oferta_vence_at: order.expiresAt ?? "",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
      }),
      10000,
    );
  }
  async timeout(order: DispatchOrder): Promise<void> {
    const token = Deno.env.get("QSTASH_TOKEN"),
      dispatchToken = Deno.env.get("DISPATCH_TOKEN"),
      url = Deno.env.get("SUPABASE_URL");
    if (!token || !dispatchToken || !url) {
      throw new Error("Timeout no configurado");
    }
    const delay = Math.max(
      1,
      Math.ceil((Date.parse(order.expiresAt ?? "") - Date.now()) / 1000),
    );
    const result = await fetch(
      `https://qstash-us-east-1.upstash.io/v2/publish/${url}/functions/v1/asignacion-timeout`,
      {
        method: "POST",
        signal: AbortSignal.timeout(5000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Upstash-Delay": `${delay}s`,
          "Upstash-Retries": "3",
          "Upstash-Forward-X-Dispatch-Token": dispatchToken,
        },
        body: JSON.stringify({
          pedido_uuid: order.id,
          repartidor_actual_id: order.owner,
          oferta_token: order.token,
        }),
      },
    );
    if (!result.ok) throw new Error("QStash no confirmó programación");
    await result.body?.cancel();
  }
}
