BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s';
-- Preserve the accepted-order idempotency path, ownership locks, capacity,
-- payment/kitchen checks and the existing Android RPC signature.
DO $$ BEGIN
 IF encode(extensions.digest(pg_get_functiondef('public.aceptar_pedido_atomico(uuid,uuid)'::regprocedure),'sha256'),'hex')<>'1f1cfba18b984cfd4af0985629dbccc0b363365045cc5cf5c098c3971d686ce8'
 THEN RAISE EXCEPTION 'Active acceptance differs from reviewed baseline'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.aceptar_pedido_atomico(p_pedido_id uuid, p_repartidor_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE p public.pedidos; carga integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND
    (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_repartidor_id) THEN RETURN false; END IF;
 SELECT * INTO p FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p.repartidor_id=p_repartidor_id AND p.estado IN ('asignado','recibido','en_camino') THEN RETURN true; END IF;
 IF NOT COALESCE(public.pedido_admite_repartidor(p),false) OR
    NOT ((p.estado='ofrecido' AND p.repartidor_id=p_repartidor_id AND
          (p.oferta_token IS NOT NULL AND p.oferta_vence_at IS NOT NULL AND p.oferta_vence_at > clock_timestamp())) OR
         (p.estado='buscando_repartidor' AND p.repartidor_id IS NULL)) THEN RETURN false; END IF;
 PERFORM 1 FROM public.repartidores WHERE user_id=p_repartidor_id AND activo IS TRUE AND COALESCE(bateria,0)>=15 FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT count(*) INTO carga FROM public.pedidos WHERE repartidor_id=p_repartidor_id AND id<>p_pedido_id
   AND estado IN ('ofrecido','asignado','recibido','en_camino');
 IF carga>=3 THEN RETURN false; END IF;
 UPDATE public.pedidos SET estado='asignado', repartidor_id=p_repartidor_id,
   oferta_token=NULL, oferta_vence_at=NULL, despacho_reintentar_at=NULL, despacho_incidente=NULL,
   pickup_pin=COALESCE(pickup_pin,lpad(floor(random()*10000)::text,4,'0')) WHERE id=p_pedido_id;
 IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id=p_pedido_id AND estado='asignado' AND repartidor_id=p_repartidor_id) THEN
   RAISE EXCEPTION 'La regla de estado impidió aceptar el pedido';
 END IF;
 UPDATE public.repartidores SET total_aceptaciones=total_aceptaciones+1 WHERE user_id=p_repartidor_id;
 RETURN true;
END; $function$;
COMMIT;
