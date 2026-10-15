-- Exact guard from 20261012000001_internal_security_boundaries.sql, deployed before branches.
CREATE OR REPLACE FUNCTION public.loyalty_guard_restaurant_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
 IF auth.role() = 'authenticated' AND NOT public.loyalty_is_admin() THEN
  IF ROW(NEW.id,NEW.admin_id,NEW.es_matriz,NEW.matriz_id,NEW.es_socio,
         NEW.comision_porcentaje,NEW.mp_access_token,NEW.mp_refresh_token,
         NEW.mp_user_id,NEW.stripe_account_id,NEW.envios_gratis_patrocinados,
         NEW.puntos_otorgados_total,NEW.clientes_afiliados_count)
     IS DISTINCT FROM
     ROW(OLD.id,OLD.admin_id,OLD.es_matriz,OLD.matriz_id,OLD.es_socio,
         OLD.comision_porcentaje,OLD.mp_access_token,OLD.mp_refresh_token,
         OLD.mp_user_id,OLD.stripe_account_id,OLD.envios_gratis_patrocinados,
         OLD.puntos_otorgados_total,OLD.clientes_afiliados_count) THEN
   RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Restaurant identity and financial fields require server or admin authorization';
  END IF;
 END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.loyalty_guard_restaurant_identity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS loyalty_guard_restaurant_identity ON public.restaurantes;
CREATE TRIGGER loyalty_guard_restaurant_identity BEFORE UPDATE ON public.restaurantes
FOR EACH ROW EXECUTE FUNCTION public.loyalty_guard_restaurant_identity();

