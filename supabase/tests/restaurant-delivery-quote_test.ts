import {
  DeliveryRequestError,
  parseRestaurantDeliveryQuote,
  RestaurantDeliveryQuoteGateway,
  deliveryObject,
} from "../functions/_shared/restaurant-delivery-quote.ts";
import {deepStrictEqual} from 'node:assert/strict';
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const input = {
  id: id(1),
  restaurantId: id(2),
  destination: { lat: 16.25, lng: -92.13, address: "Dirección de ejemplo" },
  shippingPrice: "cincuenta pesos",
  foodTotal: "200",
};
const reply = {
  id: id(1),
  restaurantId: id(2),
  destination: input.destination,
  origin: {
    id: id(2),
    name: "Robin sintético",
    branch: "Matriz",
    address: "Origen",
    lat: 16,
    lng: -92,
  },
  pricing: "manual",
  locationSource:'address',h3Index:null,
  fee: 50,
  food: 200,
  restaurantContribution: 15,
  customerShipping: 35,
  customerToCollect: 235,
  restaurantSettlement: 185,
  expiresAt: new Date(Date.now() + 300000).toISOString(),
};
const automatic={...reply,pricing:'h3',locationSource:'pin',h3Index:'8a6d2e884807fff',fee:60,customerShipping:45,customerToCollect:245};
Deno.test('session and branch checks overlap, but no external Maps request happens before both authorize',async()=>{
 let releaseSession:()=>void=()=>{throw new Error('Session was not requested');};let checkedScope=false,external=0;
 const sessionGate=new Promise<void>(resolve=>{releaseSession=resolve;});
 const g=gateway(async(url)=>{
  const path=new URL(String(url));
  if(path.pathname==='/auth/v1/user'){await sessionGate;return Response.json({id:id(3)});}
  if(path.pathname.endsWith('/eats_restaurant_delivery_capability')){checkedScope=true;releaseSession();return Response.json({enabled:false});}
  external++;throw new Error('Unauthorized Maps/price request');
 });
 await rejected(()=>g.quote('Bearer fixture-token',{...input,source:'pin',shippingPrice:undefined,mapsUrl:'https://maps.app.goo.gl/fixture',destination:{lat:null,lng:null,address:''}}),403);
 equal(checkedScope,true);equal(external,0);
});
Deno.test('upstream network failure names its stage and never creates a quote or retries',async()=>{
 let calls=0;
 const g=gateway(()=>{calls++;return Promise.reject(new TypeError('Network fixture'));});
 try{await g.quote('Bearer fixture-token',input);throw new Error('Unexpected success');}
 catch(error:unknown){if(!(error instanceof DeliveryRequestError)||error.code!=='delivery_session_unavailable'||error.status!==503)throw error;}
 equal(calls,1);
});
function requestBody(init?:RequestInit):Record<string,unknown>{const value:unknown=JSON.parse(String(init?.body));return deliveryObject(value);}
Deno.test('a precise pin sends a derived resolution-10 cell and no caller-supplied price to PostgreSQL',async()=>{
 const request={...input,source:'pin',shippingPrice:undefined};let fee:unknown='not-called',cell:unknown;
 const g=gateway(async(url,init)=>{if(new URL(String(url)).pathname==='/auth/v1/user')return Response.json({id:id(3)});const body=requestBody(init);fee=body.p_fee;cell=body.p_h3_index;equal(body.p_source,'pin');return Response.json(automatic);});
 equal((await g.quote('Bearer fixture-token',request)).fee,60);equal(fee,null);equal(cell,'8a6d2e884807fff');
 await rejected(()=>g.quote('Bearer fixture-token',{...request,shippingPrice:'1'}),400);
});
Deno.test('written text may lack a point and keeps the explicitly agreed manual price',async()=>{
 const request={...input,source:'address',destination:{lat:null,lng:null,address:'Dirección copiada del cliente'}};
 const g=gateway(async(url,init)=>{if(new URL(String(url)).pathname==='/auth/v1/user')return Response.json({id:id(3)});const body=requestBody(init);equal(deliveryObject(body.p_destination).lat,null);equal(body.p_fee,50);equal(body.p_h3_index,null);return Response.json({...reply,destination:request.destination});});
 equal((await g.quote('Bearer fixture-token',request)).pricing,'manual');
});
Deno.test('a Maps short link is resolved only after the exact restaurant capability is verified',async()=>{
 const request={...input,source:'pin',mapsUrl:'https://maps.app.goo.gl/example',destination:{lat:null,lng:null,address:''},shippingPrice:undefined};
 for(const enabled of[false,true]){
  let external=0;
  const g=gateway(async(url,init)=>{const parsed=new URL(String(url));
   if(parsed.pathname==='/auth/v1/user')return Response.json({id:id(3)});
   if(parsed.pathname.endsWith('/eats_restaurant_delivery_capability')){equal(new Headers(init?.headers).get('authorization'),'Bearer fixture-token');return Response.json({enabled});}
   if(parsed.hostname==='maps.app.goo.gl'){external++;return new Response(null,{status:302,headers:{Location:'https://maps.google.com/?q=16.25,-92.13'}});}
   const body=requestBody(init);equal(body.p_fee,null);equal(deliveryObject(body.p_destination).lat,16.25);return Response.json({...automatic,destination:{...input.destination,address:'Ubicación compartida en Google Maps'}});
  });
  if(enabled){equal((await g.quote('Bearer fixture-token',request)).pricing,'h3');equal(external,1);}else{await rejected(()=>g.quote('Bearer fixture-token',request),403);equal(external,0);}
 }
});
Deno.test('a forged automatic provenance or mismatched resolved pin cannot become a verified summary',async()=>{
 for(const patch of[{h3Index:'8a0000000000000'},{locationSource:'address'},{destination:{...input.destination,lat:17}}]){
  const g=gateway(url=>Promise.resolve(new URL(String(url)).pathname==='/auth/v1/user'?Response.json({id:id(3)}):Response.json({...automatic,...patch})));
  await rejected(()=>g.quote('Bearer fixture-token',{...input,source:'pin',shippingPrice:undefined}),503);
 }
});
function equal(actual: unknown, expected: unknown) {
  deepStrictEqual(actual,expected);
}
async function rejected(work: () => Promise<unknown>, status: number) {
  try {
    await work();
  } catch (error: unknown) {
    if (!(error instanceof DeliveryRequestError)) throw error;
    equal(error.status, status);
    return;
  }
  throw new Error("Request unexpectedly succeeded");
}
function gateway(transport: typeof fetch) {
  return new RestaurantDeliveryQuoteGateway(
    "https://fixture.invalid",
    "fixture-anon",
    "fixture-service",
    transport,
  );
}
Deno.test("an authenticated identity, not a body actor or phone, owns the manual quote", async () => {
  const paths: string[] = [];
  const g = gateway(async (url, init) => {
    const path = new URL(String(url)).pathname;
    paths.push(path);
    if (path === "/auth/v1/user") {
      equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer fixture-token",
      );
      return Response.json({ id: id(3) });
    }
    equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer fixture-service",
    );
    const body: unknown = JSON.parse(String(init?.body));
    equal(body, {
      p_actor: id(3),
      p_quote_id: id(1),
      p_restaurante_id: id(2),
      p_destination: input.destination,
      p_fee: 50,
      p_food: 200,
      p_contribution: null,
      p_price_input: "cincuenta pesos",
      p_source:'address',p_h3_index:null,
    });
    return Response.json(reply);
  });
  equal(await g.quote("Bearer fixture-token", input), reply);
  equal(paths, [
    "/auth/v1/user",
    "/rest/v1/rpc/eats_restaurant_delivery_prepare_location",
  ]);
});
Deno.test("missing or expired credentials cannot call the privileged quote RPC", async () => {
  let calls = 0;
  const g = gateway(async () => {
    calls++;
    return Response.json({}, { status: 401 });
  });
  await rejected(() => g.quote(null, input), 401);
  equal(calls, 0);
  await rejected(() => g.quote("Bearer fixture-token", input), 401);
  equal(calls, 1);
});
Deno.test("scope, quote conflict and bounded rate errors retain their explicit status", async () => {
  for (
    const [code, status] of [["42501", 403], ["22023", 400], ["PT409", 409], [
      "PT429",
      429,
    ]] as const
  ) {
    const g = gateway(async (url) =>
      new URL(String(url)).pathname === "/auth/v1/user"
        ? Response.json({ id: id(3) })
        : Response.json({ code, message: "Error controlado del contrato" }, {
          status: 400,
        })
    );
    await rejected(() => g.quote("Bearer fixture-token", input), status);
  }
});
Deno.test("a requested contribution override is explicit and must match the reply", async () => {
  const request = { ...input, restaurantContribution: "diez pesos" };
  const valid = {
    ...reply,
    restaurantContribution: 10,
    customerShipping: 40,
    customerToCollect: 240,
    restaurantSettlement: 190,
  };
  const g = gateway(async (url) =>
    new URL(String(url)).pathname === "/auth/v1/user"
      ? Response.json({ id: id(3) })
      : Response.json(valid)
  );
  equal(await g.quote("Bearer fixture-token", request), valid);
  const mismatch = gateway(async (url) =>
    new URL(String(url)).pathname === "/auth/v1/user"
      ? Response.json({ id: id(3) })
      : Response.json(reply)
  );
  await rejected(() => mismatch.quote("Bearer fixture-token", request), 503);
});
Deno.test("malformed, forged and ambiguous request data fails at the boundary", () => {
  for (
    const value of [
      null,
      [],
      { ...input, p_actor: id(4) },
      { ...input, fee: 1 },
      { ...input, destination: { ...input.destination, lat: 999 } },
      { ...input, shippingPrice: "50 o 60" },
      { ...input, shippingPrice: "50 y lo demás gratis" },
      { ...input, restaurantId: "bad" },
    ]
  ) {
    let failed = false;
    try {
      parseRestaurantDeliveryQuote(value);
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;
      failed = true;
    }
    equal(failed, true);
  }
});
Deno.test("unbalanced, fake or wrong-scope responses cannot be displayed as verified prices", async () => {
  for (
    const value of [
      { ...reply, fee: 1 },
      { ...reply, restaurantId: id(4) },
      { ...reply, food: 1 },
      { ...reply, customerShipping: 50 },
      { ...reply, customerToCollect: 250 },
      { ...reply, restaurantSettlement: 200 },
      { ...reply, restaurantContribution: 51 },
      { ...reply, fee: "50" },
      { ...reply, pricing: "automatic" },
      { ...reply, expiresAt: "bad" },
    ]
  ) {
    const g = gateway(async (url) =>
      new URL(String(url)).pathname === "/auth/v1/user"
        ? Response.json({ id: id(3) })
        : Response.json(value)
    );
    await rejected(() => g.quote("Bearer fixture-token", input), 503);
  }
});
Deno.test("storage errors and unusable provider JSON are explicit, never a free-shipping fallback", async () => {
  for (
    const response of [
      () => new Response("not JSON"),
      () =>
        Response.json({ message: "Internal provider information" }, {
          status: 500,
        }),
      () =>
        Response.json({ code: "unknown", message: "do not expose" }, {
          status: 400,
        }),
    ]
  ) {
    const g = gateway(async (url) =>
      new URL(String(url)).pathname === "/auth/v1/user"
        ? Response.json({ id: id(3) })
        : response()
    );
    await rejected(() => g.quote("Bearer fixture-token", input), 503);
  }
});
