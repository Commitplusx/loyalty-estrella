CREATE OR REPLACE FUNCTION public.aceptar_pedido_atomico(
  p_pedido_id UUID,
  p_repartidor_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Ejecuta con privilegios del creador (bypass RLS localmente para la transacción si es necesario)
AS $$
DECLARE
  v_estado TEXT;
  v_repartidor_asignado UUID;
BEGIN
  -- 1. Bloqueo Transaccional (Pessimistic Locking)
  -- Seleccionamos la fila y la bloqueamos (FOR UPDATE) hasta que termine la función.
  -- Si otra petición (ej. QStash) intenta modificar este pedido, se pondrá en cola
  -- y esperará a que esta función termine su ejecución de milisegundos.
  SELECT estado, repartidor_id
  INTO v_estado, v_repartidor_asignado
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;

  -- 2. Verificación de Invariantes (Si la fila no existe, fallamos)
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 3. Doble Candado Atómico:
  -- Aseguramos que el estado sea EXACTAMENTE 'ofrecido'
  -- y que NO se lo hayan reasignado a nadie más en el ínterin.
  IF v_estado = 'ofrecido' AND v_repartidor_asignado = p_repartidor_id THEN
    
    -- 4. Mutación Segura
    UPDATE public.pedidos
    SET 
      estado = 'asignado',
      updated_at = timezone('utc'::text, now()) -- Opcional, si manejas timestamps
    WHERE id = p_pedido_id;

    -- El repartidor ganó la carrera 🏆
    RETURN TRUE;
  ELSE
    -- El repartidor perdió la carrera (QStash ya lo quitó o cambió de estado) 💀
    RETURN FALSE;
  END IF;
END;
$$;
