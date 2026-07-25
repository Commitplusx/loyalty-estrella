const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://jdrrkpvodnqoljycixbg.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ');

async function createRechazarRpc() {
  const sql = `
  CREATE OR REPLACE FUNCTION public.rechazar_pedido_atomico(
    p_pedido_id UUID,
    p_repartidor_id UUID
  )
  RETURNS BOOLEAN
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
  DECLARE
    v_estado TEXT;
    v_actual_rep UUID;
  BEGIN
    -- Bloquear el pedido para evitar condiciones de carrera
    SELECT estado, repartidor_id INTO v_estado, v_actual_rep
    FROM public.pedidos
    WHERE id = p_pedido_id
    FOR UPDATE;

    -- Solo podemos rechazar si estaba siendo "ofrecido" o asignado a ESTE repartidor
    IF (v_estado = 'ofrecido' OR v_estado = 'asignado') AND v_actual_rep = p_repartidor_id THEN
      
      -- Actualizar el pedido
      UPDATE public.pedidos
      SET 
        estado = 'buscando_repartidor',
        repartidor_id = NULL,
        ofertas_rechazadas = array_append(COALESCE(ofertas_rechazadas, ARRAY[]::uuid[]), p_repartidor_id)
      WHERE id = p_pedido_id;

      -- Incrementar rechazos del repartidor
      UPDATE public.repartidores
      SET total_ofertas = COALESCE(total_ofertas, 0) + 1
      WHERE user_id = p_repartidor_id;
      
      RETURN TRUE;
    END IF;

    RETURN FALSE;
  END;
  $$;
  `;

  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) {
    console.error('Error creating RPC:', error);
  } else {
    console.log('RPC rechazar_pedido_atomico created successfully.');
  }
}

createRechazarRpc();
