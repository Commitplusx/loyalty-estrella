-- Migration: 20260522000003_update_canje_limit.sql
-- Actualiza el límite de canje de billetera de $300 a $5000

CREATE OR REPLACE FUNCTION "public"."fn_canjear_beneficio"("p_cliente_tel" "text", "p_tipo" "text", "p_monto_pedido" numeric DEFAULT 0.00, "p_saldo_a_usar" numeric DEFAULT 0.00, "p_restaurante" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_cliente       RECORD;
  v_codigo        TEXT;
  v_valor_pesos   DECIMAL(10,2);
  v_puntos_delta  INTEGER := 0;
  v_saldo_delta   DECIMAL(10,2) := 0.00;
  v_puntos_nuevos INTEGER;
  v_saldo_nuevo   DECIMAL(10,2);
BEGIN
  SELECT id, puntos, saldo_billetera, es_vip, nombre
  INTO v_cliente
  FROM clientes
  WHERE telefono = p_cliente_tel
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  END IF;

  v_codigo := 'CANJE-EST-' || upper(substr(md5(random()::text || NOW()::text), 1, 6));

  IF p_tipo = 'envio_normal' THEN
    IF v_cliente.es_vip THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Clientes VIP deben usar envio_vip');
    END IF;
    IF COALESCE(v_cliente.puntos, 0) < 5 THEN
      RETURN jsonb_build_object('ok', false, 'error',
        format('Necesitas 5 puntos. Tienes %s', COALESCE(v_cliente.puntos, 0)));
    END IF;
    v_valor_pesos  := 50.00;
    v_puntos_delta := -5;
    v_saldo_delta  := 0.00;

  ELSIF p_tipo = 'envio_vip' THEN
    IF NOT v_cliente.es_vip THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Solo disponible para clientes VIP');
    END IF;
    IF COALESCE(v_cliente.puntos, 0) < 5 THEN
      RETURN jsonb_build_object('ok', false, 'error',
        format('Necesitas 5 puntos. Tienes %s', COALESCE(v_cliente.puntos, 0)));
    END IF;
    v_valor_pesos := LEAST(p_monto_pedido, COALESCE(v_cliente.saldo_billetera, 0.00), 50.00);
    IF v_valor_pesos <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente en billetera');
    END IF;
    v_puntos_delta := -5;
    v_saldo_delta  := -v_valor_pesos;

  ELSIF p_tipo = 'billetera' THEN
    IF NOT v_cliente.es_vip THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Billetera solo disponible para clientes VIP');
    END IF;
    -- AQUI CAMBIAMOS EL LIMITE DE 300 A 5000
    IF p_saldo_a_usar <= 0 OR p_saldo_a_usar > 5000 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'El monto debe estar entre $1 y $5,000');
    END IF;
    IF COALESCE(v_cliente.saldo_billetera, 0.00) < p_saldo_a_usar THEN
      RETURN jsonb_build_object('ok', false, 'error',
        format('Saldo insuficiente. Tienes $%s, necesitas $%s',
               COALESCE(v_cliente.saldo_billetera, 0.00), p_saldo_a_usar));
    END IF;
    v_valor_pesos  := p_saldo_a_usar;
    v_puntos_delta := 0;
    v_saldo_delta  := -p_saldo_a_usar;

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Tipo inválido');
  END IF;

  -- Aplicar cambios
  v_puntos_nuevos := COALESCE(v_cliente.puntos, 0) + v_puntos_delta;
  v_saldo_nuevo   := COALESCE(v_cliente.saldo_billetera, 0.00) + v_saldo_delta;

  UPDATE clientes
  SET puntos = v_puntos_nuevos,
      saldo_billetera = v_saldo_nuevo
  WHERE id = v_cliente.id;

  INSERT INTO cupones (
    cliente_id, codigo, tipo, valor_pesos, puntos_costo,
    saldo_costo, estado, expires_at
  ) VALUES (
    v_cliente.id, v_codigo, p_tipo, v_valor_pesos, -v_puntos_delta,
    -v_saldo_delta, 'activo', NOW() + INTERVAL '30 days'
  );

  INSERT INTO movimientos_saldo (
    cliente_tel, tipo, descripcion, puntos_delta, saldo_delta,
    puntos_nuevo, saldo_nuevo
  ) VALUES (
    p_cliente_tel, 'canje',
    format('Canje de cupón %s (%s)', v_codigo, p_tipo),
    v_puntos_delta, v_saldo_delta,
    v_puntos_nuevos, v_saldo_nuevo
  );

  RETURN jsonb_build_object(
    'ok', true,
    'codigo', v_codigo,
    'valor_pesos', v_valor_pesos,
    'puntos_nuevo', v_puntos_nuevos,
    'saldo_nuevo', v_saldo_nuevo,
    'expires_at', (NOW() + INTERVAL '30 days')::text,
    'cliente_nombre', v_cliente.nombre
  );
END;
$_$;
