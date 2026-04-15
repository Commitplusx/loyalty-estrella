-- ============================================================
-- ESTRELLA DELIVERY - UPDATE V21 (Zonas de Envío Dinámicas)
-- ============================================================

-- 1. Catálogo Maestro de Colonias
CREATE TABLE IF NOT EXISTS colonias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL UNIQUE,
    ciudad VARCHAR(255) DEFAULT 'Comitán',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Configuración de Zona por Restaurante
CREATE TABLE IF NOT EXISTS restaurante_colonias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurante_telefono TEXT NOT NULL REFERENCES restaurantes(telefono) ON DELETE CASCADE,
    colonia_id UUID NOT NULL REFERENCES colonias(id) ON DELETE CASCADE,
    aplica_hora_feliz BOOLEAN DEFAULT false,
    precio_estandar DECIMAL(10,2), -- NULL = Usa el default del sistema
    UNIQUE(restaurante_telefono, colonia_id)
);

-- Políticas RLS para las nuevas tablas
ALTER TABLE colonias ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurante_colonias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins_Full_Access_Colonias" ON colonias FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));
CREATE POLICY "Admins_Full_Access_Restaurante_Colonias" ON restaurante_colonias FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));

-- Insertar algunas colonias base de Comitán para el catálogo inicial
INSERT INTO colonias (nombre) VALUES 
('Centro'),
('Mariano Ruiz'),
('La Cueva'),
('Chichima'),
('Los Desamparados'),
('Yajalon'),
('Cerrito de la Concepcion'),
('Guadalupe'),
('San Sebastian')
ON CONFLICT (nombre) DO NOTHING;
