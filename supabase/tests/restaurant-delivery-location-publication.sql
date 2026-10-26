-- Execute in an outer transaction followed by ROLLBACK. No service or pg_net
-- wake may be committed by publication QA.
DO $check$
DECLARE matrix constant uuid:='fa1b9bc1-eefd-489d-8ae4-fd3682efe4dd';branch constant uuid:='2ae5eee1-132e-4609-926f-da35aa7553ba';
 actor uuid;qid uuid;rid uuid;result jsonb;input jsonb;p public.pedidos;fee numeric;before_orders bigint;before_notices bigint;before_net bigint;
BEGIN
 SELECT admin_id INTO STRICT actor FROM restaurantes WHERE id=matrix AND matriz_id IS NULL;
 IF NOT EXISTS(SELECT 1 FROM restaurantes WHERE id=branch AND matriz_id=matrix AND activo IS TRUE)
  OR NOT EXISTS(SELECT 1 FROM eats_restaurant_delivery_access WHERE matriz_id=matrix AND enabled AND default_contribution=15) THEN RAISE EXCEPTION 'Reviewed branch entitlement changed';END IF;
 SELECT count(*) INTO before_orders FROM pedidos;SELECT count(*) INTO before_notices FROM eats_order_notifications;SELECT count(*) INTO before_net FROM net.http_request_queue;
 SELECT precio INTO STRICT fee FROM h3_zonas WHERE h3_index='8a6d2e884807fff';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 IF eats_restaurant_delivery_capability(branch)->>'pricing'<>'location' THEN RAISE EXCEPTION 'Capability did not advertise location pricing';END IF;
 FOR counter IN 1..2 LOOP
  qid:=gen_random_uuid();rid:=gen_random_uuid();PERFORM set_config('request.jwt.claim.role','service_role',true);
  IF counter=1 THEN
   result:=eats_restaurant_delivery_prepare_location(actor,qid,branch,
    jsonb_build_object('lat',16.25,'lng',-92.13,'address','PIN QA ROLLBACK — NO ENVIAR'),'pin',NULL,200,'',NULL,'8a6d2e884807fff');
   IF result->>'pricing'<>'h3' OR(result->>'fee')::numeric<>fee OR(result->>'customerToCollect')::numeric<>200+fee-15 THEN RAISE EXCEPTION 'H3 tariff snapshot failed';END IF;
  ELSE
   result:=eats_restaurant_delivery_prepare_location(actor,qid,branch,
    jsonb_build_object('lat',NULL,'lng',NULL,'address','DIRECCIÓN ESCRITA QA — NO ENVIAR'),'address',50,200,'cincuenta pesos',NULL,NULL);
   IF result->>'pricing'<>'manual' OR result->'destination'->>'lat' IS NOT NULL OR(result->>'customerToCollect')::numeric<>235 THEN RAISE EXCEPTION 'Written-address quote failed';END IF;
  END IF;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  input:=jsonb_build_object('quoteId',qid,'name','PRUEBA ROLLBACK — NO PREPARAR','phone','0000000000','description','PRUEBA TRANSACCIONAL — NO PREPARAR NI COBRAR','references','','preparationMinutes',15);
  result:=eats_restaurant_delivery_create(rid,input);
  IF result IS DISTINCT FROM eats_restaurant_delivery_create(rid,input) THEN RAISE EXCEPTION 'Idempotent replay changed';END IF;
  SELECT * INTO STRICT p FROM pedidos WHERE id=(result->>'orderId')::uuid;
  IF p.restaurante_id<>branch OR NOT pedido_admite_repartidor(p) OR p.estado<>'buscando_repartidor' OR p.pin_seguridad IS NOT NULL THEN RAISE EXCEPTION 'Existing dispatch contract failed';END IF;
  IF counter=1 THEN
   IF p.precio_entrega<>fee OR p.total<>200+fee-15 OR p.lat<>16.25 OR p.lng<>-92.13 THEN RAISE EXCEPTION 'Persisted H3 receipt changed';END IF;
   PERFORM set_config('test.delivery_pin',p.id::text,true);
  ELSE
   IF p.total<>235 OR p.precio_entrega<>50 OR p.lat IS NOT NULL OR p.lng IS NOT NULL OR p.lat_entrega IS NOT NULL OR p.lng_entrega IS NOT NULL
    OR p.restaurante_lat IS NULL OR p.descripcion NOT LIKE '%sin pin confirmado%' THEN RAISE EXCEPTION 'Written-address order invented a point or lost pickup';END IF;
   PERFORM set_config('test.delivery_text',p.id::text,true);
  END IF;
  IF storefront_tracking_read(p.id::text,p.access_token)->'pedido'->>'id' IS DISTINCT FROM p.id::text THEN RAISE EXCEPTION 'Tracking projection incompatible';END IF;
 END LOOP;
 IF(SELECT count(*) FROM pedidos)<>before_orders+2 OR(SELECT count(*) FROM eats_order_notifications)<>before_notices OR(SELECT count(*) FROM net.http_request_queue)<=before_net THEN RAISE EXCEPTION 'Duplicate order/notice or absent transactional wake';END IF;
 IF has_function_privilege('authenticated','eats_restaurant_delivery_prepare_location(uuid,uuid,uuid,jsonb,text,numeric,numeric,text,numeric,text)','EXECUTE')
  OR has_function_privilege('anon','eats_restaurant_delivery_prepare_location(uuid,uuid,uuid,jsonb,text,numeric,numeric,text,numeric,text)','EXECUTE') THEN RAISE EXCEPTION 'Privileged quote RPC exposed';END IF;
END;$check$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role','anon',true),set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"anon"}',true);
DO $private$ BEGIN
 IF EXISTS(SELECT 1 FROM public.pedidos WHERE id IN(current_setting('test.delivery_pin')::uuid,current_setting('test.delivery_text')::uuid)) THEN RAISE EXCEPTION 'Synthetic service visible anonymously';END IF;
END;$private$;
RESET ROLE;
SELECT true AS verified,true AS h3_and_written_address,true AS rollback_required;
