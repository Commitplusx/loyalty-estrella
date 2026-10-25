export interface DispatchOrder {
  id: string;
  state: string;
  owner: string | null;
  token: string | null;
  expiresAt: string | null;
  rejected: string[];
  restaurantId: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
}
export interface DispatchCandidate {
  id: string;
  score: number;
  contextId?: string;
}
export interface NotificationResult {
  realtime: boolean;
  push: boolean;
  timeout: boolean;
}
export type DispatchOutcome = {
  status: "ignored" | "retry_pending" | "offered";
  notifications?: NotificationResult;
};
export interface DispatchGateway {
  claim(id: string): Promise<boolean>;
  read(id: string): Promise<DispatchOrder | null>;
  candidates(order: DispatchOrder): Promise<DispatchCandidate[]>;
  offer(id: string, driver: string, contextId?: string): Promise<boolean>;
  notify(order: DispatchOrder): Promise<NotificationResult>;
  incident(
    id: string,
    reason: string,
    owner: string | null,
    token: string | null,
  ): Promise<void>;
}

/** A rejected atomic offer means "try the next eligible candidate", not that
 * the order was assigned. Authoritative readback precedes every notification. */
export async function dispatchOrder(
  id: string,
  gateway: DispatchGateway,
  elapsedClock: () => number = () => performance.now(),
): Promise<DispatchOutcome> {
  const started = elapsedClock();
  if (!await gateway.claim(id)) return { status: "ignored" };
  try {
    const order = await gateway.read(id);
    if (
      !order || order.state !== "buscando_repartidor" || order.owner !== null
    ) return { status: "ignored" };
    const candidates = await gateway.candidates(order);
    const seen = new Set<string>();
    let budgetExceeded = false;
    for (const candidate of candidates.slice(0, 10)) {
      if (elapsedClock() - started >= 20000) {
        budgetExceeded = true;
        break;
      }
      if (seen.has(candidate.id) || order.rejected.includes(candidate.id)) {
        continue;
      }
      seen.add(candidate.id);
      if (!await gateway.offer(id, candidate.id, candidate.contextId)) continue;
      const offered = await gateway.read(id);
      if (
        !offered || offered.state !== "ofrecido" ||
        offered.owner !== candidate.id || !offered.token ||
        !offered.expiresAt ||
        Date.parse(offered.expiresAt) <= Date.now()
      ) {
        return { status: "ignored" };
      }
      const notifications = await gateway.notify(offered);
      if (!notifications.push || !notifications.timeout) {
        await gateway.incident(
          id,
          "notificacion_o_timeout_pendiente",
          offered.owner,
          offered.token,
        );
      }
      return { status: "offered", notifications };
    }
    const current = await gateway.read(id);
    if (
      !current || current.state !== "buscando_repartidor" ||
      current.owner !== null
    ) return { status: "ignored" };
    await gateway.incident(
      id,
      budgetExceeded
        ? "presupuesto_despacho_agotado"
        : "sin_candidato_disponible",
      null,
      null,
    );
    return { status: "retry_pending" };
  } catch (error) {
    await gateway.incident(id, "error_despacho", null, null);
    throw error;
  }
}

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Objeto inválido");
  }
  return value as Record<string, unknown>;
}
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new Error("UUID inválido");
  }
  return value;
}
function optionalId(value: unknown): string | null {
  return value == null ? null : uuid(value);
}
function coordinate(value: unknown, max: number): number | null {
  if (value == null) return null;
  if (
    typeof value !== "number" || !Number.isFinite(value) ||
    Math.abs(value) > max
  ) throw new Error("Coordenada inválida");
  return value;
}
export function parseDispatchOrder(value: unknown): DispatchOrder {
  const row = object(value);
  if (typeof row.estado !== "string") throw new Error("Estado inválido");
  const rejected = row.ofertas_rechazadas ?? [];
  if (!Array.isArray(rejected)) throw new Error("Rechazos inválidos");
  const expires = row.oferta_vence_at;
  if (
    expires != null &&
    (typeof expires !== "string" || !Number.isFinite(Date.parse(expires)))
  ) throw new Error("Vigencia inválida");
  return {
    id: uuid(row.id),
    state: row.estado,
    owner: optionalId(row.repartidor_id),
    token: optionalId(row.oferta_token),
    expiresAt: expires == null ? null : String(expires),
    rejected: rejected.map(uuid),
    restaurantId: optionalId(row.restaurante_id),
    pickupLat: coordinate(
      row.restaurante_lat ?? (row.tipo_pedido === "mandadito" ? row.lat : null),
      90,
    ),
    pickupLng: coordinate(
      row.restaurante_lng ?? (row.tipo_pedido === "mandadito" ? row.lng : null),
      180,
    ),
    deliveryLat: coordinate(row.lat_entrega ?? row.lat, 90),
    deliveryLng: coordinate(row.lng_entrega ?? row.lng, 180),
  };
}
