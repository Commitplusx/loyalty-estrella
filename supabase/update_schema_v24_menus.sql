-- ============================================================
-- ESTRELLA DELIVERY - Menus Digitales de Restaurantes (V24)
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- 1. Categorias del menu
CREATE TABLE IF NOT EXISTS menu_categorias (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL,
  emoji          TEXT DEFAULT '🍽',
  orden          INTEGER DEFAULT 0,
  activa         BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 2. Productos del menu
CREATE TABLE IF NOT EXISTS menu_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  categoria_id   UUID REFERENCES menu_categorias(id) ON DELETE SET NULL,
  nombre         TEXT NOT NULL,
  descripcion    TEXT,
  precio         DECIMAL(10,2) NOT NULL DEFAULT 0,
  foto_url       TEXT,
  disponible     BOOLEAN DEFAULT true,
  es_popular     BOOLEAN DEFAULT false,
  orden          INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- 3. Combos / Paquetes
CREATE TABLE IF NOT EXISTS menu_combos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL,
  descripcion    TEXT,
  precio         DECIMAL(10,2) NOT NULL DEFAULT 0,
  foto_url       TEXT,
  incluye        TEXT[],
  disponible     BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 4. Promociones
CREATE TABLE IF NOT EXISTS menu_promociones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id  UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  titulo          TEXT NOT NULL,
  descripcion     TEXT,
  precio_especial DECIMAL(10,2),
  foto_url        TEXT,
  fecha_fin       DATE,
  activa          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE menu_categorias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_combos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_promociones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rest_Own_Cat"   ON menu_categorias  FOR ALL USING (restaurante_id IN (SELECT id FROM restaurantes WHERE admin_id = auth.uid()));
CREATE POLICY "Rest_Own_Items" ON menu_items        FOR ALL USING (restaurante_id IN (SELECT id FROM restaurantes WHERE admin_id = auth.uid()));
CREATE POLICY "Rest_Own_Combo" ON menu_combos       FOR ALL USING (restaurante_id IN (SELECT id FROM restaurantes WHERE admin_id = auth.uid()));
CREATE POLICY "Rest_Own_Promo" ON menu_promociones  FOR ALL USING (restaurante_id IN (SELECT id FROM restaurantes WHERE admin_id = auth.uid()));

CREATE POLICY "Admin_Cat"   ON menu_categorias  FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));
CREATE POLICY "Admin_Items" ON menu_items        FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));
CREATE POLICY "Admin_Combo" ON menu_combos       FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));
CREATE POLICY "Admin_Promo" ON menu_promociones  FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));

CREATE POLICY "Public_Cat"   ON menu_categorias  FOR SELECT USING (activa = true);
CREATE POLICY "Public_Items" ON menu_items        FOR SELECT USING (disponible = true);
CREATE POLICY "Public_Combo" ON menu_combos       FOR SELECT USING (disponible = true);
CREATE POLICY "Public_Promo" ON menu_promociones  FOR SELECT USING (activa = true AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE));

-- Storage bucket para fotos
INSERT INTO storage.buckets (id, name, public) VALUES ('menu-fotos', 'menu-fotos', true) ON CONFLICT DO NOTHING;
CREATE POLICY "Upload_Menu_Fotos" ON storage.objects FOR INSERT  WITH CHECK (bucket_id = 'menu-fotos' AND auth.uid() IS NOT NULL);
CREATE POLICY "Read_Menu_Fotos"   ON storage.objects FOR SELECT  USING (bucket_id = 'menu-fotos');
CREATE POLICY "Delete_Menu_Fotos" ON storage.objects FOR DELETE  USING (bucket_id = 'menu-fotos' AND auth.uid() IS NOT NULL);

-- Indices
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurante  ON menu_items(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_categoria    ON menu_items(categoria_id);
CREATE INDEX IF NOT EXISTS idx_menu_combos_restaurante ON menu_combos(restaurante_id);
