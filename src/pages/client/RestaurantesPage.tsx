import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, ChevronLeft, MapPin, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

// ── Dominio del portal de menús de restaurantes ────────────────────────
// Cambiar este valor cuando se conozca el dominio de producción.
// Si el portal está en el mismo dominio, usar cadena vacía ("").
const RESTAURANTES_BASE_URL = 'https://www.restaurantes-app-estrella.shop';

export function RestaurantesPage() {
  const navigate = useNavigate();
  const [restaurantes, setRestaurantes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('restaurantes')
        .select('id, nombre, direccion, foto_fachada_url, categorias')
        .eq('activo', true)
        .order('nombre');
      setRestaurantes(data || []);
      setLoading(false);
    }
    load();
  }, []);

  // Construir la URL del menú público de cada restaurante
  const getMenuUrl = (id: string) => `${RESTAURANTES_BASE_URL}/menu/${id}`;

  const handleOpenRestaurante = (id: string) => {
    window.open(getMenuUrl(id), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-blue-600 shadow-lg shadow-blue-700/20">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-full text-white hover:bg-white/20"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">Restaurantes Asociados</h1>
            <p className="text-blue-100 text-xs">Toca uno para ver su menú</p>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 space-y-3 mt-2">

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm">Buscando restaurantes...</p>
          </div>
        ) : restaurantes.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Store className="w-10 h-10 text-orange-300" />
            </div>
            <p className="font-semibold text-gray-700">No hay restaurantes disponibles</p>
            <p className="text-sm text-muted-foreground mt-1">Vuelve pronto, estamos sumando más aliados.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground px-1">
              {restaurantes.length} restaurante{restaurantes.length !== 1 ? 's' : ''} disponible{restaurantes.length !== 1 ? 's' : ''}
            </p>
            <div className="grid gap-3">
              {restaurantes.map((rest, i) => (
                <motion.button
                  key={rest.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => handleOpenRestaurante(rest.id)}
                  className="w-full text-left bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md hover:border-orange-200 dark:hover:border-orange-900/50 transition-all active:scale-[0.98] overflow-hidden group"
                >
                  <div className="flex items-center gap-4 p-4">
                    {/* Foto o placeholder */}
                    {rest.foto_fachada_url ? (
                      <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 shadow-sm">
                        <img
                          src={rest.foto_fachada_url}
                          alt={rest.nombre}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-500/20 dark:to-orange-500/10 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                        <Store className="w-8 h-8 text-orange-500" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base leading-tight text-gray-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors truncate">
                        {rest.nombre}
                      </h3>
                      {rest.direccion && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{rest.direccion}</span>
                        </p>
                      )}
                      {rest.categorias?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {rest.categorias.slice(0, 3).map((cat: string) => (
                            <span
                              key={cat}
                              className="text-[10px] font-medium bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Flecha */}
                    <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-orange-500 transition-colors shrink-0" />
                  </div>
                </motion.button>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
