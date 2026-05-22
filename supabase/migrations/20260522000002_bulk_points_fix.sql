-- Migration: 20260522000002_bulk_points_fix.sql
-- Optimiza la inserción de múltiples puntos para hacer UN SOLO insert y evitar crashear el Frontend con eventos Realtime

CREATE OR REPLACE FUNCTION "public"."fn_registrar_entrega_bulk"("p_cliente_tel" "text", "p_cantidad" integer DEFAULT 1, "p_pedido_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_cliente         RECORD;
  v_dias_limite     INTEGER;
  v_saldo_ganado_total DECIMAL(10,2) := 0.00;
  v_recien_ascendido BOOLEAN := FALSE;
  i                 INTEGER;
  v_ganancia_actual DECIMAL(10,2);
BEGIN
  -- Bloquear fila (previene race conditions)
  SELECT id, puntos, saldo_billetera, es_vip, nombre,
         puntos_expiran_at, entregas_ciclo, ciclo_inicio_at, envios_totales
  INTO v_cliente
  FROM clientes WHERE telefono = p_cliente_tel FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  END IF;

  FOR i IN 1..p_cantidad LOOP
    v_cliente.envios_totales := COALESCE(v_cliente.envios_totales, 0) + 1;

    IF v_cliente.envios_totales > 15 AND NOT v_cliente.es_vip THEN
      v_cliente.es_vip := TRUE;
      v_recien_ascendido := TRUE;
      v_cliente.entregas_ciclo := 0;
      v_cliente.ciclo_inicio_at := NOW();
    END IF;

    v_dias_limite := CASE WHEN v_cliente.es_vip THEN 30 ELSE 20 END;

    IF v_cliente.puntos_expiran_at IS NOT NULL AND NOW() > v_cliente.puntos_expiran_at AND COALESCE(v_cliente.puntos, 0) > 0 THEN
      -- Si expiraron en el loop, hacer un insert
      INSERT INTO movimientos_saldo (cliente_tel, tipo, descripcion, puntos_delta, saldo_delta, puntos_nuevo, saldo_nuevo, pedido_id)
      VALUES (p_cliente_tel, 'expiracion', format('Puntos expirados (%s días)', v_dias_limite), -v_cliente.puntos, 0.00, 0, COALESCE(v_cliente.saldo_billetera, 0.00), p_pedido_id);
      v_cliente.puntos := 0; v_cliente.puntos_expiran_at := NULL; v_cliente.entregas_ciclo := 0; v_cliente.ciclo_inicio_at := NULL;
    END IF;

    IF v_cliente.es_vip AND v_cliente.ciclo_inicio_at IS NOT NULL AND NOW() > v_cliente.ciclo_inicio_at + INTERVAL '30 days' THEN
      v_cliente.entregas_ciclo := 0; v_cliente.ciclo_inicio_at := NOW();
    END IF;

    v_cliente.entregas_ciclo := COALESCE(v_cliente.entregas_ciclo, 0) + 1;

    IF v_cliente.es_vip THEN v_ganancia_actual := fn_valor_entrega_vip(v_cliente.entregas_ciclo); ELSE v_ganancia_actual := 0.00; END IF;

    v_saldo_ganado_total := v_saldo_ganado_total + v_ganancia_actual;
    v_cliente.puntos := COALESCE(v_cliente.puntos, 0) + 1;
    v_cliente.saldo_billetera := COALESCE(v_cliente.saldo_billetera, 0.00) + v_ganancia_actual;

    IF COALESCE(v_cliente.puntos, 0) = 1 THEN
      v_cliente.puntos_expiran_at := NOW() + (v_dias_limite || ' days')::INTERVAL;
      v_cliente.ciclo_inicio_at := NOW();
    END IF;
  END LOOP;

  -- 🎯 SOLO INSERTAMOS 1 VEZ EL TOTAL AL FINAL DEL LOOP 🎯
  INSERT INTO movimientos_saldo (cliente_tel, tipo, descripcion, puntos_delta, saldo_delta, puntos_nuevo, saldo_nuevo, pedido_id)
  VALUES (p_cliente_tel, 'entrega', format('Entrega masiva (Bono de %s puntos)', p_cantidad), p_cantidad, v_saldo_ganado_total, v_cliente.puntos, v_cliente.saldo_billetera, p_pedido_id);
  
  INSERT INTO registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion)
  VALUES (v_cliente.id, 'acumulacion', p_cantidad, v_saldo_ganado_total, format('Bono masivo de %s puntos', p_cantidad));

  UPDATE clientes SET puntos = v_cliente.puntos, saldo_billetera = v_cliente.saldo_billetera, puntos_expiran_at = v_cliente.puntos_expiran_at, entregas_ciclo = v_cliente.entregas_ciclo, ciclo_inicio_at = v_cliente.ciclo_inicio_at, envios_totales = v_cliente.envios_totales, es_vip = v_cliente.es_vip WHERE id = v_cliente.id;

  IF v_recien_ascendido THEN
    BEGIN
      PERFORM net.http_post(
        url     := 'https://jdrrkpvodnqoljycixbg.supabase.co/functions/v1/notificar-whatsapp',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := jsonb_build_object('tipo', 'bienvenida_vip', 'cliente_tel', p_cliente_tel, 'cliente_nombre', v_cliente.nombre)
      );
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'webhook err'; END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'puntos', v_cliente.puntos, 'saldo_billetera', v_cliente.saldo_billetera, 'saldo_ganado', v_saldo_ganado_total, 'es_vip', v_cliente.es_vip, 'recien_ascendido', v_recien_ascendido);
END;
$$;
