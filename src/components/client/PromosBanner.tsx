import { useEffect, useState } from 'react';
import { getPromocionesActivas, supabase } from '@/lib/supabase';
import { Tag } from 'lucide-react';

interface Promo {
  id: string;
  titulo: string;
  descripcion: string;
}

export function PromosBanner() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPromos = () => {
      getPromocionesActivas()
        .then((data) => setPromos(data as Promo[]))
        .catch(() => {})
        .finally(() => setLoading(false));
    };

    loadPromos();

    // Cualquier cambio en la tabla de promociones se refleja al instante
    const channel = supabase
      .channel('promociones_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promociones_dinamicas' }, () => {
        loadPromos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading || promos.length === 0) return null;

  return (
    <div className="mb-8 rounded-2xl overflow-hidden shadow-lg border border-orange-100">
      <div className="bg-orange-100 text-orange-800 p-3 font-bold flex items-center gap-2 text-sm border-b border-orange-200">
        <Tag className="w-4 h-4" /> Ofertas del Día
      </div>
      <div className="bg-white">
        {promos.map((p, i) => (
          <div 
            key={p.id} 
            className={`p-4 ${i !== promos.length - 1 ? 'border-b border-gray-100' : ''}`}
          >
            <h3 className="font-bold text-gray-900 text-lg mb-1">{p.titulo}</h3>
            <p className="text-gray-600 text-sm">{p.descripcion}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
