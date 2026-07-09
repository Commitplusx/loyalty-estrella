CREATE OR REPLACE FUNCTION asignar_pedido_atomico(p_pedido_id UUID, p_repartidor_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ofrecidos INT;
BEGIN
  -- 1. Bloqueamos al repartidor temporalmente para evitar condiciones de carrera (Thundering Herd)
  -- Esto asegura que si 5 peticiones llegan al mismo milisegundo, se formen en fila.
  PERFORM 1 FROM public.repartidores WHERE id = p_repartidor_id FOR UPDATE;

  -- 2. Verificamos si en este exacto momento el repartidor ya tiene un pedido sonando ('ofrecido')
  SELECT COUNT(*) INTO v_ofrecidos 
  FROM public.pedidos 
  WHERE repartidor_id = p_repartidor_id AND estado = 'ofrecido';

  -- 3. Si ya tiene uno sonando, rechazamos la asignación atómica
  IF v_ofrecidos > 0 THEN
    RETURN FALSE;
  END IF;

  -- 4. Si está libre, le clavamos el pedido de forma segura
  UPDATE public.pedidos 
  SET estado = 'ofrecido', repartidor_id = p_repartidor_id 
  WHERE id = p_pedido_id;

  RETURN TRUE;
END;
$$;
