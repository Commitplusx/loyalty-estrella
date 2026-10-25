import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { NotificationAuthorizationGateway, NotificationDriverScope, NotificationOrderScope } from "./notification-authorization.ts";

function isRow(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function row(value: unknown): Record<string, unknown> {
  if (!isRow(value)) throw new Error("Invalid authorization record");
  return value;
}
function nullableText(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("Invalid authorization field");
  return value;
}
export class SupabaseNotificationAuthorization implements NotificationAuthorizationGateway {
  constructor(readonly client: SupabaseClient) {}
  async user(token: string): Promise<string | null> {
    const { data, error } = await this.client.auth.getUser(token);
    if (error) {
      if (error.status && error.status >= 400 && error.status < 500) return null;
      throw new Error("Authentication unavailable");
    }
    return data.user?.id ?? null;
  }
  async admin(userId: string): Promise<boolean> {
    const { data, error } = await this.client.from("admins").select("role").eq("id", userId).maybeSingle();
    if (error) throw new Error("Administrator lookup unavailable");
    if (!data) return false;
    return ["admin", "superadmin"].includes(String(row(data).role));
  }
  async driver(userId: string): Promise<NotificationDriverScope | null> {
    const { data, error } = await this.client.from("repartidores").select("nombre").eq("user_id", userId).maybeSingle();
    if (error) throw new Error("Driver lookup unavailable");
    if (!data) return null;
    const name = row(data).nombre;
    if (typeof name !== "string" || !name.trim()) throw new Error("Invalid driver identity");
    return { name };
  }
  async order(orderId: string): Promise<NotificationOrderScope | null> {
    const { data, error } = await this.client.from("pedidos").select("repartidor_id,restaurante_id,estado,estado_cocina,restaurante,tiempo_preparacion_minutos").eq("id", orderId).maybeSingle();
    if (error) throw new Error("Order lookup unavailable");
    if (!data) return null;
    const value = row(data), state = value.estado, minutes = value.tiempo_preparacion_minutos;
    if (typeof state !== "string" || (minutes !== null && (typeof minutes !== "number" || !Number.isFinite(minutes)))) throw new Error("Invalid order scope");
    return { owner: nullableText(value.repartidor_id), restaurantId: nullableText(value.restaurante_id),
      state, kitchenState: nullableText(value.estado_cocina), restaurant: nullableText(value.restaurante), preparationMinutes: minutes };
  }
  async managesRestaurant(userId: string, restaurantId: string): Promise<boolean> {
    const { data, error } = await this.client.from("restaurantes").select("admin_id,matriz_id").eq("id", restaurantId).maybeSingle();
    if (error) throw new Error("Restaurant lookup unavailable");
    if (!data) return false;
    const value = row(data);
    if (value.admin_id === userId) return true;
    if (typeof value.matriz_id !== "string") return false;
    const parent = await this.client.from("restaurantes").select("admin_id,es_matriz").eq("id", value.matriz_id).maybeSingle();
    if (parent.error) throw new Error("Parent ownership lookup unavailable");
    return parent.data !== null && row(parent.data).es_matriz === true && row(parent.data).admin_id === userId;
  }
}
