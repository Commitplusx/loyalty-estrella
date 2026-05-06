import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, ChevronLeft, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export function RestaurantesPage() {
  const navigate = useNavigate();
  const [restaurantes, setRestaurantes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Cargamos restaurantes activos
      const { data } = await supabase
        .from('restaurantes')
        .select('id, nombre, direccion')
        .eq('activo', true)
        .order('nombre');
      setRestaurantes(data || []);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header simple */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-xl font-bold">Restaurantes Asociados</h1>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 space-y-4 mt-2">
        <p className="text-muted-foreground">
          Pide tus platillos favoritos.
        </p>

        {loading ? (
          <div className="text-center py-10 text-muted-foreground">Cargando restaurantes...</div>
        ) : restaurantes.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">No hay restaurantes disponibles por ahora.</div>
        ) : (
          <div className="grid gap-4">
            {restaurantes.map((rest, i) => (
              <motion.div 
                key={rest.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card 
                  className="overflow-hidden hover:shadow-md transition-all cursor-pointer group border-orange-100 dark:border-orange-900/30"
                  onClick={() => navigate(`/restaurantes/${rest.id}`)}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-500/20 dark:to-orange-500/10 rounded-xl flex items-center justify-center shrink-0">
                      <Store className="w-7 h-7 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg leading-tight group-hover:text-orange-500 transition-colors">{rest.nombre}</h3>
                      {rest.direccion && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3" /> {rest.direccion}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
