BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Explicit brand entitlement, independent from public names, numbers or WABA.
CREATE TABLE public.eats_restaurant_delivery_access (
  matriz_id uuid PRIMARY KEY REFERENCES public.restaurantes(id),
  enabled boolean NOT NULL DEFAULT false,
  default_contribution numeric NOT NULL DEFAULT 15 CHECK(default_contribution BETWEEN 0 AND 10000 AND default_contribution=round(default_contribution,2))
);
CREATE TABLE public.eats_restaurant_delivery_quotes (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes(id),
  destination jsonb NOT NULL,
  origin jsonb NOT NULL,
  price_input text NOT NULL CHECK(length(price_input)<=100),
  fee numeric NOT NULL CHECK(fee>0 AND fee<=10000 AND fee=round(fee,2)),
  food numeric NOT NULL CHECK(food BETWEEN 0 AND 100000 AND food=round(food,2)),
  contribution numeric NOT NULL CHECK(contribution BETWEEN 0 AND fee AND contribution=round(contribution,2)),
  contribution_override numeric,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes'
);
CREATE INDEX eats_restaurant_delivery_quote_actor_idx ON public.eats_restaurant_delivery_quotes(actor_id,created_at);
CREATE TABLE public.eats_restaurant_delivery_requests (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes(id),
  quote_id uuid NOT NULL UNIQUE REFERENCES public.eats_restaurant_delivery_quotes(id),
  input_hash bytea NOT NULL,
  pedido_id uuid NOT NULL UNIQUE REFERENCES public.pedidos(id) DEFERRABLE INITIALLY DEFERRED,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX eats_restaurant_delivery_request_rest_idx ON public.eats_restaurant_delivery_requests(restaurante_id,created_at DESC);
ALTER TABLE public.eats_restaurant_delivery_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eats_restaurant_delivery_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eats_restaurant_delivery_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.eats_restaurant_delivery_access,public.eats_restaurant_delivery_quotes,public.eats_restaurant_delivery_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.eats_restaurant_delivery_access,public.eats_restaurant_delivery_quotes,public.eats_restaurant_delivery_requests TO service_role;

CREATE FUNCTION public.eats_restaurant_delivery_actor(p_actor uuid,p_restaurante uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $actor$
 SELECT p_actor IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.restaurantes r
  JOIN public.eats_restaurant_delivery_access a ON a.matriz_id=COALESCE(r.matriz_id,r.id) AND a.enabled
  WHERE r.id=p_restaurante AND r.activo IS TRUE AND
   (r.admin_id=p_actor OR EXISTS(SELECT 1 FROM public.restaurantes parent
    WHERE parent.id=r.matriz_id AND parent.matriz_id IS NULL AND parent.admin_id=p_actor))
 );
$actor$;
REVOKE ALL ON FUNCTION public.eats_restaurant_delivery_actor(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.eats_can_read_restaurant_delivery(p_restaurante uuid,p_owner uuid,p_state text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $read_order$
 SELECT auth.uid() IS NOT NULL AND(public.loyalty_manages_restaurant(p_restaurante) OR p_owner=auth.uid()
  OR(p_owner IS NULL AND p_state='buscando_repartidor' AND EXISTS(
   SELECT 1 FROM public.repartidores r WHERE r.user_id=auth.uid() AND r.activo IS TRUE)));
$read_order$;
REVOKE ALL ON FUNCTION public.eats_can_read_restaurant_delivery(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eats_can_read_restaurant_delivery(uuid,uuid,text) TO anon,authenticated;
-- Narrow only the new origin; established order consumers remain unchanged.
CREATE POLICY eats_restaurant_delivery_order_isolation ON public.pedidos AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(origen IS DISTINCT FROM 'portal_restaurante' OR public.eats_can_read_restaurant_delivery(restaurante_id,repartidor_id,estado));

CREATE FUNCTION public.eats_restaurant_delivery_lock_actor(p_actor uuid,p_restaurante uuid)
RETURNS public.restaurantes LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $lock_actor$
DECLARE r public.restaurantes;
BEGIN
 SELECT * INTO r FROM public.restaurantes WHERE id=p_restaurante FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='No tienes acceso a los envíos de esta sucursal.';END IF;
 -- Hold the branch, matrix ownership and entitlement stable until commit.
 PERFORM 1 FROM public.restaurantes WHERE id=COALESCE(r.matriz_id,r.id) FOR SHARE;
 PERFORM 1 FROM public.eats_restaurant_delivery_access WHERE matriz_id=COALESCE(r.matriz_id,r.id) FOR SHARE;
 IF NOT public.eats_restaurant_delivery_actor(p_actor,r.id) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='No tienes acceso a los envíos de esta sucursal.';
 END IF;
 RETURN r;
END;
$lock_actor$;
REVOKE ALL ON FUNCTION public.eats_restaurant_delivery_lock_actor(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.eats_restaurant_delivery_capability(p_restaurante_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $capability$
DECLARE r public.restaurantes;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.eats_restaurant_delivery_actor(auth.uid(),p_restaurante_id) THEN
  RETURN jsonb_build_object('enabled',false);
 END IF;
 SELECT * INTO STRICT r FROM public.restaurantes WHERE id=p_restaurante_id;
 RETURN jsonb_build_object('enabled',true,'pricing','manual','defaultContribution',
  (SELECT default_contribution FROM public.eats_restaurant_delivery_access WHERE matriz_id=COALESCE(r.matriz_id,r.id)), 'origin',jsonb_build_object(
  'id',r.id,'name',r.nombre,'branch',COALESCE(r.nombre_sucursal,''),'address',COALESCE(r.direccion,''),'lat',r.lat,'lng',r.lng));
END;
$capability$;
REVOKE ALL ON FUNCTION public.eats_restaurant_delivery_capability(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eats_restaurant_delivery_capability(uuid) TO authenticated;

-- Manual price is explicitly supplied by an authorized operator, parsed by a
-- finite grammar in Edge and snapshotted here. No automatic zone-price claim.
CREATE FUNCTION public.eats_restaurant_delivery_prepare(
 p_actor uuid,p_quote_id uuid,p_restaurante_id uuid,p_destination jsonb,
 p_fee numeric,p_food numeric,p_price_input text,p_contribution numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $prepare$
DECLARE r public.restaurantes; q public.eats_restaurant_delivery_quotes; contribution numeric; origin jsonb; v_lat float8; v_lng float8;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.eats_restaurant_delivery_actor(p_actor,p_restaurante_id) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='No tienes acceso a los envíos de esta sucursal.';
 END IF;
 IF p_quote_id IS NULL OR jsonb_typeof(p_destination) IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_destination->'lat') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_destination->'lng') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_destination->'address') IS DISTINCT FROM 'string'
  OR length(btrim(p_destination->>'address')) NOT BETWEEN 5 AND 300
  OR p_price_input IS NULL OR length(p_price_input)>100 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Confirma una ubicación de entrega válida.';
 END IF;
 IF p_fee IS NULL OR p_food IS NULL OR NOT(p_fee>0 AND p_fee<=10000 AND p_food BETWEEN 0 AND 100000)
  OR round(p_fee,2)<>p_fee OR round(p_food,2)<>p_food
  OR p_contribution IS NOT NULL AND NOT(p_contribution BETWEEN 0 AND p_fee AND round(p_contribution,2)=p_contribution) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Revisa los importes: la aportación no puede superar el envío.';
 END IF;
 v_lat:=(p_destination->>'lat')::float8;v_lng:=(p_destination->>'lng')::float8;
 IF NOT(v_lat BETWEEN -90 AND 90 AND v_lng BETWEEN -180 AND 180) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Confirma una ubicación de entrega válida.';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,20261025));
 SELECT * INTO q FROM public.eats_restaurant_delivery_quotes WHERE id=p_quote_id FOR UPDATE;
 IF FOUND THEN
  IF q.actor_id<>p_actor OR q.restaurante_id<>p_restaurante_id OR q.destination<>p_destination OR q.fee<>p_fee
   OR q.food<>p_food OR q.price_input<>p_price_input OR q.contribution_override IS DISTINCT FROM p_contribution THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='La cotización corresponde a otros datos. Vuelve a calcular.';
  END IF;
 ELSE
  -- Opportunistic, actor-scoped cleanup: bounded and never removes a consumed
  -- financial receipt. This is not a competing cron or dispatch worker.
  DELETE FROM public.eats_restaurant_delivery_quotes stale WHERE stale.id IN(
   SELECT old.id FROM public.eats_restaurant_delivery_quotes old
   WHERE old.actor_id=p_actor AND old.created_at<clock_timestamp()-interval '1 day'
    AND NOT EXISTS(SELECT 1 FROM public.eats_restaurant_delivery_requests used WHERE used.quote_id=old.id)
   ORDER BY old.created_at LIMIT 50);
  IF(SELECT count(*) FROM public.eats_restaurant_delivery_quotes WHERE actor_id=p_actor AND created_at>clock_timestamp()-interval '1 minute')>=20
   OR(SELECT count(*) FROM public.eats_restaurant_delivery_quotes WHERE actor_id=p_actor AND created_at>clock_timestamp()-interval '1 hour')>=100 THEN
   RAISE EXCEPTION USING ERRCODE='PT429',MESSAGE='Espera un momento antes de calcular otro envío.';
  END IF;
  r:=public.eats_restaurant_delivery_lock_actor(p_actor,p_restaurante_id);
  IF r.lat IS NULL OR r.lng IS NULL OR NOT(r.lat BETWEEN -90 AND 90 AND r.lng BETWEEN -180 AND 180) THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='La sucursal necesita una ubicación válida antes de solicitar envíos.';
  END IF;
  SELECT COALESCE(p_contribution,LEAST(p_fee,a.default_contribution)) INTO STRICT contribution
   FROM public.eats_restaurant_delivery_access a WHERE a.matriz_id=COALESCE(r.matriz_id,r.id) AND a.enabled;
  origin:=jsonb_build_object('id',r.id,'name',r.nombre,'branch',COALESCE(r.nombre_sucursal,''),'address',COALESCE(r.direccion,''),'lat',r.lat,'lng',r.lng);
  INSERT INTO public.eats_restaurant_delivery_quotes(id,actor_id,restaurante_id,destination,origin,price_input,fee,food,contribution,contribution_override)
   VALUES(p_quote_id,p_actor,p_restaurante_id,p_destination,origin,p_price_input,p_fee,p_food,contribution,p_contribution) RETURNING * INTO q;
 END IF;
 IF q.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='La cotización venció. Vuelve a calcular el envío.';
 END IF;
 RETURN jsonb_build_object('id',q.id,'restaurantId',q.restaurante_id,'destination',q.destination,'origin',q.origin,
  'fee',q.fee,'food',q.food,'restaurantContribution',q.contribution,'customerShipping',q.fee-q.contribution,
  'customerToCollect',q.food+q.fee-q.contribution,'restaurantSettlement',q.food-q.contribution,'pricing','manual','expiresAt',q.expires_at);
END;
$prepare$;
REVOKE ALL ON FUNCTION public.eats_restaurant_delivery_prepare(uuid,uuid,uuid,jsonb,numeric,numeric,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eats_restaurant_delivery_prepare(uuid,uuid,uuid,jsonb,numeric,numeric,text,numeric) TO service_role;
ALTER FUNCTION public.eats_restaurant_delivery_prepare(uuid,uuid,uuid,jsonb,numeric,numeric,text,numeric) SET lock_timeout='2s';

CREATE FUNCTION public.eats_restaurant_delivery_receipt(p_request_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $receipt$
 SELECT jsonb_build_object('requestId',r.id,'orderId',p.id,'state',p.estado,'fee',q.fee,'food',q.food,
  'restaurantContribution',q.contribution,'customerShipping',q.fee-q.contribution,
  'total',p.total,'restaurantSettlement',q.food-q.contribution,
  'createdAt',p.created_at,'trackingKey',p.access_token,'incident',p.despacho_incidente)
 FROM public.eats_restaurant_delivery_requests r JOIN public.pedidos p ON p.id=r.pedido_id
 JOIN public.eats_restaurant_delivery_quotes q ON q.id=r.quote_id WHERE r.id=p_request_id;
$receipt$;
REVOKE ALL ON FUNCTION public.eats_restaurant_delivery_receipt(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.eats_restaurant_delivery_result(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $result$
DECLARE r public.eats_restaurant_delivery_requests;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Inicia sesión para consultar tus envíos.';
 END IF;
 SELECT * INTO r FROM public.eats_restaurant_delivery_requests WHERE id=p_request_id;
 IF NOT FOUND OR NOT public.eats_restaurant_delivery_actor(auth.uid(),r.restaurante_id) THEN RETURN NULL;END IF;
 RETURN public.eats_restaurant_delivery_receipt(r.id);
END;
$result$;
REVOKE ALL ON FUNCTION public.eats_restaurant_delivery_result(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eats_restaurant_delivery_result(uuid) TO authenticated;

CREATE FUNCTION public.eats_restaurant_delivery_recent(p_restaurante_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $recent$
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.eats_restaurant_delivery_actor(auth.uid(),p_restaurante_id) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='No tienes acceso a los envíos de esta sucursal.';
 END IF;
 RETURN COALESCE((SELECT jsonb_agg(public.eats_restaurant_delivery_receipt(r.id) ORDER BY r.created_at DESC,r.id)
  FROM(SELECT id,created_at FROM public.eats_restaurant_delivery_requests WHERE restaurante_id=p_restaurante_id
   AND created_at>=now()-interval '30 days' ORDER BY created_at DESC,id LIMIT 20)r),'[]'::jsonb);
END;
$recent$;
REVOKE ALL ON FUNCTION public.eats_restaurant_delivery_recent(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eats_restaurant_delivery_recent(uuid) TO authenticated;

CREATE FUNCTION public.eats_restaurant_delivery_create(p_request_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $create$
DECLARE actor uuid:=auth.uid();r public.restaurantes;q public.eats_restaurant_delivery_quotes;
 request public.eats_restaurant_delivery_requests;hash bytea;pid uuid:=gen_random_uuid();
 prep integer;customer text;phone text;description text;refs text;settlement numeric;label text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR actor IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Inicia sesión para solicitar un envío.';
 END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>12000
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input)k WHERE k NOT IN('quoteId','name','phone','description','references','preparationMinutes')) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Revisa los datos del envío.';
 END IF;
 hash:=sha256(convert_to(p_input::text,'UTF8'));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,20261025));
 SELECT * INTO request FROM public.eats_restaurant_delivery_requests WHERE id=p_request_id FOR UPDATE;
 IF FOUND THEN
  IF request.actor_id<>actor OR request.input_hash<>hash OR NOT public.eats_restaurant_delivery_actor(actor,request.restaurante_id) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Esta referencia ya corresponde a otro envío. Consulta su resultado antes de continuar.';
  END IF;
  RETURN public.eats_restaurant_delivery_receipt(request.id);
 END IF;
 IF jsonb_typeof(p_input->'quoteId') IS DISTINCT FROM 'string'
  OR (p_input->>'quoteId') !~ '^[0-9a-fA-F-]{36}$'
  OR jsonb_typeof(p_input->'name') IS DISTINCT FROM 'string' OR length(btrim(p_input->>'name')) NOT BETWEEN 2 AND 100
  OR jsonb_typeof(p_input->'phone') IS DISTINCT FROM 'string' OR(p_input->>'phone') !~ '^[0-9]{10}$'
  OR jsonb_typeof(p_input->'description') IS DISTINCT FROM 'string' OR length(btrim(p_input->>'description')) NOT BETWEEN 3 AND 2000
  OR jsonb_typeof(p_input->'references') IS DISTINCT FROM 'string' OR length(p_input->>'references')>500
  OR jsonb_typeof(p_input->'preparationMinutes') IS DISTINCT FROM 'number'
  OR(p_input->>'preparationMinutes')::numeric NOT BETWEEN 0 AND 120
  OR trunc((p_input->>'preparationMinutes')::numeric)<>(p_input->>'preparationMinutes')::numeric THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Completa nombre, teléfono, pedido y tiempo de preparación.';
 END IF;
 SELECT * INTO q FROM public.eats_restaurant_delivery_quotes WHERE id=(p_input->>'quoteId')::uuid FOR UPDATE;
 IF NOT FOUND OR q.actor_id<>actor OR NOT public.eats_restaurant_delivery_actor(actor,q.restaurante_id) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='No tienes una cotización válida para esta sucursal.';
 END IF;
 IF q.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='El resumen venció. Revisa de nuevo los importes antes de enviar.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.eats_restaurant_delivery_requests WHERE quote_id=q.id) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Ese resumen ya se usó. Consulta los envíos recientes.';
 END IF;
 r:=public.eats_restaurant_delivery_lock_actor(actor,q.restaurante_id);
 IF r.lat IS DISTINCT FROM(q.origin->>'lat')::float8 OR r.lng IS DISTINCT FROM(q.origin->>'lng')::float8
  OR r.nombre IS DISTINCT FROM q.origin->>'name' OR COALESCE(r.nombre_sucursal,'') IS DISTINCT FROM q.origin->>'branch' THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='La sucursal cambió. Revisa otra vez el resumen.';
 END IF;
 prep:=(p_input->>'preparationMinutes')::integer;customer:=btrim(p_input->>'name');phone:=p_input->>'phone';refs:=btrim(p_input->>'references');
 settlement:=q.food-q.contribution;label:=concat_ws(' · ',r.nombre,NULLIF(r.nombre_sucursal,''));
 description:=btrim(p_input->>'description')||E'\n\nComida pendiente de cobro: $'||to_char(q.food,'FM999999990.00')
  ||E'\nEnvío total: $'||to_char(q.fee,'FM999999990.00')||' (Robin''s $'||to_char(q.contribution,'FM999999990.00')||' + cliente $'||to_char(q.fee-q.contribution,'FM999999990.00')||').'
  ||E'\nCobrar al cliente: $'||to_char(q.food+q.fee-q.contribution,'FM999999990.00')
  ||CASE WHEN settlement>=0 THEN E'\nEntregar a la sucursal: $'||to_char(settlement,'FM999999990.00')||'. Su parte del envío ya está descontada.'
    ELSE E'\nRecibir de la sucursal: $'||to_char(-settlement,'FM999999990.00')||' para completar el envío. No volver a cobrárselo al cliente.' END;
 -- Persist the link before order triggers, in the same transaction. The FK is
 -- deferred; rollback removes the link, order, logs, and pg_net wake together.
 INSERT INTO public.eats_restaurant_delivery_requests(id,actor_id,restaurante_id,quote_id,input_hash,pedido_id)
  VALUES(p_request_id,actor,r.id,q.id,hash,pid);
 INSERT INTO public.pedidos(id,restaurante_id,restaurante,restaurante_lat,restaurante_lng,cliente_nombre,cliente_tel,
  descripcion,direccion,referencias_entrega,lat,lng,lat_entrega,lng_entrega,total,precio_entrega,tipo_pedido,
  metodo_pago,estado_pago,estado,estado_cocina,tiempo_preparacion_minutos,origen,destino,items,idempotency_key,wb_message_id,pickup_pin,pin_seguridad)
 VALUES(pid,r.id,label,r.lat,r.lng,customer,phone,description,q.destination->>'address',refs,
  (q.destination->>'lat')::float8,(q.destination->>'lng')::float8,(q.destination->>'lat')::float8,(q.destination->>'lng')::float8,
  q.food+q.fee-q.contribution,q.fee,'restaurante_delivery','efectivo','pendiente','buscando_repartidor',
  CASE WHEN prep=0 THEN 'listo_para_recoger' ELSE 'en_cocina' END,prep,'portal_restaurante',q.destination->>'address',
  '[]'::jsonb,p_request_id,'EE-'||upper(substr(replace(pid::text,'-',''),1,12)),lpad(floor(random()*10000)::text,4,'0'),NULL);
 IF NOT EXISTS(SELECT 1 FROM public.pedidos WHERE id=pid AND estado='buscando_repartidor' AND repartidor_id IS NULL
  AND public.pedido_admite_repartidor(pedidos) AND total=q.food+q.fee-q.contribution AND precio_entrega=q.fee) THEN
  RAISE EXCEPTION 'Restaurant delivery order was not persisted with its expected contract';
 END IF;
 RETURN public.eats_restaurant_delivery_receipt(p_request_id);
END;
$create$;
REVOKE ALL ON FUNCTION public.eats_restaurant_delivery_create(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eats_restaurant_delivery_create(uuid,jsonb) TO authenticated;
ALTER FUNCTION public.eats_restaurant_delivery_create(uuid,jsonb) SET lock_timeout='2s';

-- Existing order outbox and status templates also cover genuine portal receipts.
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
END $function$;

-- Activation is intentionally separate from schema installation and requires
-- an explicit, verified matrix ID; no name-based automatic entitlement.
NOTIFY pgrst,'reload schema';
COMMIT;
