BEGIN;

-- The rescue cron still checks every minute. Invoke the existing authenticated
-- Edge handler only when its exact recovery predicate has eligible rows.
-- This is an existence check, never a claim or a competing assignment path.
CREATE OR REPLACE FUNCTION public.dispatch_recovery_due(p_at timestamptz DEFAULT now())
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public AS $due$
  SELECT EXISTS (
    SELECT 1 FROM public.pedidos
    WHERE (estado = 'ofrecido' AND oferta_vence_at <= p_at)
       OR (estado = 'buscando_repartidor' AND despacho_reintentar_at <= p_at)
       OR (estado = 'buscando_repartidor' AND despacho_reintentar_at IS NULL
           AND despacho_incidente IS NULL)
  );
$due$;
REVOKE ALL ON FUNCTION public.dispatch_recovery_due(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_recovery_due(timestamptz) TO service_role;

DO $migration$
DECLARE rescue cron.job%ROWTYPE; expected text; guarded text;
BEGIN
  -- Compare the established contract before changing only this command.
  -- Credentials remain in Vault; no key is copied into SQL or a new service.
  expected := $job$
   SELECT net.http_post(url:='https://jdrrkpvodnqoljycixbg.supabase.co/functions/v1/cron-rescate',
     headers:=jsonb_build_object('Content-Type','application/json','x-dispatch-token',
       (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='estrella_dispatch_token' LIMIT 1)),
     body:='{}'::jsonb,timeout_milliseconds:=10000);
 $job$;
  guarded := regexp_replace(expected, ';\s*$',
    ' WHERE public.dispatch_recovery_due();');
  SELECT * INTO STRICT rescue FROM cron.job WHERE jobname = 'rescate';
  IF rescue.schedule <> '* * * * *' OR NOT rescue.active THEN
    RAISE EXCEPTION 'DISPATCH_RESCUE_SCHEDULE_CHANGED';
  END IF;
  IF rescue.command = guarded THEN RETURN; END IF;
  IF rescue.command IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'DISPATCH_RESCUE_COMMAND_CHANGED';
  END IF;
  PERFORM cron.alter_job(rescue.jobid, command := guarded);
END;
$migration$;

COMMENT ON FUNCTION public.dispatch_recovery_due(timestamptz) IS
  'Server-only existence gate for the established rescue cron. Same due predicate as cron-rescate; no claims, assignment or customer output.';
NOTIFY pgrst, 'reload schema';
COMMIT;
