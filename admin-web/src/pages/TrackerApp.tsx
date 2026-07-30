import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Package, MapPin, Store, Navigation, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

export function TrackerApp() {
  const { id } = useParams<{ id: string }>();
  const [pedido, setPedido] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchPedido = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('tracker-api', {
          method: 'GET',
          query: { id }
        });

        if (error) throw error;
        setPedido(data);
      } catch (err: any) {
        console.error('Error fetching tracker:', err);
        setError(err.message || 'No se pudo cargar el pedido. Verifica el link.');
      } finally {
        setLoading(false);
      }
    };
    fetchPedido();
  }, [id]);

  const updateEstado = async (action: string) => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const { error } = await supabase.functions.invoke('tracker-api', {
        method: 'POST',
        body: { id, action }
      });
      if (error) throw error;
      setPedido((prev: any) => ({ ...prev, estado: action }));
    } catch (err: any) {
      alert('Error al actualizar: ' + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const openMaps = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500 mb-4"></div>
        <p className="text-zinc-500 font-medium animate-pulse">Cargando pedido...</p>
      </div>
    );
  }

  if (error || !pedido) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-4">
          <AlertCircle size={32} className="text-rose-500" />
        </div>
        <h1 className="text-xl font-black text-zinc-900 mb-2">Error de Rastreo</h1>
        <p className="text-zinc-500">{error || 'Pedido no encontrado'}</p>
      </div>
    );
  }

  const isTerminado = pedido.estado === 'entregado' || pedido.estado === 'cancelado';

  return (
    <div className="min-h-screen bg-zinc-50 font-sans pb-24">
      {/* Header */}
      <header className="bg-zinc-900 text-white p-4 sticky top-0 z-10 shadow-md">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Estrella Delivery</p>
            <h1 className="text-lg font-black tracking-tight">Pedido #{pedido.id.split('-')[0]}</h1>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
            pedido.estado === 'en_camino' ? 'bg-orange-500 text-white' :
            pedido.estado === 'entregado' ? 'bg-emerald-500 text-white' :
            'bg-zinc-700 text-zinc-200'
          }`}>
            {pedido.estado.replace('_', ' ')}
          </div>
        </div>
      </header>

      <main className="p-4 max-w-lg mx-auto flex flex-col gap-4 mt-2">
        
        {/* Restaurante */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-200/60 flex gap-4 items-start">
          <div className="w-12 h-12 bg-orange-100 text-orange-500 rounded-xl flex items-center justify-center shrink-0">
            <Store size={24} />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Recolección</p>
            <h2 className="text-lg font-black text-zinc-900 leading-tight mt-0.5">{pedido.restaurantes?.nombre_comercial}</h2>
            <p className="text-sm text-zinc-500 mt-1 leading-snug">{pedido.restaurantes?.direccion}</p>
            
            {pedido.restaurantes?.lat && pedido.restaurantes?.lng && (
              <button 
                onClick={() => openMaps(pedido.restaurantes.lat, pedido.restaurantes.lng)}
                className="mt-3 flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg w-max"
              >
                <Navigation size={14} /> Cómo llegar
              </button>
            )}
          </div>
        </div>

        {/* Cliente */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-200/60 flex gap-4 items-start">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
            <MapPin size={24} />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Entrega</p>
            <h2 className="text-lg font-black text-zinc-900 leading-tight mt-0.5">{pedido.cliente_nombre || 'Cliente'}</h2>
            <p className="text-sm text-zinc-500 mt-1 leading-snug">{pedido.direccion}</p>
            <p className="text-xs font-medium text-zinc-400 mt-1 border-l-2 border-zinc-200 pl-2">{pedido.descripcion}</p>
            
            {pedido.lat && pedido.lng && (
              <button 
                onClick={() => openMaps(pedido.lat, pedido.lng)}
                className="mt-3 flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg w-max"
              >
                <Navigation size={14} /> Ruta al cliente
              </button>
            )}
          </div>
        </div>

        {/* Info Extra */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="bg-white p-3 rounded-xl border border-zinc-200/60 text-center">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cobrar</p>
            <p className="text-xl font-black text-zinc-900 mt-0.5">${pedido.total}</p>
            <p className="text-[9px] font-bold text-zinc-500 uppercase">{pedido.metodo_pago}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-zinc-200/60 text-center">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Hora</p>
            <p className="text-lg font-black text-zinc-900 mt-1">{new Date(pedido.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
          </div>
        </div>
      </main>

      {/* Bottom Actions */}
      {!isTerminado && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-zinc-200 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-20">
          <div className="max-w-lg mx-auto flex gap-3">
            {pedido.estado === 'externo' && (
              <button 
                onClick={() => updateEstado('en_camino')}
                disabled={isUpdating}
                className="flex-1 bg-orange-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {isUpdating ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : <><Package size={18} /> Ya lo recogí</>}
              </button>
            )}
            
            {(pedido.estado === 'en_camino' || pedido.estado === 'externo') && (
              <button 
                onClick={() => updateEstado('entregado')}
                disabled={isUpdating}
                className="flex-1 bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {isUpdating ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : <><CheckCircle2 size={18} /> Entregado</>}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
