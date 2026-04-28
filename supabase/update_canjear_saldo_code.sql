-- update_canjear_saldo_code.sql

CREATE OR REPLACE FUNCTION canjear_saldo(
    p_cliente_id UUID,
    p_admin_id TEXT,
    p_monto DECIMAL(10,2),
    p_concepto TEXT DEFAULT 'comida'
)
RETURNS JSONB AS $$
DECLARE
    v_cliente RECORD;
    v_nuevo_saldo DECIMAL(10,2);
    v_monto_final DECIMAL(10,2);
    v_codigo TEXT;
    v_mensaje TEXT;
BEGIN
    SELECT * INTO v_cliente FROM clientes WHERE id = p_cliente_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cliente no encontrado');
    END IF;
    
    IF NOT v_cliente.es_vip THEN
        RETURN jsonb_build_object('success', false, 'message', 'Solo clientes VIP tienen billetera digital');
    END IF;
    
    v_monto_final := p_monto;
    IF p_concepto = 'envio' AND p_monto > 45.00 THEN
        v_monto_final := 45.00;
    END IF;

    IF COALESCE(v_cliente.saldo_billetera, 0) < v_monto_final THEN
        RETURN jsonb_build_object('success', false, 'message', 'Saldo insuficiente en billetera. Requiere: $' || v_monto_final::text);
    END IF;
    
    -- Generar código aleatorio
    v_codigo := 'CANJE-' || upper(substr(md5(random()::text || NOW()::text), 1, 5));
    
    -- Descuento atómico
    UPDATE clientes SET
        saldo_billetera = saldo_billetera - v_monto_final,
        updated_at = NOW()
    WHERE id = p_cliente_id
    RETURNING saldo_billetera INTO v_nuevo_saldo;
    
    v_mensaje := 'Pago de ' || p_concepto || ' con Billetera: -$' || v_monto_final::text || ' | Código: ' || v_codigo || ' (Operador: ' || p_admin_id || ')';
    
    INSERT INTO registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion)
    VALUES (p_cliente_id, 'canje', 0, -v_monto_final, v_mensaje);
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Se descontaron $' || v_monto_final::text || ' exitosamente por concepto de ' || p_concepto,
        'saldo_billetera', v_nuevo_saldo,
        'codigo', v_codigo
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
