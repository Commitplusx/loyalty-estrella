BEGIN;

-- Selection only: the existing claim/expiry/offer RPCs retain ownership and
-- revalidate concurrent state. Ineligible search rows cannot consume the batch.
CREATE OR REPLACE FUNCTION public.eats_dispatch_recovery_batch(
  p_limit integer DEFAULT 50, p_at timestamptz DEFAULT now()
) RETURNS TABLE(id uuid, estado text, repartidor_id uuid, oferta_token uuid)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public AS $batch$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 OR
     p_at IS NULL OR NOT isfinite(p_at) THEN
    RAISE EXCEPTION 'Invalid dispatch recovery batch';
  END IF;
  RETURN QUERY
    SELECT p.id, p.estado::text, p.repartidor_id, p.oferta_token
    FROM public.pedidos p
    WHERE (p.estado = 'ofrecido' AND p.oferta_vence_at <= p_at)
       OR (p.estado = 'buscando_repartidor' AND p.repartidor_id IS NULL
           AND COALESCE(public.pedido_admite_repartidor(p), false)
           AND (p.despacho_reintentar_at <= p_at OR
                (p.despacho_reintentar_at IS NULL AND p.despacho_incidente IS NULL)))
    ORDER BY p.created_at, p.id
    LIMIT p_limit;
END;
$batch$;
REVOKE ALL ON FUNCTION public.eats_dispatch_recovery_batch(integer,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eats_dispatch_recovery_batch(integer,timestamptz)
  TO service_role;

-- Cron and handler share the same predicate and database clock.
CREATE OR REPLACE FUNCTION public.dispatch_recovery_due(p_at timestamptz DEFAULT now())
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public AS $due$
  SELECT EXISTS (SELECT 1 FROM public.eats_dispatch_recovery_batch(1, p_at));
$due$;
REVOKE ALL ON FUNCTION public.dispatch_recovery_due(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_recovery_due(timestamptz) TO service_role;

COMMENT ON FUNCTION public.eats_dispatch_recovery_batch(integer,timestamptz) IS
  'Server-only bounded rescue selection using dispatch admission before LIMIT. No claims, ownership changes, notifications or inferred cancellation.';
COMMENT ON FUNCTION public.dispatch_recovery_due(timestamptz) IS
  'Existence gate for the established rescue cron, sharing its authoritative batch predicate. No claims or assignment.';
NOTIFY pgrst, 'reload schema';
COMMIT;
