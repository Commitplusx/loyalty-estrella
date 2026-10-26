BEGIN;
-- Return the existing pickup secret only through the authenticated restaurant receipt.
CREATE OR REPLACE FUNCTION public.eats_restaurant_delivery_receipt(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT jsonb_build_object('requestId',r.id,'orderId',p.id,'state',p.estado,'fee',q.fee,'food',q.food,
  'restaurantContribution',q.contribution,'customerShipping',q.fee-q.contribution,
  'total',p.total,'restaurantSettlement',q.food-q.contribution,
  'pickupPin',CASE WHEN p.estado IN('buscando_repartidor','ofrecido','asignado','recibido') THEN p.pickup_pin ELSE NULL END,
  'pricing',q.pricing,'locationSource',q.location_source,'h3Index',q.h3_index,'createdAt',p.created_at,'trackingKey',p.access_token,'incident',p.despacho_incidente)
 FROM public.eats_restaurant_delivery_requests r JOIN public.pedidos p ON p.id=r.pedido_id
 JOIN public.eats_restaurant_delivery_quotes q ON q.id=r.quote_id WHERE r.id=p_request_id;
$function$;

-- Courier requests never opt their customer into storefront notifications. Driver notices remain active.
CREATE OR REPLACE FUNCTION public.eats_capture_order_event(p pedidos, old_p pedidos, operation text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE r public.restaurantes; ek text; driver_tel text; driver_name text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.eats_notification_settings WHERE enabled) OR p.restaurante_id IS NULL
 OR NOT(p.origen IS NOT DISTINCT FROM 'web' OR(p.origen IS NOT DISTINCT FROM 'portal_restaurante' AND EXISTS(
  SELECT 1 FROM public.eats_restaurant_delivery_requests request
  WHERE request.pedido_id=p.id AND request.restaurante_id=p.restaurante_id))) THEN RETURN false; END IF;
 SELECT * INTO r FROM public.restaurantes WHERE id=p.restaurante_id;
 IF NOT FOUND OR r.es_socio IS FALSE THEN RETURN false; END IF;
 ek:=p.id::text||':'||clock_timestamp()::text;
 IF operation='INSERT' AND p.origen='web' AND p.estado='pendiente' THEN
  PERFORM public.eats_enqueue_notice(p,'restaurant_new',r.telefono,ek||':restaurant_new');
 END IF;
 IF operation='UPDATE' THEN
  IF old_p.estado IS DISTINCT FROM p.estado THEN
   IF p.estado IN ('asignado','en_camino','entregado','cancelado') THEN
    IF p.origen='web' THEN
     PERFORM public.eats_enqueue_notice(p,p.estado,p.cliente_tel,ek||':'||p.estado);
    END IF;
    IF p.estado='asignado' AND p.estado_cocina='listo_para_recoger' THEN
     SELECT telefono,nombre INTO driver_tel,driver_name FROM public.repartidores WHERE user_id=p.repartidor_id;
     PERFORM public.eats_enqueue_notice(p,'driver_ready',driver_tel,ek||':driver_ready',jsonb_build_object('customer',coalesce(driver_name,'Repartidor')));
    END IF;
   END IF;
  END IF;
  IF old_p.estado_cocina IS DISTINCT FROM p.estado_cocina THEN
   IF p.estado_cocina='en_cocina' AND p.origen='web' THEN
    PERFORM public.eats_enqueue_notice(p,'preparing',p.cliente_tel,ek||':preparing');
    PERFORM public.eats_enqueue_notice(p,'restaurant_receipt',r.telefono,ek||':restaurant_receipt');
   ELSIF p.estado_cocina='listo_para_recoger' THEN
    IF p.tipo_pedido='tienda' AND p.origen='web' THEN
     PERFORM public.eats_enqueue_notice(p,'pickup_ready',p.cliente_tel,ek||':pickup_ready');
    ELSIF p.repartidor_id IS NOT NULL THEN
     SELECT telefono,nombre INTO driver_tel,driver_name FROM public.repartidores WHERE user_id=p.repartidor_id;
     PERFORM public.eats_enqueue_notice(p,'driver_ready',driver_tel,ek||':driver_ready',jsonb_build_object('customer',coalesce(driver_name,'Repartidor')));
    END IF;
   END IF;
  END IF;
 END IF;
 RETURN true;
END $function$;

COMMIT;
