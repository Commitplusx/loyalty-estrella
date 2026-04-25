-- =========================================================================================
-- V28: Caché Geográfico de Clientes (GPS Auto-learning)
-- =========================================================================================

-- 1. Agregamos las columnas de caché a la tabla clientes
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS lat_frecuente DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS lng_frecuente DOUBLE PRECISION;

-- 2. Creamos la función del Trigger para el Auto-aprendizaje
CREATE OR REPLACE FUNCTION fn_update_cliente_gps_cache()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo se activa cuando un pedido cambia a estado "entregado"
  IF NEW.estado = 'entregado' AND OLD.estado != 'entregado' THEN
    
    -- Solo actualizamos si el pedido tiene coordenadas válidas
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
      
      -- Actualizamos la caché del cliente usando su número de teléfono
      UPDATE clientes 
      SET 
        lat_frecuente = NEW.lat,
        lng_frecuente = NEW.lng,
        updated_at = NOW()
      WHERE telefono = NEW.cliente_tel;
      
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Creamos o reemplazamos el Trigger en la tabla de pedidos
DROP TRIGGER IF EXISTS trg_update_cliente_gps_cache ON pedidos;

CREATE TRIGGER trg_update_cliente_gps_cache
AFTER UPDATE OF estado ON pedidos
FOR EACH ROW
EXECUTE FUNCTION fn_update_cliente_gps_cache();