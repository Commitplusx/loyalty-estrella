-- ============================================================
-- MIGRACIÓN: Buró de Clientes Inteligente
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

-- 1. Añadir columnas de reputación a clientes
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS etiquetas TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reputacion TEXT DEFAULT 'nuevo'
    CHECK (reputacion IN ('excelente', 'bueno', 'nuevo', 'regular', 'malo', 'vetado'));

-- 2. Índice para búsquedas rápidas por reputación
CREATE INDEX IF NOT EXISTS idx_clientes_reputacion ON clientes(reputacion);

-- 3. Tabla de cola de calificaciones pendientes (para el flujo obligatorio)
CREATE TABLE IF NOT EXISTS calificaciones_pendientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL,
  cliente_tel TEXT NOT NULL,
  cliente_nombre TEXT,
  restaurante TEXT,
  admin_phone TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Comentario de etiquetas disponibles:
-- 'demora'           → ⏱️ Tarda mucho en salir/recibir
-- 'grosero'          → 😤 Trato irrespetuoso
-- 'paga_bien'        → 💸 Siempre paga sin problema
-- 'pedido_falso'     → 🚫 Hizo pedidos falsos o canceló varias veces
-- 'no_atiende'       → 📵 No abre la puerta / no contesta
-- 'direccion_mal'    → 🏠 Siempre manda dirección incorrecta
-- 'fiel'             → ⭐ Cliente recurrente y puntual
-- 'propina'          → 💰 Siempre da propina al repartidor
