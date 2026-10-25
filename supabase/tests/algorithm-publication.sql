-- Read-only contract checks for a migration trial or committed installation.
DO $check$
DECLARE result_count integer; at_role text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.pedidos'::regclass
  AND conname='pedidos_oferta_completa' AND convalidated) THEN RAISE EXCEPTION 'Offer integrity is not validated';END IF;
 IF has_function_privilege('anon','public.buscar_repartidores_cercanos(double precision,double precision,double precision,double precision,double precision,uuid[])','EXECUTE') OR
  has_function_privilege('authenticated','public.buscar_repartidores_cercanos(double precision,double precision,double precision,double precision,double precision,uuid[])','EXECUTE') OR
  NOT has_function_privilege('service_role','public.buscar_repartidores_cercanos(double precision,double precision,double precision,double precision,double precision,uuid[])','EXECUTE') THEN
  RAISE EXCEPTION 'Dispatch search permissions changed';END IF;
 IF EXISTS(SELECT 1 FROM public.pedidos WHERE estado='ofrecido' AND
  (repartidor_id IS NULL OR oferta_token IS NULL OR oferta_vence_at IS NULL OR NOT isfinite(oferta_vence_at))) THEN RAISE EXCEPTION 'Malformed active offer';END IF;
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 SELECT count(*) INTO result_count FROM public.buscar_repartidores_cercanos(16.24::double precision,(-92.13)::double precision,
  5000::double precision,NULL::double precision,NULL::double precision,'{}'::uuid[]);
 IF result_count>10 THEN RAISE EXCEPTION 'Unbounded ranking';END IF;
 IF EXISTS(SELECT 1 FROM public.buscar_repartidores_cercanos(16.24::double precision,(-92.13)::double precision,
  5000::double precision,NULL::double precision,NULL::double precision,'{}'::uuid[]) c WHERE c.score IS NULL OR c.score IN('NaN'::double precision,'Infinity'::double precision,'-Infinity'::double precision)) THEN
  RAISE EXCEPTION 'Invalid live PostGIS score';END IF;
 IF EXISTS(SELECT 1 FROM public.buscar_repartidores_cercanos(NULL::double precision,NULL::double precision,
  5000::double precision,NULL::double precision,NULL::double precision,'{}'::uuid[]) c
  WHERE EXISTS(SELECT 1 FROM public.pedidos p WHERE p.repartidor_id=c.user_id AND p.estado='ofrecido')) THEN
  RAISE EXCEPTION 'Busy offer entered fallback candidates';END IF;
 IF(SELECT count(*) FROM public.buscar_repartidores_cercanos(16.24::double precision,(-92.13)::double precision))>10 THEN
  RAISE EXCEPTION 'Legacy API compatibility failed';END IF;
 IF position('p_estado_nuevo=''entregado''' IN pg_get_functiondef('public.avanzar_pedido_repartidor(uuid,uuid,text,text,double precision,double precision,boolean,text)'::regprocedure))=0 THEN
  RAISE EXCEPTION 'Delivery contract unexpectedly changed';END IF;
END $check$;
SELECT 'algorithm_contracts_verified_read_only' AS result;
