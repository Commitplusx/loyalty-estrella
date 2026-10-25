DO $check$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(r,'public.eats_dispatch_recovery_batch(integer,timestamptz)','EXECUTE') OR
       has_function_privilege(r,'public.dispatch_recovery_due(timestamptz)','EXECUTE') THEN
      RAISE EXCEPTION 'Recovery selection exposed to client role';
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role','public.eats_dispatch_recovery_batch(integer,timestamptz)','EXECUTE') OR
     (SELECT prosecdef FROM pg_proc WHERE oid='public.eats_dispatch_recovery_batch(integer,timestamptz)'::regprocedure) THEN
    RAISE EXCEPTION 'Recovery selection privilege contract changed';
  END IF;
  IF public.dispatch_recovery_due() IS DISTINCT FROM
     EXISTS(SELECT 1 FROM public.eats_dispatch_recovery_batch(1)) THEN
    RAISE EXCEPTION 'Cron and recovery batch disagree';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.eats_dispatch_recovery_batch() b JOIN public.pedidos p USING(id)
    WHERE NOT(p.estado='ofrecido' AND p.oferta_vence_at<=now())
      AND NOT(p.estado='buscando_repartidor' AND p.repartidor_id IS NULL
        AND COALESCE(public.pedido_admite_repartidor(p),false)
        AND(p.despacho_reintentar_at<=now() OR
          (p.despacho_reintentar_at IS NULL AND p.despacho_incidente IS NULL)))
  ) THEN RAISE EXCEPTION 'Ineligible row consumed recovery batch'; END IF;
END $check$;
SELECT 'recovery_filter_contracts_verified' result;
