import {
  BoundedRequestError,
  readBoundedJson,
} from "../_shared/http-request.ts";
import {
  DeliveryRequestError,
  RestaurantDeliveryQuoteGateway,
} from "../_shared/restaurant-delivery-quote.ts";
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return respond({ error: "POST requerido" }, 405);
  }
  try {
    const url = Deno.env.get("SUPABASE_URL"),
      anon = Deno.env.get("SUPABASE_ANON_KEY"),
      service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) {
      throw new Error("Quote configuration missing");
    }
    const result = await new RestaurantDeliveryQuoteGateway(url, anon, service)
      .quote(
        request.headers.get("authorization"),
        await readBoundedJson(request, 8192, 5000),
      );
    return respond(result);
  } catch (error: unknown) {
    if (error instanceof DeliveryRequestError) {
      return respond({ error: error.message }, error.status);
    }
    if (error instanceof BoundedRequestError) {
      return respond({
        error: "Revisa los datos del envío e intenta de nuevo.",
      }, error.status);
    }
    console.error("restaurant_delivery_quote_failed");
    return respond({
      error: "No pudimos calcular el envío. Tus datos siguen en el formulario.",
    }, 503);
  }
});
