-- Run against the reviewed schema/candidate; everything (including pg_net work) rolls back.
BEGIN;
SET LOCAL statement_timeout='30s';
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.restaurantes(id,nombre,activo) VALUES
 ('91600000-0000-4000-8000-000000000001','QA PROMOTION RULES — NO PREPARAR',true),
 ('91600000-0000-4000-8000-000000000002','QA OTHER BRANCH — NO PREPARAR',true);
INSERT INTO public.menu_promociones(id,restaurante_id,titulo,precio_especial,activa,aplica_subsidio,opciones)
VALUES('91600000-0000-4000-8000-000000000003','91600000-0000-4000-8000-000000000001','QA PROMOTION',100,true,false,'[]');
CREATE TEMP TABLE promotion_cases AS SELECT i, '00000004'||lpad(i::text,2,'0') phone,
 ('91600000-0000-4000-8000-0000000001'||lpad(i::text,2,'0'))::uuid challenge,
 ('91600000-0000-4000-8000-0000000002'||lpad(i::text,2,'0'))::uuid idem FROM generate_series(0,19) i;
INSERT INTO public.checkout_otp_challenges(id,telefono,idempotency_key,code_hash,expires_at,status)
SELECT challenge,phone,idem,repeat('a',64),now()+interval '5 minutes','sent' FROM promotion_cases;
CREATE TEMP TABLE promotion_assertions(name text PRIMARY KEY);
CREATE FUNCTION pg_temp.promo_order(p_case integer,p_mode text,p_other_branch boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c record;p public.menu_promociones;payload jsonb;stamp jsonb;
BEGIN
 SELECT * INTO STRICT c FROM promotion_cases WHERE i=p_case;
 SELECT * INTO STRICT p FROM public.menu_promociones WHERE id='91600000-0000-4000-8000-000000000003';
 stamp:=jsonb_build_object('id',p.id,'restaurante_id',p.restaurante_id,'price',100,'opciones','[]'::jsonb,
  'disponible',true,'activo',p.activa,'agotado_hoy',false,'aplica_subsidio',false);
 payload:=jsonb_build_object('idempotency_key',c.idem,'cliente_tel',c.phone,'cliente_nombre','QA PROMOTION RULES',
  'restaurante_id',CASE WHEN p_other_branch THEN '91600000-0000-4000-8000-000000000002' ELSE p.restaurante_id::text END,
  'restaurante','QA PROMOTION RULES — NO PREPARAR','restaurante_lat',16.2,'restaurante_lng',-92.1,
  'descripcion','PRUEBA TRANSACCIONAL — NO PREPARAR','direccion','QA ONLY','lat',16.2,'lng',-92.1,
  'total',100,'precio_entrega',0,'descuento_plataforma',0,'tipo_pedido',p_mode,'metodo_pago','efectivo',
  'items',jsonb_build_array(jsonb_build_object('cantidad',1,'item',jsonb_build_object('id',p.id,'tipo','promo','nombre',p.titulo,'precio',100))),
  '_catalog',jsonb_build_array(jsonb_build_object('kind','promo','stamp',stamp)),'_benefit',false,
  'wb_message_id','QA-RULE-'||p_case,'pickup_pin',CASE WHEN p_mode='domicilio' THEN '0000' END,'pin_seguridad',CASE WHEN p_mode='domicilio' THEN '0000' END);
 RETURN public.checkout_cash_order(c.challenge,c.phone,repeat('a',64),repeat('b',64),payload);
END $$;
CREATE FUNCTION pg_temp.expect_promo_error(p_case integer,p_mode text,p_code text,p_name text,p_other boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
DECLARE result jsonb;
BEGIN
 result:=pg_temp.promo_order(p_case,p_mode,p_other);
 IF result->>'error' IS NULL OR (p_code IS NOT NULL AND result->>'code' IS DISTINCT FROM p_code) THEN RAISE EXCEPTION '% did not reject: %',p_name,result; END IF;
 IF EXISTS(SELECT 1 FROM public.pedidos WHERE idempotency_key=(SELECT idem FROM promotion_cases WHERE i=p_case)) THEN RAISE EXCEPTION 'Rejected promotion created an order'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.checkout_otp_challenges WHERE id=(SELECT challenge FROM promotion_cases WHERE i=p_case) AND status='sent' AND intentos=0) THEN RAISE EXCEPTION 'Rule rejection consumed verification'; END IF;
 INSERT INTO promotion_assertions VALUES(p_name);
END $$;
DO $$
DECLARE result jsonb;previous uuid;modes text[];today text;
BEGIN
 IF (SELECT tipos_pedido FROM public.menu_promociones WHERE id='91600000-0000-4000-8000-000000000003') IS DISTINCT FROM ARRAY['tienda','domicilio'] THEN RAISE EXCEPTION 'Default changed existing availability'; END IF;
 INSERT INTO promotion_assertions VALUES('legacy/default both modes');
 FOREACH modes SLICE 1 IN ARRAY ARRAY[ARRAY['tienda','tienda'],ARRAY['domicilio','otro'],ARRAY['domicilio',NULL]] LOOP
  BEGIN
   UPDATE public.menu_promociones SET tipos_pedido=modes WHERE id='91600000-0000-4000-8000-000000000003';
   RAISE EXCEPTION 'Invalid modes accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
 END LOOP;
 BEGIN UPDATE public.menu_promociones SET tipos_pedido='{}' WHERE id='91600000-0000-4000-8000-000000000003'; RAISE EXCEPTION 'Empty modes accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE public.menu_promociones SET tipos_pedido=NULL WHERE id='91600000-0000-4000-8000-000000000003'; RAISE EXCEPTION 'Null modes accepted'; EXCEPTION WHEN not_null_violation THEN NULL; END;
 INSERT INTO promotion_assertions VALUES('empty, duplicate, null and unknown modes rejected');
 result:=pg_temp.promo_order(0,'tienda');
 IF result->'pedido'->>'id' IS NULL THEN RAISE EXCEPTION 'Both-modes pickup failed: %',result; END IF;
 INSERT INTO promotion_assertions VALUES('both modes allows pickup');
 result:=pg_temp.promo_order(1,'domicilio');
 IF result->'pedido'->>'id' IS NULL THEN RAISE EXCEPTION 'Both-modes delivery failed: %',result; END IF;
 previous:=(result->'pedido'->>'id')::uuid;
 INSERT INTO promotion_assertions VALUES('both modes allows delivery');
 UPDATE public.menu_promociones SET tipos_pedido=ARRAY['tienda'] WHERE id='91600000-0000-4000-8000-000000000003';
 PERFORM pg_temp.expect_promo_error(2,'domicilio','promotion_delivery_restricted','pickup-only rejects delivery without consuming proof');
 result:=pg_temp.promo_order(3,'tienda');
 IF result->'pedido'->>'id' IS NULL THEN RAISE EXCEPTION 'Pickup-only failed pickup'; END IF;
 INSERT INTO promotion_assertions VALUES('pickup-only accepts pickup');
 -- A completed order remains recoverable after rules change, without a second order.
 result:=pg_temp.promo_order(1,'domicilio');
 IF result->>'replayed' IS DISTINCT FROM 'true' OR (result->'pedido'->>'id')::uuid IS DISTINCT FROM previous THEN RAISE EXCEPTION 'Rule edit broke durable replay'; END IF;
 INSERT INTO promotion_assertions VALUES('lost response replay survives rule change');
 UPDATE public.menu_promociones SET tipos_pedido=ARRAY['domicilio'] WHERE id='91600000-0000-4000-8000-000000000003';
 PERFORM pg_temp.expect_promo_error(4,'tienda','promotion_delivery_restricted','delivery-only rejects pickup');
 result:=pg_temp.promo_order(5,'domicilio');
 IF result->'pedido'->>'id' IS NULL THEN RAISE EXCEPTION 'Delivery-only failed delivery'; END IF;
 INSERT INTO promotion_assertions VALUES('delivery-only accepts delivery');
 UPDATE public.menu_promociones SET tipos_pedido=ARRAY['tienda','domicilio'],fecha_fin=(now() AT TIME ZONE 'America/Mexico_City')::date-1 WHERE id='91600000-0000-4000-8000-000000000003';
 PERFORM pg_temp.expect_promo_error(6,'domicilio','promotion_unavailable','expired promotion rejected at commit');
 UPDATE public.menu_promociones SET fecha_fin=(now() AT TIME ZONE 'America/Mexico_City')::date WHERE id='91600000-0000-4000-8000-000000000003';
 result:=pg_temp.promo_order(7,'tienda');
 IF result->'pedido'->>'id' IS NULL THEN RAISE EXCEPTION 'Final local date incorrectly expired'; END IF;
 INSERT INTO promotion_assertions VALUES('expiry includes final Mexico City calendar date');
 today:=(ARRAY['lun','mar','mie','jue','vie','sab','dom'])[extract(isodow FROM now() AT TIME ZONE 'America/Mexico_City')::integer];
 UPDATE public.menu_promociones SET fecha_fin=NULL,dias_aplicacion=ARRAY(SELECT d FROM unnest(ARRAY['lun','mar','mie','jue','vie','sab','dom']) d WHERE d<>today) WHERE id='91600000-0000-4000-8000-000000000003';
 PERFORM pg_temp.expect_promo_error(8,'tienda','promotion_unavailable','wrong local weekday rejected at commit');
 UPDATE public.menu_promociones SET dias_aplicacion=ARRAY[today] WHERE id='91600000-0000-4000-8000-000000000003';
 result:=pg_temp.promo_order(9,'tienda');
 IF result->'pedido'->>'id' IS NULL THEN RAISE EXCEPTION 'Valid local weekday rejected'; END IF;
 INSERT INTO promotion_assertions VALUES('current local weekday accepted');
 PERFORM pg_temp.expect_promo_error(10,'tienda',NULL,'foreign branch promotion rejected',true);
 UPDATE public.menu_promociones SET activa=false WHERE id='91600000-0000-4000-8000-000000000003';
 PERFORM pg_temp.expect_promo_error(11,'tienda','promotion_unavailable','inactive promotion rejected at commit');
 IF has_function_privilege('anon','public.storefront_checked_cash_checkout(uuid,text,text,text,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.storefront_checked_cash_checkout(uuid,text,text,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Checkout privilege expanded'; END IF;
 INSERT INTO promotion_assertions VALUES('checkout remains server-only');
END $$;
SELECT name,'passed' AS result FROM promotion_assertions ORDER BY name;
ROLLBACK;
