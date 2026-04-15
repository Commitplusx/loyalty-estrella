-- ============================================================
-- FIX: canjear_saldo RPC — p_admin_id UUID → TEXT
-- ============================================================
-- Problema: el frontend web llama con p_admin_id = 'cliente'
-- (string) pero el parámetro era UUID, causando error de casting.
-- Solución: cambiar el tipo a TEXT para aceptar cualquier ID.
-- ============================================================

CREATE OR REPLACE FUNCTION canjear_saldo(
    p_cliente_id UUID,
    p_admin_id   TEXT,          -- ← cambiado de UUID a TEXT
    p_monto      DECIMAL(10,2)
)
RETURNS JSONB AS $$
DECLARE
    v_cliente    RECORD;
    v_nuevo_saldo DECIMAL(10,2);
BEGIN
    SELECT * INTO v_cliente FROM clientes WHERE id = p_cliente_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cliente no encontrado');
    END IF;

    IF NOT v_cliente.es_vip THEN
        RETURN jsonb_build_object('success', false, 'message', 'Solo clientes VIP tienen billetera digital');
    END IF;

    IF COALESCE(v_cliente.saldo_billetera, 0) < p_monto THEN
        RETURN jsonb_build_object('success', false, 'message', 'Saldo insuficiente en billetera');
    END IF;

    v_nuevo_saldo := COALESCE(v_cliente.saldo_billetera, 0) - p_monto;

    UPDATE clientes SET
        saldo_billetera = v_nuevo_saldo,
        updated_at      = NOW()
    WHERE id = p_cliente_id;

    -- Guardamos el origen del canje en la descripción
    INSERT INTO registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion)
    VALUES (
        p_cliente_id,
        'canje',
        0,
        -p_monto,
        'Pago/Descuento desde ' || COALESCE(p_admin_id, 'cliente') || ': -$' || p_monto::text
    );

    RETURN jsonb_build_object(
        'success',          true,
        'message',          'Se descontaron $' || p_monto::text || ' exitosamente',
        'saldo_billetera',  v_nuevo_saldo
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
