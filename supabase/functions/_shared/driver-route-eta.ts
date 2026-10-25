import { object, uuid } from "./driver-dispatch.ts";

export interface RoutePoint {
  lat: number;
  lng: number;
}
export interface RouteDriver extends RoutePoint {
  id: string;
}
export interface DispatchContext {
  id: string;
  mode: "legacy" | "observe" | "active";
  pickup: RoutePoint | null;
  drivers: RouteDriver[];
}
export type RouteReason =
  | "not_configured"
  | "provider_timeout"
  | "provider_error"
  | "provider_circuit"
  | "no_origin"
  | "no_candidates"
  | "concurrency_limit";
export interface RouteEvidence {
  source: "mapbox" | "geographic" | "legacy";
  reason: RouteReason | null;
  routes: { id: string; seconds: number | null }[];
}
function providerFailure(error: unknown): RouteReason {
  return error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ? "provider_timeout"
    : "provider_error";
}
async function routeBody(response: Response): Promise<unknown> {
  const limit = 65536;
  const size = response.headers.get("content-length");
  if (size !== null && Number(size) > limit) {
    await response.body?.cancel();
    throw new Error("Oversized route response");
  }
  if (!response.body) throw new Error("Missing route response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        throw new Error("Oversized route response");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error: unknown) {
    await reader.cancel(error);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
function point(value: unknown): RoutePoint {
  const row = object(value);
  if (
    typeof row.lat !== "number" || typeof row.lng !== "number" ||
    !Number.isFinite(row.lat) || !Number.isFinite(row.lng) ||
    Math.abs(row.lat) > 90 || Math.abs(row.lng) > 180
  ) throw new Error("Invalid route coordinates");
  return { lat: row.lat, lng: row.lng };
}
export function parseDispatchContext(value: unknown): DispatchContext {
  const row = object(value);
  if (
    row.version !== 2 ||
    (row.mode !== "legacy" && row.mode !== "observe" &&
      row.mode !== "active") ||
    !Array.isArray(row.drivers) || row.drivers.length > 10
  ) throw new Error("Invalid dispatch context");
  const drivers = row.drivers.map((entry: unknown) => {
    const driver = object(entry);
    return { id: uuid(driver.id), ...point(driver) };
  });
  if (new Set(drivers.map((driver) => driver.id)).size !== drivers.length) {
    throw new Error("Duplicate route identity");
  }
  return {
    id: uuid(row.context_id),
    mode: row.mode,
    pickup: row.pickup === null ? null : point(row.pickup),
    drivers,
  };
}

/** Only transports road estimates. Eligibility, scoring, fairness and ownership
 * are decided and revalidated by PostgreSQL, never by this provider client. */
export class DriverRouteEstimator {
  private readonly cache = new Map<
    string,
    { until: number; values: (number | null)[] }
  >();
  private readonly pending = new Map<string, Promise<(number | null)[]>>();
  private active = 0;
  private failures = 0;
  private blockedUntil = 0;
  constructor(
    private readonly token: () => string | undefined,
    private readonly transport: typeof fetch = fetch,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  async estimate(context: DispatchContext): Promise<RouteEvidence> {
    const fallback = (reason: RouteReason): RouteEvidence => ({
      source: "geographic",
      reason,
      routes: [],
    });
    if (context.mode === "legacy" || !context.pickup) {
      return { source: "legacy", reason: "no_origin", routes: [] };
    }
    if (!context.drivers.length) return fallback("no_candidates");
    const token = this.token()?.trim();
    if (!token) return fallback("not_configured");
    if (this.blockedUntil > this.clock()) return fallback("provider_circuit");
    const points = [...context.drivers, context.pickup];
    // Exact coordinates avoid disguising movement behind a broad geographic cache.
    const key = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const cached = this.cache.get(key);
    let values: (number | null)[];
    if (cached && cached.until > this.clock()) values = cached.values;
    else {
      const pending = this.pending.get(key);
      if (pending) {
        try {
          values = await pending;
        } catch (error: unknown) {
          return fallback(providerFailure(error));
        }
      } else {
        if (this.active >= 3) return fallback("concurrency_limit");
        const work = this.request(points, context.drivers.length, token);
        this.pending.set(key, work);
        try {
          values = await work;
          this.cache.delete(key);
          this.cache.set(key, { until: this.clock() + 30000, values });
          while (this.cache.size > 128) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) this.cache.delete(oldest);
          }
        } catch (error: unknown) {
          return fallback(providerFailure(error));
        } finally {
          this.pending.delete(key);
        }
      }
    }
    return {
      source: "mapbox",
      reason: null,
      routes: context.drivers.map((driver, index) => ({
        id: driver.id,
        seconds: values[index],
      })),
    };
  }

  private async request(
    points: RoutePoint[],
    count: number,
    token: string,
  ): Promise<(number | null)[]> {
    this.active++;
    const url = new URL(
      "https://api.mapbox.com/directions-matrix/v1/mapbox/driving/" +
        points.map((p) => `${p.lng},${p.lat}`).join(";"),
    );
    // Matrix requires at least two elements. With one driver include the pickup
    // as a zero-distance source; its result is validated but never ranked.
    const sources = Array.from(
      { length: Math.max(count, 2) },
      (_, i) => String(i),
    );
    url.searchParams.set("sources", sources.join(";"));
    url.searchParams.set("destinations", String(count));
    url.searchParams.set("annotations", "duration");
    url.searchParams.set("access_token", token);
    try {
      const response = await this.transport(url, {
        signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.blockedUntil = this.clock() + 300000;
        }
        await response.body?.cancel();
        throw new Error("Road provider rejected request");
      }
      // Count bytes while consuming, including chunked/compressed responses.
      // The same fetch deadline remains in force during body consumption.
      const result = object(await routeBody(response));
      if (result.code === "NoRoute") {
        this.failures = 0;
        return Array.from({ length: count }, () => null);
      }
      if (result.code !== "Ok" && result.code !== "NoRoute") {
        throw new Error("Invalid route result");
      }
      if (
        !Array.isArray(result.durations) ||
        result.durations.length !== sources.length
      ) throw new Error("Invalid route dimensions");
      const durations = result.durations.map((row: unknown) => {
        if (!Array.isArray(row) || row.length !== 1) {
          throw new Error("Invalid route dimensions");
        }
        const seconds: unknown = row[0];
        if (
          seconds !== null &&
          (typeof seconds !== "number" || !Number.isFinite(seconds) ||
            seconds < 0 || seconds > 86400)
        ) throw new Error("Invalid road duration");
        return seconds;
      });
      this.failures = 0;
      return durations.slice(0, count);
    } catch (error: unknown) {
      this.failures++;
      if (this.failures >= 3) {
        this.blockedUntil = Math.max(this.blockedUntil, this.clock() + 60000);
      }
      throw error;
    } finally {
      this.active--;
    }
  }
}
