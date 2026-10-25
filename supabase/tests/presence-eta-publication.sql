DO $check$
DECLARE name text;distance float8;d record;
BEGIN
 FOREACH name IN ARRAY ARRAY['eats_dispatch_policy','eats_driver_presence','eats_dispatch_contexts','eats_dispatch_kitchen_clock'] LOOP
  IF has_table_privilege('anon','public.'||name,'SELECT') OR has_table_privilege('authenticated','public.'||name,'SELECT') THEN
   RAISE EXCEPTION 'Private dispatch table exposed';END IF;
 END LOOP;
 IF NOT has_function_privilege('authenticated','public.driver_presence_begin(uuid,uuid,uuid)','EXECUTE') OR
  has_function_privilege('anon','public.driver_presence_begin(uuid,uuid,uuid)','EXECUTE') OR
  has_function_privilege('authenticated','public.eats_offer_ranked(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Dispatch privileges incorrect';END IF;
 IF(SELECT count(*) FROM public.eats_dispatch_policy)<>1 OR NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='eats-dispatch-retention' AND active) THEN
  RAISE EXCEPTION 'Dispatch policy or retention missing';END IF;
 SELECT ST_DistanceSphere(ST_SetSRID(ST_MakePoint(-92.13,16.24),4326),ST_SetSRID(ST_MakePoint(-92.14,16.25),4326)) INTO distance;
 IF distance IS NULL OR distance<100 OR distance>5000 THEN RAISE EXCEPTION 'PostGIS contract unavailable';END IF;
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 FOR d IN SELECT id FROM public.repartidores ORDER BY id LIMIT 20 LOOP
  PERFORM public.eats_driver_dispatch_eligible(d.id,false);
  PERFORM public.eats_driver_dispatch_eligible(d.id,true);
 END LOOP;
 IF public.eats_dispatch_context('00000000-0000-4000-8000-000000000000') IS NOT NULL OR
  public.eats_offer_ranked('00000000-0000-4000-8000-000000000000','00000000-0000-4000-8000-000000000000','00000000-0000-4000-8000-000000000000') THEN
  RAISE EXCEPTION 'Nonexistent dispatch reported success';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='eats_capture_legacy_driver_contact' AND tgenabled='O') OR
  NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='eats_capture_kitchen_clock' AND tgenabled='O') THEN RAISE EXCEPTION 'Telemetry trigger missing';END IF;
END $check$;
SELECT 'presence_eta_contracts_verified' result;
