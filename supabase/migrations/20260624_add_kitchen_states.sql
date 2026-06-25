-- Modificar el constraint de estado de los pedidos para permitir estados de cocina
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
    'cancelado'::"text"
])));
