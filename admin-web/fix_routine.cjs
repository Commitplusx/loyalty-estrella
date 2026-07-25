const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://jdrrkpvodnqoljycixbg.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ');

async function fix() {
  const sql = `
CREATE OR REPLACE FUNCTION public.asignar_pedido_atomico(
  p_pedido_id uuid,
  p_repartidor_id uuid
) RETURNS boolean AS $$
DECLARE
  v_ofrecidos INT;
BEGIN
  -- 1. Bloqueamos al repartidor temporalmente para evitar condiciones de carrera (Thundering Herd)
  PERFORM 1 FROM public.repartidores WHERE user_id = p_repartidor_id FOR UPDATE;
  
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;
  // We can't execute DDL via JS client easily unless we use a query tool.
  // Wait, I can't execute this. I will just tell the user to execute it!
}
fix();
