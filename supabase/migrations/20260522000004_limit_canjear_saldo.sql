-- Migration: 20260522000004_limit_canjear_saldo.sql
-- Agrega límite estricto de seguridad de 350 pesos a la función que usa la Web App

CREATE OR REPLACE FUNCTION public.canjear_saldo(
    p_cliente_id uuid,
    p_admin_id text,
    p_monto numeric,
    p_concepto text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cliente RECORD;
    v_nuevo_saldo numeric;
    v_codigo text;
BEGIN
    -- Bloquear al cliente para prevenir race conditions
    SELECT * INTO v_cliente
    FROM public.clientes
    WHERE id = p_cliente_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
    END IF;

    IF v_cliente.cupon_activo IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Ya tienes un cupón activo');
    END IF;

    IF COALESCE(v_cliente.saldo_billetera, 0) < p_monto THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente');
    END IF;

    -- 🚨 AQUÍ ESTÁ EL LÍMITE ESTRICTO DE $350 PESOS MÁXIMO 🚨
    IF p_monto <= 0 OR p_monto > 350 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Por seguridad, el canje máximo permitido es de $350 pesos.');
    END IF;

    v_nuevo_saldo := COALESCE(v_cliente.saldo_billetera, 0) - p_monto;
    v_codigo      := 'CANJE-' || upper(substr(md5(random()::text), 1, 5));

    UPDATE public.clientes
    SET saldo_billetera = v_nuevo_saldo, cupon_activo = v_codigo, updated_at = NOW()
    WHERE id = p_cliente_id;

    INSERT INTO public.registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion, created_by)
    VALUES (
        p_cliente_id, 'canje', 0, -p_monto,
        p_concepto || ' | Código: ' || v_codigo,
        NULL  -- autocanje web: se omite p_admin_id (asumiendo que es null desde la web app)
    );

    RETURN jsonb_build_object(
        'ok', true,
        'mensaje', 'Canje exitoso. Se descontaron $' || p_monto::text || ' de tu billetera.',
        'nuevo_saldo', v_nuevo_saldo, 
        'codigo', v_codigo
    );
END;
$$;
