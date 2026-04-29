-- ============================================================
-- FIX DEFINITIVO: canjear_saldo — eliminar ambigüedad PGRST203
-- Hay DOS versiones con firmas distintas — PostgREST no puede elegir.
-- Este script borra AMBAS y recrea SOLO la correcta (TEXT p_admin_id).
-- EJECUTAR COMPLETO en Supabase SQL Editor.
-- ============================================================

-- PASO 1: Eliminar ambas versiones conflictivas
DROP FUNCTION IF EXISTS public.canjear_saldo(UUID, TEXT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.canjear_saldo(UUID, NUMERIC, TEXT, UUID);

-- PASO 2: Recrear la versión correcta (p_admin_id = TEXT, orden correcto)
CREATE OR REPLACE FUNCTION public.canjear_saldo(
    p_cliente_id uuid,
    p_admin_id   text,
    p_monto      numeric,
    p_concepto   text
)
RETURNS jsonb AS $$
DECLARE
    v_cliente    record;
    v_nuevo_saldo numeric;
    v_codigo     text;
BEGIN
    SELECT * INTO v_cliente FROM public.clientes WHERE id = p_cliente_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
    END IF;

    -- Bloquear si ya tiene cupón activo sin usar
    IF v_cliente.cupon_activo IS NOT NULL THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'Ya tienes un cupón activo: ' || v_cliente.cupon_activo || '. Úsalo antes de generar otro.'
        );
    END IF;

    IF COALESCE(v_cliente.saldo_billetera, 0) < p_monto THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente en billetera VIP');
    END IF;

    v_nuevo_saldo := COALESCE(v_cliente.saldo_billetera, 0) - p_monto;
    v_codigo      := 'CANJE-' || upper(substr(md5(random()::text), 1, 5));

    UPDATE public.clientes
    SET saldo_billetera = v_nuevo_saldo,
        cupon_activo    = v_codigo,
        updated_at      = NOW()
    WHERE id = p_cliente_id;

    INSERT INTO public.registros_puntos (
        cliente_id, tipo, puntos, monto_saldo, descripcion, created_by
    ) VALUES (
        p_cliente_id, 'canje', 0, -p_monto,
        p_concepto || ' | Código: ' || v_codigo,
        p_admin_id::uuid
    );

    RETURN jsonb_build_object(
        'ok',          true,
        'mensaje',     'Canje exitoso. Se descontaron $' || p_monto::text || ' de tu billetera.',
        'nuevo_saldo', v_nuevo_saldo,
        'codigo',      v_codigo
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PASO 3: Dar acceso al role anon (cliente web usa anon key)
GRANT EXECUTE ON FUNCTION public.canjear_saldo(UUID, TEXT, NUMERIC, TEXT) TO anon;

-- VERIFICACIÓN: Debe retornar exactamente 1 fila
-- SELECT proname, pg_get_function_arguments(oid) FROM pg_proc WHERE proname = 'canjear_saldo';
