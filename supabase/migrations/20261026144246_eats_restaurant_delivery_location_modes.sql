BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.eats_restaurant_delivery_quotes
 ADD COLUMN pricing text NOT NULL DEFAULT 'manual',
 ADD COLUMN location_source text NOT NULL DEFAULT 'address',
 ADD COLUMN h3_index text;
ALTER TABLE public.eats_restaurant_delivery_quotes ADD CONSTRAINT eats_delivery_location_pricing CHECK(
 (pricing='manual' AND location_source='address' AND h3_index IS NULL)
 OR(pricing='h3' AND location_source='pin' AND h3_index ~ '^8a[0-9a-f]{13}$'
  AND jsonb_typeof(destination->'lat') IS NOT DISTINCT FROM 'number' AND jsonb_typeof(destination->'lng') IS NOT DISTINCT FROM 'number'));

CREATE OR REPLACE FUNCTION public.eats_restaurant_delivery_capability(p_restaurante_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $capability$
DECLARE r public.restaurantes;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.eats_restaurant_delivery_actor(auth.uid(),p_restaurante_id) THEN
  RETURN jsonb_build_object('enabled',false);
 END IF;
 SELECT * INTO STRICT r FROM public.restaurantes WHERE id=p_restaurante_id;
 RETURN jsonb_build_object('enabled',true,'pricing','location','defaultContribution',
  (SELECT default_contribution FROM public.eats_restaurant_delivery_access WHERE matriz_id=COALESCE(r.matriz_id,r.id)), 'origin',jsonb_build_object(
  'id',r.id,'name',r.nombre,'branch',COALESCE(r.nombre_sucursal,''),'address',COALESCE(r.direccion,''),'lat',r.lat,'lng',r.lng));
END;
$capability$;
CREATE OR REPLACE FUNCTION public.eats_restaurant_delivery_prepare(
 p_actor uuid,p_quote_id uuid,p_restaurante_id uuid,p_destination jsonb,
 p_fee numeric,p_food numeric,p_price_input text,p_contribution numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $prepare$
DECLARE r public.restaurantes; q public.eats_restaurant_delivery_quotes; contribution numeric; origin jsonb; v_lat float8; v_lng float8;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.eats_restaurant_delivery_actor(p_actor,p_restaurante_id) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='No tienes acceso a los envíos de esta sucursal.';
 END IF;
 IF p_quote_id IS NULL OR jsonb_typeof(p_destination) IS DISTINCT FROM 'object'
  OR NOT((jsonb_typeof(p_destination->'lat') IS NOT DISTINCT FROM 'number' AND jsonb_typeof(p_destination->'lng') IS NOT DISTINCT FROM 'number')
   OR(jsonb_typeof(p_destination->'lat') IS NOT DISTINCT FROM 'null' AND jsonb_typeof(p_destination->'lng') IS NOT DISTINCT FROM 'null'))
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
 IF v_lat IS NOT NULL AND NOT(v_lat BETWEEN -90 AND 90 AND v_lng BETWEEN -180 AND 180) THEN
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
  'customerToCollect',q.food+q.fee-q.contribution,'restaurantSettlement',q.food-q.contribution,'pricing',q.pricing,'locationSource',q.location_source,'h3Index',q.h3_index,'expiresAt',q.expires_at);
END;
$prepare$;

-- One financial path: this wrapper resolves the configured H3 price, then
-- delegates validation, budget, locking and the snapshot to the existing RPC.
-- Only trusted Edge derives resolution-10 H3 from the validated pin.
CREATE FUNCTION public.eats_restaurant_delivery_prepare_location(
 p_actor uuid,p_quote_id uuid,p_restaurante_id uuid,p_destination jsonb,p_source text,
 p_fee numeric,p_food numeric,p_price_input text,p_contribution numeric DEFAULT NULL,p_h3_index text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $location$
DECLARE fee numeric;matches bigint;q public.eats_restaurant_delivery_quotes;result jsonb;input text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.eats_restaurant_delivery_actor(p_actor,p_restaurante_id) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='No tienes acceso a los envíos de esta sucursal.';
 END IF;
 IF p_source IS NULL OR p_source NOT IN('pin','address') THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Elige pin de Maps o dirección escrita.';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,20261025));
 SELECT * INTO q FROM public.eats_restaurant_delivery_quotes WHERE id=p_quote_id FOR UPDATE;
 IF FOUND AND(q.location_source<>p_source OR q.h3_index IS DISTINCT FROM p_h3_index) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='El tipo de ubicación cambió. Revisa otra vez el envío.';
 END IF;
 IF p_source='pin' THEN
  IF p_fee IS NOT NULL OR p_h3_index IS NULL OR p_h3_index !~ '^8a[0-9a-f]{13}$'
   OR jsonb_typeof(p_destination->'lat') IS DISTINCT FROM 'number' OR jsonb_typeof(p_destination->'lng') IS DISTINCT FROM 'number' THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='El pin necesita una ubicación precisa; su tarifa la calcula el sistema.';
  END IF;
  IF q.id IS NOT NULL THEN fee:=q.fee;matches:=1;
  ELSE SELECT count(*),min(precio)::numeric INTO matches,fee FROM(SELECT precio FROM public.h3_zonas WHERE h3_index=p_h3_index LIMIT 2) tariff;END IF;
  IF matches<>1 OR fee IS NULL OR fee<=0 OR fee>10000 OR fee<>round(fee,2) THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='No hay una tarifa H3 válida para ese pin. Confirma la ubicación o usa dirección escrita con precio acordado.';
  END IF;
  input:='H3:'||p_h3_index;
 ELSE
  IF p_h3_index IS NOT NULL OR p_fee IS NULL THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Escribe el precio acordado para esta dirección.';
  END IF;
  fee:=p_fee;input:=p_price_input;
 END IF;
 result:=public.eats_restaurant_delivery_prepare(p_actor,p_quote_id,p_restaurante_id,p_destination,fee,p_food,input,p_contribution);
 UPDATE public.eats_restaurant_delivery_quotes SET pricing=CASE WHEN p_source='pin' THEN 'h3' ELSE 'manual' END,
  location_source=p_source,h3_index=p_h3_index WHERE id=p_quote_id;
 RETURN result||jsonb_build_object('pricing',CASE WHEN p_source='pin' THEN 'h3' ELSE 'manual' END,'locationSource',p_source,'h3Index',p_h3_index);
END;
$location$;
REVOKE ALL ON FUNCTION public.eats_restaurant_delivery_prepare_location(uuid,uuid,uuid,jsonb,text,numeric,numeric,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.eats_restaurant_delivery_prepare_location(uuid,uuid,uuid,jsonb,text,numeric,numeric,text,numeric,text) TO service_role;
ALTER FUNCTION public.eats_restaurant_delivery_prepare_location(uuid,uuid,uuid,jsonb,text,numeric,numeric,text,numeric,text) SET lock_timeout='2s';

CREATE OR REPLACE FUNCTION public.eats_restaurant_delivery_receipt(p_request_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $receipt$
 SELECT jsonb_build_object('requestId',r.id,'orderId',p.id,'state',p.estado,'fee',q.fee,'food',q.food,
  'restaurantContribution',q.contribution,'customerShipping',q.fee-q.contribution,
  'total',p.total,'restaurantSettlement',q.food-q.contribution,
  'pricing',q.pricing,'locationSource',q.location_source,'h3Index',q.h3_index,'createdAt',p.created_at,'trackingKey',p.access_token,'incident',p.despacho_incidente)
 FROM public.eats_restaurant_delivery_requests r JOIN public.pedidos p ON p.id=r.pedido_id
 JOIN public.eats_restaurant_delivery_quotes q ON q.id=r.quote_id WHERE r.id=p_request_id;
$receipt$;
CREATE OR REPLACE FUNCTION public.eats_restaurant_delivery_create(p_request_id uuid,p_input jsonb)
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
 description:=btrim(p_input->>'description')
  ||CASE WHEN q.destination->>'lat' IS NULL THEN E'\nDirección escrita, sin pin confirmado. Confirma la ubicación con el cliente antes de navegar.' ELSE '' END
  ||E'\n\nComida pendiente de cobro: $'||to_char(q.food,'FM999999990.00')
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
NOTIFY pgrst,'reload schema';
COMMIT;
