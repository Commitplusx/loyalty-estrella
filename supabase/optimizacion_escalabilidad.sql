-- ══════════════════════════════════════════════════════════════════════════════
-- OPTIMIZACIÓN DE ESCALABILIDAD - ÍNDICES DE TRIGRAMAS
-- Este script acelera las consultas 'ilike' (ej. .ilike('telefono', '%1234567890%'))
-- que hace el bot constantemente. Al aplicar esto, se evitan los escaneos 
-- completos de tabla y se reduce el uso de CPU.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Habilitar la extensión pg_trgm (PostgreSQL Trigram matching)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Crear índices GIN para las columnas que sufren búsquedas parciales
-- Nota: Si las tablas tienen miles de registros, esto puede tomar unos segundos.

-- Tabla: Clientes
CREATE INDEX IF NOT EXISTS idx_clientes_telefono_trgm 
ON clientes USING gin (telefono gin_trgm_ops);

-- Tabla: Repartidores
CREATE INDEX IF NOT EXISTS idx_repartidores_telefono_trgm 
ON repartidores USING gin (telefono gin_trgm_ops);

-- Tabla: Restaurantes
CREATE INDEX IF NOT EXISTS idx_restaurantes_telefono_trgm 
ON restaurantes USING gin (telefono gin_trgm_ops);

-- Tabla: Pedidos
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_tel_trgm 
ON pedidos USING gin (cliente_tel gin_trgm_ops);

-- Otras columnas usadas frecuentemente en búsquedas ilike:
CREATE INDEX IF NOT EXISTS idx_clientes_nombre_trgm 
ON clientes USING gin (nombre gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_repartidores_alias_trgm 
ON repartidores USING gin (alias gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_repartidores_nombre_trgm 
ON repartidores USING gin (nombre gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_restaurantes_nombre_trgm 
ON restaurantes USING gin (nombre gin_trgm_ops);

-- Fin del script
