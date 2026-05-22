-- Migration: 20260522000005_fix_usar_cupon_notif.sql
-- Borra el cupón activo del cliente cuando se marca como usado para que desaparezca de la Web App
-- y envía notificación por WhatsApp al cliente informando que el cupón fue canjeado.

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

        -- FIX: Limpiar el cupon_activo del cliente para que no aparezca más en la Web App
        UPDATE public.clientes
        SET cupon_activo = NULL
        WHERE telefono = v_cupon.cliente_tel;

        -- NOTIFICAR A WHATSAPP QUE SE USÓ EL CUPÓN
        BEGIN
          PERFORM net.http_post(
            url     := 'https://jdrrkpvodnqoljycixbg.supabase.co/functions/v1/notificar-whatsapp',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body    := jsonb_build_object(
                         'tipo', 'notificacion_generica',
                         'cliente_tel', v_cupon.cliente_tel,
                         'mensaje', format('✅ *¡Cupón Canjeado exitosamente!*\n\nHola %s, el repartidor ha marcado como utilizado tu cupón *%s* por *$%s pesos* de descuento en tu servicio.\n\n¡Gracias por preferir Estrella Delivery! ⭐️', COALESCE(v_cupon.cliente_nombre, 'Cliente'), upper(p_codigo), v_cupon.valor_pesos)
                       )
          );
        EXCEPTION WHEN OTHERS THEN RAISE WARNING 'webhook err'; END;

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

    -- NOTIFICAR A WHATSAPP QUE SE USÓ EL CUPÓN
    BEGIN
      PERFORM net.http_post(
        url     := 'https://jdrrkpvodnqoljycixbg.supabase.co/functions/v1/notificar-whatsapp',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := jsonb_build_object(
                     'tipo', 'notificacion_generica',
                     'cliente_tel', v_cliente.telefono,
                     'mensaje', format('✅ *¡Cupón Canjeado exitosamente!*\n\nHola %s, tu cupón *%s* se aplicó exitosamente en tu entrega de hoy.\n\n¡Gracias por ser cliente de Estrella Delivery! ⭐️', COALESCE(v_cliente.nombre, 'Cliente'), upper(p_codigo))
                   )
      );
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'webhook err'; END;

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
