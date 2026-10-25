-- Published RPC snapshot from 2026-10-25, before algorithm repairs. Synthetic tests only.

CREATE OR REPLACE FUNCTION public.pedido_admite_repartidor(p pedidos)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT p.tipo_pedido IN ('domicilio','mandadito','restaurante_delivery')
   AND (p.metodo_pago IS DISTINCT FROM 'en_linea' OR p.estado_pago = 'pagado')
   AND (p.tipo_pedido = 'mandadito' OR
       (p.estado_cocina IN ('en_cocina','listo_para_recoger') AND p.tiempo_preparacion_minutos IS NOT NULL));
$function$;

CREATE OR REPLACE FUNCTION public.asignar_pedido_atomico(p_pedido_id uuid, p_repartidor_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE p public.pedidos; carga integer; ofertas integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN false; END IF;
 SELECT * INTO p FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;
 IF NOT FOUND OR p.estado<>'buscando_repartidor' OR p.repartidor_id IS NOT NULL OR
    NOT COALESCE(public.pedido_admite_repartidor(p),false) OR p_repartidor_id=ANY(COALESCE(p.ofertas_rechazadas,'{}'::uuid[])) THEN RETURN false; END IF;
 PERFORM 1 FROM public.repartidores WHERE user_id=p_repartidor_id AND activo IS TRUE AND COALESCE(bateria,0)>=15 FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT count(*), count(*) FILTER (WHERE estado='ofrecido') INTO carga, ofertas FROM public.pedidos
   WHERE repartidor_id=p_repartidor_id AND estado IN ('ofrecido','asignado','recibido','en_camino');
 IF carga>=3 OR ofertas>0 THEN RETURN false; END IF;
 UPDATE public.pedidos SET estado='ofrecido', repartidor_id=p_repartidor_id, oferta_token=gen_random_uuid(),
   oferta_vence_at=clock_timestamp()+interval '25 seconds', despacho_reintentar_at=NULL,
   pickup_pin=COALESCE(pickup_pin,lpad(floor(random()*10000)::text,4,'0')), despacho_incidente=NULL WHERE id=p_pedido_id;
 IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id=p_pedido_id AND estado='ofrecido' AND repartidor_id=p_repartidor_id) THEN
   RAISE EXCEPTION 'La regla de estado impidió ofrecer el pedido';
 END IF;
 UPDATE public.repartidores SET total_ofertas=total_ofertas+1 WHERE user_id=p_repartidor_id;
 RETURN true;
END; $function$;

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

CREATE OR REPLACE FUNCTION public.avanzar_pedido_repartidor(p_pedido_id uuid, p_repartidor_id uuid, p_estado_anterior text, p_estado_nuevo text, p_lat_entrega double precision DEFAULT NULL::double precision, p_lng_entrega double precision DEFAULT NULL::double precision, p_pago_pendiente boolean DEFAULT NULL::boolean, p_pickup_pin text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE p public.pedidos;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND
    (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_repartidor_id) THEN RETURN false; END IF;
 SELECT * INTO p FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;
 IF NOT FOUND OR p.repartidor_id IS DISTINCT FROM p_repartidor_id THEN RETURN false; END IF;
 IF p.estado=p_estado_nuevo AND p_estado_nuevo IN ('recibido','en_camino','entregado') THEN RETURN true; END IF;
 IF p.estado IS DISTINCT FROM p_estado_anterior OR
    NOT ((p.estado='asignado' AND p_estado_nuevo='recibido') OR
         (p.estado='recibido' AND p_estado_nuevo='en_camino') OR
         (p.estado='en_camino' AND p_estado_nuevo='entregado')) THEN RETURN false; END IF;
 IF p_estado_nuevo='en_camino' AND p.tipo_pedido IS DISTINCT FROM 'mandadito' AND p.pickup_pin IS NOT NULL AND p_pickup_pin IS DISTINCT FROM p.pickup_pin THEN RETURN false; END IF;
 IF p_pago_pendiente IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN RETURN false; END IF;
 IF (p_lat_entrega IS NULL) <> (p_lng_entrega IS NULL) OR
    (p_lat_entrega IS NOT NULL AND NOT(p_lat_entrega BETWEEN -90 AND 90 AND p_lng_entrega BETWEEN -180 AND 180)) THEN RETURN false; END IF;
 IF p_lat_entrega IS NOT NULL AND (p.tipo_pedido IS DISTINCT FROM 'mandadito' OR
    p_estado_nuevo<>'entregado' OR p.lat_entrega IS NOT NULL OR p.lng_entrega IS NOT NULL) THEN RETURN false; END IF;
 UPDATE public.pedidos SET estado=p_estado_nuevo,
   lat_entrega=COALESCE(lat_entrega,p_lat_entrega), lng_entrega=COALESCE(lng_entrega,p_lng_entrega),
   pago_pendiente_restaurante=COALESCE(p_pago_pendiente,pago_pendiente_restaurante) WHERE id=p_pedido_id;
 IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id=p_pedido_id AND estado=p_estado_nuevo AND repartidor_id=p_repartidor_id) THEN
   RAISE EXCEPTION 'La regla de estado impidió avanzar el pedido';
 END IF;
 RETURN true;
END; $function$;

CREATE OR REPLACE FUNCTION public.buscar_repartidores_cercanos(p_lat double precision, p_lng double precision, p_radio_metros double precision DEFAULT 5000, p_cliente_lat double precision DEFAULT NULL::double precision, p_cliente_lng double precision DEFAULT NULL::double precision)
 RETURNS TABLE(repartidor_id uuid, user_id uuid, nombre text, distancia_metros double precision, score double precision, bateria integer, meta_envios integer, pedidos_activos bigint, tasa_aceptacion double precision, minutos_sin_pedido double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$BEGIN

    RETURN QUERY

    WITH driver_stats AS (

        SELECT

            r.id,

            r.user_id,

            r.nombre,

            r.lat,

            r.lng,

            COALESCE(r.bateria, 0) AS bateria,

            COALESCE(r.meta_envios, 0) AS meta_envios,

            COALESCE(r.total_ofertas, 0) AS total_ofertas,

            COALESCE(r.total_aceptaciones, 0) AS total_aceptaciones,

            r.ultimo_pedido_entregado_at,

            (

                SELECT COUNT(*)

                FROM pedidos p

                WHERE p.repartidor_id = r.user_id

                  AND p.estado IN ('ofrecido', 'asignado', 'recibido', 'en_camino')

            ) AS pedidos_activos_count,

            ST_DistanceSphere(

                ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326),

                ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)

            ) AS dist_restaurante

        FROM public.repartidores r

        WHERE r.activo = true AND r.user_id IS NOT NULL

          AND r.lat IS NOT NULL

          AND r.lng IS NOT NULL

          AND COALESCE(r.bateria, 0) >= 15

          AND ST_DWithin(

              ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326)::geography,

              ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,

              p_radio_metros

          )

    )

    SELECT

        ds.id                                                               AS repartidor_id,

        ds.user_id,

        ds.nombre,

        ds.dist_restaurante                                                 AS distancia_metros,

        (

            (ds.dist_restaurante * 0.40)

            + (ds.pedidos_activos_count * 2500.0)

            - (

                CASE

                    WHEN ds.total_ofertas = 0 THEN 0.8

                    ELSE LEAST(ds.total_aceptaciones::double precision / ds.total_ofertas, 1.0)

                END * 3000.0

              )

            - (

                LEAST(

                    EXTRACT(EPOCH FROM (NOW() - COALESCE(

                        ds.ultimo_pedido_entregado_at,

                        NOW() - INTERVAL '30 minutes'

                    ))) / 60.0,

                    120.0

                ) * 5.0

              )

            - (ds.bateria * 8.0)

        )::double precision                                                 AS score,

        ds.bateria,

        ds.meta_envios,

        ds.pedidos_activos_count                                            AS pedidos_activos,

        (CASE

            WHEN ds.total_ofertas = 0 THEN 0.8

            ELSE ROUND((ds.total_aceptaciones::double precision / ds.total_ofertas)::numeric, 2)

        END)::double precision                                              AS tasa_aceptacion,

        (LEAST(

            EXTRACT(EPOCH FROM (NOW() - COALESCE(

                ds.ultimo_pedido_entregado_at,

                NOW() - INTERVAL '30 minutes'

            ))) / 60.0,

            120.0

        ))::double precision                                                AS minutos_sin_pedido

    FROM driver_stats ds

    WHERE ds.pedidos_activos_count < 3

    ORDER BY score ASC

    LIMIT 10;

END;$function$;

CREATE OR REPLACE FUNCTION public.eats_notification_status(p_external_id text, p_provider_id text, p_sender text, p_recipient text, p_status text, p_code text DEFAULT NULL::text, p_price numeric DEFAULT NULL::numeric, p_currency text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE n public.eats_order_notifications; job_id uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 IF p_external_id !~ '^ee-order-[0-9a-f-]{36}$' OR p_sender<>'+522201465989' OR p_status NOT IN ('accepted','sent','delivered','read','failed') THEN RETURN false; END IF;
 BEGIN job_id:=substring(p_external_id FROM 10)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 SELECT * INTO n FROM public.eats_order_notifications WHERE id=job_id FOR UPDATE;
 IF NOT FOUND OR right(regexp_replace(n.recipient,'[^0-9]','','g'),10)<>right(regexp_replace(p_recipient,'[^0-9]','','g'),10)
 OR (n.provider_id IS NOT NULL AND n.provider_id<>p_provider_id) OR nullif(p_provider_id,'') IS NULL THEN RETURN false; END IF;
 IF (n.state='read' AND p_status<>'read') OR (n.state='delivered' AND p_status NOT IN ('delivered','read')) OR (n.state='sent' AND p_status='accepted') THEN RETURN true; END IF;
 UPDATE public.eats_order_notifications SET state=p_status,provider_status=p_status,provider_id=p_provider_id,
  error_code=p_code,price=CASE WHEN p_status IN ('delivered','read') THEN p_price ELSE price END,
  currency=CASE WHEN p_status IN ('delivered','read') THEN p_currency ELSE currency END,lease_until=NULL,updated_at=now() WHERE id=n.id;
 IF p_status='failed' THEN
  INSERT INTO public.pedido_logs(pedido_id,accion,detalles) VALUES(n.pedido_id,'ERROR_NOTIFICACION',jsonb_build_object('notification_id',n.id,'code',p_code,'state','failed')::text);
 END IF;
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.eats_notification_claim()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE n public.eats_order_notifications;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 IF NOT pg_try_advisory_xact_lock(20261013,4) THEN RETURN NULL; END IF;
 WITH lost AS (UPDATE public.eats_order_notifications SET state=CASE WHEN recoveries>=5 THEN 'failed' ELSE 'queued' END,
  recoveries=recoveries+1,error_code='preflight_lease_expired',lease_token=NULL,lease_until=NULL
 WHERE state='working' AND lease_until<now() RETURNING *)
 INSERT INTO public.pedido_logs(pedido_id,accion,detalles) SELECT pedido_id,'ERROR_NOTIFICACION',
 jsonb_build_object('notification_id',id,'code','preflight_lease_expired','state',state)::text FROM lost WHERE state='failed';
 WITH lost AS (UPDATE public.eats_order_notifications SET state='uncertain',error_code='send_lease_expired',updated_at=now()
 WHERE state='sending' AND lease_until<now() RETURNING *)
 INSERT INTO public.pedido_logs(pedido_id,accion,detalles) SELECT pedido_id,'ERROR_NOTIFICACION',
 jsonb_build_object('notification_id',id,'code','send_lease_expired','state','uncertain')::text FROM lost;
 IF (SELECT count(*) FROM public.eats_order_notifications WHERE state IN ('working','sending') AND lease_until>now())>=3 THEN RETURN NULL; END IF;
 SELECT * INTO n FROM public.eats_order_notifications candidate
 WHERE state IN ('queued','template_pending') AND next_attempt_at<=now() AND attempts<3
 AND NOT EXISTS(SELECT 1 FROM public.eats_order_notifications predecessor WHERE predecessor.group_key=candidate.group_key
   AND predecessor.sequence<candidate.sequence AND predecessor.state NOT IN ('accepted','sent','delivered','read'))
 ORDER BY created_at,sequence FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.eats_order_notifications SET state='working',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now()
 WHERE id=n.id RETURNING * INTO n;
 RETURN to_jsonb(n);
END $function$;

CREATE OR REPLACE FUNCTION public.eats_notifications_due()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.eats_notification_settings WHERE enabled) AND EXISTS(
 SELECT 1 FROM public.eats_order_notifications WHERE (state IN ('queued','template_pending') AND next_attempt_at<=now())
 OR (state IN ('working','sending') AND lease_until<now()))
$function$;