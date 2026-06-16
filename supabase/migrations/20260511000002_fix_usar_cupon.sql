-- ═══════════════════════════════════════════════════════════════════
-- FIX: usar_cupon — ahora busca en tabla 'cupones' (v2) Y en
--      clientes.cupon_activo (v1 legacy) para compatibilidad total.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION "public"."usar_cupon"("p_codigo" "text")
RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
DECLARE
    v_cupon   RECORD;
    v_cliente RECORD;
BEGIN
    -- ── Intento 1: nuevo sistema (tabla cupones) ───────────────────
    SELECT c.*, cl.nombre AS cliente_nombre, cl.telefono AS cliente_tel
    INTO v_cupon
    FROM public.cupones c
    LEFT JOIN public.clientes cl ON cl.telefono = c.cliente_tel
    WHERE upper(c.codigo) = upper(p_codigo)
      AND c.estado = 'activo'
    LIMIT 1;

    IF FOUND THEN
        -- Marcar como usado en la tabla cupones
        UPDATE public.cupones
        SET estado    = 'usado',
            used_at   = NOW()
        WHERE upper(codigo) = upper(p_codigo);

        RETURN jsonb_build_object(
            'ok',             true,
            'mensaje',        'Cupón marcado como usado exitosamente',
            'cliente_nombre', v_cupon.cliente_nombre,
            'cliente_tel',    v_cupon.cliente_tel
        );
    END IF;

    -- ── Intento 2: sistema legado (clientes.cupon_activo) ─────────
    SELECT * INTO v_cliente
    FROM public.clientes
    WHERE upper(cupon_activo) = upper(p_codigo)
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok',    false,
            'error', 'Cupón no encontrado, ya fue usado o expiró.'
        );
    END IF;

    -- Limpiar el cupón del campo legado
    UPDATE public.clientes
    SET cupon_activo = NULL,
        updated_at   = NOW()
    WHERE id = v_cliente.id;

    RETURN jsonb_build_object(
        'ok',             true,
        'mensaje',        'Cupón marcado como usado exitosamente',
        'cliente_nombre', v_cliente.nombre,
        'cliente_tel',    v_cliente.telefono
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."usar_cupon"("p_codigo" "text") TO "anon";
GRANT EXECUTE ON FUNCTION "public"."usar_cupon"("p_codigo" "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."usar_cupon"("p_codigo" "text") TO "service_role";
