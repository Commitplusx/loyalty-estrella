import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { SupabaseDispatchGateway } from "../functions/_shared/driver-dispatch-gateway.ts";
import { DriverRouteEstimator } from "../functions/_shared/driver-route-eta.ts";
import {
  type DispatchOrder,
  object,
} from "../functions/_shared/driver-dispatch.ts";
const id = "00000000-0000-4000-8000-000000000001",
  driver = "00000000-0000-4000-8000-000000000002";
const order: DispatchOrder = {
  id,
  state: "buscando_repartidor",
  owner: null,
  token: null,
  expiresAt: null,
  rejected: [driver],
  restaurantId: null,
  pickupLat: 16.24,
  pickupLng: -92.13,
  deliveryLat: 16.25,
  deliveryLng: -92.12,
};
const context = {
  context_id: id,
  version: 2,
  mode: "active",
  pickup: { lat: 16.24, lng: -92.13 },
  drivers: [{ id: driver, lat: 16.25, lng: -92.14 }],
};
function equal(a: unknown, b: unknown): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error("Dispatch gateway contract mismatch");
  }
}
function gateway(transport: typeof fetch): SupabaseDispatchGateway {
  return new SupabaseDispatchGateway(
    createClient("https://fixture.invalid", "fixture-key", {
      global: { fetch: transport },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    new DriverRouteEstimator(() => undefined),
  );
}
Deno.test("candidate context is bound to the durable order; ranking remains in PostgreSQL", async () => {
  const requests: Record<string, unknown>[] = [];
  const g = gateway(async (url, init) => {
    const path = new URL(String(url)).pathname;
    const raw: unknown = JSON.parse(String(init?.body));
    requests.push(object(raw));
    if (path.endsWith("/eats_dispatch_context")) return Response.json(context);
    equal(path, "/rest/v1/rpc/eats_rank_dispatch");
    return Response.json([{ id: driver, score: 12 }]);
  });
  equal(await g.candidates(order), [{ id: driver, score: 12, contextId: id }]);
  equal(requests, [{ p_pedido_id: id }, {
    p_context_id: id,
    p_routes: [],
    p_source: "geographic",
    p_reason: "not_configured",
  }]);
});
Deno.test("a stale or ineligible order does not obtain a fabricated shortlist", async () => {
  let calls = 0;
  const g = gateway(async () => {
    calls++;
    return Response.json(null);
  });
  equal(await g.candidates(order), []);
  equal(calls, 1);
});
Deno.test("the exact ranked context accompanies atomic offers and false stays false", async () => {
  const g = gateway(async (url, init) => {
    equal(new URL(String(url)).pathname, "/rest/v1/rpc/eats_offer_ranked");
    equal(object(JSON.parse(String(init?.body))), {
      p_pedido_id: id,
      p_repartidor_id: driver,
      p_context_id: id,
    });
    return Response.json(false);
  });
  equal(await g.offer(id, driver, id), false);
});
Deno.test("invalid context, invalid scores and storage failures propagate visibly", async () => {
  for (
    const invalid of [
      Response.json({ ...context, version: 1 }),
      Response.json({ message: "unavailable" }, { status: 503 }),
    ]
  ) {
    let rejected = false;
    try {
      await gateway(async () => invalid).candidates(order);
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;
      rejected = true;
    }
    equal(rejected, true);
  }
  for (const invalid of [[{ id: driver, score: "0" }], { error: "bad" }]) {
    const g = gateway(async (url) =>
      new URL(String(url)).pathname.endsWith("/eats_dispatch_context")
        ? Response.json(context)
        : Response.json(invalid)
    );
    let rejected = false;
    try {
      await g.candidates(order);
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;
      rejected = true;
    }
    equal(rejected, true);
  }
});
