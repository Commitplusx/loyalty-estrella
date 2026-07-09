CREATE OR REPLACE FUNCTION calcular_eta_dinamico(p_restaurante_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_pedidos_pendientes INT;
  v_repartidores_activos INT;
  v_ratio FLOAT;
  v_eta_min INT;
  v_eta_max INT;
BEGIN
  -- Contar pedidos en curso o pendientes
  SELECT COUNT(*) INTO v_pedidos_pendientes 
  FROM pedidos 
  WHERE estado IN ('pendiente', 'asignado', 'en_camino', 'recibido');

  -- Contar repartidores conectados y con batería
  SELECT COUNT(*) INTO v_repartidores_activos 
  FROM repartidores 
  WHERE activo = true AND COALESCE(bateria, 0) >= 15;

  -- Si no hay repartidores, el tiempo es alto por defecto
  IF v_repartidores_activos = 0 THEN
    RETURN '60-90 min (Alta Demanda)';
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
