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
    if (!search.trim()) {
      setFiltrados(restaurantes);
    } else {
      const q = search.toLowerCase();
      setFiltrados(restaurantes.filter(r =>
        r.nombre?.toLowerCase().includes(q) ||
        r.direccion?.toLowerCase().includes(q) ||
        r.categorias?.some((c: string) => c.toLowerCase().includes(q))
      ));
    }
  }, [search, restaurantes]);

  const getMenuUrl = (id: string) => `${RESTAURANTES_BASE_URL}/menu/${id}`;
  const handleOpenRestaurante = (id: string) => {
    window.open(getMenuUrl(id), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50/30 dark:from-gray-950 dark:via-gray-900 dark:to-orange-950/10 pb-20">

      {/* ── Header Rediseñado ─────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-card/80 backdrop-blur-md border-b border-orange-100 dark:border-orange-900/30"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-xl text-primary hover:bg-orange-50 dark:hover:bg-orange-950/30 shrink-0"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-gray-800 dark:text-white leading-tight truncate">
              Aliados
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-[11px] sm:text-xs">
              Toca uno para ver su menú
            </p>
          </div>
          {!loading && (
            <span className="text-[11px] font-semibold bg-orange-100 dark:bg-orange-900/30 text-primary px-3 py-1 rounded-full shrink-0">
              {filtrados.length} local{filtrados.length !== 1 ? 'es' : ''}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* ── Hero text (desktop) ──────────────────────────────── */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white leading-tight">
                Nuestros aliados 🍽️
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Pide directamente y acumula puntos en Estrella Delivery
              </p>
            </div>

            {/* Search */}
            {!loading && restaurantes.length > 3 && (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar restaurante..."
                  className="w-full pl-9 pr-4 h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                />
              </div>
            )}
          </div>
        </div>

        {/* ── States ──────────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-sm">Cargando...</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {filtrados.map((rest, i) => (
              <motion.button
                key={rest.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.35 }}
                onClick={() => handleOpenRestaurante(rest.id)}
                className="group w-full text-left bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl hover:border-orange-200 dark:hover:border-orange-900/40 transition-all duration-300 overflow-hidden active:scale-[0.98]"
              >
                {/* Foto de cabecera */}
                <div className="relative w-full h-36 sm:h-44 overflow-hidden bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900/30 dark:to-orange-800/20">
                  {rest.foto_fachada_url ? (
                    <img
                      src={rest.foto_fachada_url}
                      alt={rest.nombre}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Utensils className="w-14 h-14 text-orange-300/60" />
                    </div>
                  )}
                  {/* Overlay gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  {/* Badge "Ver menú" al hover */}
                  <div className="absolute bottom-3 right-3 bg-white/90 dark:bg-gray-900/90 text-orange-600 dark:text-orange-400 text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300">
                    <ExternalLink className="w-3 h-3" /> Ver menú
                  </div>
                </div>

                {/* Info inferior */}
                <div className="p-4">
                  <h3 className="font-bold text-gray-900 dark:text-white text-base leading-tight group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors truncate">
                    {rest.nombre}
                  </h3>

                  {rest.direccion && (
                    <p className="text-xs text-muted-foreground flex items-start gap-1 mt-1.5">
                      <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{rest.direccion}</span>
                    </p>
                  )}

                  {rest.categorias?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {rest.categorias.slice(0, 4).map((cat: string) => (
                        <span
                          key={cat}
                          className="text-[10px] font-semibold bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-900/30 px-2 py-0.5 rounded-full"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
