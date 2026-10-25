-- Candidate only: not applied to production. Deploy with the reviewed Edge
-- functions and configure estrella_dispatch_token in Vault + DISPATCH_TOKEN.
BEGIN;
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS oferta_token uuid,
  ADD COLUMN IF NOT EXISTS oferta_vence_at timestamptz,
  ADD COLUMN IF NOT EXISTS despacho_intentos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS despacho_reintentar_at timestamptz,
  ADD COLUMN IF NOT EXISTS despacho_incidente text;
CREATE INDEX IF NOT EXISTS pedidos_dispatch_due_idx ON public.pedidos (despacho_reintentar_at, created_at)
  WHERE estado IN ('buscando_repartidor','ofrecido');
-- Existing offers get a real deadline; legacy timeout callbacks cannot release
-- them without the token. The scheduled recovery handles those callbacks.
UPDATE public.pedidos SET oferta_token=gen_random_uuid(), oferta_vence_at=updated_at+interval '25 seconds'
 WHERE estado='ofrecido' AND oferta_token IS NULL;

CREATE OR REPLACE FUNCTION public.pedido_admite_repartidor(p public.pedidos)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
 SELECT p.tipo_pedido IN ('domicilio','mandadito','restaurante_delivery')
   AND (p.metodo_pago IS DISTINCT FROM 'en_linea' OR p.estado_pago = 'pagado')
   AND (p.tipo_pedido = 'mandadito' OR
       (p.estado_cocina IN ('en_cocina','listo_para_recoger') AND p.tiempo_preparacion_minutos IS NOT NULL));
$$;

CREATE OR REPLACE FUNCTION public.trg_validar_flujo_pedido()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
 -- A kitchen tab may still send buscando_repartidor when accepting cooking.
 -- Preserve the driver lifecycle if that tab was opened before acceptance.
 IF OLD.estado IN ('ofrecido','asignado','recibido','en_camino','entregado','cancelado') AND
    NEW.estado='buscando_repartidor' AND NEW.repartidor_id IS NOT DISTINCT FROM OLD.repartidor_id AND
    NEW.estado_cocina IS DISTINCT FROM OLD.estado_cocina THEN NEW.estado:=OLD.estado; END IF;
 IF NEW.estado IS DISTINCT FROM OLD.estado AND
    NEW.estado IN ('buscando_repartidor','ofrecido','asignado','recibido','en_camino') AND
    NOT COALESCE(public.pedido_admite_repartidor(NEW),false) THEN
    RAISE EXCEPTION 'Pedido sin pago confirmado o cocina preparada';
 END IF;
 IF NEW.estado='buscando_repartidor' AND NEW.repartidor_id IS NOT NULL THEN RAISE EXCEPTION 'Búsqueda con propietario'; END IF;
 IF NEW.estado IN ('ofrecido','asignado','recibido','en_camino') AND NEW.repartidor_id IS NULL THEN RAISE EXCEPTION 'Estado de reparto sin propietario'; END IF;
 RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.aceptar_pedido_atomico(p_pedido_id uuid, p_repartidor_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE p public.pedidos; carga integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND
    (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_repartidor_id) THEN RETURN false; END IF;
 SELECT * INTO p FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p.repartidor_id=p_repartidor_id AND p.estado IN ('asignado','recibido','en_camino') THEN RETURN true; END IF;
 IF NOT COALESCE(public.pedido_admite_repartidor(p),false) OR
    NOT ((p.estado='ofrecido' AND p.repartidor_id=p_repartidor_id AND
          (p.oferta_vence_at IS NULL OR p.oferta_vence_at > clock_timestamp())) OR
         (p.estado='buscando_repartidor' AND p.repartidor_id IS NULL)) THEN RETURN false; END IF;
 PERFORM 1 FROM public.repartidores WHERE user_id=p_repartidor_id AND activo IS TRUE FOR UPDATE;
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
END; $$;

CREATE OR REPLACE FUNCTION public.asignar_pedido_atomico(p_pedido_id uuid, p_repartidor_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
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
END; $$;

CREATE OR REPLACE FUNCTION public.rechazar_pedido_atomico(p_pedido_id uuid, p_repartidor_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE p public.pedidos;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND
    (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_repartidor_id) THEN RETURN false; END IF;
 SELECT * INTO p FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p.repartidor_id=p_repartidor_id AND p.estado IN ('asignado','recibido','en_camino','entregado') THEN RETURN false; END IF;
 IF p_repartidor_id=ANY(COALESCE(p.ofertas_rechazadas,'{}'::uuid[])) THEN RETURN true; END IF;
 IF NOT ((p.estado='ofrecido' AND p.repartidor_id=p_repartidor_id) OR
         (p.estado='buscando_repartidor' AND p.repartidor_id IS NULL)) THEN RETURN false; END IF;
 PERFORM 1 FROM public.repartidores WHERE user_id=p_repartidor_id;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.pedidos SET ofertas_rechazadas=array_append(COALESCE(ofertas_rechazadas,'{}'::uuid[]),p_repartidor_id),
   estado='buscando_repartidor', repartidor_id=NULL, oferta_token=NULL, oferta_vence_at=NULL,
   despacho_reintentar_at=clock_timestamp() WHERE id=p_pedido_id;
 RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.avanzar_pedido_repartidor(p_pedido_id uuid, p_repartidor_id uuid,
 p_estado_anterior text, p_estado_nuevo text, p_lat_entrega double precision DEFAULT NULL,
 p_lng_entrega double precision DEFAULT NULL, p_pago_pendiente boolean DEFAULT NULL, p_pickup_pin text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
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
END; $$;

CREATE OR REPLACE FUNCTION public.expirar_oferta_pedido(p_pedido_id uuid, p_repartidor_id uuid, p_oferta_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN false; END IF;
 UPDATE public.pedidos SET estado='buscando_repartidor', repartidor_id=NULL,
   ofertas_rechazadas=array_append(COALESCE(ofertas_rechazadas,'{}'::uuid[]),p_repartidor_id),
   oferta_token=NULL, oferta_vence_at=NULL, despacho_reintentar_at=clock_timestamp()
 WHERE id=p_pedido_id AND estado='ofrecido' AND repartidor_id=p_repartidor_id
   AND oferta_token=p_oferta_token AND oferta_vence_at<=clock_timestamp();
 RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.reclamar_despacho_pedido(p_pedido_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE p public.pedidos;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN false; END IF;
 SELECT * INTO p FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;
 IF NOT FOUND OR p.estado<>'buscando_repartidor' OR p.repartidor_id IS NOT NULL OR
    NOT COALESCE(public.pedido_admite_repartidor(p),false) OR p.despacho_reintentar_at>clock_timestamp() THEN RETURN false; END IF;
 IF p.despacho_intentos>=6 THEN
   UPDATE public.pedidos SET despacho_incidente='requiere_asignacion_manual', despacho_reintentar_at=NULL WHERE id=p_pedido_id;
   RETURN false;
 END IF;
 UPDATE public.pedidos SET despacho_intentos=despacho_intentos+1,
   despacho_reintentar_at=clock_timestamp()+interval '30 seconds' WHERE id=p_pedido_id;
 RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.aceptar_pedido_atomico(uuid,uuid), public.rechazar_pedido_atomico(uuid,uuid),
 public.asignar_pedido_atomico(uuid,uuid), public.avanzar_pedido_repartidor(uuid,uuid,text,text,double precision,double precision,boolean,text),
 public.expirar_oferta_pedido(uuid,uuid,uuid), public.reclamar_despacho_pedido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aceptar_pedido_atomico(uuid,uuid), public.rechazar_pedido_atomico(uuid,uuid),
 public.avanzar_pedido_repartidor(uuid,uuid,text,text,double precision,double precision,boolean,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.asignar_pedido_atomico(uuid,uuid),public.expirar_oferta_pedido(uuid,uuid,uuid),
 public.reclamar_despacho_pedido(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_pedido_atomico(uuid,uuid),public.expirar_oferta_pedido(uuid,uuid,uuid),
 public.reclamar_despacho_pedido(uuid) TO service_role;

-- Keep the established scoring expression. Correct its active states and
-- require the canonical auth identity before returning an eligible driver.
DO $rank$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='buscar_repartidores_cercanos';
 IF definition IS NULL THEN RAISE EXCEPTION 'Falta buscar_repartidores_cercanos'; END IF;
 IF position('''preparando''' IN definition)>0 THEN
   definition:=replace(definition,'''ofrecido'', ''asignado'', ''preparando'', ''en_camino''',
                                   '''ofrecido'', ''asignado'', ''recibido'', ''en_camino''');
 END IF;
 IF position('''recibido''' IN definition)=0 THEN RAISE EXCEPTION 'Ranking activo no reconocido'; END IF;
 definition:=replace(definition,'WHERE r.activo = true','WHERE r.activo = true AND r.user_id IS NOT NULL');
 EXECUTE definition;
END; $rank$;
ALTER FUNCTION public.buscar_repartidores_cercanos(double precision,double precision,double precision,double precision,double precision)
 SET search_path = pg_catalog, public, extensions;
REVOKE ALL ON FUNCTION public.buscar_repartidores_cercanos(double precision,double precision,double precision,double precision,double precision) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_repartidores_cercanos(double precision,double precision,double precision,double precision,double precision) TO service_role;

-- RLS policies currently permit authenticated UPDATE true. Protect the actual
-- row as well, while preserving kitchen updates and admin operations. Definer
-- RPCs execute as the trusted table owner; direct driver requests cannot move
-- state, reassign an owner or change the price/payment.
CREATE OR REPLACE FUNCTION public.proteger_actualizacion_pedido()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF current_user IN ('postgres','supabase_admin') OR auth.role()='service_role' THEN RETURN NEW; END IF;
 IF actor IS NULL THEN RAISE EXCEPTION 'Se requiere sesión'; END IF;
 IF EXISTS(SELECT 1 FROM public.admins WHERE id=actor) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.restaurantes WHERE id=OLD.restaurante_id AND admin_id=actor) THEN
   IF (to_jsonb(NEW)-ARRAY['estado','estado_cocina','tiempo_preparacion_minutos','updated_at']) IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['estado','estado_cocina','tiempo_preparacion_minutos','updated_at']) THEN
      RAISE EXCEPTION 'La cocina no puede modificar asignación ni cobros';
   END IF;
   -- Kitchen readiness must not rewind an already accepted delivery.
   IF OLD.estado IN ('ofrecido','asignado','recibido','en_camino','entregado','cancelado') THEN NEW.estado:=OLD.estado; END IF;
   IF OLD.estado='pendiente_pago' AND NEW.estado IS DISTINCT FROM OLD.estado THEN RAISE EXCEPTION 'Pago pendiente'; END IF;
   IF NEW.estado NOT IN (OLD.estado,'buscando_repartidor','cancelado') THEN RAISE EXCEPTION 'Transición de cocina inválida'; END IF;
   RETURN NEW;
 END IF;
 IF OLD.repartidor_id=actor AND
   (to_jsonb(NEW)-ARRAY['foto_entrega_url','updated_at']) IS NOT DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['foto_entrega_url','updated_at']) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'La asignación y el avance requieren una RPC autorizada';
END; $$;
CREATE OR REPLACE TRIGGER zzz_proteger_actualizacion_pedido BEFORE UPDATE ON public.pedidos
 FOR EACH ROW EXECUTE FUNCTION public.proteger_actualizacion_pedido();

-- One authenticated server dispatch trigger replaces the two unsigned hooks.
-- The existing rescate cron is reused; no second frontend or ranking workflow.
CREATE OR REPLACE FUNCTION public.encolar_despacho_pedido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, vault, net AS $$
DECLARE dispatch_token text;
BEGIN
 IF NEW.estado<>'buscando_repartidor' OR NEW.repartidor_id IS NOT NULL OR
    NOT COALESCE(public.pedido_admite_repartidor(NEW),false) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.estado='buscando_repartidor' THEN RETURN NEW; END IF;
 SELECT decrypted_secret INTO dispatch_token FROM vault.decrypted_secrets WHERE name='estrella_dispatch_token' LIMIT 1;
 IF dispatch_token IS NULL OR length(dispatch_token)<32 THEN RAISE WARNING 'Token de despacho no configurado'; RETURN NEW; END IF;
 PERFORM net.http_post(url:='https://jdrrkpvodnqoljycixbg.supabase.co/functions/v1/asignar-repartidor',
   headers:=jsonb_build_object('Content-Type','application/json','x-dispatch-token',dispatch_token),
   body:=jsonb_build_object('id',NEW.id),timeout_milliseconds:=10000);
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS "Asignar Repartidor" ON public.pedidos;
DROP TRIGGER IF EXISTS "Asignar Repartidor_update" ON public.pedidos;
CREATE TRIGGER "Asignar Repartidor" AFTER INSERT OR UPDATE OF estado ON public.pedidos
 FOR EACH ROW EXECUTE FUNCTION public.encolar_despacho_pedido();
DO $cron$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='estrella_dispatch_token' AND length(decrypted_secret)>=32) THEN
   RAISE EXCEPTION 'Configurar primero estrella_dispatch_token en Vault y DISPATCH_TOKEN en Edge';
 END IF;
 PERFORM cron.schedule('rescate','* * * * *',$job$
   SELECT net.http_post(url:='https://jdrrkpvodnqoljycixbg.supabase.co/functions/v1/cron-rescate',
     headers:=jsonb_build_object('Content-Type','application/json','x-dispatch-token',
       (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='estrella_dispatch_token' LIMIT 1)),
     body:='{}'::jsonb,timeout_milliseconds:=10000);
 $job$);
END; $cron$;
NOTIFY pgrst, 'reload schema';
COMMIT;
