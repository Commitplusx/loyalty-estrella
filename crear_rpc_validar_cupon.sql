-- ==============================================================================
-- Función Pública para Validar Cupones de Lealtad (Restaurantes Estrella)
-- Ejecuta esto en el SQL Editor de Supabase
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.validar_cupon_publico(p_codigo text)
RETURNS jsonb AS $$
DECLARE
    v_cliente record;
    v_registro record;
    v_cupon record;
    v_monto numeric;
BEGIN
    -- 1. Intentar buscar en la tabla 'cupones' (si está en uso la v2 de cupones)
    SELECT * INTO v_cupon FROM public.cupones 
    WHERE upper(codigo) = upper(p_codigo) AND estado = 'activo';

    IF FOUND THEN
        RETURN jsonb_build_object(
            'ok', true, 
            'monto', v_cupon.valor_pesos,
            'mensaje', 'Cupón válido'
        );
    END IF;

    -- 2. Si no, buscar en la columna 'cupon_activo' de la tabla 'clientes' (v1)
    SELECT * INTO v_cliente FROM public.clientes 
    WHERE upper(cupon_activo) = upper(p_codigo);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'El cupón ingresado no existe o ya fue usado.');
    END IF;

    -- Extraer el monto del descuento desde el historial de puntos
    SELECT * INTO v_registro
    FROM public.registros_puntos
    WHERE cliente_id = v_cliente.id
      AND tipo = 'canje'
      AND descripcion ILIKE '%Código: ' || p_codigo || '%'
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No se pudo determinar el valor del cupón.');
    END IF;

    v_monto := ABS(v_registro.monto_saldo);

    RETURN jsonb_build_object(
        'ok', true,
        'monto', v_monto,
        'cliente_nombre', v_cliente.nombre,
        'mensaje', 'Cupón válido por $' || v_monto::text
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Otorgar permisos para que clientes anónimos (portal web) puedan ejecutarla
GRANT EXECUTE ON FUNCTION public.validar_cupon_publico(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validar_cupon_publico(text) TO authenticated;
