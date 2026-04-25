-- ============================================================
-- ACTUALIZACIÓN V26: SCALING AVANZADO & ANTI-FRAUDE
-- Geocerca de Repartidores & Vigilante de Pedidos Zombis
-- ============================================================

-- ============================================================
-- 1. ANTI-FRAUDE: GEOCERCA DE ENTREGAS
-- ============================================================
-- Añadimos columnas para guardar la ubicación en vivo del repartidor
-- en el momento exacto en que presiona el botón de "Entregado"
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS lat_entrega DOUBLE PRECISION;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS lng_entrega DOUBLE PRECISION;

-- Función que calcula la distancia de Haversine nativamente en SQL
-- Y aborta la transacción si el repartidor está a más de 200 metros del destino.
CREATE OR REPLACE FUNCTION validar_geocerca_entrega()
RETURNS TRIGGER AS $$
DECLARE
  distancia_metros FLOAT;
BEGIN
  -- Solo auditar cuando el repartidor intenta cambiar el estado a "entregado"
  -- y siempre y cuando el pedido original tenga coordenadas destino.
  IF NEW.estado = 'entregado' AND OLD.estado != 'entregado' AND NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    
    -- Validamos si el frontend o el webhook pasaron las coordenadas actuales (lat_entrega, lng_entrega)
    IF NEW.lat_entrega IS NOT NULL AND NEW.lng_entrega IS NOT NULL THEN
        -- Cálculo de Fórmula de Haversine pura (No requiere PostGIS)
        distancia_metros := ( 6371000 * acos( 
            cos( radians(NEW.lat) ) * cos( radians( NEW.lat_entrega ) ) * 
            cos( radians( NEW.lng_entrega ) - radians(NEW.lng) ) + 
            sin( radians(NEW.lat) ) * sin( radians( NEW.lat_entrega ) ) 
        ) );
        
        -- Tolerancia de 200 metros para margen de error GPS
        IF distancia_metros > 200 THEN
           RAISE EXCEPTION 'FRAUDE DE GEOCERCA DETECTADO: El repartidor está a % metros del destino. Debe estar a menos de 200m para poder entregar.', ROUND(distancia_metros::numeric, 1);
        END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enganchar el vigilante de fraude a la tabla pedidos
DROP TRIGGER IF EXISTS trg_geocerca_entrega ON pedidos;
CREATE TRIGGER trg_geocerca_entrega
  BEFORE UPDATE OF estado ON pedidos
  FOR EACH ROW
  EXECUTE FUNCTION validar_geocerca_entrega();


-- ============================================================
-- 2. VIGILANTE ZOMBIE (STALE ORDERS) CON PG_CRON
-- ============================================================
-- Extensiones requeridas nativas de Supabase
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Flag para evitar spam de la misma alerta
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS alerta_retraso_enviada BOOLEAN DEFAULT false;

CREATE OR REPLACE FUNCTION monitor_pedidos_zombies()
RETURNS void AS $$
DECLARE
  v_pedido RECORD;
  v_payload JSONB;
BEGIN
  -- Escanear la base de datos buscando pedidos estancados (sin importar el frontend)
  FOR v_pedido IN 
      SELECT id, descripcion, cliente_tel, estado, 
             EXTRACT(EPOCH FROM (NOW() - updated_at))/60 AS mins_since_update,
             EXTRACT(EPOCH FROM (NOW() - created_at))/60 AS mins_total
      FROM pedidos
      WHERE estado IN ('asignado', 'recibido', 'en_camino', 'pendiente')
        AND alerta_retraso_enviada = false
  LOOP
      -- REGLA CRÍTICA:
      -- 1. Un pedido 'asignado' o 'recibido' lleva 10 minutos sin cambiar (El repartidor se durmió)
      -- 2. El pedido en total lleva 40 minutos en el sistema sin completarse (Atraso crítico)
      IF (v_pedido.estado IN ('asignado', 'recibido') AND v_pedido.mins_since_update >= 10) OR
         (v_pedido.mins_total >= 40) THEN
         
         v_payload := jsonb_build_object(
             'pedido_id', v_pedido.id,
             'tipo', 'alerta_zombie',
             'descripcion', v_pedido.descripcion,
             'minutos_total', ROUND(v_pedido.mins_total::numeric),
             'minutos_estancado', ROUND(v_pedido.mins_since_update::numeric)
         );
         
         -- Enviar Alerta silenciosamente mediante el bus de red de Postgres hacia la Edge Function
         PERFORM net.http_post(
             url := 'https://jdrrkpvodnqoljycixbg.supabase.co/functions/v1/notificar-whatsapp',
             headers := '{"Content-Type": "application/json"}'::jsonb,
             body := v_payload
         );
         
         -- Marcar como alertado
         UPDATE pedidos SET alerta_retraso_enviada = true WHERE id = v_pedido.id;
      END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Iniciar el cronograma (El corazón del Vigilante) - Se ejecuta cada 5 minutos
DO $$
BEGIN
  PERFORM cron.unschedule('vigilante_zombies');
EXCEPTION WHEN OTHERS THEN
  -- Ignorar error si el trabajo no existía previamente
END $$;

SELECT cron.schedule('vigilante_zombies', '*/5 * * * *', 'SELECT monitor_pedidos_zombies()');
