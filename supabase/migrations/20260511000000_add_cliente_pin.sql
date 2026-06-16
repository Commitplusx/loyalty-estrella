-- ═══════════════════════════════════════════════════════════════════
-- feat: PIN de seguridad de 4 dígitos para clientes
-- ═══════════════════════════════════════════════════════════════════

-- 1. Agregar columna pin a clientes (nullable = sin PIN aún)
ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS pin text DEFAULT NULL;

-- 2. RPC para establecer el PIN (primer uso o reset por admin)
CREATE OR REPLACE FUNCTION public.set_cliente_pin(p_telefono text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Validar que sea exactamente 4 dígitos numéricos
  IF p_pin !~ '^\d{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El PIN debe ser de 4 dígitos numéricos');
  END IF;

  -- Verificar que el cliente exista
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE telefono = p_telefono) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  END IF;

  UPDATE public.clientes
  SET pin = p_pin
  WHERE telefono = p_telefono;

  RETURN jsonb_build_object('ok', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_cliente_pin(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.set_cliente_pin(text, text) TO authenticated;

-- 3. RPC para verificar el PIN (devuelve si es correcto y si necesita configuración)
CREATE OR REPLACE FUNCTION public.verify_cliente_pin(p_telefono text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_cliente record;
BEGIN
  SELECT pin INTO v_cliente
  FROM public.clientes
  WHERE telefono = p_telefono;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  END IF;

  -- Sin PIN aún = primer acceso
  IF v_cliente.pin IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'needs_setup', true);
  END IF;

  -- Verificar PIN
  IF v_cliente.pin = p_pin THEN
    RETURN jsonb_build_object('ok', true, 'needs_setup', false);
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'PIN incorrecto');
  END IF;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_cliente_pin(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_cliente_pin(text, text) TO authenticated;
