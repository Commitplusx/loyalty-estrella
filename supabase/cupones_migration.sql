-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN: Sistema de Canje de Puntos y Billetera Digital
-- Estrella Delivery — Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Añadir columnas a la tabla clientes
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS puntos_expiran_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS entregas_ciclo     INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ciclo_inicio_at    TIMESTAMPTZ;
  -- saldo_billetera ya existe como DECIMAL(10,2) en el esquema
  -- es_vip ya existe como BOOLEAN

-- 2. Tabla de movimientos (historial completo)
-- Usamos una tabla nueva para no alterar registros_puntos que ya existe
CREATE TABLE IF NOT EXISTS movimientos_saldo (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_tel   TEXT        NOT NULL,
  tipo          TEXT        NOT NULL CHECK (tipo IN (
                              'entrega',
                              'canje_envio',
                              'canje_billetera',
                              'expiracion',
                              'ajuste_manual'
                            )),
  descripcion   TEXT        NOT NULL,
  puntos_delta  INTEGER     NOT NULL DEFAULT 0,
  saldo_delta   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  puntos_nuevo  INTEGER     NOT NULL,
  saldo_nuevo   DECIMAL(10,2) NOT NULL,
  pedido_id     UUID        REFERENCES pedidos(id) ON DELETE SET NULL,
  cupon_codigo  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_tel    ON movimientos_saldo(cliente_tel);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha  ON movimientos_saldo(created_at);

-- 3. Tabla de cupones
CREATE TABLE IF NOT EXISTS cupones (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        TEXT        UNIQUE NOT NULL,
  cliente_tel   TEXT        NOT NULL,
  tipo          TEXT        NOT NULL CHECK (tipo IN ('envio_normal', 'envio_vip', 'billetera')),
  valor_pesos   DECIMAL(10,2) NOT NULL CHECK (valor_pesos > 0),
  puntos_usados INTEGER     NOT NULL DEFAULT 0,
  saldo_usado   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  restaurante   TEXT,
  estado        TEXT        NOT NULL DEFAULT 'activo'
                            CHECK (estado IN ('activo', 'usado', 'expirado')),
  pedido_id     UUID        REFERENCES pedidos(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cupones_tel    ON cupones(cliente_tel);
CREATE INDEX IF NOT EXISTS idx_cupones_estado ON cupones(estado);
CREATE INDEX IF NOT EXISTS idx_cupones_codigo ON cupones(codigo);

-- 4. RLS
ALTER TABLE cupones           ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_saldo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_ve_sus_cupones" ON cupones
  FOR SELECT USING (
    cliente_tel = (current_setting('request.jwt.claims', true)::jsonb->>'telefono')::text
  );

CREATE POLICY "cliente_ve_sus_movimientos" ON movimientos_saldo
  FOR SELECT USING (
    cliente_tel = (current_setting('request.jwt.claims', true)::jsonb->>'telefono')::text
  );

-- ══════════════════════════════════════════════════════════════
-- 5. FUNCIÓN AUXILIAR: Calcular cuánto vale cada entrega según tier VIP
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_valor_entrega_vip(p_entregas_ciclo INTEGER)
RETURNS DECIMAL(10,2)
LANGUAGE sql IMMUTABLE
AS $$
  -- Entregas 1-10 en el ciclo: $10 por entrega
  -- Entregas 11+: $7 por entrega
  SELECT CASE WHEN p_entregas_ciclo <= 10 THEN 10.00 ELSE 7.00 END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 6. FUNCIÓN ATÓMICA: Registrar entrega y sumar puntos/saldo
--    Llamada desde el backend de Supabase o bot_whatsapp
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_registrar_entrega(
  p_cliente_tel TEXT,
  p_pedido_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_cliente         RECORD;
  v_dias_limite     INTEGER;
  v_puntos_nuevos   INTEGER;
  v_saldo_nuevo     DECIMAL(10,2);
  v_entregas_nuevas INTEGER;
  v_saldo_ganado    DECIMAL(10,2);
  v_expiran_at      TIMESTAMPTZ;
  v_ciclo_inicio    TIMESTAMPTZ;
BEGIN
  -- Bloquear fila (previene race conditions)
  SELECT id, puntos, saldo_billetera, es_vip, nombre,
         puntos_expiran_at, entregas_ciclo, ciclo_inicio_at
  INTO v_cliente
  FROM clientes
  WHERE telefono = p_cliente_tel
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  END IF;

  v_dias_limite := CASE WHEN v_cliente.es_vip THEN 30 ELSE 20 END;

  -- Verificar si los puntos actuales han expirado por tiempo
  IF v_cliente.puntos_expiran_at IS NOT NULL
     AND NOW() > v_cliente.puntos_expiran_at
     AND COALESCE(v_cliente.puntos, 0) > 0 THEN

    INSERT INTO movimientos_saldo (
      cliente_tel, tipo, descripcion, puntos_delta, saldo_delta,
      puntos_nuevo, saldo_nuevo, pedido_id
    ) VALUES (
      p_cliente_tel, 'expiracion',
      format('Puntos expirados (%s días sin completar 5 envíos)', v_dias_limite),
      -v_cliente.puntos, 0.00, 0, COALESCE(v_cliente.saldo_billetera, 0.00), p_pedido_id
    );

    UPDATE clientes
    SET puntos = 0, puntos_expiran_at = NULL, entregas_ciclo = 0, ciclo_inicio_at = NULL
    WHERE id = v_cliente.id;

    v_cliente.puntos          := 0;
    v_cliente.entregas_ciclo  := 0;
    v_cliente.ciclo_inicio_at := NULL;
  END IF;

  -- Verificar si el ciclo de 30 días (VIP) expiró para resetear contador de tier
  IF v_cliente.es_vip
     AND v_cliente.ciclo_inicio_at IS NOT NULL
     AND NOW() > v_cliente.ciclo_inicio_at + INTERVAL '30 days' THEN
    -- Nuevo ciclo: resetear contador de entregas (el tier vuelve a $10/entrega)
    UPDATE clientes SET entregas_ciclo = 0, ciclo_inicio_at = NOW() WHERE id = v_cliente.id;
    v_cliente.entregas_ciclo  := 0;
    v_cliente.ciclo_inicio_at := NOW();
  END IF;

  -- Calcular nueva cantidad de entregas en el ciclo
  v_entregas_nuevas := COALESCE(v_cliente.entregas_ciclo, 0) + 1;

  -- Calcular saldo ganado según tier VIP
  IF v_cliente.es_vip THEN
    v_saldo_ganado := fn_valor_entrega_vip(v_entregas_nuevas);
  ELSE
    v_saldo_ganado := 0.00;
  END IF;

  v_puntos_nuevos := COALESCE(v_cliente.puntos, 0) + 1;
  v_saldo_nuevo   := COALESCE(v_cliente.saldo_billetera, 0.00) + v_saldo_ganado;

  -- Fecha de expiración de puntos: se fija al primer punto del ciclo
  IF COALESCE(v_cliente.puntos, 0) = 0 THEN
    v_expiran_at   := NOW() + (v_dias_limite || ' days')::INTERVAL;
    v_ciclo_inicio := NOW();
  ELSE
    v_expiran_at   := v_cliente.puntos_expiran_at;
    v_ciclo_inicio := COALESCE(v_cliente.ciclo_inicio_at, NOW());
  END IF;

  -- Actualizar cliente
  UPDATE clientes
  SET puntos            = v_puntos_nuevos,
      saldo_billetera   = v_saldo_nuevo,
      puntos_expiran_at = v_expiran_at,
      entregas_ciclo    = v_entregas_nuevas,
      ciclo_inicio_at   = v_ciclo_inicio
  WHERE id = v_cliente.id;

  -- Registrar en historial (movimientos_saldo nuevo + registros_puntos antiguo para no romper app)
  INSERT INTO movimientos_saldo (
    cliente_tel, tipo, descripcion, puntos_delta, saldo_delta,
    puntos_nuevo, saldo_nuevo, pedido_id
  ) VALUES (
    p_cliente_tel, 'entrega',
    format('Entrega #%s del ciclo. +1 punto%s',
           v_entregas_nuevas,
           CASE WHEN v_cliente.es_vip THEN format(' +$%s billetera (tier %s)',
             v_saldo_ganado,
             CASE WHEN v_entregas_nuevas <= 10 THEN '★ Premium' ELSE 'Estándar' END)
           ELSE '' END),
    1, v_saldo_ganado,
    v_puntos_nuevos, v_saldo_nuevo,
    p_pedido_id
  );

  INSERT INTO registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion)
  VALUES (v_cliente.id, 'acumulacion', 1, v_saldo_ganado, 'Entrega # ' || v_entregas_nuevas);

  RETURN jsonb_build_object(
    'ok',            true,
    'puntos',        v_puntos_nuevos,
    'saldo_billetera', v_saldo_nuevo,
    'saldo_ganado',  v_saldo_ganado,
    'entregas_ciclo',v_entregas_nuevas,
    'tier',          CASE WHEN v_entregas_nuevas <= 10 THEN 'premium_10' ELSE 'estandar_7' END,
    'es_vip',        v_cliente.es_vip,
    'puede_canjear', v_puntos_nuevos >= 5,
    'expiran_at',    v_expiran_at
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 7. FUNCIÓN ATÓMICA: Canjear beneficio (cupón)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_canjear_beneficio(
  p_cliente_tel   TEXT,
  p_tipo          TEXT,     -- 'envio_normal' | 'envio_vip' | 'billetera'
  p_monto_pedido  DECIMAL(10,2) DEFAULT 0.00,
  p_saldo_a_usar  DECIMAL(10,2) DEFAULT 0.00,
  p_restaurante   TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
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
    IF p_saldo_a_usar <= 0 OR p_saldo_a_usar > 300 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'El monto debe estar entre $1 y $300');
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
  SET puntos            = v_puntos_nuevos,
      saldo_billetera   = v_saldo_nuevo,
      puntos_expiran_at = CASE
        WHEN p_tipo IN ('envio_normal', 'envio_vip') THEN NULL
        ELSE puntos_expiran_at
      END
  WHERE id = v_cliente.id;

  -- Crear cupón
  INSERT INTO cupones (
    codigo, cliente_tel, tipo, valor_pesos,
    puntos_usados, saldo_usado, restaurante, expires_at
  ) VALUES (
    v_codigo, p_cliente_tel, p_tipo, v_valor_pesos,
    ABS(v_puntos_delta), ABS(v_saldo_delta),
    p_restaurante, NOW() + INTERVAL '7 days'
  );

  -- Registrar en historial
  INSERT INTO movimientos_saldo (
    cliente_tel, tipo, descripcion,
    puntos_delta, saldo_delta, puntos_nuevo, saldo_nuevo, cupon_codigo
  ) VALUES (
    p_cliente_tel,
    CASE p_tipo WHEN 'billetera' THEN 'canje_billetera' ELSE 'canje_envio' END,
    format('Cupón %s generado. Descuento: $%s', v_codigo, v_valor_pesos),
    v_puntos_delta, v_saldo_delta,
    v_puntos_nuevos, v_saldo_nuevo, v_codigo
  );

  INSERT INTO registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion)
  VALUES (v_cliente.id, 'canje', v_puntos_delta, v_saldo_delta, 'Cupón canjeado: ' || v_codigo);

  RETURN jsonb_build_object(
    'ok',             true,
    'codigo',         v_codigo,
    'valor_pesos',    v_valor_pesos,
    'puntos_nuevos',  v_puntos_nuevos,
    'saldo_nuevo',    v_saldo_nuevo,
    'cliente_nombre', v_cliente.nombre,
    'es_vip',         v_cliente.es_vip,
    'expires_at',     NOW() + INTERVAL '7 days'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
