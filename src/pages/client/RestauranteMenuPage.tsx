import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, MessageCircle, Share, Clock, MapPin, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { useSchedule } from '@/hooks/useSchedule';

export function RestauranteMenuPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [restaurante, setRestaurante] = useState<any>(null);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { contacto } = useSchedule();

  useEffect(() => {
    if (!id) return;
    async function load() {
      const [
        { data: rest },
        { data: cats },
        { data: prods }
      ] = await Promise.all([
        supabase.from('restaurantes').select('*').eq('id', id).single(),
        supabase.from('menu_categorias').select('*').eq('restaurante_id', id).order('orden'),
        supabase.from('menu_items').select('*').eq('restaurante_id', id).eq('disponible', true).order('orden')
      ]);

      setRestaurante(rest);
      setCategorias(cats || []);
      setItems(prods || []);
      setLoading(false);
    }
    load();
  }, [id]);

  const handlePedir = () => {
    if (!restaurante) return;
    const numeroBot = contacto?.whatsapp ? contacto.whatsapp.replace(/\D/g, '') : '529631550244';
    const mensaje = `Hola, quiero pedir del menú de *${restaurante.nombre}*:\n\n`;
    const url = `https://wa.me/${numeroBot}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
  };

  if (loading) return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header Skeleton */}
      <header className="sticky top-0 z-50 bg-background/80 border-b">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="shimmer h-10 w-10 rounded-full" />
            <div className="shimmer h-6 w-32 rounded-md hidden sm:block" />
          </div>
          <div className="shimmer h-9 w-20 rounded-md" />
        </div>
      </header>

      {/* Portada Skeleton */}
      <div className="border-b py-8 px-4 flex flex-col items-center">
        <div className="w-20 h-20 rounded-2xl shimmer mb-4" />
        <div className="shimmer h-8 w-48 rounded-lg mb-3" />
        <div className="shimmer h-4 w-64 rounded-md" />
      </div>

      {/* Menu List Skeleton */}
      <main className="max-w-xl mx-auto p-4 space-y-8 mt-4">
        {[1, 2].map(cat => (
          <div key={cat} className="space-y-4">
            <div className="shimmer h-7 w-40 rounded-lg" />
            <div className="grid gap-4">
              {[1, 2, 3].map(item => (
                <div key={item} className="h-[100px] rounded-xl border border-border/50 flex p-3 gap-4">
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="shimmer h-5 w-3/4 rounded-md" />
                    <div className="shimmer h-3 w-full rounded-md" />
                  </div>
                  <div className="shimmer w-20 h-20 rounded-lg shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
  if (!restaurante) return <div className="text-center py-20">Restaurante no encontrado.</div>;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header flotante sobre la imagen */}
      <header className="fixed top-0 left-0 right-0 z-50 transition-colors duration-300 bg-transparent">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center justify-between" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <Button variant="secondary" size="icon" onClick={() => navigate(-1)} className="rounded-full bg-white/80 dark:bg-black/50 backdrop-blur-md shadow-sm">
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <Button variant="secondary" size="icon" className="rounded-full bg-white/80 dark:bg-black/50 backdrop-blur-md shadow-sm">
            <Share className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Portada Full Bleed */}
      <div className="relative w-full h-64 sm:h-80 bg-slate-200 dark:bg-zinc-800">
        {restaurante.foto_fachada_url && (
          <img src={restaurante.foto_fachada_url} alt={restaurante.nombre} className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5 text-white max-w-xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight mb-2">{restaurante.nombre}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm font-medium opacity-90">
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> 20-35 min</span>
            <span>•</span>
            <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> A 2.4 km</span>
            <span>•</span>
            <span className="font-bold text-orange-400">4.8 ⭐️</span>
          </div>
        </div>
      </div>

      {/* Sticky Categories */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b shadow-sm" style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top))' }}>
        <div className="max-w-xl mx-auto flex overflow-x-auto hide-scrollbar px-4 py-3 gap-2">
          {categorias.map(cat => (
            <button key={cat.id} className="whitespace-nowrap px-4 py-2 bg-slate-100 dark:bg-zinc-800 text-foreground font-bold text-sm rounded-full active:scale-95 transition-transform shrink-0">
              {cat.emoji} {cat.nombre}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-xl mx-auto p-4 space-y-8 mt-4">
        {categorias.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">Este restaurante aún no ha subido su menú.</p>
        ) : (
          categorias.map((cat, catIdx) => {
            const catItems = items.filter(i => i.categoria_id === cat.id);
            if (catItems.length === 0) return null;
            return (
              <div key={cat.id} className="space-y-4 pt-4 scroll-mt-24">
                <h3 className="text-2xl font-extrabold flex items-center gap-2">
                  {cat.nombre}
                </h3>
                <div className="grid gap-0 sm:gap-4 divide-y sm:divide-y-0">
                  {catItems.map((item, i) => (
                    <motion.div 
                      key={item.id} 
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (catIdx * 0.1) + (i * 0.05), duration: 0.4 }}
                      className="flex p-4 gap-4 bg-white sm:rounded-2xl sm:border sm:border-gray-100 dark:bg-card dark:sm:border-gray-800 -mx-4 sm:mx-0 active:bg-slate-50 transition-colors"
                    >
                      <div className="flex-1 space-y-1">
                        <h4 className="font-bold text-base leading-tight text-gray-900 dark:text-white">{item.nombre}</h4>
                        {item.descripcion && (
                          <p className="text-sm text-gray-500 line-clamp-2 mt-1">{item.descripcion}</p>
                        )}
                        <p className="font-bold text-gray-900 dark:text-white mt-2">
                          ${item.precio.toFixed(2)}
                        </p>
                      </div>
                      {item.foto_url ? (
                        <div className="w-28 h-28 rounded-xl overflow-hidden shrink-0 bg-slate-100 shadow-sm">
                          <img src={item.foto_url} alt={item.nombre} className="w-full h-full object-cover" />
                        </div>
                      ) : null}
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* Floating Action Button para pedir */}
      <div className="fixed bottom-6 left-0 right-0 px-4 z-50 pointer-events-none flex justify-center">
        <Button 
          size="lg" 
          onClick={handlePedir}
          className="pointer-events-auto rounded-full shadow-xl shadow-green-500/20 bg-green-600 hover:bg-green-700 text-white gap-2 pl-6 pr-8 h-14 text-lg"
        >
          <MessageCircle className="w-6 h-6" />
          Pedir por WhatsApp
        </Button>
      </div>
    </div>
  );
}
