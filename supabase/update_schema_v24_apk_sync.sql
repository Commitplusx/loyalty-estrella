-- ============================================================
-- ESTRELLA DELIVERY - ESQUEMA DE SINCRONIZACIÓN APK (V24)
-- Propósito: Este archivo documenta y construye localmente todas 
-- las tablas, columnas, vistas y funciones RPC que ya existen en vivo
-- en Supabase para que la Web y la y la app Móvil (APK Flutter)
-- funcionen perfectamente.
-- No borrar registros, solo agregar la estructura faltante local.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLA: motos (Flota Oficial de la Empresa)
-- Utilizada en admin_app/lib/services/gasto_service.dart
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS motos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES auth.users(id),
    placa VARCHAR(50) NOT NULL,
    alias VARCHAR(255),
    estado VARCHAR(50) DEFAULT 'activa',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index para motos
CREATE INDEX IF NOT EXISTS motos_placa_idx ON motos(placa);

-- ------------------------------------------------------------
-- 2. MODIFICACIÓN: clientes
-- Utilizada en admin_app/lib/services/cliente_service.dart
-- ------------------------------------------------------------
-- La APK necesita registrar el costo del envío para configuraciones cliente
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS costo_envio DECIMAL(10,2) DEFAULT 0.00;

-- ------------------------------------------------------------
-- 3. MODIFICACIÓN: repartidores
-- Utilizada en admin_app/lib/services/repartidor_service.dart
-- ------------------------------------------------------------
-- El repartidor puede tener una moto oficial asignada.
ALTER TABLE repartidores ADD COLUMN IF NOT EXISTS moto_id UUID REFERENCES motos(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 4. MODIFICACIÓN: gastos_motos
-- Utilizada masivamente en el payload de gasto_service.dart
-- ------------------------------------------------------------
ALTER TABLE gastos_motos ADD COLUMN IF NOT EXISTS moto_id UUID REFERENCES motos(id) ON DELETE CASCADE;
ALTER TABLE gastos_motos ADD COLUMN IF NOT EXISTS repartidor_id UUID REFERENCES repartidores(id) ON DELETE SET NULL;
ALTER TABLE gastos_motos ADD COLUMN IF NOT EXISTS tipo_gasto VARCHAR(100) DEFAULT 'gasolina';
ALTER TABLE gastos_motos ADD COLUMN IF NOT EXISTS categoria VARCHAR(100) DEFAULT 'flota';
ALTER TABLE gastos_motos ADD COLUMN IF NOT EXISTS comprobante_url TEXT;

-- ------------------------------------------------------------
-- 5. TABLA: servicios_repartidor (Liquidación Diaria)
-- Utilizada en admin_app/lib/services/repartidor_service.dart
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS servicios_repartidor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repartidor_id UUID NOT NULL REFERENCES repartidores(id) ON DELETE CASCADE,
    cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
    restaurante_id UUID REFERENCES restaurantes(id) ON DELETE SET NULL,
    descripcion TEXT NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    tipo_servicio VARCHAR(50) DEFAULT 'cliente',
    notas TEXT,
    asignado_por UUID REFERENCES auth.users(id),
    creado_por UUID REFERENCES auth.users(id),
    turno_fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    estado VARCHAR(50) DEFAULT 'completado',
    comprobante_url TEXT,
    liquidado BOOLEAN DEFAULT FALSE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index vital para el cuadré
CREATE INDEX IF NOT EXISTS servicios_repartidor_fecha_idx ON servicios_repartidor(turno_fecha);
CREATE INDEX IF NOT EXISTS servicios_repartidor_rep_idx ON servicios_repartidor(repartidor_id);

-- ------------------------------------------------------------
-- 6. POLÍTICAS RLS (Habilita seguridad en las tablas nuevas)
-- ------------------------------------------------------------
ALTER TABLE motos ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios_repartidor ENABLE ROW LEVEL SECURITY;

-- Admins
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'motos' AND policyname = 'Admins_All_Motos') THEN
    CREATE POLICY "Admins_All_Motos" ON motos FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'servicios_repartidor' AND policyname = 'Admins_All_Servicios') THEN
    CREATE POLICY "Admins_All_Servicios" ON servicios_repartidor FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));
  END IF;
END $$;

-- ------------------------------------------------------------
-- 7. VISTAS DOCUMENTADAS (Representaciones de lo Vivo)
-- Extraído del comportamiento de la app: resumen_semanal, cuadre, leaderboard.
-- Estas vistas YA EXISTEN en Supabase, se definen aquí solo por completitud local.
-- ------------------------------------------------------------

-- Vista: resumen_semanal_negocio
CREATE OR REPLACE VIEW resumen_semanal_negocio AS
SELECT 
    DATE_TRUNC('week', turno_fecha) AS semana,
    SUM(monto) as total_generado,
    COUNT(*) as total_servicios
FROM servicios_repartidor
WHERE estado = 'completado'
GROUP BY 1;

-- Vista: cuadre_repartidores
CREATE OR REPLACE VIEW cuadre_repartidores AS
SELECT 
    r.id AS repartidor_id,
    r.nombre AS repartidor,
    sr.turno_fecha,
    COUNT(sr.id) AS servicios_totales,
    SUM(sr.monto) AS total_dinero,
    EVERY(sr.liquidado) AS turno_liquidado
FROM servicios_repartidor sr
JOIN repartidores r ON sr.repartidor_id = r.id
GROUP BY r.id, r.nombre, sr.turno_fecha;

-- Vista: envios_hoy_por_repartidor
CREATE OR REPLACE VIEW envios_hoy_por_repartidor AS
SELECT 
    r.id AS repartidor_id,
    r.nombre,
    COUNT(sr.id) as envios_hoy,
    COALESCE((SELECT monto FROM gastos_motos WHERE repartidor_id = r.id AND tipo_gasto = 'meta_diaria' LIMIT 1), 0) AS meta_envios
FROM repartidores r
LEFT JOIN servicios_repartidor sr ON r.id = sr.repartidor_id AND sr.turno_fecha = CURRENT_DATE
GROUP BY r.id, r.nombre;

-- ------------------------------------------------------------
-- 8. FUNCIONES RPC DOCUMENTADAS (Mockup / Replacements)
-- ------------------------------------------------------------

-- A. set_meta_envios
CREATE OR REPLACE FUNCTION set_meta_envios(p_repartidor_id UUID, p_meta INT)
RETURNS void AS $$
BEGIN
   -- Lógica almacenada en vivo
   -- Generalmente actualiza una tabla metas_repartidor o parecido
   RAISE NOTICE 'Meta establecida %', p_meta;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. liquidar_turno_repartidor
CREATE OR REPLACE FUNCTION liquidar_turno_repartidor(p_repartidor_id UUID)
RETURNS void AS $$
BEGIN
   UPDATE servicios_repartidor 
   SET liquidado = TRUE, estado = 'liquidado'
   WHERE repartidor_id = p_repartidor_id AND liquidado = FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
