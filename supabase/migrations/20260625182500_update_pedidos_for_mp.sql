ALTER TABLE "public"."pedidos" ADD COLUMN IF NOT EXISTS "estado_pago" text DEFAULT 'efectivo';
ALTER TABLE "public"."pedidos" ADD COLUMN IF NOT EXISTS "mp_payment_id" text;

ALTER TABLE "public"."pedidos" DROP CONSTRAINT IF EXISTS "pedidos_estado_check";

ALTER TABLE "public"."pedidos" ADD CONSTRAINT "pedidos_estado_check" 
CHECK (("estado" = ANY (ARRAY[
    'pendiente'::"text", 
    'asignado'::"text", 
    'aceptado'::"text", 
    'en_cocina'::"text", 
    'listo_para_recoger'::"text", 
    'recibido'::"text", 
    'en_camino'::"text", 
    'entregado'::"text", 
    'cancelado'::"text",
    'pendiente_pago'::"text"
])));
