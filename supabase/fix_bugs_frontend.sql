-- ============================================================
-- FIX BUGS — Aplicar en Supabase SQL Editor
-- ============================================================

-- BUG #8 FIX: get_historial_cliente ya tiene COALESCE en la BD actual ✓
-- (verificado — ya retorna '[]'::jsonb cuando no hay registros)

-- FIX ADICIONAL: La columna 'rango' NO existe en la tabla clientes.
-- El frontend la usaba para calcular la meta VIP (3/4/5 envíos).
-- Se agrega la columna con valor por defecto 'bronce'.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS rango TEXT NOT NULL DEFAULT 'bronce'
  CHECK (rango IN ('bronce', 'plata', 'oro'));

-- Actualizar rango basado en envios_totales (lógica sugerida):
UPDATE clientes SET rango =
  CASE
    WHEN envios_totales >= 50 THEN 'oro'
    WHEN envios_totales >= 20 THEN 'plata'
    ELSE 'bronce'
  END;

-- ============================================================
-- VERIFICAR que canjear_saldo acepta TEXT en p_admin_id
-- (ya aplicado en fix_canjear_saldo_rpc.sql — solo verificar)
-- SELECT proargnames, proargtypes::text FROM pg_proc WHERE proname = 'canjear_saldo';
-- ============================================================
