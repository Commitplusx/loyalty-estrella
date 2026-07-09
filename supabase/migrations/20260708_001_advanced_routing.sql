-- Archivo de migración para Routing Avanzado (Batching & Predictive ETA)

-- 1. Función para calcular la distancia entre dos puntos (en kilómetros) usando PostGIS
CREATE OR REPLACE FUNCTION get_distance_km(lat1 FLOAT, lon1 FLOAT, lat2 FLOAT, lon2 FLOAT)
RETURNS FLOAT AS $$
BEGIN
  -- Usar ST_DistanceSphere (retorna metros) y convertir a km
  RETURN ST_DistanceSphere(
    ST_MakePoint(lon1, lat1),
    ST_MakePoint(lon2, lat2)
  ) / 1000.0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Función principal para buscar repartidores cercanos (Advanced Batching)
CREATE OR REPLACE FUNCTION buscar_repartidores_cercanos(
  p_restaurante_lat FLOAT,
  p_restaurante_lng FLOAT,
  p_cliente_lat FLOAT, -- Nueva entrega LAT
  p_cliente_lng FLOAT, -- Nueva entrega LNG
  p_radio_km FLOAT DEFAULT 5.0
) RETURNS TABLE (
  repartidor_id UUID,
  telefono TEXT,
  distancia_km FLOAT,
  score FLOAT,
  pedidos_activos INT,
  viaje_apilado BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH driver_stats AS (
    -- Contar pedidos activos por repartidor y obtener su último destino (si aplica)
    SELECT 
      r.id AS rep_id,
      r.telefono,
      r.lat,
      r.lng,
      r.bateria,
      COUNT(p.id) AS activos,
      -- Obtener el destino del pedido más reciente que tenga en camino
      MAX(p.lat) AS ultimo_destino_lat,
      MAX(p.lng) AS ultimo_destino_lng
    FROM repartidores r
    LEFT JOIN pedidos p ON p.repartidor_id = r.id AND p.estado IN ('asignado', 'en_camino', 'recibido')
    WHERE r.activo = true 
      AND r.bateria >= 15 -- Filtro duro: no asignar si se va a apagar el cel
      AND r.lat IS NOT NULL 
      AND r.lng IS NOT NULL
    GROUP BY r.id, r.telefono, r.lat, r.lng, r.bateria
  ),
  candidatos AS (
    SELECT 
      ds.rep_id,
      ds.telefono,
      get_distance_km(p_restaurante_lat, p_restaurante_lng, ds.lat, ds.lng) AS dist_res,
      ds.activos,
      ds.ultimo_destino_lat,
      ds.ultimo_destino_lng
    FROM driver_stats ds
    WHERE ds.activos < 3 -- Máximo 3 pedidos apilados
  )
  SELECT 
    c.rep_id,
    c.telefono,
    c.dist_res AS distancia_km,
    -- Calcular Score Híbrido
    (
      c.dist_res * 1.0 + -- Distancia base al restaurante
      (c.activos * 2.5) -- Penalización moderada por tener pedidos activos
    ) AS score,
    c.activos::INT AS pedidos_activos,
    (c.activos > 0) AS viaje_apilado
  FROM candidatos c
  WHERE c.dist_res <= p_radio_km
    -- LÓGICA DE APILAMIENTO (BATCHING INTELIGENTE)
    AND (
      c.activos = 0 -- Si está libre, es buen candidato
      OR 
      (
        c.activos > 0 AND 
        -- Validar si el nuevo pedido va a una zona similar (Desviación máxima de 2.5 km)
        -- Si el destino previo no tiene coordenadas, lo pasamos por alto
        (c.ultimo_destino_lat IS NULL OR get_distance_km(p_cliente_lat, p_cliente_lng, c.ultimo_destino_lat, c.ultimo_destino_lng) <= 2.5)
      )
      OR
      (
        c.activos > 0 AND
        -- Si va para zonas opuestas (distancia > 2.5km), solo lo consideramos si YA está a punto de desocuparse
        -- (a menos de 1km de su entrega actual)
        c.ultimo_destino_lat IS NOT NULL AND 
        get_distance_km(p_cliente_lat, p_cliente_lng, c.ultimo_destino_lat, c.ultimo_destino_lng) > 2.5 AND
        get_distance_km(c.ultimo_destino_lat, c.ultimo_destino_lng, c.lat, c.lng) <= 1.0
      )
    )
  ORDER BY score ASC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Función para calcular el Tiempo Estimado Dinámico (Dynamic ETA)
CREATE OR REPLACE FUNCTION calcular_eta_dinamico(p_restaurante_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_pedidos_pendientes INT;
  v_repartidores_activos INT;
  v_ratio FLOAT;
  v_eta_min INT;
  v_eta_max INT;
BEGIN
  -- Contar pedidos esperando ser asignados
  SELECT COUNT(*) INTO v_pedidos_pendientes 
  FROM pedidos 
  WHERE estado = 'pendiente';

  -- Contar repartidores conectados y con batería
  SELECT COUNT(*) INTO v_repartidores_activos 
  FROM repartidores 
  WHERE activo = true AND bateria >= 15;

  -- Si no hay repartidores, el tiempo es alto por defecto
  IF v_repartidores_activos = 0 THEN
    RETURN '60-90 min (Buscando Repartidores)';
  END IF;

  v_ratio := v_pedidos_pendientes::FLOAT / v_repartidores_activos::FLOAT;

  -- ETA Base: 25-35 min
  v_eta_min := 25;
  v_eta_max := 35;

  IF v_ratio >= 3.0 THEN
    -- Alta saturación (3 o más pedidos por repartidor)
    v_eta_min := 45;
    v_eta_max := 60;
  ELSIF v_ratio >= 1.5 THEN
    -- Demanda moderada
    v_eta_min := 35;
    v_eta_max := 45;
  END IF;

  RETURN v_eta_min::TEXT || '-' || v_eta_max::TEXT || ' min';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
