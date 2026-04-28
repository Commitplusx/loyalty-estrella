-- ============================================================
-- SCHEMA V26: Sistema de Cupón Único Activo
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Agregar columna cupon_activo a clientes
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS cupon_activo text;

-- 2. Actualizar canjear_saldo: bloquea si hay cupón activo, guarda el código
CREATE OR REPLACE FUNCTION public.canjear_saldo(
    p_cliente_id uuid,
    p_monto numeric,
    p_concepto text,
    p_admin_id uuid
)
RETURNS jsonb AS $$
DECLARE
    v_cliente record;
    v_nuevo_saldo numeric;
    v_codigo text;
BEGIN
    SELECT * INTO v_cliente FROM public.clientes WHERE id = p_cliente_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
    END IF;

    -- Bloquear si ya tiene un cupón activo sin usar
    IF v_cliente.cupon_activo IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Ya tienes un cupón activo: ' || v_cliente.cupon_activo || '. Úsalo antes de generar otro.');
    END IF;

    IF COALESCE(v_cliente.saldo_billetera, 0) < p_monto THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente en billetera VIP');
    END IF;

    v_nuevo_saldo := COALESCE(v_cliente.saldo_billetera, 0) - p_monto;
    v_codigo := 'CANJE-' || upper(substr(md5(random()::text), 1, 5));

    UPDATE public.clientes
    SET saldo_billetera = v_nuevo_saldo,
        cupon_activo = v_codigo,
        updated_at = NOW()
    WHERE id = p_cliente_id;

    INSERT INTO public.registros_puntos (
        cliente_id, tipo, puntos, monto_saldo, descripcion, created_by
    ) VALUES (
        p_cliente_id, 'canje', 0, -p_monto,
        p_concepto || ' | Código: ' || v_codigo,
        p_admin_id
    );

    RETURN jsonb_build_object(
        'ok', true,
        'mensaje', 'Canje exitoso. Se descontaron $' || p_monto::text || ' de tu billetera.',
        'nuevo_saldo', v_nuevo_saldo,
        'codigo', v_codigo
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. usar_cupon: Admin marca cupón como usado → cliente puede generar otro
CREATE OR REPLACE FUNCTION public.usar_cupon(p_codigo text)
RETURNS jsonb AS $$
DECLARE
    v_cliente record;
BEGIN
    -- Normalizar a mayúsculas para evitar errores de capitalización
    SELECT * INTO v_cliente
    FROM public.clientes
    WHERE upper(cupon_activo) = upper(p_codigo)
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Cupón no encontrado o ya fue usado.');
    END IF;

    UPDATE public.clientes
    SET cupon_activo = NULL,
        updated_at = NOW()
    WHERE id = v_cliente.id;

    RETURN jsonb_build_object(
        'ok', true,
        'mensaje', 'Cupón marcado como usado exitosamente',
        'cliente_nombre', v_cliente.nombre,
        'cliente_tel', v_cliente.telefono
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. cancelar_cupon: Admin cancela y reembolsa el saldo al cliente
CREATE OR REPLACE FUNCTION public.cancelar_cupon(p_codigo text, p_admin_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_cliente record;
    v_registro record;
    v_monto_reembolso numeric;
BEGIN
    SELECT * INTO v_cliente
    FROM public.clientes
    WHERE upper(cupon_activo) = upper(p_codigo)
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Cupón no encontrado o ya fue usado/cancelado.');
    END IF;

    -- Buscar el monto original del canje en el historial
    SELECT * INTO v_registro
    FROM public.registros_puntos
    WHERE cliente_id = v_cliente.id
      AND tipo = 'canje'
      AND descripcion ILIKE '%Código: ' || p_codigo || '%'
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No se encontró el registro original del canje para reembolsar.');
    END IF;

    v_monto_reembolso := ABS(v_registro.monto_saldo);

    UPDATE public.clientes
    SET saldo_billetera = COALESCE(saldo_billetera, 0) + v_monto_reembolso,
        cupon_activo = NULL,
        updated_at = NOW()
    WHERE id = v_cliente.id;

    INSERT INTO public.registros_puntos (
        cliente_id, tipo, puntos, monto_saldo, descripcion, created_by
    ) VALUES (
        v_cliente.id, 'canje', 0, v_monto_reembolso,
        'Reembolso por cupón cancelado | Código: ' || p_codigo,
        p_admin_id
    );

    RETURN jsonb_build_object(
        'ok', true,
        'mensaje', 'Cupón cancelado y saldo reembolsado exitosamente',
        'monto_reembolsado', v_monto_reembolso,
        'cliente_nombre', v_cliente.nombre,
        'cliente_tel', v_cliente.telefono
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
