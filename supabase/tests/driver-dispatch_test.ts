import {
  type DispatchCandidate,
  type DispatchGateway,
  type DispatchOrder,
  dispatchOrder,
  type NotificationResult,
  parseDispatchOrder,
} from "../functions/_shared/driver-dispatch.ts";
const id = "00000000-0000-4000-8000-000000000001";
const driverA = "00000000-0000-4000-8000-000000000002";
const driverB = "00000000-0000-4000-8000-000000000003";
function expect(value: unknown, expected: unknown): void {
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
    );
  }
}
class Gateway implements DispatchGateway {
  order: DispatchOrder = {
    id,
    state: "buscando_repartidor",
    owner: null,
    token: null,
    expiresAt: null,
    rejected: [],
    restaurantId: null,
    pickupLat: null,
    pickupLng: null,
    deliveryLat: null,
    deliveryLng: null,
  };
  list: DispatchCandidate[] = [{ id: driverA, score: 1 }, {
    id: driverB,
    score: 2,
  }];
  claimed = true;
  failedCandidates = new Set<string>();
  calls: string[] = [];
  notifications = 0;
  incidents: string[] = [];
  notification: NotificationResult = {
    push: true,
    realtime: true,
    timeout: true,
  };
  concurrentAcceptance = false;
  expiresOffset = 25000;
  claim(): Promise<boolean> {
    return Promise.resolve(this.claimed);
  }
  read(): Promise<DispatchOrder> {
    return Promise.resolve({ ...this.order });
  }
  candidates(): Promise<DispatchCandidate[]> {
    return Promise.resolve(this.list);
  }
  offer(_id: string, driver: string): Promise<boolean> {
    this.calls.push(driver);
    if (this.failedCandidates.has(driver)) return Promise.resolve(false);
    this.order = {
      ...this.order,
      state: this.concurrentAcceptance ? "asignado" : "ofrecido",
      owner: driver,
      token: id,
      expiresAt: new Date(Date.now() + this.expiresOffset).toISOString(),
    };
    return Promise.resolve(true);
  }
  notify(): Promise<NotificationResult> {
    this.notifications++;
    return Promise.resolve(this.notification);
  }
  incident(_id: string, reason: string): Promise<void> {
    this.incidents.push(reason);
    return Promise.resolve();
  }
}
Deno.test("busy first driver tries next; success requires persisted ownership", async () => {
  const g = new Gateway();
  g.failedCandidates.add(driverA);
  expect((await dispatchOrder(id, g)).status, "offered");
  expect(g.calls, [driverA, driverB]);
  expect(g.order.owner, driverB);
  expect(g.notifications, 1);
});
Deno.test("duplicate/leased trigger cannot offer or notify twice", async () => {
  const g = new Gateway();
  g.claimed = false;
  expect((await dispatchOrder(id, g)).status, "ignored");
  expect(g.calls, []);
  expect(g.notifications, 0);
});
Deno.test("durable rejection is excluded before any atomic offer", async () => {
  const g = new Gateway();
  g.order.rejected = [driverA];
  await dispatchOrder(id, g);
  expect(g.calls, [driverB]);
});
Deno.test("notification failure is visible and does not erase a valid offer", async () => {
  const g = new Gateway();
  g.notification = { push: false, realtime: true, timeout: false };
  const result = await dispatchOrder(id, g);
  expect(result.status, "offered");
  expect(g.order.state, "ofrecido");
  expect(g.incidents, ["notificacion_o_timeout_pendiente"]);
  expect(result.notifications?.push, false);
});
Deno.test("no candidate creates retry state without claiming assignment", async () => {
  const g = new Gateway();
  g.failedCandidates = new Set([driverA, driverB]);
  expect((await dispatchOrder(id, g)).status, "retry_pending");
  expect(g.notifications, 0);
  expect(g.order.owner, null);
});
Deno.test("slow dispatch stops claiming more candidates and leaves a visible durable retry", async () => {
  const g = new Gateway();
  const times = [0, 21000];
  expect(
    (await dispatchOrder(id, g, () => times.shift() ?? 21000)).status,
    "retry_pending",
  );
  expect(g.calls, []);
  expect(g.notifications, 0);
  expect(g.incidents, ["presupuesto_despacho_agotado"]);
});
Deno.test("acceptance between offer and readback never emits a stale offer", async () => {
  const g = new Gateway();
  g.concurrentAcceptance = true;
  expect((await dispatchOrder(id, g)).status, "ignored");
  expect(g.notifications, 0);
});
Deno.test("offer that expires before readback never emits an unusable notification", async () => {
  const g = new Gateway();
  g.expiresOffset = -1000;
  expect((await dispatchOrder(id, g)).status, "ignored");
  expect(g.notifications, 0);
  // Expiration/recovery still owns the durable state; do not free it from a stale read.
  expect(g.order.state, "ofrecido");
});
Deno.test("an unpaid/foreign state cannot be dispatched from stale trigger payload", async () => {
  for (
    const state of [
      "pendiente_pago",
      "pendiente",
      "asignado",
      "entregado",
      "cancelado",
    ]
  ) {
    const g = new Gateway();
    g.order.state = state;
    expect((await dispatchOrder(id, g)).status, "ignored");
    expect(g.calls, []);
  }
});
Deno.test("invalid external records reject rather than fabricate coordinates or identity", () => {
  for (
    const value of [null, [], { id: "garbage", estado: "ofrecido" }, {
      id,
      estado: "ofrecido",
      lat: 999,
    }]
  ) {
    let failed = false;
    try {
      parseDispatchOrder(value);
    } catch {
      failed = true;
    }
    expect(failed, true);
  }
});
Deno.test("restaurant pickup is not confused with customer delivery coordinates", () => {
  const row = parseDispatchOrder({
    id,
    estado: "buscando_repartidor",
    tipo_pedido: "domicilio",
    lat: 16,
    lng: -92,
    restaurante_lat: 17,
    restaurante_lng: -93,
  });
  expect(row.pickupLat, 17);
  expect(row.deliveryLat, 16);
});
