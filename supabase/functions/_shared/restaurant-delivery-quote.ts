import { parseDeliveryMoney } from "./delivery-money.ts";
import { readBoundedJsonBody } from "./http-request.ts";
import {latLngToCell} from 'https://esm.sh/h3-js@4.4.0';
import {DeliveryPinError,resolveDeliveryMapsPin} from './delivery-maps-pin.ts';

type ObjectData = Record<string, unknown>;
export class DeliveryRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}
export function deliveryObject(value: unknown): ObjectData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DeliveryRequestError("Datos del envío inválidos.");
  }
  return value as ObjectData;
}
function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  ) throw new DeliveryRequestError("Identificador del envío inválido.");
  return value.toLowerCase();
}
export interface RestaurantDeliveryQuoteInput {
  id: string;
  restaurantId: string;
  destination: { lat: number|null; lng: number|null; address: string };
  source: 'pin'|'address';
  mapsUrl?: string;
  shippingPrice?: string;
  foodTotal: string;
  restaurantContribution?: string;
}
export function parseRestaurantDeliveryQuote(
  value: unknown,
): RestaurantDeliveryQuoteInput {
  const row = deliveryObject(value), point = deliveryObject(row.destination);
  if (
    Object.keys(row).some((key) =>
      ![
        "id",
        "restaurantId",
        "destination",
        "shippingPrice",
        "foodTotal",
        "restaurantContribution",
        "source","mapsUrl",
      ].includes(key)
    ) ||
    Object.keys(point).some((key) =>
      !["lat", "lng", "address"].includes(key)
    ) ||
    !((point.lat===null&&point.lng===null)||(typeof point.lat==='number'&&Number.isFinite(point.lat)&&Math.abs(point.lat)<=90
      &&typeof point.lng==='number'&&Number.isFinite(point.lng)&&Math.abs(point.lng)<=180)) ||
    typeof point.address !== "string" || point.address.length > 300 ||
    row.source!==undefined&&row.source!=='pin'&&row.source!=='address' ||
    row.mapsUrl!==undefined&&(typeof row.mapsUrl!=='string'||row.mapsUrl.length>2048||row.source!=='pin') ||
    row.source==='pin'&&(row.mapsUrl===undefined&&point.lat===null || row.mapsUrl!==undefined&&point.lat!==null) ||
    !(row.source==='pin'&&typeof row.mapsUrl==='string')&&point.address.trim().length<5
  ) {
    throw new DeliveryRequestError(
      "Confirma el destino en el mapa y revisa la dirección.",
    );
  }
  if (
    (row.source==='pin'?row.shippingPrice!==undefined:typeof row.shippingPrice!=='string'||row.shippingPrice.length>100) ||
    typeof row.foodTotal !== "string" ||
    row.foodTotal.length > 100 ||
    row.restaurantContribution !== undefined &&
      (typeof row.restaurantContribution !== "string" ||
        row.restaurantContribution.length > 100)
  ) {
    throw new DeliveryRequestError(
      "Escribe los importes del envío y la comida.",
    );
  }
  try {
    if(row.source!=='pin')parseDeliveryMoney(row.shippingPrice);
    parseDeliveryMoney(row.foodTotal, 100000);
    if (row.restaurantContribution !== undefined) {
      parseDeliveryMoney(row.restaurantContribution);
    }
  } catch (error: unknown) {
    throw new DeliveryRequestError(
      error instanceof Error ? error.message : "Revisa los importes del envío.",
    );
  }
  return {
    id: uuid(row.id),
    restaurantId: uuid(row.restaurantId),
    destination: {
      lat: point.lat as number|null,
      lng: point.lng as number|null,
      address: point.address.trim(),
    },
    source:row.source==='pin'?'pin':'address',
    ...(typeof row.shippingPrice==='string'?{shippingPrice:row.shippingPrice}:{}),
    ...(typeof row.mapsUrl==='string'?{mapsUrl:row.mapsUrl}:{}),
    foodTotal: row.foodTotal,
    ...(row.restaurantContribution === undefined
      ? {}
      : { restaurantContribution: row.restaurantContribution }),
  };
}
export class RestaurantDeliveryQuoteGateway {
  constructor(
    private readonly url: string,
    private readonly anonKey: string,
    private readonly serviceKey: string,
    private readonly transport: typeof fetch = fetch,
  ) {}
  private async json(response: Response): Promise<unknown> {
    try {
      return await readBoundedJsonBody(response.body, 65536, 5000);
    } catch {
      throw new DeliveryRequestError(
        "No pudimos verificar la respuesta del servidor. Reintenta con los mismos datos.",
        503,
      );
    }
  }
  async quote(
    authorization: string | null,
    value: unknown,
  ): Promise<ObjectData> {
    const deadline=AbortSignal.timeout(18000);
    if (
      !authorization || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization) ||
      authorization.length > 8192
    ) {
      throw new DeliveryRequestError(
        "Inicia sesión para solicitar un envío.",
        401,
      );
    }
    const input = parseRestaurantDeliveryQuote(value);
    const auth = await this.transport(this.url + "/auth/v1/user", {
      headers: { apikey: this.anonKey, Authorization: authorization },
      signal: AbortSignal.any([deadline,AbortSignal.timeout(8000)]),
    });
    if (!auth.ok) {
      await auth.body?.cancel();
      throw new DeliveryRequestError(
        auth.status >= 500
          ? "No pudimos comprobar tu sesión. Intenta de nuevo."
          : "Tu sesión venció. Vuelve a entrar al panel.",
        auth.status >= 500 ? 503 : 401,
      );
    }
    const actor = uuid(deliveryObject(await this.json(auth)).id);
    let destination=input.destination;
    if(input.mapsUrl!==undefined){
      const scope=await this.transport(this.url+'/rest/v1/rpc/eats_restaurant_delivery_capability',{
        method:'POST',headers:{apikey:this.anonKey,Authorization:authorization,'Content-Type':'application/json'},
        body:JSON.stringify({p_restaurante_id:input.restaurantId}),signal:AbortSignal.any([deadline,AbortSignal.timeout(8000)]),
      });
      if(!scope.ok){await scope.body?.cancel();throw new DeliveryRequestError('No pudimos comprobar el acceso a esta sucursal.',scope.status>=500?503:403);}
      if(deliveryObject(await this.json(scope)).enabled!==true)throw new DeliveryRequestError('No tienes acceso a los envíos de esta sucursal.',403);
      try{destination={...await resolveDeliveryMapsPin(input.mapsUrl,this.transport,deadline),address:input.destination.address.trim()||'Ubicación compartida en Google Maps'};}
      catch(error:unknown){if(error instanceof DeliveryPinError)throw new DeliveryRequestError(error.message);throw error;}
    }
    const cell=input.source==='pin'&&destination.lat!==null&&destination.lng!==null?latLngToCell(destination.lat,destination.lng,10):null;
    const response = await this.transport(
      this.url + "/rest/v1/rpc/eats_restaurant_delivery_prepare_location",
      {
        method: "POST",
        headers: {
          apikey: this.serviceKey,
          Authorization: "Bearer " + this.serviceKey,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.any([deadline,AbortSignal.timeout(10000)]),
        body: JSON.stringify({
          p_actor: actor,
          p_quote_id: input.id,
          p_restaurante_id: input.restaurantId,
          p_destination: destination,
          p_source:input.source,
          p_h3_index:cell,
          p_fee: input.source==='address'?parseDeliveryMoney(input.shippingPrice):null,
          p_food: parseDeliveryMoney(input.foodTotal, 100000),
          p_contribution: input.restaurantContribution === undefined
            ? null
            : parseDeliveryMoney(input.restaurantContribution),
          p_price_input: input.shippingPrice??'',
        }),
      },
    );
    const result = deliveryObject(await this.json(response));
    if (!response.ok) {
      const safeCodes: Record<string, number> = {
        "22023": 400,
        "42501": 403,
        "PT409": 409,
        "PT429": 429,
      };
      const status = typeof result.code === "string"
        ? safeCodes[result.code]
        : undefined;
      throw new DeliveryRequestError(
        status && typeof result.message === "string" &&
          result.message.length <= 300
          ? result.message
          : "No pudimos calcular el envío. Reintenta con el mismo destino.",
        status ?? 503,
      );
    }
    if (
      result.id !== input.id || result.restaurantId !== input.restaurantId ||
      result.pricing !== (input.source==='pin'?'h3':'manual') ||
      result.locationSource!==input.source||result.h3Index!==cell||
      deliveryObject(result.destination).lat!==destination.lat||deliveryObject(result.destination).lng!==destination.lng||
      typeof result.fee !== "number" || !Number.isFinite(result.fee) ||
      result.fee <= 0 || result.fee > 10000 ||
      input.source==='address'&&result.fee !== parseDeliveryMoney(input.shippingPrice) ||
      result.food !== parseDeliveryMoney(input.foodTotal, 100000) ||
      typeof result.restaurantContribution !== "number" ||
      !Number.isFinite(result.restaurantContribution) ||
      result.restaurantContribution < 0 ||
      result.restaurantContribution > result.fee ||
      input.restaurantContribution !== undefined &&
        result.restaurantContribution !==
          parseDeliveryMoney(input.restaurantContribution) ||
      typeof result.customerShipping !== "number" ||
      !Number.isFinite(result.customerShipping) ||
      Math.round(
          (result.restaurantContribution + result.customerShipping) * 100,
        ) !== Math.round(result.fee * 100) ||
      typeof result.customerToCollect !== "number" ||
      Math.round(result.customerToCollect * 100) !==
        Math.round(
          (parseDeliveryMoney(input.foodTotal, 100000) +
            result.customerShipping) * 100,
        ) ||
      typeof result.restaurantSettlement !== "number" ||
      Math.round(result.restaurantSettlement * 100) !==
        Math.round(
          (parseDeliveryMoney(input.foodTotal, 100000) -
            result.restaurantContribution) * 100,
        ) ||
      typeof result.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(result.expiresAt))
    ) {
      throw new DeliveryRequestError(
        "No pudimos verificar la tarifa del envío.",
        503,
      );
    }
    return result;
  }
}
