BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Abort if production differs from the reviewed, privately backed-up definition.
DO $$ BEGIN
 IF encode(sha256(convert_to(pg_get_functiondef('public.storefront_checked_cash_checkout(uuid,text,text,text,jsonb)'::regprocedure),'UTF8')),'hex') <> 'bfd6f3a87df930f9bb6b8a20566d04ad3317d9c6d19c819be83ca49df37f3222' THEN
  RAISE EXCEPTION 'Checkout differs from reviewed baseline; review before applying promotion rules';
 END IF;
END $$;
ALTER TABLE public.menu_promociones
 ADD COLUMN tipos_pedido text[] NOT NULL DEFAULT ARRAY['tienda','domicilio']::text[],
 ADD CONSTRAINT menu_promociones_tipos_pedido_valid CHECK (
  tipos_pedido IN (ARRAY['tienda']::text[],ARRAY['domicilio']::text[],ARRAY['tienda','domicilio']::text[],ARRAY['domicilio','tienda']::text[])
 );
COMMENT ON COLUMN public.menu_promociones.tipos_pedido IS 'Order fulfilment modes: tienda=pickup, domicilio=delivery. Evaluated in canonical checkout, not a display-only restriction.';
CREATE OR REPLACE FUNCTION public.storefront_checked_cash_checkout(p_challenge uuid, p_phone text, p_code_hash text, p_request_hash text, p_order jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE c public.checkout_otp_challenges; existing public.pedidos; inserted public.pedidos; idem uuid;
 version jsonb; product jsonb; stamp jsonb; coupon jsonb;
 benefit_customer public.clientes; benefit_source text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF p_phone !~ '^[0-9]{10}$' OR p_request_hash !~ '^[0-9a-f]{64}$' OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
  RETURN jsonb_build_object('error','Verificación inválida.');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('checkout-phone:'||p_phone,0));
 SELECT * INTO c FROM public.checkout_otp_challenges WHERE id=p_challenge FOR UPDATE;
 IF NOT FOUND OR c.telefono<>p_phone OR c.status NOT IN ('sent','used') OR c.intentos>=5 THEN
  RETURN jsonb_build_object('error','Solicita un código nuevo.');
 END IF;
 IF c.code_hash<>p_code_hash THEN
  UPDATE public.checkout_otp_challenges SET intentos=intentos+1 WHERE id=c.id;
  RETURN jsonb_build_object('error','Código incorrecto.');
 END IF;
 IF c.status='used' THEN
  IF c.request_hash<>p_request_hash OR c.used_at<now()-interval '30 minutes' THEN
   RETURN jsonb_build_object('error','Esta verificación corresponde a otro pedido o expiró.');
  END IF;
  SELECT * INTO existing FROM public.pedidos WHERE id=c.pedido_id;
  RETURN jsonb_build_object('pedido',to_jsonb(existing),'replayed',true);
 END IF;
 IF c.expires_at<=now() THEN RETURN jsonb_build_object('error','El código expiró. Solicita otro.'); END IF;
 idem:=(p_order->>'idempotency_key')::uuid;
 IF idem IS DISTINCT FROM c.idempotency_key OR p_order->>'cliente_tel' IS DISTINCT FROM p_phone
    OR p_order->>'metodo_pago' IS DISTINCT FROM 'efectivo' OR p_order->>'tipo_pedido' NOT IN ('domicilio','tienda') THEN
  RETURN jsonb_build_object('error','El pedido no corresponde a esta verificación.');
 END IF;
 SELECT * INTO existing FROM public.pedidos WHERE idempotency_key=idem;
 IF FOUND THEN RETURN jsonb_build_object('error','Este pedido ya fue registrado. Consulta su estado.'); END IF;
 IF EXISTS(SELECT 1 FROM public.pedidos WHERE right(regexp_replace(cliente_tel,'\D','','g'),10)=p_phone
  AND estado IN ('pendiente','buscando_repartidor','ofrecido','asignado','recibido','en_camino')) THEN
  RETURN jsonb_build_object('error','Ya tienes un pedido en curso. Consulta su estado antes de pedir de nuevo.');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.restaurantes WHERE id=(p_order->>'restaurante_id')::uuid AND activo=true) THEN
  RETURN jsonb_build_object('error','El restaurante ya no acepta pedidos.');
 END IF;
 -- Lock and recheck the exact catalogue snapshot validated by the Edge. A menu
 -- edit between quote and commit must not create an order at a stale price.
 IF jsonb_typeof(p_order->'_catalog') IS DISTINCT FROM 'array' OR jsonb_array_length(p_order->'_catalog') NOT BETWEEN 1 AND 150 THEN
  RETURN jsonb_build_object('error','No se pudo verificar el catálogo.');
 END IF;
 FOR version IN SELECT value FROM jsonb_array_elements(p_order->'_catalog') ORDER BY value->>'kind',value->'stamp'->>'id' LOOP
  product:=NULL;
  CASE version->>'kind'
   WHEN 'item' THEN SELECT to_jsonb(m) INTO product FROM public.menu_items m WHERE id=(version->'stamp'->>'id')::uuid FOR UPDATE;
   WHEN 'combo' THEN SELECT to_jsonb(m) INTO product FROM public.menu_combos m WHERE id=(version->'stamp'->>'id')::uuid FOR UPDATE;
   WHEN 'promo' THEN SELECT to_jsonb(m) INTO product FROM public.menu_promociones m WHERE id=(version->'stamp'->>'id')::uuid FOR UPDATE;
   ELSE RETURN jsonb_build_object('error','Catálogo inválido.');
  END CASE;
  stamp:=jsonb_build_object('id',product->'id','restaurante_id',product->'restaurante_id',
   'price',COALESCE((product->>'precio_especial')::numeric,(product->>'precio')::numeric),
   'opciones',COALESCE(product->'opciones','null'::jsonb),
   'disponible',COALESCE(NULLIF(product->'disponible','null'::jsonb),'true'::jsonb),
   'activo',COALESCE(NULLIF(product->'activa','null'::jsonb),NULLIF(product->'activo','null'::jsonb),'true'::jsonb),
   'agotado_hoy',COALESCE(NULLIF(product->'agotado_hoy','null'::jsonb),'false'::jsonb),
   'aplica_subsidio',COALESCE(NULLIF(product->'aplica_subsidio','null'::jsonb),'true'::jsonb));
  IF product IS NULL OR stamp IS DISTINCT FROM version->'stamp' OR product->>'restaurante_id'<>p_order->>'restaurante_id' THEN
   RETURN jsonb_build_object('error','El menú cambió. Revisa el pedido y solicita un código nuevo.');
  END IF;
  -- Evaluate current rules while the existing catalogue row lock is held.
  -- Never trust modalities/days/expiry sent by the browser or a cached quote.
  IF version->>'kind'='promo' THEN
   IF (product->'tipos_pedido' ? (p_order->>'tipo_pedido')) IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('error',COALESCE(product->>'titulo','Esta promoción')||
     CASE WHEN product->'tipos_pedido' ? 'tienda' THEN ': solo para recoger en sucursal. Cambia la entrega o retírala del carrito.'
     ELSE ': solo a domicilio. Cambia la entrega o retírala del carrito.' END,'code','promotion_delivery_restricted');
   END IF;
   IF product->>'activa' IS DISTINCT FROM 'true'
    OR (product->>'fecha_fin')::date < (now() AT TIME ZONE 'America/Mexico_City')::date
    OR (jsonb_array_length(COALESCE(NULLIF(product->'dias_aplicacion','null'::jsonb),'[]'::jsonb))>0
      AND NOT ((product->'dias_aplicacion') ? (ARRAY['lun','mar','mie','jue','vie','sab','dom'])[extract(isodow FROM now() AT TIME ZONE 'America/Mexico_City')::integer])) THEN
    RETURN jsonb_build_object('error',COALESCE(product->>'titulo','Esta promoción')||': no está disponible hoy. Revisa las promociones del menú.','code','promotion_unavailable');
   END IF;
  END IF;
 END LOOP;
 IF p_order->>'_coupon_id' IS NOT NULL THEN
  IF (p_order->>'_coupon_restaurant')::boolean THEN
   SELECT to_jsonb(q) INTO coupon FROM public.cupones_restaurante q WHERE id=(p_order->>'_coupon_id')::uuid FOR UPDATE;
  ELSE
   SELECT to_jsonb(q) INTO coupon FROM public.cupones_plataforma q WHERE id=(p_order->>'_coupon_id')::uuid FOR UPDATE;
  END IF;
  IF coupon IS NULL OR coupon->>'activo' IS DISTINCT FROM 'true'
   OR coupon->>'tipo' IS DISTINCT FROM p_order->>'_coupon_type' OR (coupon->>'valor')::numeric IS DISTINCT FROM (p_order->>'_coupon_value')::numeric
   OR (coupon->>'fecha_fin')::timestamptz<now()
   OR ((coupon->>'uso_maximo')::integer>0 AND (coupon->>'usos_actuales')::integer>=(coupon->>'uso_maximo')::integer) THEN
   RETURN jsonb_build_object('error','El cupón ya no está disponible. Revisa el resumen.');
  END IF;
 END IF;
 IF COALESCE((p_order->>'_benefit')::boolean,false) THEN
  IF p_order->>'tipo_pedido' IS DISTINCT FROM 'domicilio' THEN
   RETURN jsonb_build_object('error','Al recoger en tienda no necesitas usar un beneficio de envío.');
  END IF;
  SELECT * INTO benefit_customer FROM public.clientes WHERE telefono=p_phone FOR UPDATE;
  IF NOT FOUND OR benefit_customer.es_vip IS TRUE THEN
   RETURN jsonb_build_object('error','No tienes un envío gratis disponible.');
  END IF;
  IF COALESCE(benefit_customer.envios_gratis_disponibles,0)>0 THEN benefit_source:='available_delivery';
  ELSIF COALESCE(benefit_customer.puntos,0)>=6 THEN benefit_source:='points';
  ELSE RETURN jsonb_build_object('error','Tu beneficio cambió. Revisa el pedido antes de confirmarlo.');
  END IF;
 END IF;
 INSERT INTO public.pedidos(cliente_tel,cliente_nombre,restaurante_id,restaurante,restaurante_lat,restaurante_lng,
  descripcion,direccion,referencias_entrega,lat,lng,total,precio_entrega,descuento_plataforma,cupon_plataforma_id,
  tipo_pedido,metodo_pago,estado,estado_pago,estado_cocina,origen,items,idempotency_key,wb_message_id,pickup_pin,pin_seguridad)
 VALUES(p_phone,p_order->>'cliente_nombre',(p_order->>'restaurante_id')::uuid,p_order->>'restaurante',
  (p_order->>'restaurante_lat')::double precision,(p_order->>'restaurante_lng')::double precision,
  p_order->>'descripcion',p_order->>'direccion',p_order->>'referencias_entrega',
  (p_order->>'lat')::double precision,(p_order->>'lng')::double precision,(p_order->>'total')::numeric,
  CASE WHEN p_order->>'tipo_pedido'='tienda' THEN 0 ELSE (p_order->>'precio_entrega')::numeric END,
  (p_order->>'descuento_plataforma')::numeric,(p_order->>'cupon_plataforma_id')::uuid,
  p_order->>'tipo_pedido','efectivo','pendiente','pendiente','pendiente','web',p_order->'items',idem,
  p_order->>'wb_message_id',p_order->>'pickup_pin',p_order->>'pin_seguridad') RETURNING * INTO inserted;
 IF benefit_source IS NOT NULL THEN
  UPDATE public.clientes SET
   envios_gratis_disponibles=COALESCE(envios_gratis_disponibles,0)-CASE WHEN benefit_source='available_delivery' THEN 1 ELSE 0 END,
   puntos=COALESCE(puntos,0)-CASE WHEN benefit_source='points' THEN 6 ELSE 0 END
  WHERE id=benefit_customer.id;
  INSERT INTO public.checkout_benefit_redemptions(pedido_id,cliente_id,source,points_used)
  VALUES(inserted.id,benefit_customer.id,benefit_source,CASE WHEN benefit_source='points' THEN 6 ELSE 0 END);
  INSERT INTO public.registros_puntos(cliente_id,tipo,puntos,descripcion)
  VALUES(benefit_customer.id,'canje',CASE WHEN benefit_source='points' THEN -6 ELSE 0 END,'Beneficio de envío aplicado al pedido '||inserted.id::text);
 END IF;
 UPDATE public.checkout_otp_challenges SET status='used',pedido_id=inserted.id,request_hash=p_request_hash,used_at=now() WHERE id=c.id;
 IF coupon IS NOT NULL THEN
  IF (p_order->>'_coupon_restaurant')::boolean THEN
   UPDATE public.cupones_restaurante SET usos_actuales=COALESCE(usos_actuales,0)+1 WHERE id=(coupon->>'id')::uuid;
  ELSE
   UPDATE public.cupones_plataforma SET usos_actuales=COALESCE(usos_actuales,0)+1 WHERE id=(coupon->>'id')::uuid;
  END IF;
 END IF;
 RETURN jsonb_build_object('pedido',to_jsonb(inserted),'replayed',false);
END $function$
;
REVOKE ALL ON FUNCTION public.storefront_checked_cash_checkout(uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_checked_cash_checkout(uuid,text,text,text,jsonb) TO service_role;
COMMIT;
