-- Migration: 20260522_performance_and_rls.sql
-- Optimización de la base de datos para consultas de números telefónicos (Escalabilidad)

-- Habilitar extensión pg_trgm para indexación eficiente de búsquedas tipo LIKE / ILIKE
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índices GIN (Generalized Inverted Index) para búsquedas parciales de teléfono (ilike '%numero%')
-- Esto acelerará drásticamente la latencia del bot cuando la tabla de clientes crezca a miles de registros
CREATE INDEX IF NOT EXISTS idx_clientes_telefono_trgm ON public.clientes USING gin (telefono gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_repartidores_telefono_trgm ON public.repartidores USING gin (telefono gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_restaurantes_telefono_trgm ON public.restaurantes USING gin (telefono gin_trgm_ops);

-- Índice B-Tree clásico para las consultas de memoria del bot (usamos .eq('phone', ...))
CREATE INDEX IF NOT EXISTS idx_bot_memory_phone ON public.bot_memory (phone);
