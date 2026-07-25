import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { MapPin, Navigation, Package, CheckCircle2, Clock, Loader2, ArrowLeft, Bike } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Tracking() {
  const { user, pedidoActivo, setPedidoActivo } = useAppStore();
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    // Buscar pedido activo
    const fetchPedido = async () => {
      try {
        const { data, error } = await supabase
          .from('pedidos')
          .select('*, repartidores(nombre, telefono, foto_url, vehiculo, placa)')
          .eq('cliente_tel', user.phone)
          .eq('tipo_pedido', 'mandadito')
          .not('estado', 'in', '("entregado","cancelado")')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;
        setPedidoActivo(data);
      } catch (err) {
        console.error('Error fetching pedido:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPedido();

    // Suscripción
    const channel = supabase.channel('mandadito_updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'pedidos',
        filter: `cliente_tel=eq.${user.phone}`,
      }, (payload) => {
        if (payload.new.estado === 'entregado' || payload.new.estado === 'cancelado') {
          setPedidoActivo(null); // Ya terminó
        } else {
          // Re-fetch para traer datos del repartidor si se acaba de asignar
          fetchPedido();
        }
      }).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, setPedidoActivo]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={32} />
        <p className="text-zinc-500 font-medium">Buscando tu mandadito...</p>
      </div>
    );
  }

  if (!pedidoActivo) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 size={32} />
        </div>
        <h2 className="text-xl font-black text-zinc-900 mb-2">No tienes mandaditos activos</h2>
        <p className="text-zinc-500 font-medium mb-6">¿Necesitas que llevemos algo por ti?</p>
        <button
          onClick={() => navigate('/')}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-md shadow-blue-600/20 active:scale-95 transition-all"
        >
          Pedir Mandadito
        </button>
      </div>
    );
  }

  const getStatusText = (estado: string) => {
    switch (estado) {
      case 'buscando_repartidor': return 'Buscando Repartidor...';
      case 'asignado': return 'Repartidor Asignado';
      case 'en_camino': return 'En Camino al Destino';
      case 'recibido': return 'El repartidor tiene tu paquete';
      default: return estado.replace('_', ' ');
    }
  };

  const getStatusIcon = (estado: string) => {
    switch (estado) {
      case 'buscando_repartidor': return <Loader2 className="animate-spin" />;
      case 'asignado': return <CheckCircle2 />;
      case 'en_camino': return <Bike />;
      case 'recibido': return <Package />;
      default: return <Clock />;
    }
  };

  const rep = pedidoActivo.repartidores;

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <button onClick={() => navigate('/')} className="mr-4 p-2 -ml-2 text-zinc-400 hover:text-zinc-900 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-black tracking-tight text-zinc-900 text-lg">Seguimiento</h1>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full p-4 md:p-8 flex flex-col gap-6">
        
        {/* Status Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-200 text-center relative overflow-hidden">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-sm">
            {getStatusIcon(pedidoActivo.estado)}
          </div>
          <h2 className="text-xl font-black text-zinc-900 uppercase tracking-wide">
            {getStatusText(pedidoActivo.estado)}
          </h2>
          <p className="text-zinc-500 text-sm mt-2 font-medium">
            Monto a pagar: <span className="font-bold text-zinc-900">${pedidoActivo.total}</span>
          </p>
          <div className="mt-4 pt-4 border-t border-zinc-100 flex justify-center gap-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">
             <span>#{pedidoActivo.id.split('-')[0]}</span>
             <span>•</span>
             <span>Efectivo</span>
          </div>
        </div>

        {/* Repartidor Info */}
        {rep && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-zinc-200 flex items-center gap-4">
            <div className="w-14 h-14 bg-zinc-100 rounded-full flex items-center justify-center border-2 border-zinc-200 shrink-0 overflow-hidden">
              {rep.foto_url ? (
                <img src={rep.foto_url} alt="Repartidor" className="w-full h-full object-cover" />
              ) : (
                <span className="font-black text-zinc-400 text-xl">{rep.nombre?.charAt(0) || 'R'}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-0.5">Tu Repartidor</p>
              <p className="font-black text-zinc-900 truncate">{rep.nombre}</p>
              <p className="text-xs text-zinc-500 font-medium truncate">{rep.vehiculo || 'Moto'} • {rep.placa}</p>
            </div>
            <a 
              href={`https://wa.me/52${rep.telefono?.replace(/\D/g,'')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center hover:bg-green-100 transition-colors shrink-0"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
            </a>
          </div>
        )}

        {/* Detalles */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-200 space-y-6">
          <div>
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Lo que pediste</h3>
            <p className="text-zinc-900 font-medium leading-relaxed">{pedidoActivo.descripcion}</p>
          </div>
          
          <div className="relative pl-8 space-y-6">
            <div className="absolute left-[11px] top-6 bottom-6 w-0.5 bg-zinc-200"></div>
            
            <div className="relative">
              <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-2 border-zinc-300 rounded-full flex items-center justify-center z-10">
                <div className="w-2 h-2 bg-zinc-400 rounded-full"></div>
              </div>
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Recolección</h3>
              <p className="text-zinc-900 font-medium leading-relaxed">{pedidoActivo.direccion}</p>
            </div>

            <div className="relative">
              <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-2 border-blue-500 rounded-full flex items-center justify-center z-10">
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
              </div>
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Entrega</h3>
              <p className="text-zinc-900 font-medium leading-relaxed">{pedidoActivo.referencias_entrega}</p>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
