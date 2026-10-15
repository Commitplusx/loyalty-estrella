-- Separate Auth identities for locations; the existing root still manages its brand.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.restaurant_branch_access (
 branch_id uuid PRIMARY KEY REFERENCES public.restaurantes(id),
 parent_id uuid NOT NULL REFERENCES public.restaurantes(id),
 owner_id uuid NOT NULL,
 auth_user_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 phone text NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
 linked boolean NOT NULL DEFAULT false,
 lease_token uuid,
 lease_until timestamptz,
 last_started_at timestamptz,
 last_completed_at timestamptz
);
ALTER TABLE public.restaurant_branch_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_branch_access FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.restaurant_branch_access TO service_role;

CREATE OR REPLACE FUNCTION public.loyalty_manages_restaurant(p_restaurante_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.loyalty_is_admin() OR EXISTS(
 SELECT 1 FROM public.restaurantes r WHERE r.id=p_restaurante_id AND
 (r.admin_id=auth.uid() OR EXISTS(SELECT 1 FROM public.restaurantes parent
 WHERE parent.id=r.matriz_id AND parent.matriz_id IS NULL AND parent.admin_id=auth.uid())));
$$;

CREATE FUNCTION public.begin_branch_access(p_parent uuid,p_branch uuid,p_rotate boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parent public.restaurantes; branch public.restaurantes; access public.restaurant_branch_access; token uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Inicia sesión para administrar los accesos.';
 END IF;
 SELECT * INTO parent FROM public.restaurantes WHERE id=p_parent FOR UPDATE;
 IF NOT FOUND OR parent.matriz_id IS NOT NULL OR parent.admin_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Sólo la cuenta principal puede generar accesos de esta marca.';
 END IF;
 SELECT * INTO branch FROM public.restaurantes WHERE id=p_branch FOR UPDATE;
 IF NOT FOUND OR branch.matriz_id IS DISTINCT FROM p_parent OR branch.telefono !~ '^[0-9]{10}$' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='No puedes generar el acceso de esta sucursal.';
 END IF;
 SELECT * INTO access FROM public.restaurant_branch_access WHERE branch_id=p_branch FOR UPDATE;
 IF NOT FOUND THEN
  IF branch.admin_id IS DISTINCT FROM parent.admin_id THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Esta sucursal ya tiene otro acceso. Revisa su cuenta antes de reemplazarla.';
  END IF;
  INSERT INTO public.restaurant_branch_access(branch_id,parent_id,owner_id,phone)
  VALUES(p_branch,p_parent,parent.admin_id,branch.telefono) RETURNING * INTO access;
 END IF;
 IF access.owner_id IS DISTINCT FROM parent.admin_id OR access.parent_id<>p_parent OR access.phone<>branch.telefono THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='El acceso cambió. Vuelve a consultar la sucursal.';
 END IF;
 IF access.lease_until>now() THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Hay una generación de acceso en curso. Espera un momento antes de reintentar.';
 END IF;
 IF access.linked AND NOT p_rotate THEN
  RETURN jsonb_build_object('decision','exists','phone',access.phone);
 END IF;
 IF access.last_started_at>now()-interval '60 seconds' THEN
  RAISE EXCEPTION USING ERRCODE='PT429',MESSAGE='Espera un minuto antes de generar otra contraseña.';
 END IF;
 token:=gen_random_uuid();
 UPDATE public.restaurant_branch_access SET lease_token=token,lease_until=now()+interval '90 seconds',last_started_at=now()
 WHERE branch_id=p_branch;
 RETURN jsonb_build_object('decision','reserved','phone',access.phone,'auth_user_id',access.auth_user_id,'lease_token',token,'linked',access.linked);
END $$;
REVOKE ALL ON FUNCTION public.begin_branch_access(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_branch_access(uuid,uuid,boolean) TO authenticated;

CREATE FUNCTION public.complete_branch_access(p_branch uuid,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE access public.restaurant_branch_access; branch public.restaurantes; parent public.restaurantes;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Operación de servidor.';
 END IF;
 -- Same lock order as begin/upsert: root, branch, reservation.
 SELECT r.* INTO parent FROM public.restaurantes r JOIN public.restaurant_branch_access a ON a.parent_id=r.id WHERE a.branch_id=p_branch FOR UPDATE OF r;
 SELECT * INTO branch FROM public.restaurantes WHERE id=p_branch FOR UPDATE;
 SELECT * INTO access FROM public.restaurant_branch_access WHERE branch_id=p_branch FOR UPDATE;
 IF NOT FOUND OR p_token IS NULL OR access.lease_token IS NULL OR access.lease_until IS NULL
  OR access.lease_token IS DISTINCT FROM p_token OR access.lease_until<=now()
  OR branch.matriz_id IS DISTINCT FROM access.parent_id OR parent.admin_id IS DISTINCT FROM access.owner_id
  OR branch.telefono IS DISTINCT FROM access.phone
  OR (branch.admin_id IS DISTINCT FROM access.owner_id AND branch.admin_id IS DISTINCT FROM access.auth_user_id) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='La generación de acceso venció o cambió de propietario.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=access.auth_user_id
  AND lower(u.email)='aliado_'||access.phone||'@app-estrella.shop'
  AND u.raw_app_meta_data->>'restaurant_branch_id'=p_branch::text) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='El proveedor no confirmó la identidad de esta sucursal.';
 END IF;
 UPDATE public.restaurantes SET admin_id=access.auth_user_id WHERE id=p_branch;
 UPDATE public.restaurant_branch_access SET linked=true,lease_token=NULL,lease_until=NULL,last_completed_at=now() WHERE branch_id=p_branch;
 RETURN jsonb_build_object('ok',true,'branch_id',p_branch);
END $$;
REVOKE ALL ON FUNCTION public.complete_branch_access(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_branch_access(uuid,uuid) TO service_role;

CREATE FUNCTION public.release_branch_access(p_branch uuid,p_token uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Operación de servidor.'; END IF;
 UPDATE public.restaurant_branch_access SET lease_token=NULL,lease_until=NULL WHERE branch_id=p_branch AND lease_token=p_token;
END $$;
REVOKE ALL ON FUNCTION public.release_branch_access(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_branch_access(uuid,uuid) TO service_role;

CREATE INDEX IF NOT EXISTS restaurantes_phone_identity_idx ON public.restaurantes
 ((right(regexp_replace(coalesce(telefono,''),'[^0-9]','','g'),10)));
CREATE FUNCTION public.guard_branch_login_phone() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE phone text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.telefono IS NOT DISTINCT FROM OLD.telefono THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.restaurant_branch_access WHERE branch_id=OLD.id) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Ese número identifica el acceso de la sucursal. Contacta a soporte para cambiarlo junto con su cuenta.';
 END IF;
 phone:=right(regexp_replace(coalesce(NEW.telefono,''),'[^0-9]','','g'),10);
 IF length(phone)=10 THEN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('restaurant-phone:'||phone,0));
  IF EXISTS(SELECT 1 FROM public.restaurantes r WHERE r.id<>NEW.id
   AND right(regexp_replace(coalesce(r.telefono,''),'[^0-9]','','g'),10)=phone) THEN
   RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Ese teléfono ya identifica otro restaurante o sucursal.';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_branch_login_phone() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_branch_login_phone BEFORE INSERT OR UPDATE ON public.restaurantes FOR EACH ROW EXECUTE FUNCTION public.guard_branch_login_phone();

CREATE FUNCTION public.guard_restaurant_brand() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.matriz_id IS NOT NULL AND NEW.nombre IS DISTINCT FROM (SELECT nombre FROM public.restaurantes WHERE id=NEW.matriz_id) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='El nombre de la marca se administra desde la cuenta principal. Cambia el nombre de sucursal para identificar tu local.';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_restaurant_brand() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_restaurant_brand BEFORE INSERT OR UPDATE OF nombre,matriz_id ON public.restaurantes FOR EACH ROW EXECUTE FUNCTION public.guard_restaurant_brand();
CREATE FUNCTION public.sync_restaurant_brand() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.matriz_id IS NULL AND NEW.nombre IS DISTINCT FROM OLD.nombre THEN
  UPDATE public.restaurantes SET nombre=NEW.nombre WHERE matriz_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_restaurant_brand() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_restaurant_brand AFTER UPDATE OF nombre ON public.restaurantes FOR EACH ROW EXECUTE FUNCTION public.sync_restaurant_brand();

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['menu_categorias','menu_items','menu_combos','menu_promociones'] LOOP
  EXECUTE format('CREATE POLICY branch_brand_owner ON public.%I FOR ALL TO authenticated USING (public.loyalty_manages_restaurant(restaurante_id)) WITH CHECK (public.loyalty_manages_restaurant(restaurante_id))',t);
 END LOOP;
END $$;
CREATE POLICY branch_brand_orders ON public.pedidos FOR SELECT TO authenticated USING(public.loyalty_manages_restaurant(restaurante_id));
-- Historic public tracking policies remain during their separate app cutover.
-- A restrictive policy also applies when one of those permissive policies is true.
CREATE FUNCTION public.is_branch_login_actor() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.restaurant_branch_access a WHERE a.auth_user_id=auth.uid() AND a.linked);
$$;
REVOKE ALL ON FUNCTION public.is_branch_login_actor() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_branch_login_actor() TO authenticated;
CREATE POLICY branch_login_order_isolation ON public.pedidos AS RESTRICTIVE FOR SELECT TO authenticated
 USING (NOT public.is_branch_login_actor() OR public.loyalty_manages_restaurant(restaurante_id));
COMMIT;
