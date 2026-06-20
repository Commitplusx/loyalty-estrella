import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, ChevronLeft, MapPin, ExternalLink, Loader2, Utensils, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

const RESTAURANTES_BASE_URL = 'https://www.restaurantes-app-estrella.shop';

export function RestaurantesPage() {
  const navigate = useNavigate();
  const [restaurantes, setRestaurantes] = useState<any[]>([]);
  const [filtrados, setFiltrados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todos');

  // Extraer categorías únicas
  const allCategories = ['Todos', ...Array.from(new Set(restaurantes.flatMap(r => r.categorias || [])))].filter(Boolean);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('restaurantes')
        .select('id, nombre, direccion, foto_fachada_url, categorias')
        .eq('activo', true)
        .order('nombre');
      setRestaurantes(data || []);
      setFiltrados(data || []);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    let result = restaurantes;

    if (activeCategory !== 'Todos') {
      result = result.filter(r => r.categorias?.includes(activeCategory));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.nombre?.toLowerCase().includes(q) ||
        r.direccion?.toLowerCase().includes(q) ||
        r.categorias?.some((c: string) => c.toLowerCase().includes(q))
      );
    }
    setFiltrados(result);
  }, [search, activeCategory, restaurantes]);

  const handleOpenRestaurante = (id: string) => {
    navigate(`/restaurantes/${id}`);
  };

  return (
    <div className="min-h-screen bg-[#F6F6F9] dark:bg-zinc-950 pb-20 font-sans">

      {/* ── Header Simple ─────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[#F6F6F9]/80 dark:bg-zinc-950/80 backdrop-blur-xl"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-full text-gray-900 dark:text-white hover:bg-gray-200/50 dark:hover:bg-zinc-800"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          {!loading && (
            <span className="text-xs font-bold bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 px-4 py-1.5 rounded-full shadow-sm">
              {filtrados.length} resultados
            </span>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 sm:px-8 py-2">

        {/* ── Hero text ──────────────────────────────── */}
        <div className="mb-8">
          <h2 className="text-[34px] sm:text-5xl font-extrabold text-gray-900 dark:text-white leading-[1.15] w-3/4 sm:w-1/2">
            Delicious <br />
            food for you
          </h2>
        </div>

        {/* ── Search Bar ──────────────────────────────── */}
        {!loading && restaurantes.length > 3 && (
          <div className="relative w-full mb-8">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-[22px] h-[22px] text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full pl-16 pr-6 h-14 rounded-full bg-gray-200/60 dark:bg-zinc-900 border-none text-[17px] text-foreground placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-semibold"
            />
          </div>
        )}

        {/* ── Chips de Categorías ──────────────────────────────── */}
        {/* ── Tabs de Categorías ──────────────────────────────── */}
        {!loading && restaurantes.length > 0 && (
          <div className="flex overflow-x-auto pb-4 mb-2 -mx-6 px-10 sm:mx-0 sm:px-4 hide-scrollbar gap-10">
            {allCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 pb-3 text-[17px] font-semibold transition-all relative ${
                  activeCategory === cat 
                    ? 'text-[#FA4A0C]' 
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                {cat}
                {activeCategory === cat && (
                  <motion.div layoutId="activeTab" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-[#FA4A0C] rounded-t-full" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── States ──────────────────────────────────────────── */}
        {/* ── Cards Dribbble Style ──────────────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-16 sm:gap-x-8 mt-20 px-2">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white dark:bg-zinc-900 rounded-[30px] shadow-sm relative pt-16 pb-8 px-4 flex flex-col items-center mt-10">
                <div className="absolute -top-12 w-28 h-28 rounded-full border-[6px] border-[#F6F6F9] dark:border-zinc-950 shimmer bg-slate-200" />
                <div className="shimmer h-6 w-3/4 rounded-md mb-3" />
                <div className="shimmer h-4 w-1/2 rounded-md" />
              </div>
            ))}
          </div>
        ) : restaurantes.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-24 h-24 bg-orange-50 dark:bg-orange-900/20 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
              <Store className="w-12 h-12 text-orange-300" />
            </div>
            <p className="font-bold text-gray-800 dark:text-white text-lg">Sin restaurantes disponibles</p>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
              Estamos sumando más aliados. ¡Vuelve pronto!
            </p>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-16">
            <p className="font-semibold text-gray-700 dark:text-gray-300">Sin resultados para "{search}"</p>
            <button onClick={() => setSearch('')} className="text-sm text-primary mt-2 hover:underline">
              Limpiar búsqueda
            </button>
          </div>
        ) : (
          /* ── Grid responsivo ─────────────────────────────────
             Mobile:  1 columna — lista vertical tipo app
             Tablet:  2 columnas
             Desktop: 3 columnas
          ─────────────────────────────────────────────────── */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-16 sm:gap-x-8 mt-20 px-2">
            {filtrados.map((rest, i) => (
              <motion.button
                key={rest.id}
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.5, type: 'spring' }}
                onClick={() => handleOpenRestaurante(rest.id)}
                className="group relative bg-white dark:bg-zinc-900 rounded-[30px] shadow-sm hover:shadow-xl transition-all duration-300 pt-[70px] pb-8 px-3 flex flex-col items-center text-center mt-10 border border-transparent dark:border-zinc-800"
              >
                {/* Plato flotante circular */}
                <div className="absolute -top-14 w-[110px] h-[110px] sm:w-[130px] sm:h-[130px] rounded-full overflow-hidden shadow-lg border-[6px] border-[#F6F6F9] dark:border-zinc-950 bg-white dark:bg-zinc-800 group-hover:-translate-y-2 transition-transform duration-500">
                  {rest.foto_fachada_url ? (
                    <img
                      src={rest.foto_fachada_url}
                      alt={rest.nombre}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-orange-50 dark:bg-zinc-800">
                      <Utensils className="w-10 h-10 text-orange-300" />
                    </div>
                  )}
                </div>

                {/* Info (Dribbble Style) */}
                <h3 className="font-bold text-gray-900 dark:text-white text-[17px] sm:text-[19px] leading-tight px-1">
                  {rest.nombre}
                </h3>
                <p className="text-[#FA4A0C] font-bold text-[15px] mt-2.5">
                  {rest.categorias?.[0] || 'Restaurante'}
                </p>
              </motion.button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
