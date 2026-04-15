-- ============================================================
-- FIX: registro_express_cliente RPC (Fase 6 — QR Sync)
-- ============================================================
-- Problema: la función generaba un QR como 'ESTRELLA-abc12345'
-- pero la Web/Bot esperan 'https://www.app-estrella.shop/loyalty/{tel}'
-- 
-- Ejecutar en: Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION registro_express_cliente(
    p_telefono VARCHAR,
    p_nombre VARCHAR
)
RETURNS JSONB AS $$
DECLARE
    v_cliente_id UUID;
    v_qr_code VARCHAR;
    v_tel_10 VARCHAR;
BEGIN
    -- Extraer 10 dígitos del teléfono
    v_tel_10 := regexp_replace(p_telefono, '\D', '', 'g');
    v_tel_10 := right(v_tel_10, 10);

    -- URL canónica: la misma que usa la Web App (QRGenerator.tsx) y el Bot
    v_qr_code := 'https://www.app-estrella.shop/loyalty/' || v_tel_10;

    -- Verificar si ya existe
    SELECT id INTO v_cliente_id
    FROM clientes
    WHERE telefono = v_tel_10
    LIMIT 1;

    IF v_cliente_id IS NOT NULL THEN
        -- Ya existe: actualizar qr_code al formato canonical si aún está viejo
        UPDATE clientes
        SET qr_code = v_qr_code,
            nombre  = COALESCE(NULLIF(TRIM(p_nombre), ''), nombre)
        WHERE id = v_cliente_id;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Cliente ya existía. QR actualizado al formato canónico.',
            'cliente_id', v_cliente_id,
            'qr_code', v_qr_code
        );
    END IF;

    -- Insertar nuevo cliente con qr_code canónico
    INSERT INTO clientes (nombre, telefono, qr_code)
    VALUES (
        COALESCE(NULLIF(TRIM(p_nombre), ''), 'Cliente Nuevo'),
        v_tel_10,
        v_qr_code
    )
    RETURNING id INTO v_cliente_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Cliente registrado',
        'cliente_id', v_cliente_id,
        'qr_code', v_qr_code
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FIX: Migración masiva de QRs viejos (ESTRELLA-XXXXXXXX)
-- Convierte todos los qr_codes con formato antiguo al nuevo.
-- ============================================================
UPDATE clientes
SET qr_code = 'https://www.app-estrella.shop/loyalty/' || right(regexp_replace(telefono, '\D', '', 'g'), 10)
WHERE qr_code NOT LIKE 'https://%';
