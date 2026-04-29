import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Megaphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function FlashBanner() {
  const [anuncio, setAnuncio] = useState<string | null>(null);

  useEffect(() => {
    // 1. Fetch initial
    const fetchAviso = async () => {
      const { data } = await supabase
        .from('anuncios_flash')
        .select('mensaje')
        .eq('activo', true)
        .order('created_at', { ascending: false }) // BUG-27 fix: always show newest active banner
        .limit(1)
        .maybeSingle();

      if (data) {
        setAnuncio(data.mensaje);
      } else {
        setAnuncio(null);
      }
    };

    fetchAviso();

    // 2. Subscribe to realtime changes
    const channel = supabase
      .channel('anuncios_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'anuncios_flash',
        },
        () => {
          fetchAviso();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <AnimatePresence>
      {anuncio && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="bg-red-600 text-white w-full overflow-hidden"
        >
          <div className="max-w-md mx-auto px-4 py-2 flex items-center justify-center space-x-2 text-sm font-bold">
            <Megaphone className="w-4 h-4 flex-shrink-0 animate-pulse" />
            <span className="text-center">{anuncio}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
