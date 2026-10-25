-- Run inside an outer transaction followed by ROLLBACK only. This exercises
-- the installed triggers but cannot commit a service, notification or pg_net job.
DO $check$
DECLARE matrix constant uuid:='fa1b9bc1-eefd-489d-8ae4-fd3682efe4dd';
 branch constant uuid:='2ae5eee1-132e-4609-926f-da35aa7553ba';
 actor uuid; quote uuid:=gen_random_uuid(); request uuid:=gen_random_uuid();
 input jsonb; result jsonb; again jsonb; p public.pedidos; before_orders bigint;
 before_notices bigint; before_net bigint; tracking jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM restaurantes WHERE id=matrix AND matriz_id IS NULL AND activo IS TRUE AND admin_id IS NOT NULL)
  OR NOT EXISTS(SELECT 1 FROM restaurantes WHERE id=branch AND matriz_id=matrix AND activo IS TRUE)
  OR(SELECT count(*) FROM restaurantes WHERE id=matrix OR matriz_id=matrix)<>3 THEN
  RAISE EXCEPTION 'Reviewed brand relationship changed';
 END IF;
 SELECT admin_id INTO STRICT actor FROM restaurantes WHERE id=matrix;
 SELECT count(*) INTO before_orders FROM pedidos;
 SELECT count(*) INTO before_notices FROM eats_order_notifications;
 SELECT count(*) INTO before_net FROM net.http_request_queue;
 INSERT INTO eats_restaurant_delivery_access(matriz_id,enabled,default_contribution) VALUES(matrix,true,15)
  ON CONFLICT(matriz_id) DO UPDATE SET enabled=true,default_contribution=15;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 IF(eats_restaurant_delivery_capability(branch)->>'enabled')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Branch capability failed';END IF;
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 result:=eats_restaurant_delivery_prepare(actor,quote,branch,
  jsonb_build_object('lat',16.25,'lng',-92.13,'address','PRUEBA ROLLBACK — NO ENVIAR'),50,200,'cincuenta pesos',NULL);
 IF result->>'pricing'<>'manual' OR(result->>'customerToCollect')::numeric<>235
  OR(result->>'restaurantSettlement')::numeric<>185 THEN RAISE EXCEPTION 'Manual quote does not reconcile';END IF;
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 input:=jsonb_build_object('quoteId',quote,'name','PRUEBA ROLLBACK — NO PREPARAR','phone','0000000000',
  'description','PRUEBA TRANSACCIONAL — NO PREPARAR NI COBRAR','references','','preparationMinutes',15);
 result:=eats_restaurant_delivery_create(request,input);
 again:=eats_restaurant_delivery_create(request,input);
 IF result IS DISTINCT FROM again OR result IS DISTINCT FROM eats_restaurant_delivery_result(request)
  OR(result->>'total')::numeric<>235 OR(result->>'fee')::numeric<>50
  OR(result->>'restaurantSettlement')::numeric<>185 THEN RAISE EXCEPTION 'Durable replay or settlement failed';END IF;
 SELECT * INTO STRICT p FROM pedidos WHERE id=(result->>'orderId')::uuid;
 IF p.restaurante_id<>branch OR p.estado<>'buscando_repartidor' OR p.estado_cocina<>'en_cocina'
  OR NOT pedido_admite_repartidor(p) OR p.pickup_pin !~ '^[0-9]{4}$' OR p.pin_seguridad IS NOT NULL
  OR p.total<>235 OR p.precio_entrega<>50 OR p.origen<>'portal_restaurante' THEN RAISE EXCEPTION 'Persisted service contract failed';END IF;
 IF(SELECT count(*) FROM pedidos)<>before_orders+1 THEN RAISE EXCEPTION 'Unexpected order duplication';END IF;
 IF(SELECT count(*) FROM eats_order_notifications)<>before_notices THEN RAISE EXCEPTION 'Manual acceptance created duplicate kitchen notices';END IF;
 IF(SELECT count(*) FROM net.http_request_queue)<=before_net THEN RAISE EXCEPTION 'Existing transactional wake was not queued';END IF;
 tracking:=storefront_tracking_read(p.id::text,p.access_token);
 IF tracking->'pedido'->>'id' IS DISTINCT FROM p.id::text OR(tracking->'pedido'->>'total')::numeric<>235
  OR tracking->'pedido'->>'pickup_pin' IS NOT NULL THEN RAISE EXCEPTION 'Tracking projection incompatible';END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true);
 PERFORM set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000099"}',true);
 IF eats_restaurant_delivery_result(request) IS NOT NULL THEN RAISE EXCEPTION 'Foreign receipt exposure';END IF;
 IF has_table_privilege('anon','public.eats_restaurant_delivery_requests','SELECT')
  OR has_table_privilege('authenticated','public.eats_restaurant_delivery_quotes','INSERT')
  OR has_function_privilege('authenticated','eats_restaurant_delivery_prepare(uuid,uuid,uuid,jsonb,numeric,numeric,text,numeric)','EXECUTE')
  OR has_function_privilege('anon','eats_restaurant_delivery_create(uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Privilege boundary failed';
 END IF;
END;
$check$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role','anon',true),set_config('request.jwt.claim.sub','',true),
 set_config('request.jwt.claims','{"role":"anon"}',true);
DO $anon_check$ BEGIN
 IF EXISTS(SELECT 1 FROM public.pedidos WHERE origen='portal_restaurante') THEN
  RAISE EXCEPTION 'New service is exposed through a legacy anonymous order policy';
 END IF;
END;$anon_check$;
RESET ROLE;
SELECT true AS verified, 'manual_50_15_35_235_185' AS settlement, true AS rollback_required;
