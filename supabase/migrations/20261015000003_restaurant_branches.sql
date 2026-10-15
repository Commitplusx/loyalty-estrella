-- Owner-managed branches use the existing restaurant identity and checkout.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE INDEX IF NOT EXISTS restaurantes_matriz_id_idx ON public.restaurantes(matriz_id);

CREATE OR REPLACE FUNCTION public.restaurant_upsert_branch(
 p_parent uuid, p_branch uuid, p_name text, p_phone text, p_address text,
 p_lat double precision, p_lng double precision, p_active boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout='5s' AS $function$
DECLARE parent public.restaurantes; branch public.restaurantes; phone text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Inicia sesión para administrar sucursales.';
 END IF;
 SELECT * INTO parent FROM public.restaurantes WHERE id=p_parent FOR UPDATE;
 IF NOT FOUND OR (parent.admin_id IS DISTINCT FROM auth.uid() AND NOT public.loyalty_is_admin()) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='No puedes administrar este restaurante.';
 END IF;
 IF parent.matriz_id IS NOT NULL OR parent.admin_id IS NULL OR p_branch IS NULL OR p_branch=p_parent THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Elige la sucursal principal de la marca.';
 END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 80 OR
    p_address IS NULL OR length(btrim(p_address)) NOT BETWEEN 5 AND 300 OR
    p_lat IS NULL OR NOT (p_lat BETWEEN -90 AND 90) OR
    p_lng IS NULL OR NOT (p_lng BETWEEN -180 AND 180) OR p_active IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Revisa el nombre, dirección y ubicación de la sucursal.';
 END IF;
 phone:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 IF length(phone)=12 AND left(phone,2)='52' THEN phone:=substring(phone FROM 3); END IF;
 IF phone !~ '^[0-9]{10}$' THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Escribe un teléfono de 10 dígitos.';
 END IF;
 SELECT * INTO branch FROM public.restaurantes WHERE id=p_branch FOR UPDATE;
 IF FOUND AND branch.matriz_id IS DISTINCT FROM p_parent THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='La sucursal no pertenece a esta marca.';
 END IF;
 -- The live schema has no unique phone constraint. Serialize this normalized
 -- identifier across brands, including an international-format legacy value.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('restaurant-phone:'||phone,0));
 IF EXISTS(SELECT 1 FROM public.restaurantes r WHERE r.id<>p_branch
  AND right(regexp_replace(coalesce(r.telefono,''),'[^0-9]','','g'),10)=phone) THEN
  RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Ese teléfono ya identifica otro restaurante o sucursal.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.restaurantes WHERE matriz_id=p_parent AND id<>p_branch
           AND lower(btrim(nombre_sucursal))=lower(btrim(p_name))) THEN
  RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='Ya existe una sucursal con ese nombre.';
 END IF;
 IF p_active AND NOT (EXISTS(SELECT 1 FROM public.menu_items WHERE restaurante_id=p_branch AND disponible IS TRUE)
  OR EXISTS(SELECT 1 FROM public.menu_combos WHERE restaurante_id=p_branch AND disponible IS TRUE)
  OR EXISTS(SELECT 1 FROM public.menu_promociones WHERE restaurante_id=p_branch AND activa IS TRUE)) THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Guarda la sucursal pausada y agrega su menú antes de mostrarla a los clientes.';
 END IF;
 IF branch.id IS NULL THEN
  IF parent.perfil_completo IS NOT TRUE THEN
   RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Completa el perfil de la sucursal principal antes de crear otra ubicación.';
  END IF;
  IF (SELECT count(*) FROM public.restaurantes WHERE matriz_id=p_parent)>=100 THEN
   RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Esta marca alcanzó el límite de sucursales.';
  END IF;
  INSERT INTO public.restaurantes(id,admin_id,matriz_id,es_matriz,nombre,nombre_sucursal,telefono,
   direccion,lat,lng,activo,perfil_completo,foto_fachada_url,logo_url,descripcion_corta,categorias,horarios,hora_apertura,hora_cierre)
  VALUES(p_branch,parent.admin_id,p_parent,false,parent.nombre,btrim(p_name),phone,btrim(p_address),p_lat,p_lng,p_active,parent.perfil_completo,
   parent.foto_fachada_url,parent.logo_url,parent.descripcion_corta,parent.categorias,parent.horarios,parent.hora_apertura,parent.hora_cierre)
  RETURNING * INTO branch;
 ELSE
  UPDATE public.restaurantes SET nombre_sucursal=btrim(p_name),telefono=phone,direccion=btrim(p_address),
   lat=p_lat,lng=p_lng,activo=p_active WHERE id=p_branch RETURNING * INTO branch;
 END IF;
 -- Return only the identifier; the existing SELECT policies control profile reads.
 RETURN jsonb_build_object('id',branch.id,'matriz_id',branch.matriz_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.restaurant_upsert_branch(uuid,uuid,text,text,text,double precision,double precision,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurant_upsert_branch(uuid,uuid,text,text,text,double precision,double precision,boolean) TO authenticated;
COMMIT;
