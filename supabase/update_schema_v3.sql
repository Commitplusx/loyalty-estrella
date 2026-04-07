-- ============================================
-- ACTUALIZACIÓN V3: Estrella Delivery Empresarial
-- ============================================

-- 1. Agregar Notas (CRM) a Clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS notas_crm TEXT DEFAULT '';

-- 2. Sistema de Aprobación de Gastos
-- 'pendiente', 'aprobado', 'rechazado'
ALTER TABLE gastos_motos ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'aprobado';

-- 3. Crear tabla de Anuncios Flash
CREATE TABLE IF NOT EXISTS anuncios_flash (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mensaje TEXT NOT NULL,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Políticas de Anuncios Flash
ALTER TABLE anuncios_flash ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anuncios_lectura" ON anuncios_flash
    FOR SELECT USING (activa = true OR activo = true);

CREATE POLICY "anuncios_escritura" ON anuncios_flash
    FOR ALL USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- Ajuste de política para Notas de Repartidores
-- ============================================
-- Los clientes ya están en escritura para 'authenticated' así que 
-- los repartidores ya pueden actualizar la columna 'notas_crm'.
