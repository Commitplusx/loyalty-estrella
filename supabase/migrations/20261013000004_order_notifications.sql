BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE TABLE public.eats_notification_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false
);
INSERT INTO public.eats_notification_settings(singleton,enabled) VALUES(true,false);
CREATE TABLE public.eats_order_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pedido_id uuid NOT NULL REFERENCES public.pedidos(id),
 event_key text NOT NULL UNIQUE, kind text NOT NULL, recipient text NOT NULL,
 sender text NOT NULL DEFAULT '+522201465989' CHECK(sender='+522201465989'),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'), sequence integer NOT NULL DEFAULT 0, group_key text NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','working','sending','template_pending','accepted','sent','delivered','read','failed','uncertain','superseded')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 recoveries integer NOT NULL DEFAULT 0 CHECK(recoveries BETWEEN 0 AND 6),
 lease_token uuid, lease_until timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 provider_id text UNIQUE, provider_status text, error_code text, price numeric, currency text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eats_notifications_due ON public.eats_order_notifications(next_attempt_at,created_at)
 WHERE state IN ('queued','template_pending','working','sending');
CREATE INDEX eats_notifications_order ON public.eats_order_notifications(pedido_id,created_at);
CREATE INDEX eats_notifications_group ON public.eats_order_notifications(group_key,sequence);
CREATE TABLE public.eats_kitchen_events (
 message_id text PRIMARY KEY, pedido_id uuid NOT NULL REFERENCES public.pedidos(id),
 action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.eats_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eats_order_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eats_kitchen_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.eats_notification_settings,public.eats_order_notifications,public.eats_kitchen_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.eats_notification_settings,public.eats_order_notifications,public.eats_kitchen_events TO service_role;
GRANT SELECT ON public.eats_order_notifications TO authenticated;
CREATE POLICY eats_notifications_admin_read ON public.eats_order_notifications FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.admins WHERE id=auth.uid() AND role IN ('admin','superadmin')));

CREATE FUNCTION public.eats_enqueue_notice(p public.pedidos,k text,tel text,ek text,extra jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE body jsonb; part text; i integer:=0; description text;
BEGIN
 body:=jsonb_build_object('id',p.id,'folio',coalesce(nullif(p.wb_message_id,''),right(p.id::text,6)),
 'customer',coalesce(p.cliente_nombre,'Cliente'),'restaurant',coalesce(p.restaurante,'Restaurante'),
 'driver_id',p.repartidor_id,'description',coalesce(p.descripcion,''),'minutes',p.tiempo_preparacion_minutos,
 'total',p.total,'shipping',p.precio_entrega,'payment',p.metodo_pago,'type',p.tipo_pedido,'restaurant_id',p.restaurante_id)||extra;
 IF k='restaurant_receipt' THEN
  description:=coalesce(p.descripcion,'Sin detalles');
  LOOP
   part:=substring(description FROM i*1500+1 FOR 1500);
   INSERT INTO public.eats_order_notifications(pedido_id,event_key,kind,recipient,snapshot,sequence,group_key)
   VALUES(p.id,ek||':'||i,k,coalesce(tel,''),body||jsonb_build_object('description',part,'last_part',length(description)<=(i+1)*1500),i,ek)
   ON CONFLICT(event_key) DO NOTHING;
   i:=i+1;
   EXIT WHEN i*1500>=length(description);
  END LOOP;
 ELSE
  INSERT INTO public.eats_order_notifications(pedido_id,event_key,kind,recipient,snapshot,group_key)
  VALUES(p.id,ek,k,coalesce(tel,''),body,ek) ON CONFLICT(event_key) DO NOTHING;
 END IF;
END $$;

CREATE FUNCTION public.eats_capture_order_event(p public.pedidos,old_p public.pedidos,operation text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.restaurantes; ek text; driver_tel text; driver_name text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.eats_notification_settings WHERE enabled) OR p.restaurante_id IS NULL
 OR p.origen IS DISTINCT FROM 'web' THEN RETURN false; END IF;
 SELECT * INTO r FROM public.restaurantes WHERE id=p.restaurante_id;
 IF NOT FOUND OR r.es_socio IS FALSE THEN RETURN false; END IF;
 ek:=p.id::text||':'||clock_timestamp()::text;
 IF operation='INSERT' AND p.estado='pendiente' THEN
  PERFORM public.eats_enqueue_notice(p,'restaurant_new',r.telefono,ek||':restaurant_new');
 END IF;
 IF operation='UPDATE' THEN
  IF old_p.estado IS DISTINCT FROM p.estado THEN
   IF p.estado IN ('asignado','en_camino','entregado','cancelado') THEN
    PERFORM public.eats_enqueue_notice(p,p.estado,p.cliente_tel,ek||':'||p.estado);
    IF p.estado='asignado' AND p.estado_cocina='listo_para_recoger' THEN
     SELECT telefono,nombre INTO driver_tel,driver_name FROM public.repartidores WHERE user_id=p.repartidor_id;
     PERFORM public.eats_enqueue_notice(p,'driver_ready',driver_tel,ek||':driver_ready',jsonb_build_object('customer',coalesce(driver_name,'Repartidor')));
    END IF;
   END IF;
  END IF;
  IF old_p.estado_cocina IS DISTINCT FROM p.estado_cocina THEN
   IF p.estado_cocina='en_cocina' THEN
    PERFORM public.eats_enqueue_notice(p,'preparing',p.cliente_tel,ek||':preparing');
    PERFORM public.eats_enqueue_notice(p,'restaurant_receipt',r.telefono,ek||':restaurant_receipt');
   ELSIF p.estado_cocina='listo_para_recoger' THEN
    IF p.tipo_pedido='tienda' THEN
     PERFORM public.eats_enqueue_notice(p,'pickup_ready',p.cliente_tel,ek||':pickup_ready');
    ELSIF p.repartidor_id IS NOT NULL THEN
     SELECT telefono,nombre INTO driver_tel,driver_name FROM public.repartidores WHERE user_id=p.repartidor_id;
     PERFORM public.eats_enqueue_notice(p,'driver_ready',driver_tel,ek||':driver_ready',jsonb_build_object('customer',coalesce(driver_name,'Repartidor')));
    END IF;
   END IF;
  END IF;
 END IF;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.loyalty_forward_order_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE handled boolean;
BEGIN
 IF TG_OP='UPDATE' AND OLD.estado IS NOT DISTINCT FROM NEW.estado
 AND OLD.estado_cocina IS NOT DISTINCT FROM NEW.estado_cocina THEN RETURN NEW; END IF;
 handled:=public.eats_capture_order_event(NEW,CASE WHEN TG_OP='UPDATE' THEN OLD ELSE NULL END,TG_OP);
 BEGIN
  PERFORM net.http_post(url:='https://jdrrkpvodnqoljycixbg.supabase.co/functions/v1/notificar-whatsapp',
   headers:=public.loyalty_notification_headers(),
   body:=CASE WHEN handled THEN jsonb_build_object('tipo','process_order_outbox') ELSE
    jsonb_build_object('type',TG_OP,'table',TG_TABLE_NAME,'schema',TG_TABLE_SCHEMA,
     'record',to_jsonb(NEW),'old_record',CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END) END,
   timeout_milliseconds:=5000);
 EXCEPTION WHEN OTHERS THEN
  IF NOT handled THEN RAISE; END IF;
  RAISE WARNING 'Order notification wake failed; durable outbox retained';
 END;
 RETURN NEW;
END $$;

CREATE FUNCTION public.eats_notification_claim()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
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
END $$;

CREATE FUNCTION public.eats_notification_start(p_id uuid,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 UPDATE public.eats_order_notifications SET state='sending',attempts=attempts+1,updated_at=now()
 WHERE id=p_id AND lease_token=p_token AND state='working' AND lease_until>now() AND attempts<3;
 RETURN FOUND;
END $$;

CREATE FUNCTION public.eats_notification_finish(p_id uuid,p_token uuid,p_state text,p_provider_id text DEFAULT NULL,p_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE n public.eats_order_notifications;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 IF p_state NOT IN ('accepted','sent','delivered','read','queued','failed','uncertain','template_pending','superseded') THEN RAISE EXCEPTION 'Invalid result'; END IF;
 SELECT * INTO n FROM public.eats_order_notifications WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR n.lease_token IS DISTINCT FROM p_token THEN RETURN false; END IF;
 -- A callback can arrive before the send response. Never downgrade it.
 IF n.state IN ('delivered','read') OR (n.state='sent' AND p_state='accepted') THEN RETURN true; END IF;
 IF n.state NOT IN ('working','sending','accepted','sent') THEN RETURN false; END IF;
 IF p_state IN ('accepted','sent','delivered','read') AND nullif(p_provider_id,'') IS NULL THEN RAISE EXCEPTION 'Provider ID required'; END IF;
 UPDATE public.eats_order_notifications SET
  state=CASE WHEN p_state='queued' AND attempts>=3 THEN 'failed' ELSE p_state END,
  provider_id=coalesce(p_provider_id,provider_id),provider_status=CASE WHEN p_provider_id IS NOT NULL THEN p_state ELSE provider_status END,
  error_code=p_code,lease_until=NULL,
  next_attempt_at=now()+CASE WHEN p_state='template_pending' THEN interval '5 minutes' ELSE interval '1 minute' END,updated_at=now()
 WHERE id=p_id;
 IF p_state IN ('failed','uncertain') OR (p_state='queued' AND n.attempts>=3) THEN
  INSERT INTO public.pedido_logs(pedido_id,accion,detalles) VALUES(n.pedido_id,'ERROR_NOTIFICACION',jsonb_build_object('notification_id',n.id,'kind',n.kind,'code',p_code,'state',p_state)::text);
 END IF;
 RETURN true;
END $$;

CREATE FUNCTION public.eats_notification_status(p_external_id text,p_provider_id text,p_sender text,p_recipient text,p_status text,p_code text DEFAULT NULL,p_price numeric DEFAULT NULL,p_currency text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
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
END $$;

CREATE FUNCTION public.eats_kitchen_action(p_order_key text,p_phone text,p_message_id text,p_action text,p_minutes integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.pedidos; r public.restaurantes; result jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.eats_notification_settings WHERE enabled) THEN RETURN jsonb_build_object('handled',false); END IF;
 IF nullif(p_message_id,'') IS NULL OR length(p_message_id)>250 OR p_action NOT IN ('prompt','prepare','ready','reject') THEN RAISE EXCEPTION 'Invalid kitchen action'; END IF;
 SELECT * INTO p FROM public.pedidos WHERE id::text=p_order_key OR wb_message_id=p_order_key FOR UPDATE;
 IF NOT FOUND OR p.origen IS DISTINCT FROM 'web' THEN RETURN jsonb_build_object('handled',false); END IF;
 SELECT * INTO r FROM public.restaurantes WHERE id=p.restaurante_id;
 IF NOT FOUND OR r.activo IS NOT TRUE OR r.es_socio IS FALSE
 OR right(regexp_replace(coalesce(r.telefono,''),'[^0-9]','','g'),10)<>right(regexp_replace(p_phone,'[^0-9]','','g'),10)
 OR length(regexp_replace(p_phone,'[^0-9]','','g')) NOT IN (10,12,13) THEN RAISE EXCEPTION 'Restaurant identity mismatch'; END IF;
 INSERT INTO public.eats_kitchen_events(message_id,pedido_id,action) VALUES(p_message_id,p.id,p_action) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN jsonb_build_object('handled',true,'replayed',true); END IF;
 IF p_action='prompt' THEN
  IF p.estado<>'pendiente' OR coalesce(p.estado_cocina,'pendiente')<>'pendiente' THEN RAISE EXCEPTION 'Kitchen stage changed'; END IF;
  PERFORM public.eats_enqueue_notice(p,'kitchen_prompt',p_phone,'kitchen:'||p_message_id);
 ELSIF p_action='prepare' THEN
  result:=public.cambiar_estado_cocina(p.id,'en_cocina',p.estado_cocina,p_minutes);
 ELSIF p_action='ready' THEN
  result:=public.cambiar_estado_cocina(p.id,'listo_para_recoger','en_cocina',NULL);
 ELSIF p_action='reject' THEN
  IF p.estado='cancelado' THEN RETURN jsonb_build_object('handled',true,'replayed',true); END IF;
  IF p.estado<>'pendiente' OR coalesce(p.estado_cocina,'pendiente')<>'pendiente' OR p.repartidor_id IS NOT NULL THEN RAISE EXCEPTION 'Cannot reject an accepted order'; END IF;
  UPDATE public.pedidos SET estado='cancelado' WHERE id=p.id;
  PERFORM public.eats_enqueue_notice(p,'restaurant_rejected',p_phone,'kitchen:'||p_message_id);
 END IF;
 RETURN jsonb_build_object('handled',true,'replayed',coalesce((result->>'replayed')::boolean,false));
END $$;

CREATE FUNCTION public.eats_notifications_due() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.eats_notification_settings WHERE enabled) AND EXISTS(
 SELECT 1 FROM public.eats_order_notifications WHERE (state IN ('queued','template_pending') AND next_attempt_at<=now())
 OR (state IN ('working','sending') AND lease_until<now()))
$$;
CREATE FUNCTION public.eats_notifications_wake() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.eats_notifications_due() THEN
  PERFORM net.http_post(url:='https://jdrrkpvodnqoljycixbg.supabase.co/functions/v1/notificar-whatsapp',
   headers:=public.loyalty_notification_headers(),body:='{"tipo":"process_order_outbox"}'::jsonb,timeout_milliseconds:=5000);
 END IF;
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
 ('eats_enqueue_notice','eats_capture_order_event','eats_notification_claim','eats_notification_start','eats_notification_finish','eats_notification_status','eats_kitchen_action','eats_notifications_due','eats_notifications_wake') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
SELECT cron.schedule('eats-order-notifications','* * * * *','SELECT public.eats_notifications_wake()');
COMMIT;
