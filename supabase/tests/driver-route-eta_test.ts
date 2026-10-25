import {
  type DispatchContext,
  DriverRouteEstimator,
  parseDispatchContext,
} from "../functions/_shared/driver-route-eta.ts";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const context: DispatchContext = {
  id: id(99),
  mode: "active",
  pickup: { lat: 16.24, lng: -92.13 },
  drivers: [{ id: id(1), lat: 16.25, lng: -92.14 }, {
    id: id(2),
    lat: 16.26,
    lng: -92.15,
  }],
};
function equal(a: unknown, b: unknown): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error("Route contract mismatch");
  }
}
const matrix = (rows: (number | null)[]) =>
  Response.json({ code: "Ok", durations: rows.map((v) => [v]) });
Deno.test("chunked oversized provider body is cancelled at the byte limit", async () => {
  let cancelled = false, chunks = 0;
  const estimator = new DriverRouteEstimator(
    () => "fixture",
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            chunks++;
            if (chunks <= 20) {
              controller.enqueue(new Uint8Array(16384).fill(32));
            } else controller.close();
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  );
  equal((await estimator.estimate(context)).reason, "provider_error");
  equal(cancelled, true);
  equal(chunks <= 6, true);
});
Deno.test("a declared oversized body is cancelled before consumption", async () => {
  let cancelled = false;
  const estimator = new DriverRouteEstimator(
    () => "fixture",
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "content-length": "65537" } },
      ),
  );
  equal((await estimator.estimate(context)).reason, "provider_error");
  equal(cancelled, true);
});
Deno.test("UTF-8 byte limit cannot be bypassed by a shorter character count", async () => {
  const body = JSON.stringify({ padding: "é".repeat(33000) });
  equal(body.length < 65536, true);
  const estimator = new DriverRouteEstimator(
    () => "fixture",
    async () => new Response(body),
  );
  equal((await estimator.estimate(context)).reason, "provider_error");
});
Deno.test("malformed streamed UTF-8 cancels the remaining response", async () => {
  let cancelled = false;
  const estimator = new DriverRouteEstimator(
    () => "fixture",
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([255]));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  );
  equal((await estimator.estimate(context)).reason, "provider_error");
  equal(cancelled, true);
});
Deno.test("shared timed-out lookup gives every caller the same observable cause", async () => {
  let rejectRequest: ((error: unknown) => void) | undefined;
  let calls = 0;
  const estimator = new DriverRouteEstimator(() => "fixture", () => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      rejectRequest = reject;
    });
  });
  const a = estimator.estimate(context), b = estimator.estimate(context);
  if (!rejectRequest) throw new Error("Request not started");
  rejectRequest(new DOMException("Synthetic body timeout", "TimeoutError"));
  equal((await Promise.all([a, b])).map((result) => result.reason), [
    "provider_timeout",
    "provider_timeout",
  ]);
  equal(calls, 1);
});
Deno.test("a body that stalls after headers is covered by the request deadline", async () => {
  const estimator = new DriverRouteEstimator(
    () => "fixture",
    async (_input, init) => {
      const signal = init?.signal;
      if (!signal) throw new Error("Provider request has no deadline");
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"code":'));
            signal.addEventListener(
              "abort",
              () => controller.error(signal.reason),
              { once: true },
            );
          },
        }),
      );
    },
  );
  equal((await estimator.estimate(context)).reason, "provider_timeout");
});
Deno.test("road lookup requests only bounded many-to-one pairs at the exact branch", async () => {
  const estimator = new DriverRouteEstimator(() => "fixture", async (input) => {
    const url = new URL(String(input));
    equal(url.origin, "https://api.mapbox.com");
    equal(url.searchParams.get("sources"), "0;1");
    equal(url.searchParams.get("destinations"), "2");
    equal(url.pathname.endsWith("-92.13,16.24"), true);
    return matrix([300, 120]);
  });
  equal(await estimator.estimate(context), {
    source: "mapbox",
    reason: null,
    routes: [{ id: id(1), seconds: 300 }, { id: id(2), seconds: 120 }],
  });
});
Deno.test("one driver observes the two-element API minimum without inventing a second candidate", async () => {
  const estimator = new DriverRouteEstimator(() => "fixture", async (input) => {
    const url = new URL(String(input));
    equal(url.searchParams.get("sources"), "0;1");
    equal(url.searchParams.get("destinations"), "1");
    return matrix([60, 0]);
  });
  equal(
    (await estimator.estimate({ ...context, drivers: [context.drivers[0]] }))
      .routes,
    [{ id: id(1), seconds: 60 }],
  );
});
Deno.test("no-route and null durations remain unreachable rather than zero or fallback", async () => {
  for (
    const response of [
      () => Response.json({ code: "NoRoute" }),
      () => matrix([null, null]),
    ]
  ) {
    const estimator = new DriverRouteEstimator(
      () => "fixture",
      async () => response(),
    );
    const result = await estimator.estimate(context);
    equal(result.source, "mapbox");
    equal(result.routes.map((r) => r.seconds), [null, null]);
  }
});
Deno.test("invalid dimensions, non-finite numbers and unexpected responses degrade explicitly", async () => {
  for (
    const payload of [
      { code: "Ok", durations: [[1]] },
      { code: "Ok", durations: [[1, 2], [1, 2]] },
      { code: "Ok", durations: [[-1], [1]] },
      { code: "Ok", durations: [["50"], [1]] },
      { code: "wrong", durations: [[1], [2]] },
    ]
  ) {
    const estimator = new DriverRouteEstimator(
      () => "fixture",
      async () => Response.json(payload),
    );
    equal(await estimator.estimate(context), {
      source: "geographic",
      reason: "provider_error",
      routes: [],
    });
  }
});
Deno.test("provider HTTP errors and timeouts never become a successful road estimate", async () => {
  const denied = new DriverRouteEstimator(
    () => "fixture",
    async () => Response.json({}, { status: 503 }),
  );
  equal((await denied.estimate(context)).reason, "provider_error");
  const timeout = new DriverRouteEstimator(() => "fixture", async () => {
    throw new DOMException("Synthetic timeout", "TimeoutError");
  });
  equal((await timeout.estimate(context)).reason, "provider_timeout");
});
Deno.test("repeated provider failures open a finite circuit and recover after its deadline", async () => {
  let now = 0, calls = 0;
  const estimator = new DriverRouteEstimator(() => "fixture", async () => {
    calls++;
    return Response.json({}, { status: 429 });
  }, () => now);
  for (let i = 0; i < 3; i++) await estimator.estimate(context);
  equal((await estimator.estimate(context)).reason, "provider_circuit");
  equal(calls, 3);
  now = 61000;
  await estimator.estimate(context);
  equal(calls, 4);
});
Deno.test("auth failure opens a five-minute circuit without repeated charged requests", async () => {
  let now = 0, calls = 0;
  const estimator = new DriverRouteEstimator(() => "fixture", async () => {
    calls++;
    return Response.json({}, { status: 403 });
  }, () => now);
  await estimator.estimate(context);
  now = 61000;
  equal((await estimator.estimate(context)).reason, "provider_circuit");
  equal(calls, 1);
  now = 300001;
  await estimator.estimate(context);
  equal(calls, 2);
});
Deno.test("exact-coordinate cache expires and movement does not reuse an old matrix", async () => {
  let now = 0, calls = 0;
  const estimator = new DriverRouteEstimator(() => "fixture", async () => {
    calls++;
    return matrix([10, 20]);
  }, () => now);
  await estimator.estimate(context);
  await estimator.estimate(context);
  equal(calls, 1);
  await estimator.estimate({
    ...context,
    pickup: { lat: 16.2401, lng: -92.13 },
  });
  equal(calls, 2);
  now = 30001;
  await estimator.estimate(context);
  equal(calls, 3);
});
Deno.test("identical concurrent requests share one provider lookup", async () => {
  let complete: ((r: Response) => void) | undefined;
  let calls = 0;
  const estimator = new DriverRouteEstimator(() => "fixture", () => {
    calls++;
    return new Promise<Response>((resolve) => {
      complete = resolve;
    });
  });
  const a = estimator.estimate(context), b = estimator.estimate(context);
  if (!complete) throw new Error("Request not started");
  complete(matrix([10, 20]));
  await Promise.all([a, b]);
  equal(calls, 1);
});
Deno.test("provider concurrency is capped instead of queuing an unbounded backlog", async () => {
  const pending: ((r: Response) => void)[] = [];
  const estimator = new DriverRouteEstimator(
    () => "fixture",
    () => new Promise<Response>((resolve) => pending.push(resolve)),
  );
  const active = Array.from(
    { length: 3 },
    (_, i) =>
      estimator.estimate({
        ...context,
        pickup: { lat: 16.24 + i / 100, lng: -92.13 },
      }),
  );
  equal(
    (await estimator.estimate({ ...context, pickup: { lat: 17, lng: -92 } }))
      .reason,
    "concurrency_limit",
  );
  pending.forEach((resolve) => resolve(matrix([10, 20])));
  await Promise.all(active);
});
Deno.test("no token, no origin and no candidates avoid provider calls", async () => {
  let calls = 0;
  const transport: typeof fetch = async () => {
    calls++;
    return matrix([10, 20]);
  };
  equal(
    (await new DriverRouteEstimator(() => undefined, transport).estimate(
      context,
    )).reason,
    "not_configured",
  );
  equal(
    (await new DriverRouteEstimator(() => "fixture", transport).estimate({
      ...context,
      pickup: null,
    })).reason,
    "no_origin",
  );
  equal(
    (await new DriverRouteEstimator(() => "fixture", transport).estimate({
      ...context,
      drivers: [],
    })).reason,
    "no_candidates",
  );
  equal(calls, 0);
});
Deno.test("malformed contexts cannot inject destinations or arbitrary candidate identities", () => {
  for (
    const value of [{}, {
      ...context,
      context_id: id(99),
      version: 2,
      drivers: [{ id: "bad", lat: 16, lng: -92 }],
    }, {
      ...context,
      context_id: id(99),
      version: 2,
      drivers: [context.drivers[0], context.drivers[0]],
    }]
  ) {
    let rejected = false;
    try {
      parseDispatchContext(value);
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;
      rejected = true;
    }
    equal(rejected, true);
  }
});
