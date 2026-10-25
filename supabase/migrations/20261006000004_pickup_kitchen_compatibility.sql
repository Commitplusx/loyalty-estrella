BEGIN;
CREATE OR REPLACE FUNCTION public.trg_update_estado_pedido()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 -- Older kitchen tabs still submit a dispatch state together with readiness.
 -- Store pickup readiness always keeps the pending global state. This permits
 -- the same kitchen transition without creating a delivery or an offer.
 IF NEW.tipo_pedido='tienda' AND OLD.estado='pendiente' AND NEW.estado='buscando_repartidor'
    AND NEW.estado_cocina IN ('en_cocina','listo_para_recoger')
    AND NEW.estado_cocina IS DISTINCT FROM OLD.estado_cocina THEN
  NEW.estado:=OLD.estado;
 END IF;
 IF NEW.tipo_pedido IN ('domicilio','restaurante_delivery','mandadito') AND
    ((NEW.estado_cocina='en_cocina' AND OLD.estado_cocina IS DISTINCT FROM 'en_cocina') OR
     (NEW.estado_cocina='listo_para_recoger' AND OLD.estado_cocina='en_cocina')) AND
    (NEW.estado='pendiente' OR NEW.estado IS NULL) THEN
  NEW.estado:='buscando_repartidor';
 END IF;
 RETURN NEW;
END $$;
COMMIT;
