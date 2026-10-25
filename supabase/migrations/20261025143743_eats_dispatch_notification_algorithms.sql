BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Keep the five-argument API compatible. The sixth argument scopes exclusions
-- before LIMIT; the Edge passes the durable rejection list of the same order.
CREATE FUNCTION public.buscar_repartidores_cercanos(
 p_lat double precision,p_lng double precision,p_radio_metros double precision,
 p_cliente_lat double precision,p_cliente_lng double precision,p_excluidos uuid[])
RETURNS TABLE(repartidor_id uuid,user_id uuid,nombre text,distancia_metros double precision,
 score double precision,bateria integer,meta_envios integer,pedidos_activos bigint,
 tasa_aceptacion double precision,minutos_sin_pedido double precision)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $function$
DECLARE has_origin boolean:=p_lat IS NOT NULL;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Server required'; END IF;
 IF (p_lat IS NULL)<>(p_lng IS NULL) OR
    (has_origin AND NOT(p_lat BETWEEN -90 AND 90 AND p_lng BETWEEN -180 AND 180)) OR
    p_radio_metros IS NULL OR NOT(p_radio_metros BETWEEN 1 AND 50000) OR
    coalesce(cardinality(p_excluidos),0)>1000 THEN RAISE EXCEPTION 'Invalid dispatch search'; END IF;
 RETURN QUERY
 WITH candidates AS (
  SELECT r.id,r.user_id,r.nombre,coalesce(r.bateria,0) battery,coalesce(r.meta_envios,0) goals,
   coalesce(r.total_ofertas,0) offers,coalesce(r.total_aceptaciones,0) accepted,
   r.ultimo_pedido_entregado_at,load.active_count,
   CASE WHEN has_origin THEN ST_DistanceSphere(ST_SetSRID(ST_MakePoint(r.lng,r.lat),4326),
     ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)) END distance
  FROM public.repartidores r
  CROSS JOIN LATERAL (
   SELECT count(*) active_count,coalesce(bool_or(p.estado='ofrecido'),false) has_offer
   FROM public.pedidos p WHERE p.repartidor_id=r.user_id AND p.estado IN('ofrecido','asignado','recibido','en_camino')
  ) load
  WHERE r.activo IS TRUE AND r.user_id IS NOT NULL AND coalesce(r.bateria,0)>=15
   AND load.active_count<3 AND NOT load.has_offer
   AND NOT EXISTS(SELECT 1 FROM unnest(coalesce(p_excluidos,'{}'::uuid[])) excluded(id) WHERE excluded.id=r.user_id)
   AND (NOT has_origin OR (r.lat IS NOT NULL AND r.lng IS NOT NULL AND
    ST_DWithin(ST_SetSRID(ST_MakePoint(r.lng,r.lat),4326)::geography,
     ST_SetSRID(ST_MakePoint(p_lng,p_lat),4326)::geography,p_radio_metros)))
 ), scored AS (
  SELECT c.*,CASE WHEN c.offers=0 THEN 0.8 ELSE least(c.accepted::double precision/c.offers,1.0) END acceptance,
   least(extract(epoch FROM(now()-coalesce(c.ultimo_pedido_entregado_at,now()-interval '30 minutes')))/60.0,120.0)::double precision idle
  FROM candidates c
 )
 SELECT s.id,s.user_id,s.nombre,s.distance,
  CASE WHEN has_origin THEN s.distance*0.40+s.active_count*2500.0-s.acceptance*3000.0-s.idle*5.0-s.battery*8.0
   ELSE s.offers::double precision END,
  s.battery,s.goals,s.active_count,
  CASE WHEN s.offers=0 THEN 0.8 ELSE round((s.accepted::double precision/s.offers)::numeric,2)::double precision END,
  s.idle
 FROM scored s ORDER BY 5,s.user_id LIMIT 10;
END $function$;
REVOKE ALL ON FUNCTION public.buscar_repartidores_cercanos(double precision,double precision,double precision,double precision,double precision,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_repartidores_cercanos(double precision,double precision,double precision,double precision,double precision,uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.buscar_repartidores_cercanos(
 p_lat double precision,p_lng double precision,p_radio_metros double precision DEFAULT 5000,
 p_cliente_lat double precision DEFAULT NULL,p_cliente_lng double precision DEFAULT NULL)
RETURNS TABLE(repartidor_id uuid,user_id uuid,nombre text,distancia_metros double precision,
 score double precision,bateria integer,meta_envios integer,pedidos_activos bigint,
 tasa_aceptacion double precision,minutos_sin_pedido double precision)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT * FROM public.buscar_repartidores_cercanos(p_lat,p_lng,p_radio_metros,p_cliente_lat,p_cliente_lng,'{}'::uuid[]);
$function$;

-- Refuse a cutover over malformed legacy data; do not guess ownership or send
-- a replacement offer. Validation also prevents this unreachable state later.
DO $function$ BEGIN
 IF EXISTS(SELECT 1 FROM public.pedidos WHERE estado='ofrecido' AND
  (repartidor_id IS NULL OR oferta_token IS NULL OR oferta_vence_at IS NULL OR NOT isfinite(oferta_vence_at))) THEN
  RAISE EXCEPTION 'Malformed offer requires explicit review before deployment';
 END IF;
END $function$;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_oferta_completa CHECK(
 estado IS DISTINCT FROM 'ofrecido' OR
 (repartidor_id IS NOT NULL AND oferta_token IS NOT NULL AND oferta_vence_at IS NOT NULL AND isfinite(oferta_vence_at))) NOT VALID;
ALTER TABLE public.pedidos VALIDATE CONSTRAINT pedidos_oferta_completa;

CREATE OR REPLACE FUNCTION public.eats_notification_status(
 p_external_id text,p_provider_id text,p_sender text,p_recipient text,p_status text,
 p_code text DEFAULT NULL,p_price numeric DEFAULT NULL,p_currency text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE n public.eats_order_notifications;job_id uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 IF p_external_id IS NULL OR p_external_id !~ '^ee-order-[0-9a-f-]{36}$' OR
  p_sender IS DISTINCT FROM '+522201465989' OR p_status IS NULL OR p_status NOT IN('accepted','sent','delivered','read','failed') OR
  p_recipient IS NULL THEN RETURN false; END IF;
 BEGIN job_id:=substring(p_external_id FROM 10)::uuid;EXCEPTION WHEN invalid_text_representation THEN RETURN false;END;
 SELECT * INTO n FROM public.eats_order_notifications WHERE id=job_id FOR UPDATE;
 IF NOT FOUND OR right(regexp_replace(n.recipient,'[^0-9]','','g'),10)<>right(regexp_replace(p_recipient,'[^0-9]','','g'),10)
  OR (n.provider_id IS NOT NULL AND n.provider_id<>p_provider_id) OR nullif(p_provider_id,'') IS NULL THEN RETURN false;END IF;
 IF (n.state='read' AND p_status<>'read') OR
  (n.state='delivered' AND p_status NOT IN('delivered','read')) OR
  (n.state='sent' AND p_status='accepted') OR
  (n.state='failed' AND p_status IN('accepted','sent')) THEN RETURN true;END IF;
 UPDATE public.eats_order_notifications SET state=p_status,provider_status=p_status,provider_id=p_provider_id,
  error_code=p_code,price=CASE WHEN p_status IN('delivered','read') THEN p_price ELSE price END,
  currency=CASE WHEN p_status IN('delivered','read') THEN p_currency ELSE currency END,lease_until=NULL,updated_at=now() WHERE id=n.id;
 IF p_status='failed' THEN
  INSERT INTO public.pedido_logs(pedido_id,accion,detalles) VALUES(n.pedido_id,'ERROR_NOTIFICACION',
   jsonb_build_object('notification_id',n.id,'code',p_code,'state','failed')::text);
 END IF;
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.eats_notification_claim()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
DECLARE n public.eats_order_notifications;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only';END IF;
 IF NOT pg_try_advisory_xact_lock(20261013,4) THEN RETURN NULL;END IF;
 WITH lost AS(UPDATE public.eats_order_notifications SET state=CASE WHEN recoveries>=5 THEN 'failed' ELSE 'queued' END,
  recoveries=recoveries+1,error_code='preflight_lease_expired',lease_token=NULL,lease_until=NULL
  WHERE state='working' AND lease_until<now() RETURNING *)
 INSERT INTO public.pedido_logs(pedido_id,accion,detalles) SELECT pedido_id,'ERROR_NOTIFICACION',
  jsonb_build_object('notification_id',id,'code','preflight_lease_expired','state',state)::text FROM lost WHERE state='failed';
 WITH lost AS(UPDATE public.eats_order_notifications SET state='uncertain',error_code='send_lease_expired',updated_at=now()
  WHERE state='sending' AND lease_until<now() RETURNING *)
 INSERT INTO public.pedido_logs(pedido_id,accion,detalles) SELECT pedido_id,'ERROR_NOTIFICACION',
  jsonb_build_object('notification_id',id,'code','send_lease_expired','state','uncertain')::text FROM lost;
 -- Close only unsent dependent parts, once. Never retry an uncertain send.
 WITH blocked AS(
  SELECT candidate.id FROM public.eats_order_notifications candidate
  WHERE candidate.state IN('queued','template_pending') AND (candidate.attempts>=3 OR EXISTS(
   SELECT 1 FROM public.eats_order_notifications predecessor WHERE predecessor.group_key=candidate.group_key
    AND predecessor.sequence<candidate.sequence AND predecessor.state IN('failed','uncertain','superseded')))
  ORDER BY candidate.created_at,candidate.sequence FOR UPDATE OF candidate SKIP LOCKED LIMIT 100
 ), closed AS(
  UPDATE public.eats_order_notifications target SET state='failed',error_code=CASE WHEN target.attempts>=3 THEN 'attempt_limit_reached' ELSE 'predecessor_terminal' END,
   lease_token=NULL,lease_until=NULL,updated_at=now() FROM blocked WHERE target.id=blocked.id RETURNING target.*
 )
 INSERT INTO public.pedido_logs(pedido_id,accion,detalles) SELECT pedido_id,'ERROR_NOTIFICACION',
  jsonb_build_object('notification_id',id,'kind',kind,'code',error_code,'state','failed')::text FROM closed;
 IF(SELECT count(*) FROM public.eats_order_notifications WHERE state IN('working','sending') AND lease_until>now())>=3 THEN RETURN NULL;END IF;
 SELECT * INTO n FROM public.eats_order_notifications candidate
 WHERE state IN('queued','template_pending') AND next_attempt_at<=now() AND attempts<3
 AND NOT EXISTS(SELECT 1 FROM public.eats_order_notifications predecessor WHERE predecessor.group_key=candidate.group_key
  AND predecessor.sequence<candidate.sequence AND predecessor.state NOT IN('accepted','sent','delivered','read'))
 ORDER BY created_at,sequence FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE public.eats_order_notifications SET state='working',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now()
 WHERE id=n.id RETURNING * INTO n;
 RETURN to_jsonb(n);
END $function$;

CREATE OR REPLACE FUNCTION public.eats_notifications_due()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $function$
 SELECT EXISTS(SELECT 1 FROM public.eats_notification_settings WHERE enabled) AND(
  EXISTS(SELECT 1 FROM public.eats_order_notifications WHERE state IN('working','sending') AND lease_until<now()) OR
  EXISTS(SELECT 1 FROM public.eats_order_notifications candidate WHERE candidate.state IN('queued','template_pending') AND(
   candidate.attempts>=3 OR EXISTS(SELECT 1 FROM public.eats_order_notifications predecessor
    WHERE predecessor.group_key=candidate.group_key AND predecessor.sequence<candidate.sequence
    AND predecessor.state IN('failed','uncertain','superseded')))) OR
  ((SELECT count(*) FROM public.eats_order_notifications WHERE state IN('working','sending') AND lease_until>now())<3 AND
   EXISTS(SELECT 1 FROM public.eats_order_notifications candidate
    WHERE candidate.state IN('queued','template_pending') AND candidate.next_attempt_at<=now() AND candidate.attempts<3
    AND NOT EXISTS(SELECT 1 FROM public.eats_order_notifications predecessor WHERE predecessor.group_key=candidate.group_key
     AND predecessor.sequence<candidate.sequence AND predecessor.state NOT IN('accepted','sent','delivered','read'))))
 );
$function$;
COMMIT;
