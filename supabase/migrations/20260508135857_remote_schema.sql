


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."acumular_punto"("p_cliente_id" "uuid", "p_admin_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_cliente RECORD;
    v_nuevos_puntos INTEGER;
    v_envios_gratis INTEGER;
    v_mensaje TEXT;
BEGIN
    -- Obtener cliente
    SELECT * INTO v_cliente FROM clientes WHERE id = p_cliente_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cliente no encontrado');
    END IF;
    
    -- Calcular nuevos puntos
    v_nuevos_puntos := v_cliente.puntos + 1;
    v_envios_gratis := v_cliente.envios_gratis_disponibles;
    v_mensaje := 'Punto acumulado correctamente';
    
    -- Verificar si ganó envío gratis
    IF v_nuevos_puntos >= 5 THEN
        v_envios_gratis := v_envios_gratis + 1;
        v_nuevos_puntos := 0;
        v_mensaje := '¡Felicidades! Has ganado un envío GRATIS';
    END IF;
    
    -- Actualizar cliente
    UPDATE clientes SET
        puntos = v_nuevos_puntos,
        envios_gratis_disponibles = v_envios_gratis,
        envios_totales = envios_totales + 1,
        updated_at = NOW()
    WHERE id = p_cliente_id;
    
    -- Crear registro
    INSERT INTO registros_puntos (cliente_id, tipo, puntos, descripcion, created_by)
    VALUES (p_cliente_id, 'acumulacion', 1, v_mensaje, p_admin_id);
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', v_mensaje,
        'puntos', v_nuevos_puntos,
        'envios_gratis', v_envios_gratis
    );
END;
$$;


ALTER FUNCTION "public"."acumular_punto"("p_cliente_id" "uuid", "p_admin_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."buscar_excepcion"("p_texto" "text") RETURNS TABLE("exc_id" integer, "colonia_texto" "text", "zona_id" integer, "zona_nombre" "text", "zona_emoji" "text", "precio" numeric, "precio_max" numeric, "precio_efectivo" numeric, "dificultad_alta" boolean, "motivo" "text", "lat" double precision, "lng" double precision, "radio_metros" integer)
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.colonia_texto,
    e.zona_id,
    z.nombre,
    z.color_emoji,
    z.precio,
    z.precio_max,
    -- Lógica de precio efectivo: si dificultad_alta y hay precio_max → cobrar precio_max
    CASE
      WHEN e.dificultad_alta AND z.precio_max IS NOT NULL THEN z.precio_max
      ELSE z.precio
    END,
    e.dificultad_alta,
    e.motivo,
    e.lat,
    e.lng,
    e.radio_metros
  FROM public.excepciones_precio e
  JOIN public.zonas_entrega z ON z.id = e.zona_id
  WHERE e.activo = true
    AND f_unaccent(lower(p_texto)) LIKE '%' || f_unaccent(lower(e.colonia_texto)) || '%'
  ORDER BY length(e.colonia_texto) DESC  -- prioriza matches más específicos primero
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."buscar_excepcion"("p_texto" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancelar_cupon"("p_codigo" "text", "p_admin_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_cliente         RECORD;
    v_monto_reembolso NUMERIC;
BEGIN
    -- 1. Encontrar el cliente que tiene este cupón activo (FOR UPDATE previene race conditions)
    SELECT * INTO v_cliente
    FROM public.clientes
    WHERE upper(cupon_activo) = upper(p_codigo)
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Cupón no encontrado o ya fue usado/cancelado.');
    END IF;

    -- 2. FIX: Buscar el monto directamente en la tabla cupones por código (robusto).
    --    Antes se buscaba parseando texto de registros_puntos (frágil a cambios de ortografía).
    SELECT valor_pesos INTO v_monto_reembolso
    FROM public.cupones
    WHERE upper(codigo) = upper(p_codigo)
    LIMIT 1;

    -- 3. Fallback: si el cupón no está en la tabla cupones (caso histórico),
    --    buscar en registros_puntos de forma flexible (acepta "Código:" y "Codigo:").
    IF v_monto_reembolso IS NULL THEN
        SELECT ABS(monto_saldo) INTO v_monto_reembolso
        FROM public.registros_puntos
        WHERE cliente_id = v_cliente.id
          AND tipo = 'canje'
          AND (
            descripcion ILIKE '%' || p_codigo || '%'
            OR descripcion ILIKE '%Código:%'
            OR descripcion ILIKE '%Codigo:%'
          )
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    IF v_monto_reembolso IS NULL THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'No se encontró el monto original del cupón para reembolsar. Contacta soporte.'
        );
    END IF;

    -- 4. Reembolsar saldo y limpiar cupón activo del cliente
    UPDATE public.clientes
    SET saldo_billetera = COALESCE(saldo_billetera, 0) + v_monto_reembolso,
        cupon_activo    = NULL,
        updated_at      = NOW()
    WHERE id = v_cliente.id;

    -- 5. Registrar el reembolso en el historial de puntos
    INSERT INTO public.registros_puntos (
        cliente_id, tipo, puntos, monto_saldo, descripcion, created_by
    ) VALUES (
        v_cliente.id, 'canje', 0, v_monto_reembolso,
        'Reembolso por cupón cancelado | Código: ' || upper(p_codigo),
        p_admin_id
    );

    RETURN jsonb_build_object(
        'ok',                true,
        'mensaje',           'Cupón cancelado y saldo reembolsado exitosamente',
        'monto_reembolsado', v_monto_reembolso,
        'cliente_nombre',    v_cliente.nombre,
        'cliente_tel',       v_cliente.telefono
    );
END;
$$;


ALTER FUNCTION "public"."cancelar_cupon"("p_codigo" "text", "p_admin_id" "uuid") OWNER TO "postgres";

    v_nuevo_saldo := COALESCE(v_cliente.saldo_billetera, 0) - p_monto;
    v_codigo      := 'CANJE-' || upper(substr(md5(random()::text), 1, 5));

    UPDATE public.clientes
    SET saldo_billetera = v_nuevo_saldo, cupon_activo = v_codigo, updated_at = NOW()
    WHERE id = p_cliente_id;

    INSERT INTO public.registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion, created_by)
    VALUES (
        p_cliente_id, 'canje', 0, -p_monto,
        p_concepto || ' | Código: ' || v_codigo,
        NULL  -- autocanje web: no hay admin, se omite la FK
    );

    RETURN jsonb_build_object('ok', true,
        'mensaje', 'Canje exitoso. Se descontaron $' || p_monto::text || ' de tu billetera.',
        'nuevo_saldo', v_nuevo_saldo, 'codigo', v_codigo);
END;
$_$;


ALTER FUNCTION "public"."canjear_saldo"("p_cliente_id" "uuid", "p_admin_id" "text", "p_monto" numeric, "p_concepto" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_unaccent"("text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE STRICT PARALLEL SAFE
    AS $_$
  SELECT public.unaccent('public.unaccent', $1)
$_$;


ALTER FUNCTION "public"."f_unaccent"("text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_canjear_beneficio"("p_cliente_tel" "text", "p_tipo" "text", "p_monto_pedido" numeric DEFAULT 0.00, "p_saldo_a_usar" numeric DEFAULT 0.00, "p_restaurante" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_cliente       RECORD;
  v_codigo        TEXT;
  v_valor_pesos   DECIMAL(10,2);
  v_puntos_delta  INTEGER := 0;
  v_saldo_delta   DECIMAL(10,2) := 0.00;
  v_puntos_nuevos INTEGER;
  v_saldo_nuevo   DECIMAL(10,2);
BEGIN
  SELECT id, puntos, saldo_billetera, es_vip, nombre
  INTO v_cliente
  FROM clientes
  WHERE telefono = p_cliente_tel
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  END IF;

  v_codigo := 'CANJE-EST-' || upper(substr(md5(random()::text || NOW()::text), 1, 6));

  IF p_tipo = 'envio_normal' THEN
    IF v_cliente.es_vip THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Clientes VIP deben usar envio_vip');
    END IF;
    IF COALESCE(v_cliente.puntos, 0) < 5 THEN
      RETURN jsonb_build_object('ok', false, 'error',
        format('Necesitas 5 puntos. Tienes %s', COALESCE(v_cliente.puntos, 0)));
    END IF;
    v_valor_pesos  := 50.00;
    v_puntos_delta := -5;
    v_saldo_delta  := 0.00;

  ELSIF p_tipo = 'envio_vip' THEN
    IF NOT v_cliente.es_vip THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Solo disponible para clientes VIP');
    END IF;
    IF COALESCE(v_cliente.puntos, 0) < 5 THEN
      RETURN jsonb_build_object('ok', false, 'error',
        format('Necesitas 5 puntos. Tienes %s', COALESCE(v_cliente.puntos, 0)));
    END IF;
    v_valor_pesos := LEAST(p_monto_pedido, COALESCE(v_cliente.saldo_billetera, 0.00), 50.00);
    IF v_valor_pesos <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente en billetera');
    END IF;
    v_puntos_delta := -5;
    v_saldo_delta  := -v_valor_pesos;

  ELSIF p_tipo = 'billetera' THEN
    IF NOT v_cliente.es_vip THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Billetera solo disponible para clientes VIP');
    END IF;
    IF p_saldo_a_usar <= 0 OR p_saldo_a_usar > 300 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'El monto debe estar entre $1 y $300');
    END IF;
    IF COALESCE(v_cliente.saldo_billetera, 0.00) < p_saldo_a_usar THEN
      RETURN jsonb_build_object('ok', false, 'error',
        format('Saldo insuficiente. Tienes $%s, necesitas $%s',
               COALESCE(v_cliente.saldo_billetera, 0.00), p_saldo_a_usar));
    END IF;
    v_valor_pesos  := p_saldo_a_usar;
    v_puntos_delta := 0;
    v_saldo_delta  := -p_saldo_a_usar;

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Tipo inválido');
  END IF;

  -- Aplicar cambios
  v_puntos_nuevos := COALESCE(v_cliente.puntos, 0) + v_puntos_delta;
  v_saldo_nuevo   := COALESCE(v_cliente.saldo_billetera, 0.00) + v_saldo_delta;

  UPDATE clientes
  SET puntos            = v_puntos_nuevos,
      saldo_billetera   = v_saldo_nuevo,
      puntos_expiran_at = CASE
        WHEN p_tipo IN ('envio_normal', 'envio_vip') THEN NULL
        ELSE puntos_expiran_at
      END
  WHERE id = v_cliente.id;

  -- Crear cupón
  INSERT INTO cupones (
    codigo, cliente_tel, tipo, valor_pesos,
    puntos_usados, saldo_usado, restaurante, expires_at
  ) VALUES (
    v_codigo, p_cliente_tel, p_tipo, v_valor_pesos,
    ABS(v_puntos_delta), ABS(v_saldo_delta),
    p_restaurante, NOW() + INTERVAL '7 days'
  );

  -- Registrar en historial
  INSERT INTO movimientos_saldo (
    cliente_tel, tipo, descripcion,
    puntos_delta, saldo_delta, puntos_nuevo, saldo_nuevo, cupon_codigo
  ) VALUES (
    p_cliente_tel,
    CASE p_tipo WHEN 'billetera' THEN 'canje_billetera' ELSE 'canje_envio' END,
    format('Cupón %s generado. Descuento: $%s', v_codigo, v_valor_pesos),
    v_puntos_delta, v_saldo_delta,
    v_puntos_nuevos, v_saldo_nuevo, v_codigo
  );

  INSERT INTO registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion)
  VALUES (v_cliente.id, 'canje', v_puntos_delta, v_saldo_delta, 'Cupón canjeado: ' || v_codigo);

  RETURN jsonb_build_object(
    'ok',             true,
    'codigo',         v_codigo,
    'valor_pesos',    v_valor_pesos,
    'puntos_nuevos',  v_puntos_nuevos,
    'saldo_nuevo',    v_saldo_nuevo,
    'cliente_nombre', v_cliente.nombre,
    'es_vip',         v_cliente.es_vip,
    'expires_at',     NOW() + INTERVAL '7 days'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$_$;


ALTER FUNCTION "public"."fn_canjear_beneficio"("p_cliente_tel" "text", "p_tipo" "text", "p_monto_pedido" numeric, "p_saldo_a_usar" numeric, "p_restaurante" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_notificar_cambio_estado_pedido"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF OLD.estado IS NOT DISTINCT FROM NEW.estado THEN RETURN NEW; END IF;
  IF NEW.estado NOT IN ('recibido', 'en_camino', 'entregado') THEN RETURN NEW; END IF;
  BEGIN
    PERFORM net.http_post(
      url     := 'https://jdrrkpvodnqoljycixbg.supabase.co/functions/v1/notificar-whatsapp',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := jsonb_build_object('pedido_id', NEW.id::text, 'tipo', NEW.estado)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notificar-whatsapp trigger error: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_notificar_cambio_estado_pedido"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_registrar_entrega"("p_cliente_tel" "text", "p_pedido_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_cliente         RECORD;
  v_dias_limite     INTEGER;
  v_puntos_nuevos   INTEGER;
  v_saldo_nuevo     DECIMAL(10,2);
  v_entregas_nuevas INTEGER;
  v_saldo_ganado    DECIMAL(10,2);
  v_expiran_at      TIMESTAMPTZ;
  v_ciclo_inicio    TIMESTAMPTZ;
  v_envios_totales  INTEGER;
  v_es_vip          BOOLEAN;
  v_recien_ascendido BOOLEAN := FALSE;
BEGIN
  -- Bloquear fila (previene race conditions)
  SELECT id, puntos, saldo_billetera, es_vip, nombre,
         puntos_expiran_at, entregas_ciclo, ciclo_inicio_at, envios_totales
  INTO v_cliente
  FROM clientes
  WHERE telefono = p_cliente_tel
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  END IF;

  v_es_vip := v_cliente.es_vip;
  v_envios_totales := COALESCE(v_cliente.envios_totales, 0) + 1;

  -- LÓGICA DE ASCENSO VIP AUTOMÁTICO (15 envíos = 3 ciclos de 5)
  IF v_envios_totales > 15 AND NOT v_es_vip THEN
    v_es_vip := TRUE;
    v_recien_ascendido := TRUE;
    -- Iniciar su primer ciclo VIP
    v_cliente.entregas_ciclo := 0;
    v_cliente.ciclo_inicio_at := NOW();
  END IF;

  v_dias_limite := CASE WHEN v_es_vip THEN 30 ELSE 20 END;

  -- Verificar si los puntos actuales han expirado por tiempo
  IF v_cliente.puntos_expiran_at IS NOT NULL
     AND NOW() > v_cliente.puntos_expiran_at
     AND COALESCE(v_cliente.puntos, 0) > 0 THEN

    INSERT INTO movimientos_saldo (
      cliente_tel, tipo, descripcion, puntos_delta, saldo_delta,
      puntos_nuevo, saldo_nuevo, pedido_id
    ) VALUES (
      p_cliente_tel, 'expiracion',
      format('Puntos expirados (%s días sin completar 5 envíos)', v_dias_limite),
      -v_cliente.puntos, 0.00, 0, COALESCE(v_cliente.saldo_billetera, 0.00), p_pedido_id
    );

    UPDATE clientes
    SET puntos = 0, puntos_expiran_at = NULL, entregas_ciclo = 0, ciclo_inicio_at = NULL
    WHERE id = v_cliente.id;

    v_cliente.puntos          := 0;
    v_cliente.entregas_ciclo  := 0;
    v_cliente.ciclo_inicio_at := NULL;
  END IF;

  -- Verificar si el ciclo de 30 días (VIP) expiró para resetear contador de tier
  IF v_es_vip
     AND v_cliente.ciclo_inicio_at IS NOT NULL
     AND NOW() > v_cliente.ciclo_inicio_at + INTERVAL '30 days' THEN
    -- Nuevo ciclo: resetear contador de entregas
    UPDATE clientes SET entregas_ciclo = 0, ciclo_inicio_at = NOW() WHERE id = v_cliente.id;
    v_cliente.entregas_ciclo  := 0;
    v_cliente.ciclo_inicio_at := NOW();
  END IF;

  -- Calcular nueva cantidad de entregas en el ciclo
  v_entregas_nuevas := COALESCE(v_cliente.entregas_ciclo, 0) + 1;

  -- Calcular saldo ganado según tier VIP
  IF v_es_vip THEN
    v_saldo_ganado := fn_valor_entrega_vip(v_entregas_nuevas);
  ELSE
    v_saldo_ganado := 0.00;
  END IF;

  v_puntos_nuevos := COALESCE(v_cliente.puntos, 0) + 1;
  v_saldo_nuevo   := COALESCE(v_cliente.saldo_billetera, 0.00) + v_saldo_ganado;

  -- Fecha de expiración de puntos: se fija al primer punto del ciclo
  IF COALESCE(v_cliente.puntos, 0) = 0 THEN
    v_expiran_at   := NOW() + (v_dias_limite || ' days')::INTERVAL;
    v_ciclo_inicio := NOW();
  ELSE
    v_expiran_at   := v_cliente.puntos_expiran_at;
    v_ciclo_inicio := COALESCE(v_cliente.ciclo_inicio_at, NOW());
  END IF;

  -- Actualizar cliente
  UPDATE clientes
  SET puntos            = v_puntos_nuevos,
      saldo_billetera   = v_saldo_nuevo,
      puntos_expiran_at = v_expiran_at,
      entregas_ciclo    = v_entregas_nuevas,
      ciclo_inicio_at   = v_ciclo_inicio,
      envios_totales    = v_envios_totales,
      es_vip            = v_es_vip
  WHERE id = v_cliente.id;

  -- Registrar en historial
  INSERT INTO movimientos_saldo (
    cliente_tel, tipo, descripcion, puntos_delta, saldo_delta,
    puntos_nuevo, saldo_nuevo, pedido_id
  ) VALUES (
    p_cliente_tel, 'entrega',
    format('Entrega #%s del ciclo. +1 punto%s',
           v_entregas_nuevas,
           CASE WHEN v_es_vip THEN format(' +$%s billetera (tier %s)',
             v_saldo_ganado,
             CASE WHEN v_entregas_nuevas <= 10 THEN '★ Premium' ELSE 'Estándar' END)
           ELSE '' END),
    1, v_saldo_ganado,
    v_puntos_nuevos, v_saldo_nuevo,
    p_pedido_id
  );

  INSERT INTO registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion)
  VALUES (v_cliente.id, 'acumulacion', 1, v_saldo_ganado, 'Entrega # ' || v_entregas_nuevas);

  -- Si recién subió a VIP, mandar webhook a notificar-whatsapp
  IF v_recien_ascendido THEN
    BEGIN
      PERFORM net.http_post(
        url     := 'https://jdrrkpvodnqoljycixbg.supabase.co/functions/v1/notificar-whatsapp',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := jsonb_build_object(
                     'tipo', 'bienvenida_vip',
                     'cliente_tel', p_cliente_tel,
                     'cliente_nombre', v_cliente.nombre
                   )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notificar-whatsapp webhook error: %', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok',            true,
    'puntos',        v_puntos_nuevos,
    'saldo_billetera', v_saldo_nuevo,
    'saldo_ganado',  v_saldo_ganado,
    'entregas_ciclo',v_entregas_nuevas,
    'tier',          CASE WHEN v_entregas_nuevas <= 10 THEN 'premium_10' ELSE 'estandar_7' END,
    'es_vip',        v_es_vip,
    'recien_ascendido', v_recien_ascendido,
    'puede_canjear', v_puntos_nuevos >= 5,
    'expiran_at',    v_expiran_at
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$_$;


ALTER FUNCTION "public"."fn_registrar_entrega"("p_cliente_tel" "text", "p_pedido_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_update_cliente_gps_cache"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Solo se activa cuando un pedido cambia a estado "entregado"
  IF NEW.estado = 'entregado' AND OLD.estado != 'entregado' THEN
    
    -- Solo actualizamos si el pedido tiene coordenadas válidas
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
      
      -- Actualizamos la caché del cliente usando su número de teléfono
      UPDATE clientes 
      SET 
        lat_frecuente = NEW.lat,
        lng_frecuente = NEW.lng,
        updated_at = NOW()
      WHERE telefono = NEW.cliente_tel;
      
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_update_cliente_gps_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_valor_entrega_vip"("p_entregas_ciclo" integer) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $_$
  -- Entregas 1-10 en el ciclo: $10 por entrega
  -- Entregas 11+: $7 por entrega
  SELECT CASE WHEN p_entregas_ciclo <= 10 THEN 10.00 ELSE 7.00 END;
$_$;


ALTER FUNCTION "public"."fn_valor_entrega_vip"("p_entregas_ciclo" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_historial_cliente"("p_cliente_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."get_historial_cliente"("p_cliente_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_cliente"("p_telefono" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_cliente RECORD;
    v_qr_code TEXT;
    v_nuevo_cliente record;
BEGIN
    -- Intentar buscar al cliente por teléfono
    SELECT * INTO v_cliente FROM clientes WHERE telefono = p_telefono LIMIT 1;
    
    IF FOUND THEN
        -- Si existe, devolver sus datos en formato JSON
        RETURN row_to_json(v_cliente);
    ELSE
        -- Generar un código QR temporal (único probabilísticamente)
        v_qr_code := 'ED-' || extract(epoch from now())::text || '-' || substr(md5(random()::text), 1, 6);
        
        -- Insertar el nuevo cliente, con nombre por defecto basado en su teléfono
        INSERT INTO clientes (nombre, telefono, qr_code, puntos, envios_gratis_disponibles, envios_totales)
        VALUES ('Cliente ' || p_telefono, p_telefono, v_qr_code, 0, 0, 0)
        RETURNING * INTO v_nuevo_cliente;
        
        -- Devolver el cliente recién creado
        RETURN row_to_json(v_nuevo_cliente);
    END IF;
END;
$$;


ALTER FUNCTION "public"."get_or_create_cliente"("p_telefono" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN (COALESCE(auth.jwt()->>'email', '') LIKE '%@admin.com');
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."liquidar_turno_repartidor"("p_repartidor_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.servicios_repartidor
    SET liquidado = true
    WHERE repartidor_id = p_repartidor_id
      AND liquidado = false
      AND (estado = 'completado' OR (asignado_por IS NOT NULL AND estado != 'cancelado'));

    UPDATE public.gastos_motos
    SET liquidado = true
    WHERE repartidor_id = p_repartidor_id
      AND liquidado = false
      AND estado = 'aprobado';

    RETURN true;
END;
$$;


ALTER FUNCTION "public"."liquidar_turno_repartidor"("p_repartidor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_system_error"("p_level" "text", "p_source" "text", "p_message" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    INSERT INTO public.system_logs (level, source, message, metadata)
    VALUES (p_level, p_source, p_message, p_metadata);
END;
$$;


ALTER FUNCTION "public"."log_system_error"("p_level" "text", "p_source" "text", "p_message" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."monitor_pedidos_zombies"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_pedido   RECORD;
  v_payload  JSONB;
  v_anon_key TEXT;
BEGIN
  -- Leer anon_key desde la configuracion de la DB para autenticar la llamada HTTP.
  -- Configurar una sola vez con: ALTER DATABASE postgres SET app.settings.anon_key = 'tu_anon_key';
  -- anon_key es clave PUBLICA, seguro hardcodearla aqui
  v_anon_key CONSTANT TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ';

  FOR v_pedido IN
    SELECT id, descripcion, cliente_tel, estado,
           EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 AS mins_since_update,
           EXTRACT(EPOCH FROM (NOW() - created_at))  / 60 AS mins_total
    FROM pedidos
    WHERE estado IN ('pendiente', 'asignado', 'aceptado', 'recibido', 'en_camino')
      AND alerta_retraso_enviada = false
  LOOP
    -- REGLA: pedido asignado/aceptado sin moverse 10 min, O cualquier pedido > 40 min total
    IF (v_pedido.estado IN ('asignado', 'aceptado', 'recibido') AND v_pedido.mins_since_update >= 10) OR
       (v_pedido.mins_total >= 40) THEN

      v_payload := jsonb_build_object(
        'pedido_id',         v_pedido.id,
        'tipo',              'alerta_zombie',
        'descripcion',       v_pedido.descripcion,
        'minutos_total',     ROUND(v_pedido.mins_total::numeric),
        'minutos_estancado', ROUND(v_pedido.mins_since_update::numeric)
      );

      PERFORM net.http_post(
        url     := 'https://jdrrkpvodnqoljycixbg.supabase.co/functions/v1/notificar-whatsapp',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_anon_key
        ),
        body    := v_payload
      );

      UPDATE pedidos SET alerta_retraso_enviada = true WHERE id = v_pedido.id;
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."monitor_pedidos_zombies"() OWNER TO "postgres";

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
$$;


ALTER FUNCTION "public"."usar_cupon"("p_codigo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validar_cupon_publico"("p_codigo" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
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
$_$;


ALTER FUNCTION "public"."validar_cupon_publico"("p_codigo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validar_geocerca_entrega"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  distancia_metros FLOAT;
BEGIN
  -- Solo auditar cuando el repartidor intenta cambiar el estado a "entregado"
  -- y siempre y cuando el pedido original tenga coordenadas destino.
  IF NEW.estado = 'entregado' AND OLD.estado != 'entregado' AND NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    
    -- Validamos si el frontend o el webhook pasaron las coordenadas actuales (lat_entrega, lng_entrega)
    IF NEW.lat_entrega IS NOT NULL AND NEW.lng_entrega IS NOT NULL THEN
        -- Cálculo de Fórmula de Haversine pura (No requiere PostGIS)
        distancia_metros := ( 6371000 * acos( 
            cos( radians(NEW.lat) ) * cos( radians( NEW.lat_entrega ) ) * 
            cos( radians( NEW.lng_entrega ) - radians(NEW.lng) ) + 
            sin( radians(NEW.lat) ) * sin( radians( NEW.lat_entrega ) ) 
        ) );
        
        -- Tolerancia de 200 metros para margen de error GPS
        IF distancia_metros > 200 THEN
           RAISE EXCEPTION 'FRAUDE DE GEOCERCA DETECTADO: El repartidor está a % metros del destino. Debe estar a menos de 200m para poder entregar.', ROUND(distancia_metros::numeric, 1);
        END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validar_geocerca_entrega"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admins" (
    "id" "uuid" NOT NULL,
    "email" character varying(255) NOT NULL,
    "nombre" character varying(255) NOT NULL,
    "role" character varying(20) DEFAULT 'admin'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "admins_role_check" CHECK ((("role")::"text" = ANY ((ARRAY['admin'::character varying, 'superadmin'::character varying])::"text"[])))
);


ALTER TABLE "public"."admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."anuncios_flash" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "mensaje" "text" NOT NULL,
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."anuncios_flash" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "id" character varying(50) DEFAULT 'default'::character varying NOT NULL,
    "horarios" "jsonb" NOT NULL,
    "horas_felices" "jsonb" NOT NULL,
    "contacto" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."app_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auditoria_precios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "direccion_input" "text",
    "restaurante_lat" double precision,
    "restaurante_lng" double precision,
    "zona_resultante" "text",
    "precio" numeric,
    "colonia_detectada" "text",
    "distancia_km" double precision,
    "metodo_usado" "text",
    "tiempo_ms" integer,
    CONSTRAINT "auditoria_precios_metodo_usado_check" CHECK (("metodo_usado" = ANY (ARRAY['excepcion_gps'::"text", 'excepcion'::"text", 'colonia_google'::"text", 'distancia_conduccion'::"text", 'texto'::"text", 'fallback'::"text", 'lineal'::"text"])))
);


ALTER TABLE "public"."auditoria_precios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bot_memory" (
    "phone" "text" NOT NULL,
    "history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bot_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calificaciones_pendientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pedido_id" "uuid" NOT NULL,
    "cliente_tel" "text" NOT NULL,
    "cliente_nombre" "text",
    "restaurante" "text",
    "admin_phone" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."calificaciones_pendientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calificaciones_servicio" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "registro_punto_id" "uuid",
    "puntuacion" integer NOT NULL,
    "comentario" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "calificaciones_servicio_puntuacion_check" CHECK ((("puntuacion" >= 1) AND ("puntuacion" <= 5)))
);


ALTER TABLE "public"."calificaciones_servicio" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" character varying(255) NOT NULL,
    "telefono" character varying(20) NOT NULL,
    "email" character varying(255),
    "qr_code" character varying(255) NOT NULL,
    "puntos" integer DEFAULT 0,
    "envios_gratis_disponibles" integer DEFAULT 0,
    "envios_totales" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "es_vip" boolean DEFAULT false,
    "costo_envio" numeric(10,2) DEFAULT 0,
    "notas_crm" "text" DEFAULT ''::"text",
    "saldo_billetera" numeric(10,2) DEFAULT 0.00,
    "rango" "text" DEFAULT 'bronce'::"text" NOT NULL,
    "lat_frecuente" double precision,
    "lng_frecuente" double precision,
    "foto_fachada_url" "text",
    "etiqueta_zona" "text",
    "etiquetas" "text"[] DEFAULT '{}'::"text"[],
    "reputacion" "text" DEFAULT 'nuevo'::"text",
    "acepta_terminos" boolean DEFAULT false,
    "puntos_expiran_at" timestamp with time zone,
    "entregas_ciclo" integer DEFAULT 0 NOT NULL,
    "ciclo_inicio_at" timestamp with time zone,
    "cupon_activo" "text",
    CONSTRAINT "clientes_envios_gratis_disponibles_check" CHECK (("envios_gratis_disponibles" >= 0)),
    CONSTRAINT "clientes_envios_totales_check" CHECK (("envios_totales" >= 0)),
    CONSTRAINT "clientes_reputacion_check" CHECK (("reputacion" = ANY (ARRAY['excelente'::"text", 'bueno'::"text", 'nuevo'::"text", 'regular'::"text", 'malo'::"text", 'vetado'::"text"])))
);


ALTER TABLE "public"."clientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."colonias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" character varying(255) NOT NULL,
    "ciudad" character varying(255) DEFAULT 'Comitán'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "etiqueta_zona" "text" DEFAULT 'rojo'::"text",
    "lat" double precision,
    "lng" double precision,
    "precio" integer,
    "precio_max" integer,
    "cp" "text"
);


ALTER TABLE "public"."colonias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gastos_motos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "concepto" character varying(255) NOT NULL,
    "monto" numeric(10,2) NOT NULL,
    "fecha" timestamp with time zone DEFAULT "now"(),
    "estado" character varying(20) DEFAULT 'aprobado'::character varying,
    "moto_id" "uuid",
    "tipo_gasto" "text" DEFAULT 'otro'::"text",
    "repartidor_id" "uuid",
    "comprobante_url" "text",
    "liquidado" boolean DEFAULT false,
    "categoria" "text" DEFAULT 'flota'::"text"
);


ALTER TABLE "public"."gastos_motos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."repartidores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "nombre" "text" NOT NULL,
    "telefono" "text",
    "alias" "text",
    "foto_url" "text",
    "activo" boolean DEFAULT true,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "meta_envios" integer DEFAULT 0,
    "moto_id" "uuid"
);


ALTER TABLE "public"."repartidores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."servicios_repartidor" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repartidor_id" "uuid",
    "cliente_id" "uuid",
    "descripcion" "text" NOT NULL,
    "monto" numeric(10,2) DEFAULT 0 NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text",
    "turno_fecha" "date" DEFAULT CURRENT_DATE,
    "asignado_por" "uuid",
    "creado_por" "uuid",
    "notas" "text",
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "liquidado" boolean DEFAULT false,
    "comprobante_url" "text",
    "restaurante_id" "uuid",
    "tipo_servicio" "text" DEFAULT 'cliente'::"text",
    "rating" integer DEFAULT 5,
    CONSTRAINT "servicios_repartidor_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'completado'::"text", 'cancelado'::"text"])))
);


ALTER TABLE "public"."servicios_repartidor" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cuadre_repartidores" AS
 WITH "base_counts" AS (
         SELECT "r"."id" AS "repartidor_id",
            "r"."nombre" AS "repartidor",
            "r"."alias",
            COALESCE(("s"."turno_fecha")::"text", (CURRENT_DATE)::"text") AS "turno_fecha",
            COALESCE("sum"("s"."monto") FILTER (WHERE (("s"."asignado_por" IS NOT NULL) AND ("s"."estado" <> 'cancelado'::"text") AND ("s"."liquidado" = false))), (0)::numeric) AS "total_admin",
            COALESCE("sum"("s"."monto") FILTER (WHERE (("s"."creado_por" IS NOT NULL) AND ("s"."estado" = 'completado'::"text") AND ("s"."liquidado" = false))), (0)::numeric) AS "total_repartidor"
           FROM ("public"."repartidores" "r"
             LEFT JOIN "public"."servicios_repartidor" "s" ON (("s"."repartidor_id" = "r"."id")))
          WHERE ("r"."activo" = true)
          GROUP BY "r"."id", "r"."nombre", "r"."alias", ("s"."turno_fecha")::"text"
        ), "weekly_expenses" AS (
         SELECT "gastos_motos"."repartidor_id",
            (("gastos_motos"."fecha")::"date")::"text" AS "fecha_gasto",
            "sum"("gastos_motos"."monto") AS "total_gastos"
           FROM "public"."gastos_motos"
          WHERE ((("gastos_motos"."estado")::"text" = 'aprobado'::"text") AND ("gastos_motos"."liquidado" = false))
          GROUP BY "gastos_motos"."repartidor_id", (("gastos_motos"."fecha")::"date")::"text"
        )
 SELECT "b"."repartidor_id",
    "b"."repartidor",
    "b"."alias",
    "b"."turno_fecha",
    "b"."total_admin",
    "b"."total_repartidor",
    COALESCE("e"."total_gastos", (0)::numeric) AS "total_gastos",
    (("b"."total_admin" - COALESCE("e"."total_gastos", (0)::numeric)) - "b"."total_repartidor") AS "diferencia"
   FROM ("base_counts" "b"
     LEFT JOIN "weekly_expenses" "e" ON ((("e"."repartidor_id" = "b"."repartidor_id") AND ("e"."fecha_gasto" = "b"."turno_fecha"))));


ALTER VIEW "public"."cuadre_repartidores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cupones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo" "text" NOT NULL,
    "cliente_tel" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "valor_pesos" numeric(10,2) NOT NULL,
    "puntos_usados" integer DEFAULT 0 NOT NULL,
    "saldo_usado" numeric(10,2) DEFAULT 0.00 NOT NULL,
    "restaurante" "text",
    "estado" "text" DEFAULT 'activo'::"text" NOT NULL,
    "pedido_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    CONSTRAINT "cupones_estado_check" CHECK (("estado" = ANY (ARRAY['activo'::"text", 'usado'::"text", 'expirado'::"text"]))),
    CONSTRAINT "cupones_tipo_check" CHECK (("tipo" = ANY (ARRAY['envio_normal'::"text", 'envio_vip'::"text", 'billetera'::"text"]))),
    CONSTRAINT "cupones_valor_pesos_check" CHECK (("valor_pesos" > (0)::numeric))
);


ALTER TABLE "public"."cupones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meta_envios_diarios" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "repartidor_id" "uuid",
    "meta_envios" integer DEFAULT 15 NOT NULL,
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."meta_envios_diarios" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."envios_hoy_por_repartidor" AS
 SELECT "r"."id" AS "repartidor_id",
    "r"."nombre" AS "repartidor",
    "r"."alias",
    "r"."activo",
    COALESCE("med"."meta_envios", 0) AS "meta_envios",
    "count"("s"."id") FILTER (WHERE (("s"."turno_fecha" = CURRENT_DATE) AND ("s"."estado" = 'completado'::"text") AND ("s"."liquidado" = false))) AS "envios_hoy"
   FROM (("public"."repartidores" "r"
     LEFT JOIN "public"."servicios_repartidor" "s" ON (("s"."repartidor_id" = "r"."id")))
     LEFT JOIN "public"."meta_envios_diarios" "med" ON ((("med"."repartidor_id" = "r"."id") AND ("med"."fecha" = CURRENT_DATE))))
  WHERE ("r"."activo" = true)
  GROUP BY "r"."id", "r"."nombre", "r"."alias", "r"."activo", "med"."meta_envios";


ALTER VIEW "public"."envios_hoy_por_repartidor" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."excepciones_precio" (
    "id" integer NOT NULL,
    "colonia_texto" "text" NOT NULL,
    "zona_forzada" "text" NOT NULL,
    "dificultad_alta" boolean DEFAULT false NOT NULL,
    "motivo" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "zona_id" integer,
    "lat" double precision,
    "lng" double precision,
    "radio_metros" integer DEFAULT 100
);


ALTER TABLE "public"."excepciones_precio" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."excepciones_precio_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."excepciones_precio_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."excepciones_precio_id_seq" OWNED BY "public"."excepciones_precio"."id";



CREATE OR REPLACE VIEW "public"."leaderboard_repartidores" AS
 SELECT "r"."id",
    "r"."nombre",
    "r"."alias",
    "r"."foto_url",
    "count"("s"."id") FILTER (WHERE (("s"."estado" = 'completado'::"text") OR ("s"."estado" = 'entregado'::"text"))) AS "completados",
    COALESCE("sum"("s"."monto") FILTER (WHERE (("s"."estado" = 'completado'::"text") OR ("s"."estado" = 'entregado'::"text"))), (0)::numeric) AS "total_generado",
    "round"(
        CASE
            WHEN ("count"("s"."id") > 0) THEN ((("count"("s"."id") FILTER (WHERE (("s"."estado" = 'completado'::"text") OR ("s"."estado" = 'entregado'::"text"))))::numeric / ("count"("s"."id"))::numeric) * (100)::numeric)
            ELSE (0)::numeric
        END, 0) AS "efectividad",
    COALESCE("avg"("s"."rating"), 5.0) AS "rating_estrellas"
   FROM ("public"."repartidores" "r"
     LEFT JOIN "public"."servicios_repartidor" "s" ON (("s"."repartidor_id" = "r"."id")))
  WHERE ("r"."activo" = true)
  GROUP BY "r"."id", "r"."nombre", "r"."alias", "r"."foto_url";


ALTER VIEW "public"."leaderboard_repartidores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_points" (
    "phone" "text" NOT NULL,
    "puntos" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loyalty_points" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_categorias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurante_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "emoji" "text" DEFAULT '🍽'::"text",
    "orden" integer DEFAULT 0,
    "activa" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."menu_categorias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_combos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurante_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "precio" numeric(10,2) DEFAULT 0 NOT NULL,
    "foto_url" "text",
    "incluye" "text"[],
    "disponible" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."menu_combos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurante_id" "uuid" NOT NULL,
    "categoria_id" "uuid",
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "precio" numeric(10,2) DEFAULT 0 NOT NULL,
    "foto_url" "text",
    "disponible" boolean DEFAULT true,
    "es_popular" boolean DEFAULT false,
    "orden" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_promociones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurante_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "descripcion" "text",
    "precio_especial" numeric(10,2),
    "foto_url" "text",
    "fecha_fin" "date",
    "activa" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."menu_promociones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."motos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "placa" "text" NOT NULL,
    "alias" "text",
    "marca" "text",
    "admin_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "estado" "text" DEFAULT 'activa'::"text"
);


ALTER TABLE "public"."motos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."movimientos_saldo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_tel" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "descripcion" "text" NOT NULL,
    "puntos_delta" integer DEFAULT 0 NOT NULL,
    "saldo_delta" numeric(10,2) DEFAULT 0.00 NOT NULL,
    "puntos_nuevo" integer NOT NULL,
    "saldo_nuevo" numeric(10,2) NOT NULL,
    "pedido_id" "uuid",
    "cupon_codigo" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "movimientos_saldo_tipo_check" CHECK (("tipo" = ANY (ARRAY['entrega'::"text", 'canje_envio'::"text", 'canje_billetera'::"text", 'expiracion'::"text", 'ajuste_manual'::"text"])))
);


ALTER TABLE "public"."movimientos_saldo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedidos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_tel" "text" NOT NULL,
    "repartidor_id" "uuid",
    "descripcion" "text" NOT NULL,
    "direccion" "text",
    "estado" "text" DEFAULT 'asignado'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cliente_nombre" "text",
    "restaurante" "text",
    "lat" double precision,
    "lng" double precision,
    "wb_message_id" "text",
    "precio_entrega" numeric,
    "zona_entrega" "text",
    "lat_entrega" double precision,
    "lng_entrega" double precision,
    "alerta_retraso_enviada" boolean DEFAULT false,
    CONSTRAINT "pedidos_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'asignado'::"text", 'aceptado'::"text", 'recibido'::"text", 'en_camino'::"text", 'entregado'::"text", 'cancelado'::"text"])))
);


ALTER TABLE "public"."pedidos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promociones_dinamicas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "titulo" character varying(255) NOT NULL,
    "descripcion" "text",
    "activa" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."promociones_dinamicas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."registros_puntos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "tipo" character varying(20) NOT NULL,
    "puntos" integer NOT NULL,
    "descripcion" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "latitud" numeric(10,8),
    "longitud" numeric(11,8),
    "monto_saldo" numeric(10,2) DEFAULT 0.00,
    CONSTRAINT "registros_puntos_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['acumulacion'::character varying, 'canje'::character varying])::"text"[])))
);


ALTER TABLE "public"."registros_puntos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurante_colonias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurante_telefono" "text" NOT NULL,
    "colonia_id" "uuid" NOT NULL,
    "aplica_hora_feliz" boolean DEFAULT false,
    "precio_estandar" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."restaurante_colonias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restaurantes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "admin_id" "uuid",
    "nombre" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "telefono" character varying(20),
    "activo" boolean DEFAULT true,
    "direccion" "text",
    "lat" double precision,
    "lng" double precision,
    "es_socio" boolean DEFAULT false,
    "etiqueta_zona" "text" DEFAULT 'verde'::"text",
    "foto_fachada_url" "text",
    "hora_apertura" time without time zone,
    "hora_cierre" time without time zone,
    "categorias" "text"[]
);


ALTER TABLE "public"."restaurantes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."restaurantes"."es_socio" IS 'Si es TRUE, el Restaurante entra al convenio VIP: Zonas verdes a $35 y -$5/-$10 en el resto.';



CREATE TABLE IF NOT EXISTS "public"."restaurantes_solicitudes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre_restaurante" "text" NOT NULL,
    "correo" "text" NOT NULL,
    "telefono" "text" NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text",
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "actualizado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."restaurantes_solicitudes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."resumen_semanal_negocio" AS
 WITH "ingresos_semanales" AS (
         SELECT ("date_trunc"('week'::"text", ("servicios_repartidor"."turno_fecha")::timestamp with time zone))::"date" AS "semana",
            "sum"("servicios_repartidor"."monto") AS "total_ingresos",
            "count"("servicios_repartidor"."id") AS "servicios_count"
           FROM "public"."servicios_repartidor"
          WHERE ("servicios_repartidor"."estado" = 'completado'::"text")
          GROUP BY (("date_trunc"('week'::"text", ("servicios_repartidor"."turno_fecha")::timestamp with time zone))::"date")
        ), "gastos_semanales" AS (
         SELECT ("date_trunc"('week'::"text", (("gastos_motos"."fecha")::"date")::timestamp with time zone))::"date" AS "semana",
            "sum"("gastos_motos"."monto") AS "total_gastos"
           FROM "public"."gastos_motos"
          WHERE (("gastos_motos"."estado")::"text" = 'aprobado'::"text")
          GROUP BY (("date_trunc"('week'::"text", (("gastos_motos"."fecha")::"date")::timestamp with time zone))::"date")
        )
 SELECT COALESCE("i"."semana", "g"."semana") AS "semana_inicio",
    COALESCE("i"."total_ingresos", (0)::numeric) AS "ingresos_totales",
    COALESCE("g"."total_gastos", (0)::numeric) AS "gastos_totales",
    COALESCE("i"."servicios_count", (0)::bigint) AS "total_servicios"
   FROM ("ingresos_semanales" "i"
     FULL JOIN "gastos_semanales" "g" ON (("i"."semana" = "g"."semana")))
  ORDER BY COALESCE("i"."semana", "g"."semana") DESC;


ALTER VIEW "public"."resumen_semanal_negocio" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "level" "text" NOT NULL,
    "source" "text" NOT NULL,
    "message" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "system_logs_level_check" CHECK (("level" = ANY (ARRAY['info'::"text", 'warn'::"text", 'error'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."system_logs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vista_clientes_stats" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::character varying(255) AS "nombre",
    NULL::character varying(20) AS "telefono",
    NULL::character varying(255) AS "email",
    NULL::character varying(255) AS "qr_code",
    NULL::integer AS "puntos",
    NULL::integer AS "envios_gratis_disponibles",
    NULL::integer AS "envios_totales",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at",
    NULL::bigint AS "total_registros",
    NULL::timestamp with time zone AS "ultima_actividad";


ALTER VIEW "public"."vista_clientes_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zonas_entrega" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "color_emoji" "text" DEFAULT '🟢'::"text" NOT NULL,
    "precio" numeric(8,2) NOT NULL,
    "precio_max" numeric(8,2) DEFAULT NULL::numeric,
    "km_max" numeric(5,2) DEFAULT NULL::numeric,
    "colonias" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "actualizado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."zonas_entrega" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."zonas_entrega_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."zonas_entrega_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."zonas_entrega_id_seq" OWNED BY "public"."zonas_entrega"."id";



ALTER TABLE ONLY "public"."excepciones_precio" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."excepciones_precio_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."zonas_entrega" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."zonas_entrega_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anuncios_flash"
    ADD CONSTRAINT "anuncios_flash_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auditoria_precios"
    ADD CONSTRAINT "auditoria_precios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bot_memory"
    ADD CONSTRAINT "bot_memory_pkey" PRIMARY KEY ("phone");



ALTER TABLE ONLY "public"."calificaciones_pendientes"
    ADD CONSTRAINT "calificaciones_pendientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calificaciones_servicio"
    ADD CONSTRAINT "calificaciones_servicio_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calificaciones_servicio"
    ADD CONSTRAINT "calificaciones_servicio_registro_punto_id_key" UNIQUE ("registro_punto_id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_qr_code_key" UNIQUE ("qr_code");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_telefono_key" UNIQUE ("telefono");



ALTER TABLE ONLY "public"."colonias"
    ADD CONSTRAINT "colonias_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."colonias"
    ADD CONSTRAINT "colonias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cupones"
    ADD CONSTRAINT "cupones_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."cupones"
    ADD CONSTRAINT "cupones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."excepciones_precio"
    ADD CONSTRAINT "excepciones_precio_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gastos_motos"
    ADD CONSTRAINT "gastos_motos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_points"
    ADD CONSTRAINT "loyalty_points_pkey" PRIMARY KEY ("phone");



ALTER TABLE ONLY "public"."menu_categorias"
    ADD CONSTRAINT "menu_categorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_combos"
    ADD CONSTRAINT "menu_combos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_promociones"
    ADD CONSTRAINT "menu_promociones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meta_envios_diarios"
    ADD CONSTRAINT "meta_envios_diarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meta_envios_diarios"
    ADD CONSTRAINT "meta_envios_diarios_repartidor_id_fecha_key" UNIQUE ("repartidor_id", "fecha");



ALTER TABLE ONLY "public"."motos"
    ADD CONSTRAINT "motos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."motos"
    ADD CONSTRAINT "motos_placa_key" UNIQUE ("placa");



ALTER TABLE ONLY "public"."movimientos_saldo"
    ADD CONSTRAINT "movimientos_saldo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promociones_dinamicas"
    ADD CONSTRAINT "promociones_dinamicas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."registros_puntos"
    ADD CONSTRAINT "registros_puntos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."repartidores"
    ADD CONSTRAINT "repartidores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurante_colonias"
    ADD CONSTRAINT "restaurante_colonias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurante_colonias"
    ADD CONSTRAINT "restaurante_colonias_restaurante_telefono_colonia_id_key" UNIQUE ("restaurante_telefono", "colonia_id");



ALTER TABLE ONLY "public"."restaurantes"
    ADD CONSTRAINT "restaurantes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurantes_solicitudes"
    ADD CONSTRAINT "restaurantes_solicitudes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."servicios_repartidor"
    ADD CONSTRAINT "servicios_repartidor_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zonas_entrega"
    ADD CONSTRAINT "zonas_entrega_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_clientes_created_at" ON "public"."clientes" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_clientes_nombre_trgm" ON "public"."clientes" USING "gin" ("nombre" "public"."gin_trgm_ops");



CREATE INDEX "idx_clientes_qr_code" ON "public"."clientes" USING "btree" ("qr_code");



CREATE INDEX "idx_clientes_reputacion" ON "public"."clientes" USING "btree" ("reputacion");



CREATE INDEX "idx_clientes_telefono" ON "public"."clientes" USING "btree" ("telefono");



CREATE INDEX "idx_clientes_telefono_trgm" ON "public"."clientes" USING "gin" ("telefono" "public"."gin_trgm_ops");



CREATE INDEX "idx_cupones_codigo" ON "public"."cupones" USING "btree" ("codigo");



CREATE INDEX "idx_cupones_estado" ON "public"."cupones" USING "btree" ("estado");



CREATE INDEX "idx_cupones_tel" ON "public"."cupones" USING "btree" ("cliente_tel");



CREATE INDEX "idx_exc_activo" ON "public"."excepciones_precio" USING "btree" ("activo");



CREATE INDEX "idx_exc_colonia_unaccent" ON "public"."excepciones_precio" USING "btree" ("public"."f_unaccent"("lower"("colonia_texto")));



CREATE INDEX "idx_exc_zona_id" ON "public"."excepciones_precio" USING "btree" ("zona_id");



CREATE INDEX "idx_excepciones_activo" ON "public"."excepciones_precio" USING "btree" ("activo");



CREATE INDEX "idx_excepciones_colonia" ON "public"."excepciones_precio" USING "btree" ("lower"("colonia_texto"));



CREATE INDEX "idx_menu_combos_restaurante" ON "public"."menu_combos" USING "btree" ("restaurante_id");



CREATE INDEX "idx_menu_items_categoria" ON "public"."menu_items" USING "btree" ("categoria_id");



CREATE INDEX "idx_menu_items_restaurante" ON "public"."menu_items" USING "btree" ("restaurante_id");



CREATE INDEX "idx_movimientos_fecha" ON "public"."movimientos_saldo" USING "btree" ("created_at");



CREATE INDEX "idx_movimientos_tel" ON "public"."movimientos_saldo" USING "btree" ("cliente_tel");



CREATE INDEX "idx_pedidos_cliente_tel_trgm" ON "public"."pedidos" USING "gin" ("cliente_tel" "public"."gin_trgm_ops");



CREATE INDEX "idx_registros_cliente" ON "public"."registros_puntos" USING "btree" ("cliente_id");



CREATE INDEX "idx_registros_created_at" ON "public"."registros_puntos" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_repartidores_alias_trgm" ON "public"."repartidores" USING "gin" ("alias" "public"."gin_trgm_ops");



CREATE INDEX "idx_repartidores_nombre_trgm" ON "public"."repartidores" USING "gin" ("nombre" "public"."gin_trgm_ops");



CREATE INDEX "idx_repartidores_telefono_trgm" ON "public"."repartidores" USING "gin" ("telefono" "public"."gin_trgm_ops");



CREATE INDEX "idx_restaurantes_nombre_trgm" ON "public"."restaurantes" USING "gin" ("nombre" "public"."gin_trgm_ops");



CREATE INDEX "idx_restaurantes_telefono_trgm" ON "public"."restaurantes" USING "gin" ("telefono" "public"."gin_trgm_ops");



CREATE INDEX "idx_servicios_estado" ON "public"."servicios_repartidor" USING "btree" ("estado");



CREATE INDEX "idx_servicios_repartidor" ON "public"."servicios_repartidor" USING "btree" ("repartidor_id");



CREATE INDEX "idx_servicios_turno" ON "public"."servicios_repartidor" USING "btree" ("turno_fecha");



CREATE INDEX "idx_system_logs_created_at" ON "public"."system_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_system_logs_level" ON "public"."system_logs" USING "btree" ("level");



CREATE INDEX "idx_system_logs_source" ON "public"."system_logs" USING "btree" ("source");



CREATE INDEX "idx_zonas_activo_orden" ON "public"."zonas_entrega" USING "btree" ("activo", "orden");



CREATE INDEX "idx_zonas_colonias_gin" ON "public"."zonas_entrega" USING "gin" ("colonias");



CREATE INDEX "pedidos_created_at_idx" ON "public"."pedidos" USING "btree" ("created_at" DESC);



CREATE INDEX "pedidos_estado_idx" ON "public"."pedidos" USING "btree" ("estado");



CREATE INDEX "pedidos_repartidor_idx" ON "public"."pedidos" USING "btree" ("repartidor_id");



CREATE UNIQUE INDEX "pedidos_wb_message_id_idx" ON "public"."pedidos" USING "btree" ("wb_message_id") WHERE ("wb_message_id" IS NOT NULL);



CREATE OR REPLACE VIEW "public"."vista_clientes_stats" AS
 SELECT "c"."id",
    "c"."nombre",
    "c"."telefono",
    "c"."email",
    "c"."qr_code",
    "c"."puntos",
    "c"."envios_gratis_disponibles",
    "c"."envios_totales",
    "c"."created_at",
    "c"."updated_at",
    "count"("r"."id") AS "total_registros",
    "max"("r"."created_at") AS "ultima_actividad"
   FROM ("public"."clientes" "c"
     LEFT JOIN "public"."registros_puntos" "r" ON (("c"."id" = "r"."cliente_id")))
  GROUP BY "c"."id";



CREATE OR REPLACE TRIGGER "trg_geocerca_entrega" BEFORE UPDATE OF "estado" ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."validar_geocerca_entrega"();



CREATE OR REPLACE TRIGGER "trg_notificar_estado_pedido" AFTER UPDATE OF "estado" ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_notificar_cambio_estado_pedido"();



CREATE OR REPLACE TRIGGER "trg_pedidos_updated_at" BEFORE UPDATE ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."update_pedidos_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_cliente_gps_cache" AFTER UPDATE OF "estado" ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_cliente_gps_cache"();



CREATE OR REPLACE TRIGGER "trigger_zonas_timestamp" BEFORE UPDATE ON "public"."zonas_entrega" FOR EACH ROW EXECUTE FUNCTION "public"."update_zonas_timestamp"();



CREATE OR REPLACE TRIGGER "update_app_config_updated_at" BEFORE UPDATE ON "public"."app_config" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_clientes_updated_at" BEFORE UPDATE ON "public"."clientes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calificaciones_servicio"
    ADD CONSTRAINT "calificaciones_servicio_registro_punto_id_fkey" FOREIGN KEY ("registro_punto_id") REFERENCES "public"."registros_puntos"("id");



ALTER TABLE ONLY "public"."cupones"
    ADD CONSTRAINT "cupones_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."excepciones_precio"
    ADD CONSTRAINT "excepciones_precio_zona_id_fkey" FOREIGN KEY ("zona_id") REFERENCES "public"."zonas_entrega"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gastos_motos"
    ADD CONSTRAINT "gastos_motos_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gastos_motos"
    ADD CONSTRAINT "gastos_motos_moto_id_fkey" FOREIGN KEY ("moto_id") REFERENCES "public"."motos"("id");



ALTER TABLE ONLY "public"."gastos_motos"
    ADD CONSTRAINT "gastos_motos_repartidor_id_fkey" FOREIGN KEY ("repartidor_id") REFERENCES "public"."repartidores"("id");



ALTER TABLE ONLY "public"."menu_categorias"
    ADD CONSTRAINT "menu_categorias_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_combos"
    ADD CONSTRAINT "menu_combos_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."menu_categorias"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_promociones"
    ADD CONSTRAINT "menu_promociones_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meta_envios_diarios"
    ADD CONSTRAINT "meta_envios_diarios_repartidor_id_fkey" FOREIGN KEY ("repartidor_id") REFERENCES "public"."repartidores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."motos"
    ADD CONSTRAINT "motos_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."movimientos_saldo"
    ADD CONSTRAINT "movimientos_saldo_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_repartidor_id_fkey" FOREIGN KEY ("repartidor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."registros_puntos"
    ADD CONSTRAINT "registros_puntos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registros_puntos"
    ADD CONSTRAINT "registros_puntos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."repartidores"
    ADD CONSTRAINT "repartidores_moto_id_fkey" FOREIGN KEY ("moto_id") REFERENCES "public"."motos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."repartidores"
    ADD CONSTRAINT "repartidores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurante_colonias"
    ADD CONSTRAINT "restaurante_colonias_colonia_id_fkey" FOREIGN KEY ("colonia_id") REFERENCES "public"."colonias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restaurantes"
    ADD CONSTRAINT "restaurantes_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."servicios_repartidor"
    ADD CONSTRAINT "servicios_repartidor_asignado_por_fkey" FOREIGN KEY ("asignado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."servicios_repartidor"
    ADD CONSTRAINT "servicios_repartidor_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."servicios_repartidor"
    ADD CONSTRAINT "servicios_repartidor_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."servicios_repartidor"
    ADD CONSTRAINT "servicios_repartidor_repartidor_id_fkey" FOREIGN KEY ("repartidor_id") REFERENCES "public"."repartidores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."servicios_repartidor"
    ADD CONSTRAINT "servicios_repartidor_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "public"."restaurantes"("id") ON DELETE SET NULL;



CREATE POLICY "Admin puede modificar" ON "public"."zonas_entrega" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Admin_Cat" ON "public"."menu_categorias" USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."id" = "auth"."uid"()))));



CREATE POLICY "Admin_Combo" ON "public"."menu_combos" USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."id" = "auth"."uid"()))));



CREATE POLICY "Admin_Items" ON "public"."menu_items" USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."id" = "auth"."uid"()))));



CREATE POLICY "Admin_Promo" ON "public"."menu_promociones" USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."id" = "auth"."uid"()))));



CREATE POLICY "Admins_Full_Access_Colonias" ON "public"."colonias" USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."id" = "auth"."uid"()))));



CREATE POLICY "Admins_Full_Access_Restaurante_Colonias" ON "public"."restaurante_colonias" USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."id" = "auth"."uid"()))));



CREATE POLICY "Admins_Full_Access_Restaurantes" ON "public"."restaurantes" USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."id" = "auth"."uid"()))));



CREATE POLICY "Allow admin manage motos" ON "public"."motos" USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."id" = "auth"."uid"()))));



CREATE POLICY "Allow admin read ratings" ON "public"."calificaciones_servicio" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."id" = "auth"."uid"()))));



CREATE POLICY "Allow public insert ratings" ON "public"."calificaciones_servicio" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow public read app_config" ON "public"."app_config" FOR SELECT USING (true);



CREATE POLICY "Allow public read clientes" ON "public"."clientes" FOR SELECT USING (true);



CREATE POLICY "Allow public read own registros" ON "public"."registros_puntos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."clientes"
  WHERE ("clientes"."id" = "registros_puntos"."cliente_id"))));



CREATE POLICY "Allow public read promos" ON "public"."promociones_dinamicas" FOR SELECT USING (("activa" = true));



CREATE POLICY "Auth_Read_Restaurantes" ON "public"."restaurantes" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Bot can insert audit logs" ON "public"."auditoria_precios" FOR INSERT WITH CHECK (true);



CREATE POLICY "Denegar lectura publica a system_logs" ON "public"."system_logs" FOR SELECT USING (false);



CREATE POLICY "Lectura pública" ON "public"."zonas_entrega" FOR SELECT USING (true);



CREATE POLICY "Lectura pública excepciones" ON "public"."excepciones_precio" FOR SELECT USING (true);



CREATE POLICY "Permitir inserción anonima a system_logs" ON "public"."system_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "Permitir lectura publica de pedidos" ON "public"."pedidos" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Permitir_Insertar_Pedidos_Web_Publicos" ON "public"."pedidos" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public_Cat" ON "public"."menu_categorias" FOR SELECT USING (("activa" = true));



CREATE POLICY "Public_Combo" ON "public"."menu_combos" FOR SELECT USING (("disponible" = true));



CREATE POLICY "Public_Items" ON "public"."menu_items" FOR SELECT USING (("disponible" = true));



CREATE POLICY "Public_Promo" ON "public"."menu_promociones" FOR SELECT USING ((("activa" = true) AND (("fecha_fin" IS NULL) OR ("fecha_fin" >= CURRENT_DATE))));



CREATE POLICY "Public_Read_Restaurantes" ON "public"."restaurantes" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Rest_Own_Cat" ON "public"."menu_categorias" USING (("restaurante_id" IN ( SELECT "restaurantes"."id"
   FROM "public"."restaurantes"
  WHERE ("restaurantes"."admin_id" = "auth"."uid"()))));



CREATE POLICY "Rest_Own_Combo" ON "public"."menu_combos" USING (("restaurante_id" IN ( SELECT "restaurantes"."id"
   FROM "public"."restaurantes"
  WHERE ("restaurantes"."admin_id" = "auth"."uid"()))));



CREATE POLICY "Rest_Own_Items" ON "public"."menu_items" USING (("restaurante_id" IN ( SELECT "restaurantes"."id"
   FROM "public"."restaurantes"
  WHERE ("restaurantes"."admin_id" = "auth"."uid"()))));



CREATE POLICY "Rest_Own_Promo" ON "public"."menu_promociones" USING (("restaurante_id" IN ( SELECT "restaurantes"."id"
   FROM "public"."restaurantes"
  WHERE ("restaurantes"."admin_id" = "auth"."uid"()))));



CREATE POLICY "Service role modifica excepciones" ON "public"."excepciones_precio" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service_Role_Bypass" ON "public"."restaurantes" USING (true);



CREATE POLICY "Service_Role_Colonias" ON "public"."colonias" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service_Role_Restaurante_Colonias" ON "public"."restaurante_colonias" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "admin_all_pedidos" ON "public"."pedidos" USING ((("auth"."jwt"() ->> 'email'::"text") ~~* '%@admin.com'::"text"));



ALTER TABLE "public"."admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins_self_read" ON "public"."admins" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "anuncios_escritura" ON "public"."anuncios_flash" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."anuncios_flash" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anuncios_lectura" ON "public"."anuncios_flash" FOR SELECT USING (("activo" = true));



ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_config_escritura" ON "public"."app_config" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."auditoria_precios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calificaciones_servicio" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cliente_ve_sus_cupones" ON "public"."cupones" FOR SELECT USING (("cliente_tel" = (("current_setting"('request.jwt.claims'::"text", true))::"jsonb" ->> 'telefono'::"text")));



CREATE POLICY "cliente_ve_sus_movimientos" ON "public"."movimientos_saldo" FOR SELECT USING (("cliente_tel" = (("current_setting"('request.jwt.claims'::"text", true))::"jsonb" ->> 'telefono'::"text")));



ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clientes_escritura" ON "public"."clientes" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "clientes_read_auth" ON "public"."clientes" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."colonias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cupones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."excepciones_precio" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gastos_autenticados" ON "public"."gastos_motos" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."gastos_motos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "manage_own_gastos" ON "public"."gastos_motos" TO "authenticated" USING (("auth"."uid"() = "admin_id")) WITH CHECK (("auth"."uid"() = "admin_id"));



CREATE POLICY "manage_own_motos" ON "public"."motos" TO "authenticated" USING (("auth"."uid"() = "admin_id")) WITH CHECK (("auth"."uid"() = "admin_id"));



ALTER TABLE "public"."menu_categorias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_combos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_promociones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."motos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movimientos_saldo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pedidos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promociones_dinamicas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "promos_escritura" ON "public"."promociones_dinamicas" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "promos_lectura" ON "public"."promociones_dinamicas" FOR SELECT USING (("activa" = true));



CREATE POLICY "registros_escritura" ON "public"."registros_puntos" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "registros_insert_auth" ON "public"."registros_puntos" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "registros_lectura" ON "public"."registros_puntos" FOR SELECT USING (true);



ALTER TABLE "public"."registros_puntos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "registros_read_self" ON "public"."registros_puntos" FOR SELECT USING ((("auth"."uid"() = "created_by") OR (("auth"."jwt"() ->> 'email'::"text") ~~ '%@admin.com'::"text")));



CREATE POLICY "repartidor_own_pedidos" ON "public"."pedidos" FOR SELECT USING (("repartidor_id" = "auth"."uid"()));



CREATE POLICY "repartidor_update_estado" ON "public"."pedidos" FOR UPDATE USING (("repartidor_id" = "auth"."uid"())) WITH CHECK (("repartidor_id" = "auth"."uid"()));



ALTER TABLE "public"."repartidores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "repartidores_admin" ON "public"."repartidores" USING (((("auth"."jwt"() ->> 'email'::"text") ~~ '%@admin.com'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."id" = "auth"."uid"())))));



CREATE POLICY "repartidores_link_self" ON "public"."repartidores" FOR UPDATE USING (("user_id" IS NULL)) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "repartidores_read_auth" ON "public"."repartidores" FOR SELECT USING (true);



CREATE POLICY "repartidores_read_unlinked" ON "public"."repartidores" FOR SELECT USING ((("user_id" IS NULL) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "repartidores_self" ON "public"."repartidores" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."restaurante_colonias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurantes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurantes_solicitudes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "servicios_admin_all" ON "public"."servicios_repartidor" USING (((("auth"."jwt"() ->> 'email'::"text") ~~ '%@admin.com'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."admins"
  WHERE ("admins"."id" = "auth"."uid"())))));



CREATE POLICY "servicios_rep_own" ON "public"."servicios_repartidor" USING (("repartidor_id" IN ( SELECT "repartidores"."id"
   FROM "public"."repartidores"
  WHERE ("repartidores"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."servicios_repartidor" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "view_all_gastos" ON "public"."gastos_motos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "view_all_motos" ON "public"."motos" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."zonas_entrega" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."admins";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."app_config";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bot_memory";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."calificaciones_servicio";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."clientes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."gastos_motos";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."motos";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."promociones_dinamicas";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."registros_puntos";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."acumular_punto"("p_cliente_id" "uuid", "p_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."acumular_punto"("p_cliente_id" "uuid", "p_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."acumular_punto"("p_cliente_id" "uuid", "p_admin_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."buscar_excepcion"("p_texto" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."buscar_excepcion"("p_texto" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."buscar_excepcion"("p_texto" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancelar_cupon"("p_codigo" "text", "p_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancelar_cupon"("p_codigo" "text", "p_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancelar_cupon"("p_codigo" "text", "p_admin_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."canjear_envio_gratis"("p_cliente_id" "uuid", "p_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."canjear_envio_gratis"("p_cliente_id" "uuid", "p_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."canjear_envio_gratis"("p_cliente_id" "uuid", "p_admin_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."canjear_saldo"("p_cliente_id" "uuid", "p_admin_id" "text", "p_monto" numeric, "p_concepto" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."canjear_saldo"("p_cliente_id" "uuid", "p_admin_id" "text", "p_monto" numeric, "p_concepto" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."canjear_saldo"("p_cliente_id" "uuid", "p_admin_id" "text", "p_monto" numeric, "p_concepto" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."f_unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_unaccent"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_canjear_beneficio"("p_cliente_tel" "text", "p_tipo" "text", "p_monto_pedido" numeric, "p_saldo_a_usar" numeric, "p_restaurante" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_canjear_beneficio"("p_cliente_tel" "text", "p_tipo" "text", "p_monto_pedido" numeric, "p_saldo_a_usar" numeric, "p_restaurante" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_canjear_beneficio"("p_cliente_tel" "text", "p_tipo" "text", "p_monto_pedido" numeric, "p_saldo_a_usar" numeric, "p_restaurante" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_notificar_cambio_estado_pedido"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_notificar_cambio_estado_pedido"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_notificar_cambio_estado_pedido"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_registrar_entrega"("p_cliente_tel" "text", "p_pedido_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_registrar_entrega"("p_cliente_tel" "text", "p_pedido_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_registrar_entrega"("p_cliente_tel" "text", "p_pedido_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_update_cliente_gps_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_update_cliente_gps_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_update_cliente_gps_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_valor_entrega_vip"("p_entregas_ciclo" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_valor_entrega_vip"("p_entregas_ciclo" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_valor_entrega_vip"("p_entregas_ciclo" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_historial_cliente"("p_cliente_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_historial_cliente"("p_cliente_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_historial_cliente"("p_cliente_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_cliente"("p_telefono" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_cliente"("p_telefono" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_cliente"("p_telefono" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."liquidar_turno_repartidor"("p_repartidor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."liquidar_turno_repartidor"("p_repartidor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."liquidar_turno_repartidor"("p_repartidor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_system_error"("p_level" "text", "p_source" "text", "p_message" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_system_error"("p_level" "text", "p_source" "text", "p_message" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_system_error"("p_level" "text", "p_source" "text", "p_message" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."monitor_pedidos_zombies"() TO "anon";
GRANT ALL ON FUNCTION "public"."monitor_pedidos_zombies"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."monitor_pedidos_zombies"() TO "service_role";



GRANT ALL ON FUNCTION "public"."registrar_envio"("p_cliente_id" "uuid", "p_admin_id" "uuid", "p_latitud" numeric, "p_longitud" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."registrar_envio"("p_cliente_id" "uuid", "p_admin_id" "uuid", "p_latitud" numeric, "p_longitud" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_envio"("p_cliente_id" "uuid", "p_admin_id" "uuid", "p_latitud" numeric, "p_longitud" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."registro_express_cliente"("p_telefono" character varying, "p_nombre" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."registro_express_cliente"("p_telefono" character varying, "p_nombre" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."registro_express_cliente"("p_telefono" character varying, "p_nombre" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_meta_envios"("p_repartidor_id" "uuid", "p_meta" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."set_meta_envios"("p_repartidor_id" "uuid", "p_meta" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_meta_envios"("p_repartidor_id" "uuid", "p_meta" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_pedidos_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_pedidos_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_pedidos_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_zonas_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_zonas_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_zonas_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."usar_cupon"("p_codigo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."usar_cupon"("p_codigo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."usar_cupon"("p_codigo" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validar_cupon_publico"("p_codigo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validar_cupon_publico"("p_codigo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validar_cupon_publico"("p_codigo" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validar_geocerca_entrega"() TO "anon";
GRANT ALL ON FUNCTION "public"."validar_geocerca_entrega"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validar_geocerca_entrega"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";
























GRANT ALL ON TABLE "public"."admins" TO "anon";
GRANT ALL ON TABLE "public"."admins" TO "authenticated";
GRANT ALL ON TABLE "public"."admins" TO "service_role";



GRANT ALL ON TABLE "public"."anuncios_flash" TO "anon";
GRANT ALL ON TABLE "public"."anuncios_flash" TO "authenticated";
GRANT ALL ON TABLE "public"."anuncios_flash" TO "service_role";



GRANT ALL ON TABLE "public"."app_config" TO "anon";
GRANT ALL ON TABLE "public"."app_config" TO "authenticated";
GRANT ALL ON TABLE "public"."app_config" TO "service_role";



GRANT ALL ON TABLE "public"."auditoria_precios" TO "anon";
GRANT ALL ON TABLE "public"."auditoria_precios" TO "authenticated";
GRANT ALL ON TABLE "public"."auditoria_precios" TO "service_role";



GRANT ALL ON TABLE "public"."bot_memory" TO "anon";
GRANT ALL ON TABLE "public"."bot_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."bot_memory" TO "service_role";



GRANT ALL ON TABLE "public"."calificaciones_pendientes" TO "anon";
GRANT ALL ON TABLE "public"."calificaciones_pendientes" TO "authenticated";
GRANT ALL ON TABLE "public"."calificaciones_pendientes" TO "service_role";



GRANT ALL ON TABLE "public"."calificaciones_servicio" TO "anon";
GRANT ALL ON TABLE "public"."calificaciones_servicio" TO "authenticated";
GRANT ALL ON TABLE "public"."calificaciones_servicio" TO "service_role";



GRANT ALL ON TABLE "public"."clientes" TO "anon";
GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";



GRANT ALL ON TABLE "public"."colonias" TO "anon";
GRANT ALL ON TABLE "public"."colonias" TO "authenticated";
GRANT ALL ON TABLE "public"."colonias" TO "service_role";



GRANT ALL ON TABLE "public"."gastos_motos" TO "anon";
GRANT ALL ON TABLE "public"."gastos_motos" TO "authenticated";
GRANT ALL ON TABLE "public"."gastos_motos" TO "service_role";



GRANT ALL ON TABLE "public"."repartidores" TO "anon";
GRANT ALL ON TABLE "public"."repartidores" TO "authenticated";
GRANT ALL ON TABLE "public"."repartidores" TO "service_role";



GRANT ALL ON TABLE "public"."servicios_repartidor" TO "anon";
GRANT ALL ON TABLE "public"."servicios_repartidor" TO "authenticated";
GRANT ALL ON TABLE "public"."servicios_repartidor" TO "service_role";



GRANT ALL ON TABLE "public"."cuadre_repartidores" TO "anon";
GRANT ALL ON TABLE "public"."cuadre_repartidores" TO "authenticated";
GRANT ALL ON TABLE "public"."cuadre_repartidores" TO "service_role";



GRANT ALL ON TABLE "public"."cupones" TO "anon";
GRANT ALL ON TABLE "public"."cupones" TO "authenticated";
GRANT ALL ON TABLE "public"."cupones" TO "service_role";



GRANT ALL ON TABLE "public"."meta_envios_diarios" TO "anon";
GRANT ALL ON TABLE "public"."meta_envios_diarios" TO "authenticated";
GRANT ALL ON TABLE "public"."meta_envios_diarios" TO "service_role";



GRANT ALL ON TABLE "public"."envios_hoy_por_repartidor" TO "anon";
GRANT ALL ON TABLE "public"."envios_hoy_por_repartidor" TO "authenticated";
GRANT ALL ON TABLE "public"."envios_hoy_por_repartidor" TO "service_role";



GRANT ALL ON TABLE "public"."excepciones_precio" TO "anon";
GRANT ALL ON TABLE "public"."excepciones_precio" TO "authenticated";
GRANT ALL ON TABLE "public"."excepciones_precio" TO "service_role";



GRANT ALL ON SEQUENCE "public"."excepciones_precio_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."excepciones_precio_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."excepciones_precio_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."leaderboard_repartidores" TO "anon";
GRANT ALL ON TABLE "public"."leaderboard_repartidores" TO "authenticated";
GRANT ALL ON TABLE "public"."leaderboard_repartidores" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_points" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_points" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_points" TO "service_role";



GRANT ALL ON TABLE "public"."menu_categorias" TO "anon";
GRANT ALL ON TABLE "public"."menu_categorias" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_categorias" TO "service_role";



GRANT ALL ON TABLE "public"."menu_combos" TO "anon";
GRANT ALL ON TABLE "public"."menu_combos" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_combos" TO "service_role";



GRANT ALL ON TABLE "public"."menu_items" TO "anon";
GRANT ALL ON TABLE "public"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."menu_promociones" TO "anon";
GRANT ALL ON TABLE "public"."menu_promociones" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_promociones" TO "service_role";



GRANT ALL ON TABLE "public"."motos" TO "anon";
GRANT ALL ON TABLE "public"."motos" TO "authenticated";
GRANT ALL ON TABLE "public"."motos" TO "service_role";



GRANT ALL ON TABLE "public"."movimientos_saldo" TO "anon";
GRANT ALL ON TABLE "public"."movimientos_saldo" TO "authenticated";
GRANT ALL ON TABLE "public"."movimientos_saldo" TO "service_role";



GRANT ALL ON TABLE "public"."pedidos" TO "anon";
GRANT ALL ON TABLE "public"."pedidos" TO "authenticated";
GRANT ALL ON TABLE "public"."pedidos" TO "service_role";



GRANT ALL ON TABLE "public"."promociones_dinamicas" TO "anon";
GRANT ALL ON TABLE "public"."promociones_dinamicas" TO "authenticated";
GRANT ALL ON TABLE "public"."promociones_dinamicas" TO "service_role";



GRANT ALL ON TABLE "public"."registros_puntos" TO "anon";
GRANT ALL ON TABLE "public"."registros_puntos" TO "authenticated";
GRANT ALL ON TABLE "public"."registros_puntos" TO "service_role";



GRANT ALL ON TABLE "public"."restaurante_colonias" TO "anon";
GRANT ALL ON TABLE "public"."restaurante_colonias" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurante_colonias" TO "service_role";



GRANT ALL ON TABLE "public"."restaurantes" TO "anon";
GRANT ALL ON TABLE "public"."restaurantes" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurantes" TO "service_role";



GRANT ALL ON TABLE "public"."restaurantes_solicitudes" TO "anon";
GRANT ALL ON TABLE "public"."restaurantes_solicitudes" TO "authenticated";
GRANT ALL ON TABLE "public"."restaurantes_solicitudes" TO "service_role";



GRANT ALL ON TABLE "public"."resumen_semanal_negocio" TO "anon";
GRANT ALL ON TABLE "public"."resumen_semanal_negocio" TO "authenticated";
GRANT ALL ON TABLE "public"."resumen_semanal_negocio" TO "service_role";



GRANT ALL ON TABLE "public"."system_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_logs" TO "service_role";



GRANT ALL ON TABLE "public"."vista_clientes_stats" TO "anon";
GRANT ALL ON TABLE "public"."vista_clientes_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."vista_clientes_stats" TO "service_role";



GRANT ALL ON TABLE "public"."zonas_entrega" TO "anon";
GRANT ALL ON TABLE "public"."zonas_entrega" TO "authenticated";
GRANT ALL ON TABLE "public"."zonas_entrega" TO "service_role";



GRANT ALL ON SEQUENCE "public"."zonas_entrega_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."zonas_entrega_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."zonas_entrega_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";

alter table "public"."admins" drop constraint "admins_role_check";

alter table "public"."registros_puntos" drop constraint "registros_puntos_tipo_check";

alter table "public"."admins" add constraint "admins_role_check" CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'superadmin'::character varying])::text[]))) not valid;

alter table "public"."admins" validate constraint "admins_role_check";

alter table "public"."registros_puntos" add constraint "registros_puntos_tipo_check" CHECK (((tipo)::text = ANY ((ARRAY['acumulacion'::character varying, 'canje'::character varying])::text[]))) not valid;

alter table "public"."registros_puntos" validate constraint "registros_puntos_tipo_check";


  create policy "Auth Insert Restaurantes"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'restaurantes'::text));



  create policy "Auth Update Restaurantes"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'restaurantes'::text));



  create policy "Delete_Menu_Fotos"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'menu-fotos'::text) AND (auth.uid() IS NOT NULL)));



  create policy "Public View Restaurantes"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'restaurantes'::text));



  create policy "Read_Menu_Fotos"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'menu-fotos'::text));



  create policy "Upload_Menu_Fotos"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'menu-fotos'::text) AND (auth.uid() IS NOT NULL)));



