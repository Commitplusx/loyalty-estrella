BEGIN;
CREATE OR REPLACE FUNCTION public.trg_update_estado_pedido()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.tipo_pedido IN ('domicilio','restaurante_delivery','mandadito') AND
    ((NEW.estado_cocina='en_cocina' AND OLD.estado_cocina IS DISTINCT FROM 'en_cocina') OR
     (NEW.estado_cocina='listo_para_recoger' AND OLD.estado_cocina='en_cocina')) AND
    (NEW.estado='pendiente' OR NEW.estado IS NULL) THEN
  NEW.estado:='buscando_repartidor';
 END IF;
 RETURN NEW;
END $$;

-- One server-owned transition for the existing kitchen controls. The driver
-- lifecycle is preserved; only a store pickup can be completed by kitchen.
CREATE FUNCTION public.cambiar_estado_cocina(p_pedido_id uuid,p_estado_nuevo text,
 p_estado_esperado text,p_minutos integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.pedidos; actor uuid:=auth.uid();
BEGIN
 IF COALESCE(auth.role(),'') NOT IN ('authenticated','service_role') OR
    (auth.role()='authenticated' AND actor IS NULL) THEN RAISE EXCEPTION 'Se requiere sesión'; END IF;
 SELECT * INTO p FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
 IF auth.role() IS DISTINCT FROM 'service_role' AND
    NOT EXISTS(SELECT 1 FROM public.admins WHERE id=actor) AND
    NOT EXISTS(SELECT 1 FROM public.restaurantes r LEFT JOIN public.restaurantes parent ON parent.id=r.matriz_id
               WHERE r.id=p.restaurante_id AND (r.admin_id=actor OR parent.admin_id=actor)) THEN
  RAISE EXCEPTION 'No puedes modificar este restaurante';
 END IF;
 IF p_estado_nuevo IS NULL OR p_estado_nuevo NOT IN ('en_cocina','listo_para_recoger','entregado') THEN
  RAISE EXCEPTION 'Etapa de cocina inválida';
 END IF;
 IF p_estado_nuevo='entregado' AND p.tipo_pedido IS DISTINCT FROM 'tienda' THEN
  RAISE EXCEPTION 'El repartidor confirma la recogida y entrega desde su app';
 END IF;
 IF p.estado IN ('cancelado','rechazado') OR
    (p.metodo_pago='en_linea' AND p.estado_pago IS DISTINCT FROM 'pagado') THEN
  RAISE EXCEPTION 'El pedido no está disponible para cocina';
 END IF;
 IF p_estado_nuevo='en_cocina' AND (p_minutos IS NULL OR p_minutos NOT BETWEEN 1 AND 180) THEN
  RAISE EXCEPTION 'Elige entre 1 y 180 minutos de preparación';
 END IF;
 IF p.estado_cocina=p_estado_nuevo AND
    (p_estado_nuevo<>'en_cocina' OR p.tiempo_preparacion_minutos=p_minutos) THEN
  RETURN jsonb_build_object('pedido',to_jsonb(p),'replayed',true);
 END IF;
 IF p.estado='entregado' OR p.estado_cocina IS DISTINCT FROM p_estado_esperado OR
    NOT ((p_estado_nuevo='en_cocina' AND (p.estado_cocina IS NULL OR p.estado_cocina='pendiente')) OR
         (p_estado_nuevo='listo_para_recoger' AND p.estado_cocina='en_cocina') OR
         (p_estado_nuevo='entregado' AND p.estado_cocina='listo_para_recoger')) THEN
  RAISE EXCEPTION 'El pedido ya cambió de etapa. Vuelve a consultarlo';
 END IF;
 UPDATE public.pedidos SET estado_cocina=p_estado_nuevo,
  tiempo_preparacion_minutos=CASE WHEN p_estado_nuevo='en_cocina' THEN p_minutos ELSE tiempo_preparacion_minutos END,
  estado=CASE WHEN p_estado_nuevo='entregado' THEN 'entregado' ELSE estado END,
  estado_pago=CASE WHEN p_estado_nuevo='entregado' AND metodo_pago='efectivo' THEN 'pagado' ELSE estado_pago END
 WHERE id=p.id RETURNING * INTO p;
 IF p.estado_cocina<>p_estado_nuevo OR (p_estado_nuevo='entregado' AND p.estado<>'entregado') THEN
  RAISE EXCEPTION 'No se confirmó la transición de cocina';
 END IF;
 RETURN jsonb_build_object('pedido',to_jsonb(p),'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.cambiar_estado_cocina(uuid,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_cocina(uuid,text,text,integer) TO authenticated,service_role;
COMMIT;
