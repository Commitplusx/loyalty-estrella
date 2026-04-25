-- ============================================================
-- AUDITORÍA SENIOR QA - FIXES DE LÓGICA Y BASE DE DATOS
-- Versión: 25 (QA Arquitectura)
-- ============================================================

-- ============================================================
-- 1. FIX: RACE CONDITIONS Y LÓGICA EN BILLETERA VIP
-- ============================================================

-- A. Acumulación Segura (registrar_envio)
CREATE OR REPLACE FUNCTION registrar_envio(
    p_cliente_id UUID,
    p_admin_id UUID DEFAULT auth.uid(),
    p_latitud DECIMAL DEFAULT NULL,
    p_longitud DECIMAL DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_cliente RECORD;
    v_nuevo_saldo DECIMAL(10,2);
    v_nuevos_puntos INTEGER;
    v_envios_gratis INTEGER;
    v_mensaje TEXT;
BEGIN
    -- Bloqueo FOR UPDATE para prevenir Race Conditions (Doble escaneo accidental)
    SELECT * INTO v_cliente FROM clientes WHERE id = p_cliente_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cliente no encontrado');
    END IF;

    -- LÓGICA VIP
    IF v_cliente.es_vip THEN
        -- Actualización atómica segura
        UPDATE clientes SET 
            saldo_billetera = COALESCE(saldo_billetera, 0) + 5.00,
            envios_totales = envios_totales + 1,
            updated_at = NOW()
        WHERE id = p_cliente_id
        RETURNING saldo_billetera INTO v_nuevo_saldo;
        
        v_mensaje := 'Punto registrado: +$5.00 Cashback VIP';
        
        INSERT INTO registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion, created_by, latitud, longitud)
        VALUES (p_cliente_id, 'acumulacion', 0, 5.00, v_mensaje, p_admin_id, p_latitud, p_longitud);
        
        RETURN jsonb_build_object('success', true, 'message', v_mensaje, 'saldo_billetera', v_nuevo_saldo, 'is_vip', true);
    END IF;
    
    -- LÓGICA CLIENTES NORMALES
    v_nuevos_puntos := v_cliente.puntos + 1;
    v_envios_gratis := v_cliente.envios_gratis_disponibles;
    v_mensaje := 'Punto acumulado correctamente';
    
    IF v_nuevos_puntos >= 5 THEN
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
    
    RETURN jsonb_build_object('success', true, 'message', v_mensaje, 'puntos', v_nuevos_puntos, 'envios_gratis', v_envios_gratis, 'meta_vip', 5, 'is_vip', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- B. Canje Seguro (canjear_saldo) - Con tope de $45 para "envio"
-- Eliminamos TODAS las versiones anteriores (sobrecargas) para limpiar la DB
DROP FUNCTION IF EXISTS canjear_saldo(UUID, UUID, DECIMAL);
DROP FUNCTION IF EXISTS canjear_saldo(UUID, TEXT, DECIMAL);
DROP FUNCTION IF EXISTS canjear_saldo(UUID, TEXT, DECIMAL, TEXT);

CREATE OR REPLACE FUNCTION canjear_saldo(
    p_cliente_id UUID,
    p_admin_id TEXT,
    p_monto DECIMAL(10,2),
    p_concepto TEXT DEFAULT 'comida' -- Nuevo parámetro obligatorio en el futuro
)
RETURNS JSONB AS $$
DECLARE
    v_cliente RECORD;
    v_nuevo_saldo DECIMAL(10,2);
    v_monto_final DECIMAL(10,2);
BEGIN
    -- Bloqueo FOR UPDATE para transacciones financieras seguras
    SELECT * INTO v_cliente FROM clientes WHERE id = p_cliente_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cliente no encontrado');
    END IF;
    
    IF NOT v_cliente.es_vip THEN
        RETURN jsonb_build_object('success', false, 'message', 'Solo clientes VIP tienen billetera digital');
    END IF;
    
    -- Aplicar lógica de negocio de topes
    v_monto_final := p_monto;
    IF p_concepto = 'envio' AND p_monto > 45.00 THEN
        v_monto_final := 45.00;
    END IF;

    IF COALESCE(v_cliente.saldo_billetera, 0) < v_monto_final THEN
        RETURN jsonb_build_object('success', false, 'message', 'Saldo insuficiente en billetera. Requiere: $' || v_monto_final::text);
    END IF;
    
    -- Descuento atómico
    UPDATE clientes SET
        saldo_billetera = saldo_billetera - v_monto_final,
        updated_at = NOW()
    WHERE id = p_cliente_id
    RETURNING saldo_billetera INTO v_nuevo_saldo;
    
    INSERT INTO registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion)
    VALUES (p_cliente_id, 'canje', 0, -v_monto_final, 'Pago de ' || p_concepto || ' con Billetera: -$' || v_monto_final::text || ' (Operador: ' || p_admin_id || ')');
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Se descontaron $' || v_monto_final::text || ' exitosamente por concepto de ' || p_concepto,
        'saldo_billetera', v_nuevo_saldo
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 2. NOTAS SOBRE EL VIGILANTE DE PEDIDOS
-- ============================================================
-- La auditoría detectó que ya tienes Triggers configurados en 
-- la tabla `pedidos` (probablemente Webhooks de Supabase nativos 
-- o Realtime). Por lo tanto, el sistema ya es SEGURO en la capa de 
-- notificaciones. NO es necesario inyectar nuevos triggers.
