import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { ChevronLeft, Package, ShoppingCart, Loader2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface HistoryViewProps {
  setCurrentView: (view: string) => void;
}

export function HistoryView({ setCurrentView }: HistoryViewProps) {
  const { user } = useAppStore();
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchHistorial = async () => {
      try {
        const { data, error } = await supabase
          .from('pedidos')
          .select('*')
          .eq('cliente_tel', user.phone)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setPedidos(data || []);
      } catch (err) {
        console.error('Error fetching historial:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistorial();
  }, [user]);

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case 'entregado': return 'bg-green-100 text-green-700 border-green-200';
      case 'cancelado': return 'bg-red-100 text-red-700 border-red-200';
      case 'buscando_repartidor': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200'; // en_camino...
    }
  };

  const getStatusText = (estado: string) => {
    switch (estado) {
      case 'entregado': return 'Completado';
      case 'cancelado': return 'Cancelado';
      case 'buscando_repartidor': return 'Buscando';
      case 'en_camino_origen': return 'En camino (Origen)';
      case 'en_camino_destino': return 'En ruta (Destino)';
      default: return 'En proceso';
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 relative w-full">
      <header className="px-6 pt-6 sm:pt-8 pb-4 flex items-center gap-4 bg-white sticky top-0 z-20 border-b border-gray-100 shadow-sm">
        <button onClick={() => setCurrentView('home')} className="p-2 -ml-2 rounded-full hover:bg-gray-50 transition-colors">
          <ChevronLeft className="w-6 h-6 text-gray-800" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Mis Envíos</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 md:px-6 custom-scrollbar">
        <div className="max-w-2xl mx-auto w-full">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-yellow-500 animate-spin mb-4" />
              <p className="text-gray-500 font-medium">Cargando tu historial...</p>
            </div>
          ) : pedidos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                <Package className="w-10 h-10 text-gray-400" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Aún no tienes envíos</h2>
              <p className="text-gray-500 max-w-xs mb-8">Tus pedidos recientes aparecerán aquí una vez que realices tu primer envío o compra.</p>
              <button 
                onClick={() => setCurrentView('newDelivery')}
                className="bg-gray-900 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:bg-gray-800 active:scale-95 transition-all"
              >
                Solicitar ahora
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {pedidos.map((pedido, idx) => {
                const isCompra = pedido.descripcion?.includes('[COMPRA');
                const shortId = pedido.id.split('-')[0];
                
                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={pedido.id}
                    className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group cursor-pointer"
                    onClick={() => {
                       // Si está activo, llevar al tracking
                       if (!['entregado', 'cancelado'].includes(pedido.estado)) {
                         setCurrentView('activeTracking');
                       }
                    }}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isCompra ? 'bg-blue-50' : 'bg-yellow-50'}`}>
                          {isCompra ? (
                            <ShoppingCart className={`w-6 h-6 ${isCompra ? 'text-blue-600' : 'text-yellow-600'}`} />
                          ) : (
                            <Package className={`w-6 h-6 ${isCompra ? 'text-blue-600' : 'text-yellow-600'}`} />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Orden #{shortId}</p>
                          <h3 className="text-sm font-bold text-gray-900 line-clamp-1">{pedido.descripcion || 'Envío de paquete'}</h3>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <span className="text-lg font-black text-gray-900">${pedido.total}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-gray-50 pt-4">
                      <span className="text-[13px] font-medium text-gray-500">
                        {formatDate(pedido.created_at)}
                      </span>
                      <div className="flex items-center gap-3">
                        <div className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(pedido.estado)}`}>
                          {getStatusText(pedido.estado)}
                        </div>
                        {!['entregado', 'cancelado'].includes(pedido.estado) && (
                          <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center group-hover:bg-gray-900 group-hover:border-gray-900 group-hover:text-white transition-colors">
                            <ArrowRight className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
