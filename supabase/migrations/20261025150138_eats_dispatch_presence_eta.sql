BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE TABLE public.eats_dispatch_policy(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 mode text NOT NULL DEFAULT 'observe' CHECK(mode IN('legacy','observe','active')),
 strict_presence boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 2 CHECK(version=2)
);
INSERT INTO public.eats_dispatch_policy DEFAULT VALUES;
CREATE TABLE public.eats_driver_presence(
 profile_id uuid PRIMARY KEY REFERENCES public.repartidores(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL UNIQUE,device_id uuid,session_id uuid NOT NULL,
 sequence bigint NOT NULL DEFAULT 0 CHECK(sequence>=0),
 contact_at timestamptz NOT NULL,gps_at timestamptz,lat float8,lng float8,accuracy_m float8,
 battery integer CHECK(battery BETWEEN 0 AND 100),protocol integer NOT NULL DEFAULT 1 CHECK(protocol IN(0,1))
);
CREATE TABLE public.eats_dispatch_kitchen_clock(
 pedido_id uuid PRIMARY KEY REFERENCES public.pedidos(id) ON DELETE CASCADE,
 accepted_at timestamptz NOT NULL,ready_at timestamptz
);
CREATE TABLE public.eats_dispatch_contexts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
 attempt integer NOT NULL CHECK(attempt BETWEEN 1 AND 6),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),result jsonb,
 UNIQUE(pedido_id,attempt)
);
CREATE INDEX eats_dispatch_contexts_retention ON public.eats_dispatch_contexts(created_at);
ALTER TABLE public.eats_dispatch_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eats_driver_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eats_dispatch_kitchen_clock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eats_dispatch_contexts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.eats_dispatch_policy,public.eats_driver_presence,public.eats_dispatch_kitchen_clock,public.eats_dispatch_contexts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.eats_dispatch_policy,public.eats_driver_presence,public.eats_dispatch_kitchen_clock,public.eats_dispatch_contexts TO service_role;

CREATE FUNCTION public.driver_presence_begin(p_profile_id uuid,p_device_id uuid,p_session_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2s' AS $$
DECLARE r public.repartidores;actor uuid:=auth.uid();
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR actor IS NULL OR p_session_id IS NULL THEN RETURN false;END IF;
 SELECT * INTO r FROM public.repartidores WHERE id=p_profile_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND OR r.activo IS DISTINCT FROM true OR r.current_device_id IS DISTINCT FROM p_device_id THEN RETURN false;END IF;
 INSERT INTO public.eats_driver_presence(profile_id,actor_id,device_id,session_id,contact_at)
 VALUES(r.id,actor,p_device_id,p_session_id,clock_timestamp())
 ON CONFLICT(profile_id) DO UPDATE SET actor_id=excluded.actor_id,device_id=excluded.device_id,
  session_id=excluded.session_id,sequence=0,contact_at=excluded.contact_at,gps_at=NULL,lat=NULL,lng=NULL,accuracy_m=NULL,battery=NULL,protocol=1
 WHERE eats_driver_presence.session_id IS DISTINCT FROM excluded.session_id;
 RETURN true;
END $$;

-- Older installed APKs already send authenticated GPS updates periodically.
-- Record contact, not the time/accuracy of the GPS sample they did not supply.
CREATE FUNCTION public.eats_capture_legacy_driver_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.role()='authenticated' AND auth.uid()=NEW.user_id AND NEW.activo IS TRUE AND
  NEW.lat BETWEEN -90 AND 90 AND NEW.lng BETWEEN -180 AND 180 THEN
  INSERT INTO public.eats_driver_presence(profile_id,actor_id,device_id,session_id,contact_at,lat,lng,battery,protocol)
  VALUES(NEW.id,NEW.user_id,NEW.current_device_id,gen_random_uuid(),clock_timestamp(),NEW.lat,NEW.lng,NEW.bateria,0)
  ON CONFLICT(profile_id) DO UPDATE SET actor_id=excluded.actor_id,device_id=excluded.device_id,
   contact_at=excluded.contact_at,lat=excluded.lat,lng=excluded.lng,battery=excluded.battery
  WHERE eats_driver_presence.protocol=0;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER eats_capture_legacy_driver_contact AFTER UPDATE OF lat,lng ON public.repartidores
 FOR EACH ROW EXECUTE FUNCTION public.eats_capture_legacy_driver_contact();

CREATE FUNCTION public.driver_presence_report(p_profile_id uuid,p_session_id uuid,p_sequence bigint,
 p_sent_at timestamptz,p_lat float8,p_lng float8,p_gps_at timestamptz,p_accuracy_m float8,p_battery integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='2s' AS $$
DECLARE r public.repartidores;v public.eats_driver_presence;t timestamptz:=clock_timestamp();good_gps boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN RETURN jsonb_build_object('accepted',false,'reason','identity');END IF;
 IF p_sequence IS NULL OR p_sequence<1 OR p_sequence>9007199254740991 OR p_sent_at IS NULL OR NOT isfinite(p_sent_at)
  OR p_sent_at<t-interval '45 seconds' OR p_sent_at>t+interval '30 seconds'
  OR (p_battery IS NOT NULL AND p_battery NOT BETWEEN 0 AND 100) THEN RETURN jsonb_build_object('accepted',false,'reason','invalid_report');END IF;
 SELECT * INTO r FROM public.repartidores WHERE id=p_profile_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR r.activo IS DISTINCT FROM true THEN RETURN jsonb_build_object('accepted',false,'reason','offline');END IF;
 SELECT * INTO v FROM public.eats_driver_presence WHERE profile_id=r.id FOR UPDATE;
 IF NOT FOUND OR v.actor_id IS DISTINCT FROM auth.uid() OR v.session_id IS DISTINCT FROM p_session_id
  OR v.device_id IS DISTINCT FROM r.current_device_id THEN RETURN jsonb_build_object('accepted',false,'reason','session');END IF;
 IF p_sequence<=v.sequence THEN RETURN jsonb_build_object('accepted',false,'reason','old_sequence');END IF;
 IF v.sequence>0 AND v.contact_at>t-interval '5 seconds' THEN RETURN jsonb_build_object('accepted',true,'reason','throttled','gps_accepted',false);END IF;
 good_gps:=coalesce(p_lat BETWEEN -90 AND 90 AND p_lng BETWEEN -180 AND 180 AND
  p_gps_at IS NOT NULL AND isfinite(p_gps_at) AND p_gps_at>=t-interval '120 seconds' AND p_gps_at<=t+interval '15 seconds'
  AND p_accuracy_m BETWEEN 0 AND 100 AND (v.gps_at IS NULL OR p_gps_at>v.gps_at),false);
 UPDATE public.eats_driver_presence SET sequence=p_sequence,contact_at=t,battery=coalesce(p_battery,battery),
  lat=CASE WHEN good_gps THEN p_lat ELSE lat END,lng=CASE WHEN good_gps THEN p_lng ELSE lng END,
  gps_at=CASE WHEN good_gps THEN p_gps_at ELSE gps_at END,accuracy_m=CASE WHEN good_gps THEN p_accuracy_m ELSE accuracy_m END WHERE profile_id=r.id;
 -- GPS never activates a driver. The row lock serializes Offline and reporting.
 IF good_gps THEN UPDATE public.repartidores SET lat=p_lat,lng=p_lng,bateria=coalesce(p_battery,bateria) WHERE id=r.id AND activo IS TRUE;
 ELSIF p_battery IS NOT NULL THEN UPDATE public.repartidores SET bateria=p_battery WHERE id=r.id AND activo IS TRUE;END IF;
 RETURN jsonb_build_object('accepted',true,'gps_accepted',good_gps);
END $$;

CREATE FUNCTION public.eats_capture_kitchen_clock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.estado_cocina IN('en_cocina','listo_para_recoger') AND
  (TG_OP='INSERT' OR OLD.estado_cocina IS DISTINCT FROM NEW.estado_cocina) THEN
  INSERT INTO public.eats_dispatch_kitchen_clock(pedido_id,accepted_at,ready_at)
  VALUES(NEW.id,clock_timestamp(),CASE WHEN NEW.estado_cocina='listo_para_recoger' THEN clock_timestamp() END)
  ON CONFLICT(pedido_id) DO UPDATE SET ready_at=CASE WHEN NEW.estado_cocina='listo_para_recoger' THEN coalesce(eats_dispatch_kitchen_clock.ready_at,excluded.ready_at) ELSE eats_dispatch_kitchen_clock.ready_at END;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER eats_capture_kitchen_clock AFTER INSERT OR UPDATE OF estado_cocina ON public.pedidos
 FOR EACH ROW EXECUTE FUNCTION public.eats_capture_kitchen_clock();

CREATE FUNCTION public.eats_driver_dispatch_eligible(p_profile_id uuid,p_strict boolean)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.repartidores r LEFT JOIN public.eats_driver_presence v ON v.profile_id=r.id
 WHERE r.id=p_profile_id AND r.activo IS TRUE AND r.user_id IS NOT NULL AND coalesce(r.bateria,0)>=15 AND
  CASE WHEN v.profile_id IS NULL THEN false
   WHEN v.protocol=0 THEN NOT p_strict AND v.actor_id=r.user_id AND v.device_id IS NOT DISTINCT FROM r.current_device_id
    AND v.contact_at>=clock_timestamp()-interval '90 seconds' AND v.lat BETWEEN -90 AND 90 AND v.lng BETWEEN -180 AND 180
   ELSE v.actor_id=r.user_id AND v.device_id IS NOT DISTINCT FROM r.current_device_id AND
    v.contact_at>=clock_timestamp()-interval '90 seconds' AND v.gps_at>=clock_timestamp()-interval '120 seconds' AND v.gps_at<=clock_timestamp()+interval '15 seconds'
    AND v.accuracy_m BETWEEN 0 AND 100 AND coalesce(v.battery,r.bateria)>=15 END);
$$;

CREATE FUNCTION public.eats_dispatch_context(p_pedido_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions SET lock_timeout='2s' AS $$
DECLARE p public.pedidos;policy public.eats_dispatch_policy;ctx public.eats_dispatch_contexts;
 lat0 float8;lng0 float8;drivers jsonb;legacy jsonb;food_ready timestamptz;effective_mode text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only';END IF;
 SELECT * INTO p FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;
 IF NOT FOUND OR p.estado<>'buscando_repartidor' OR p.repartidor_id IS NOT NULL OR p.despacho_intentos NOT BETWEEN 1 AND 6
  OR NOT coalesce(public.pedido_admite_repartidor(p),false) THEN RETURN NULL;END IF;
 SELECT * INTO ctx FROM public.eats_dispatch_contexts WHERE pedido_id=p.id AND attempt=p.despacho_intentos;
 IF FOUND THEN RETURN ctx.snapshot||jsonb_build_object('context_id',ctx.id);END IF;
 SELECT * INTO STRICT policy FROM public.eats_dispatch_policy;
 lat0:=p.restaurante_lat;lng0:=p.restaurante_lng;
 IF (lat0 IS NULL OR lng0 IS NULL) AND p.restaurante_id IS NOT NULL THEN SELECT lat,lng INTO lat0,lng0 FROM public.restaurantes WHERE id=p.restaurante_id;END IF;
 IF (lat0 IS NULL OR lng0 IS NULL) AND p.tipo_pedido='mandadito' THEN lat0:=p.lat;lng0:=p.lng;END IF;
 IF lat0 IS NULL OR lng0 IS NULL OR NOT(lat0 BETWEEN -90 AND 90 AND lng0 BETWEEN -180 AND 180) THEN lat0:=NULL;lng0:=NULL;END IF;
 -- Missing pickup coordinates are visible as no candidates in active mode;
 -- they must not silently bypass presence through the old fallback.
 effective_mode:=policy.mode;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.user_id,'score',c.score) ORDER BY c.score,c.user_id),'[]'::jsonb) INTO legacy
 FROM public.buscar_repartidores_cercanos(lat0,lng0,5000::float8,NULL::float8,NULL::float8,p.ofertas_rechazadas)c
 JOIN public.repartidores r ON r.user_id=c.user_id
 WHERE policy.mode<>'active' OR(public.eats_driver_dispatch_eligible(r.id,policy.strict_presence) AND NOT EXISTS(
  SELECT 1 FROM public.pedidos busy WHERE busy.repartidor_id=r.user_id AND busy.estado IN('ofrecido','asignado','recibido','en_camino')));
 SELECT CASE WHEN p.estado_cocina='listo_para_recoger' THEN now() ELSE c.accepted_at+make_interval(mins=>p.tiempo_preparacion_minutos) END
 INTO food_ready FROM public.eats_dispatch_kitchen_clock c WHERE c.pedido_id=p.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.user_id,'profile_id',d.id,'lat',d.lat,'lng',d.lng,
  'distance_m',d.distance_m,'legacy_presence',d.legacy_presence,'idle_seconds',d.idle_seconds) ORDER BY d.distance_m,d.user_id),'[]'::jsonb)
 INTO drivers FROM(
  SELECT r.id,r.user_id,coalesce(v.lat,r.lat) lat,coalesce(v.lng,r.lng) lng,coalesce(v.protocol=0,true) legacy_presence,
   greatest(0,least(7200,extract(epoch FROM(now()-coalesce(r.ultimo_pedido_entregado_at,now()))))) idle_seconds,
   ST_DistanceSphere(ST_SetSRID(ST_MakePoint(coalesce(v.lng,r.lng),coalesce(v.lat,r.lat)),4326),ST_SetSRID(ST_MakePoint(lng0,lat0),4326)) distance_m
  FROM public.repartidores r LEFT JOIN public.eats_driver_presence v ON v.profile_id=r.id
  WHERE lat0 IS NOT NULL AND public.eats_driver_dispatch_eligible(r.id,policy.strict_presence)
   AND NOT EXISTS(SELECT 1 FROM unnest(coalesce(p.ofertas_rechazadas,'{}'::uuid[])) rejected(id) WHERE rejected.id=r.user_id)
   -- Until a durable compatible route exists, never add an automatic detour to an accepted trip.
   AND NOT EXISTS(SELECT 1 FROM public.pedidos busy WHERE busy.repartidor_id=r.user_id AND busy.estado IN('ofrecido','asignado','recibido','en_camino'))
   AND ST_DWithin(ST_SetSRID(ST_MakePoint(coalesce(v.lng,r.lng),coalesce(v.lat,r.lat)),4326)::geography,
    ST_SetSRID(ST_MakePoint(lng0,lat0),4326)::geography,5000)
  ORDER BY distance_m,r.user_id LIMIT 10
 )d;
 INSERT INTO public.eats_dispatch_contexts(pedido_id,attempt,snapshot)
 VALUES(p.id,p.despacho_intentos,jsonb_build_object('mode',effective_mode,'strict_presence',policy.strict_presence,'version',2,
  'pickup',CASE WHEN lat0 IS NULL THEN NULL ELSE jsonb_build_object('lat',lat0,'lng',lng0) END,
  'food_remaining_seconds',CASE WHEN food_ready IS NULL THEN NULL ELSE greatest(0,extract(epoch FROM(food_ready-now()))) END,
  'drivers',drivers,'legacy',legacy)) RETURNING * INTO ctx;
 RETURN ctx.snapshot||jsonb_build_object('context_id',ctx.id);
END $$;

CREATE FUNCTION public.eats_rank_dispatch(p_context_id uuid,p_routes jsonb,p_source text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ctx public.eats_dispatch_contexts;p public.pedidos;ranked jsonb;chosen jsonb;route jsonb;driver jsonb;seconds float8;score float8;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only';END IF;
 IF p_source IS NULL OR p_source NOT IN('mapbox','geographic','legacy') OR p_reason IS NOT NULL AND
  p_reason NOT IN('not_configured','provider_timeout','provider_error','provider_circuit','no_origin','no_candidates','concurrency_limit')
  OR p_routes IS NULL OR jsonb_typeof(p_routes)<>'array' OR jsonb_array_length(p_routes)>10 THEN RAISE EXCEPTION 'Invalid route evidence';END IF;
 SELECT * INTO ctx FROM public.eats_dispatch_contexts WHERE id=p_context_id FOR UPDATE;
 IF NOT FOUND OR ctx.created_at<clock_timestamp()-interval '20 seconds' THEN RETURN '[]'::jsonb;END IF;
 SELECT * INTO p FROM public.pedidos WHERE id=ctx.pedido_id;
 IF NOT FOUND OR p.estado<>'buscando_repartidor' OR p.repartidor_id IS NOT NULL OR p.despacho_intentos<>ctx.attempt THEN RETURN '[]'::jsonb;END IF;
 IF ctx.result IS NOT NULL THEN RETURN ctx.result->'chosen';END IF;
 -- Evidence is validated at the service boundary and revalidated here; unknown IDs cannot enter the ranking.
 FOR route IN SELECT value FROM jsonb_array_elements(p_routes) LOOP
  IF jsonb_typeof(route)<>'object' OR jsonb_typeof(route->'id')<>'string' OR NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(ctx.snapshot->'drivers') d WHERE d->>'id'=route->>'id') OR
   route->'seconds' IS NULL OR (route->'seconds'<>'null'::jsonb AND(jsonb_typeof(route->'seconds')<>'number' OR
    (route->>'seconds')::float8 NOT BETWEEN 0 AND 86400)) THEN RAISE EXCEPTION 'Invalid route candidate';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_routes) e GROUP BY e->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate route evidence';END IF;
 ranked:='[]'::jsonb;
 FOR driver IN SELECT value FROM jsonb_array_elements(ctx.snapshot->'drivers') LOOP
  IF NOT public.eats_driver_dispatch_eligible((driver->>'profile_id')::uuid,(ctx.snapshot->>'strict_presence')::boolean) THEN CONTINUE;END IF;
  IF p_source='mapbox' THEN
   SELECT value INTO route FROM jsonb_array_elements(p_routes) WHERE value->>'id'=driver->>'id';
   IF NOT FOUND OR route->'seconds'='null'::jsonb THEN CONTINUE;END IF;
   seconds:=(route->>'seconds')::float8;
  ELSE seconds:=(driver->>'distance_m')::float8*1.35/5.5+45;END IF;
  -- All terms are seconds. Fairness is limited to thirty seconds, never a substitute for eligibility.
  score:=greatest(seconds,coalesce((ctx.snapshot->>'food_remaining_seconds')::float8,0))
   -least((driver->>'idle_seconds')::float8/240,30);
  ranked:=ranked||jsonb_build_array(jsonb_build_object('id',driver->>'id','score',score,'pickup_seconds',seconds));
 END LOOP;
 SELECT coalesce(jsonb_agg(value ORDER BY(value->>'score')::float8,(value->>'pickup_seconds')::float8,value->>'id'),'[]'::jsonb) INTO ranked FROM jsonb_array_elements(ranked);
 chosen:=CASE WHEN ctx.snapshot->>'mode'='active' THEN ranked ELSE ctx.snapshot->'legacy' END;
 UPDATE public.eats_dispatch_contexts SET result=jsonb_build_object('chosen',chosen,'proposed',ranked,'source',p_source,'reason',p_reason,
  'ranked_at',clock_timestamp(),'mode',ctx.snapshot->>'mode') WHERE id=ctx.id;
 RETURN chosen;
END $$;

CREATE FUNCTION public.eats_offer_ranked(p_pedido_id uuid,p_repartidor_id uuid,p_context_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions SET lock_timeout='2s' AS $$
DECLARE ctx public.eats_dispatch_contexts;r public.repartidores;p public.pedidos;candidate jsonb;lat0 float8;lng0 float8;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN false;END IF;
 SELECT * INTO p FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;
 IF NOT FOUND OR p.estado<>'buscando_repartidor' OR p.repartidor_id IS NOT NULL THEN RETURN false;END IF;
 SELECT * INTO ctx FROM public.eats_dispatch_contexts WHERE id=p_context_id AND pedido_id=p.id AND attempt=p.despacho_intentos;
 IF NOT FOUND OR ctx.created_at<clock_timestamp()-interval '20 seconds' OR ctx.result IS NULL OR NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(ctx.result->'chosen') c WHERE c->>'id'=p_repartidor_id::text) THEN RETURN false;END IF;
 SELECT * INTO r FROM public.repartidores WHERE user_id=p_repartidor_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF ctx.created_at<clock_timestamp()-interval '20 seconds' THEN RETURN false;END IF;
 IF ctx.snapshot->>'mode'='active' THEN
  IF NOT public.eats_driver_dispatch_eligible(r.id,(ctx.snapshot->>'strict_presence')::boolean) OR EXISTS(
   SELECT 1 FROM public.pedidos busy WHERE busy.repartidor_id=r.user_id AND busy.estado IN('ofrecido','asignado','recibido','en_camino')) THEN RETURN false;END IF;
  SELECT value INTO candidate FROM jsonb_array_elements(ctx.snapshot->'drivers') WHERE value->>'id'=r.user_id::text;
  SELECT coalesce(v.lat,r.lat),coalesce(v.lng,r.lng) INTO lat0,lng0 FROM(SELECT 1) x LEFT JOIN public.eats_driver_presence v ON v.profile_id=r.id;
  IF candidate IS NULL OR ST_DistanceSphere(ST_SetSRID(ST_MakePoint(lng0,lat0),4326),
   ST_SetSRID(ST_MakePoint((candidate->>'lng')::float8,(candidate->>'lat')::float8),4326))>150 THEN RETURN false;END IF;
 END IF;
 RETURN public.asignar_pedido_atomico(p.id,r.user_id);
END $$;

-- A late acceptance must not bypass a persisted rejection by entering the
-- legacy direct-pool branch. Retrying an already accepted service stays true.
CREATE OR REPLACE FUNCTION public.aceptar_pedido_atomico(p_pedido_id uuid,p_repartidor_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.pedidos;r public.repartidores;carga integer;offers integer;policy public.eats_dispatch_policy;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND(auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_repartidor_id) THEN RETURN false;END IF;
 SELECT * INTO p FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF p.repartidor_id=p_repartidor_id AND p.estado IN('asignado','recibido','en_camino') THEN RETURN true;END IF;
 IF NOT coalesce(public.pedido_admite_repartidor(p),false) OR EXISTS(
  SELECT 1 FROM unnest(coalesce(p.ofertas_rechazadas,'{}'::uuid[])) rejected(id) WHERE rejected.id=p_repartidor_id) OR
  NOT((p.estado='ofrecido' AND p.repartidor_id=p_repartidor_id AND p.oferta_token IS NOT NULL AND
    p.oferta_vence_at IS NOT NULL AND p.oferta_vence_at>clock_timestamp()) OR
   (p.estado='buscando_repartidor' AND p.repartidor_id IS NULL)) THEN RETURN false;END IF;
 SELECT * INTO r FROM public.repartidores WHERE user_id=p_repartidor_id AND activo IS TRUE AND coalesce(bateria,0)>=15 FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO STRICT policy FROM public.eats_dispatch_policy;
 IF policy.mode='active' AND NOT public.eats_driver_dispatch_eligible(r.id,policy.strict_presence) THEN RETURN false;END IF;
 SELECT count(*),count(*) FILTER(WHERE estado='ofrecido') INTO carga,offers FROM public.pedidos
  WHERE repartidor_id=p_repartidor_id AND id<>p.id AND estado IN('ofrecido','asignado','recibido','en_camino');
 IF carga>=3 OR offers>0 THEN RETURN false;END IF;
 UPDATE public.pedidos SET estado='asignado',repartidor_id=p_repartidor_id,oferta_token=NULL,oferta_vence_at=NULL,
  despacho_reintentar_at=NULL,despacho_incidente=NULL,pickup_pin=coalesce(pickup_pin,lpad(floor(random()*10000)::text,4,'0')) WHERE id=p.id;
 IF NOT EXISTS(SELECT 1 FROM public.pedidos WHERE id=p.id AND estado='asignado' AND repartidor_id=p_repartidor_id) THEN
  RAISE EXCEPTION 'La regla de estado impidió aceptar el pedido';END IF;
 UPDATE public.repartidores SET total_aceptaciones=coalesce(total_aceptaciones,0)+1 WHERE id=r.id;
 RETURN true;
END $$;

CREATE FUNCTION public.eats_dispatch_prune()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE deleted integer;
BEGIN
 IF current_user NOT IN('postgres','supabase_admin') AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only';END IF;
 WITH old AS(SELECT id FROM public.eats_dispatch_contexts WHERE created_at<now()-interval '7 days' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1000)
 DELETE FROM public.eats_dispatch_contexts c USING old WHERE c.id=old.id;
 GET DIAGNOSTICS deleted=ROW_COUNT;RETURN deleted;
END $$;
REVOKE ALL ON FUNCTION public.driver_presence_begin(uuid,uuid,uuid),public.driver_presence_report(uuid,uuid,bigint,timestamptz,float8,float8,timestamptz,float8,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.driver_presence_begin(uuid,uuid,uuid),public.driver_presence_report(uuid,uuid,bigint,timestamptz,float8,float8,timestamptz,float8,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.eats_capture_kitchen_clock(),public.eats_capture_legacy_driver_contact(),public.eats_driver_dispatch_eligible(uuid,boolean),public.eats_dispatch_context(uuid),
 public.eats_rank_dispatch(uuid,jsonb,text,text),public.eats_offer_ranked(uuid,uuid,uuid),public.eats_dispatch_prune() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eats_driver_dispatch_eligible(uuid,boolean),public.eats_dispatch_context(uuid),
 public.eats_rank_dispatch(uuid,jsonb,text,text),public.eats_offer_ranked(uuid,uuid,uuid),public.eats_dispatch_prune() TO service_role;
-- Retain at most one bounded batch per hour; no additional Edge invocation.
SELECT cron.schedule('eats-dispatch-retention','17 * * * *','SELECT public.eats_dispatch_prune();');
NOTIFY pgrst,'reload schema';
COMMIT;
