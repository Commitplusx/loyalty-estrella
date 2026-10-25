/** Minimal schema for this gateway's existing PostgreSQL contracts. Runtime
 * JSON remains unknown and is validated by the notification boundary. */
type Table<Row> = {Row:Row;Insert:Partial<Row>;Update:Partial<Row>;Relationships:[]};
type Rpc<Args,Returns> = {Args:Args;Returns:Returns};
export interface OrderNotificationDatabase {
  public: {
    Tables: {
      pedidos:Table<{id:string;estado:string;estado_cocina:string|null;repartidor_id:string|null;origen:string|null;restaurante_id:string|null;wb_message_id:string|null;access_token:string;items:unknown;total:number|null;precio_entrega:number|null;descuento_plataforma:number|null;metodo_pago:string|null;estado_pago:string|null;tipo_pedido:string|null}>;
      repartidores:Table<{user_id:string;nombre:string|null}>;
      restaurantes:Table<{id:string;es_socio:boolean|null}>;
      eats_notification_settings:Table<{singleton:boolean;enabled:boolean}>;
      eats_restaurant_delivery_requests:Table<{id:string;pedido_id:string;restaurante_id:string}>;
    };
    Views:Record<never,never>;
    Functions: {
      eats_notification_claim:Rpc<Record<never,never>,unknown>;
      eats_notification_start:Rpc<{p_id:string;p_token:string},boolean>;
      eats_notification_finish:Rpc<{p_id:string;p_token:string;p_state:string;p_provider_id:string|null;p_code:string|null},boolean>;
      eats_notification_status:Rpc<{p_external_id:string;p_provider_id:string;p_sender:string;p_recipient:string;p_status:string;p_code:string|null;p_price:number|null;p_currency:string|null},boolean>;
      eats_kitchen_action:Rpc<{p_order_key:string;p_phone:string;p_message_id:string;p_action:string;p_minutes:number|null},unknown>;
    };
    Enums:Record<never,never>;
    CompositeTypes:Record<never,never>;
  };
}
