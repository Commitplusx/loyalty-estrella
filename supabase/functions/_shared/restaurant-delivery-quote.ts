import { parseDeliveryMoney } from "./delivery-money.ts";
import { readBoundedJsonBody } from "./http-request.ts";

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
  destination: { lat: number; lng: number; address: string };
  shippingPrice: string;
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
      ].includes(key)
    ) ||
    Object.keys(point).some((key) =>
      !["lat", "lng", "address"].includes(key)
    ) ||
    typeof point.lat !== "number" || !Number.isFinite(point.lat) ||
    Math.abs(point.lat) > 90 ||
    typeof point.lng !== "number" || !Number.isFinite(point.lng) ||
    Math.abs(point.lng) > 180 ||
    typeof point.address !== "string" || point.address.trim().length < 5 ||
    point.address.length > 300
  ) {
    throw new DeliveryRequestError(
      "Confirma el destino en el mapa y revisa la dirección.",
    );
  }
  if (
    typeof row.shippingPrice !== "string" ||
    typeof row.foodTotal !== "string" || row.shippingPrice.length > 100 ||
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
    parseDeliveryMoney(row.shippingPrice);
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
      lat: point.lat,
      lng: point.lng,
      address: point.address.trim(),
    },
    shippingPrice: row.shippingPrice,
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
      signal: AbortSignal.timeout(8000),
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
    const response = await this.transport(
      this.url + "/rest/v1/rpc/eats_restaurant_delivery_prepare",
      {
        method: "POST",
        headers: {
          apikey: this.serviceKey,
          Authorization: "Bearer " + this.serviceKey,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          p_actor: actor,
          p_quote_id: input.id,
          p_restaurante_id: input.restaurantId,
          p_destination: input.destination,
          p_fee: parseDeliveryMoney(input.shippingPrice),
          p_food: parseDeliveryMoney(input.foodTotal, 100000),
          p_contribution: input.restaurantContribution === undefined
            ? null
            : parseDeliveryMoney(input.restaurantContribution),
          p_price_input: input.shippingPrice,
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
      result.pricing !== "manual" ||
      typeof result.fee !== "number" || !Number.isFinite(result.fee) ||
      result.fee <= 0 || result.fee > 10000 ||
      result.fee !== parseDeliveryMoney(input.shippingPrice) ||
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
