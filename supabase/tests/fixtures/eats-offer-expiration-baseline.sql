CREATE OR REPLACE FUNCTION public.expirar_oferta_pedido(p_pedido_id uuid, p_repartidor_id uuid, p_oferta_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN false; END IF;
 UPDATE public.pedidos SET estado='buscando_repartidor', repartidor_id=NULL,
   ofertas_rechazadas=array_append(COALESCE(ofertas_rechazadas,'{}'::uuid[]),p_repartidor_id),
   oferta_token=NULL, oferta_vence_at=NULL, despacho_reintentar_at=clock_timestamp()
 WHERE id=p_pedido_id AND estado='ofrecido' AND repartidor_id=p_repartidor_id
   AND oferta_token=p_oferta_token AND oferta_vence_at<=clock_timestamp();
 RETURN FOUND;
END; $function$
