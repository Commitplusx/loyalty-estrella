import { supabase } from '../../lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useAppStore';
import { Package, ShoppingCart, Loader2, ArrowRight, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

interface HistoryViewProps {
  setCurrentView: (view: string) => void;
}

const STATUS_MAP: Record<string, { label: string; dot: string }> = {
  entregado:           { label: 'Completado',   dot: 'bg-emerald-400' },
  cancelado:           { label: 'Cancelado',    dot: 'bg-red-400'     },
  buscando_repartidor: { label: 'Buscando',     dot: 'bg-yellow-400'  },
  en_camino_origen:    { label: 'En camino',    dot: 'bg-blue-400'    },
  en_camino_destino:   { label: 'En ruta',      dot: 'bg-blue-400'    },
};

const getStatus = (estado: string) =>
  STATUS_MAP[estado] ?? { label: 'En proceso', dot: 'bg-blue-400' };

const formatDate = (dateStr: string) =>
  new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateStr));

export function HistoryView({ setCurrentView }: HistoryViewProps) {
  const { user } = useAppStore();

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['historial', user?.phone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pedidos')
        .select('*')
        .eq('cliente_tel', user!.phone)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.phone,
  });

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">

      {/* Top bar — mismo alto que HomeView */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 px-8 md:px-12 h-14 flex items-center shrink-0">
        <h1 className="text-sm font-bold text-gray-900">Mis Envíos</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 md:px-12 py-10">
        <div className="max-w-3xl w-full mx-auto">

          {/* Header text */}
          <div className="mb-8">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Historial</p>
            <h2 className="text-3xl font-black text-gray-900">Tus pedidos</h2>
          </div>

          {/* States */}
          {isLoading ? (
            <div className="flex items-center gap-3 py-16 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">Cargando historial…</span>
            </div>

          ) : pedidos.length === 0 ? (
            <div className="py-20 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center mb-5">
                <Package className="w-7 h-7 text-gray-300" />
              </div>
              <p className="font-bold text-gray-900 mb-1">Sin envíos aún</p>
              <p className="text-sm text-gray-400 max-w-xs mb-7">
                Tus pedidos aparecerán aquí en cuanto realices tu primer envío o compra.
              </p>
              <button
                onClick={() => setCurrentView('newDelivery')}
                className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-gray-800 active:scale-95 transition-all"
              >
                Solicitar ahora <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          ) : (
            /* Table-style list */
            <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-100">
              {pedidos.map((pedido, idx) => {
                const isCompra = pedido.descripcion?.includes('[COMPRA');
                const shortId  = pedido.id.split('-')[0].toUpperCase();
                const active   = !['entregado', 'cancelado'].includes(pedido.estado);
                const status   = getStatus(pedido.estado);

                return (
                  <motion.button
                    key={pedido.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.04 }}
                    onClick={() => active && setCurrentView('activeTracking')}
                    className={`w-full text-left flex items-center gap-4 px-5 py-4 bg-white transition-colors duration-150 ${active ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
                  >
                    {/* Icon */}
                    <div className="w-9 h-9 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center shrink-0">
                      {isCompra
                        ? <ShoppingCart className="w-4 h-4 text-gray-500" />
                        : <Package      className="w-4 h-4 text-gray-500" />
                      }
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {pedido.descripcion || 'Envío de paquete'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Clock className="w-3 h-3 text-gray-300 shrink-0" />
                        <span className="text-xs text-gray-400">{formatDate(pedido.created_at)}</span>
                      </div>
                    </div>

                    {/* Status pill */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                      <span className="text-xs font-semibold text-gray-500">{status.label}</span>
                    </div>

                    {/* Price + arrow */}
                    <div className="text-right shrink-0 flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-900">${pedido.total}</span>
                      {active && (
                        <ArrowRight className="w-4 h-4 text-gray-300" />
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
