-- ============================================
-- BILLETERA DIGITAL VIP - ESTRELLA DELIVERY
-- Ejecutar en el Editor SQL de Supabase
-- ============================================

-- 1. Añadir saldo_billetera a clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS saldo_billetera DECIMAL(10,2) DEFAULT 0.00;

-- 2. Añadir monto_saldo a registros_puntos
ALTER TABLE registros_puntos ADD COLUMN IF NOT EXISTS monto_saldo DECIMAL(10,2) DEFAULT 0.00;

-- 3. Actualizar función registrar_envio
CREATE OR REPLACE FUNCTION registrar_envio(
    p_cliente_id UUID,
    p_admin_id UUID DEFAULT auth.uid(),
    p_latitud DECIMAL DEFAULT NULL,
    p_longitud DECIMAL DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_cliente RECORD;
    v_nuevos_puntos INTEGER;
    v_envios_gratis INTEGER;
    v_meta INTEGER;
    v_mensaje TEXT;
    v_nuevo_saldo DECIMAL(10,2);
BEGIN
    SELECT * INTO v_cliente FROM clientes WHERE id = p_cliente_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cliente no encontrado');
    END IF;

    -- LÓGICA EXCLUSIVA PARA VIP
    IF v_cliente.es_vip THEN
        v_nuevo_saldo := COALESCE(v_cliente.saldo_billetera, 0) + 5.00;
        v_mensaje := 'Punto registrado: +$5.00 Cashback VIP';
        
        UPDATE clientes SET 
            saldo_billetera = v_nuevo_saldo,
            envios_totales = envios_totales + 1,
            updated_at = NOW()
        WHERE id = p_cliente_id;
        
        INSERT INTO registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion, created_by, latitud, longitud)
        VALUES (p_cliente_id, 'acumulacion', 0, 5.00, v_mensaje, p_admin_id, p_latitud, p_longitud);
        
        RETURN jsonb_build_object(
            'success', true, 
            'message', v_mensaje,
            'saldo_billetera', v_nuevo_saldo,
            'is_vip', true
        );
    END IF;
    
    -- LÓGICA CLIENTES NORMALES
    v_meta := 5;
    
    v_nuevos_puntos := v_cliente.puntos + 1;
    v_envios_gratis := v_cliente.envios_gratis_disponibles;
    v_mensaje := 'Punto acumulado correctamente';
    
    IF v_nuevos_puntos >= v_meta THEN
        v_envios_gratis := v_envios_gratis + 1;
        v_nuevos_puntos := 0;
        v_mensaje := '¡Felicidades! Has ganado un envío GRATIS';
    END IF;
    
    UPDATE clientes SET
        puntos = v_nuevos_puntos,
        envios_gratis_disponibles = v_envios_gratis,
        envios_totales = envios_totales + 1,
        updated_at = NOW()
    WHERE id = p_cliente_id;
    
    INSERT INTO registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion, created_by, latitud, longitud)
    VALUES (p_cliente_id, 'acumulacion', 1, 0, v_mensaje, p_admin_id, p_latitud, p_longitud);
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', v_mensaje,
        'puntos', v_nuevos_puntos,
        'envios_gratis', v_envios_gratis,
        'meta_vip', v_meta,
        'is_vip', false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Nueva función para canjear saldo
CREATE OR REPLACE FUNCTION canjear_saldo(
    p_cliente_id UUID,
    p_admin_id UUID,
    p_monto DECIMAL(10,2)
)
RETURNS JSONB AS $$
DECLARE
    v_cliente RECORD;
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
        updated_at = NOW()
    WHERE id = p_cliente_id;
    
    INSERT INTO registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion, created_by)
    VALUES (p_cliente_id, 'canje', 0, -p_monto, 'Pago/Descuento con Billetera: -$' || p_monto::text, p_admin_id);
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Se descontaron $' || p_monto::text || ' exitosamente',
        'saldo_billetera', v_nuevo_saldo
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC para Leer Historial (Con info de Billetera)
CREATE OR REPLACE FUNCTION get_historial_cliente(p_cliente_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_registros JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', r.id,
            'tipo', r.tipo,
            'puntos', r.puntos,
            'monto_saldo', r.monto_saldo,
            'descripcion', r.descripcion,
            'created_at', r.created_at
        ) ORDER BY r.created_at DESC
    ) INTO v_registros
    FROM registros_puntos r
    WHERE r.cliente_id = p_cliente_id;
    
    RETURN COALESCE(v_registros, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
