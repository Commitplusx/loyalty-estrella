import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Package, Phone, Loader2, Navigation, CheckCircle2 } from 'lucide-react';
import { toast } from '@/components/ui/toast-native';

interface Pedido {
  id: string;
  cliente_tel: string;
  cliente_nombre?: string;
  restaurante?: string;
  repartidor_id?: string;
  descripcion: string;
  direccion?: string;
  lat?: number;
  lng?: number;
  wb_message_id?: string;
  precio_entrega?: number;
  zona_entrega?: string;
  estado: 'asignado' | 'recibido' | 'en_camino' | 'entregado' | 'cancelado';
  created_at: string;
  updated_at: string;
}

export function PedidoView() {
  const { id } = useParams();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [loading, setLoading] = useState(true);
  const [aceptando, setAceptando] = useState(false);

  useEffect(() => {
    // BUG-20 fix: guard at the top so cleanup always runs when id changes
    if (!id) return;

    const fetchPedido = async () => {
      try {
        const { data, error } = await supabase
          .from('pedidos')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        setPedido(data);
      } catch (err: any) {
        toast.error('Error al cargar el pedido');
      } finally {
        setLoading(false);
      }
    };

    fetchPedido();

    // Sincronización en tiempo real
    const channel = supabase
      .channel(`pedido-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pedidos',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          console.log('Pedido actualizado remoto:', payload.new);
          setPedido(payload.new as Pedido);
          toast.info(`El pedido ahora está: ${payload.new.estado.replace('_', ' ')}`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const handleActualizarEstado = async (nuevoEstado: string) => {
    if (!pedido) return;
    setAceptando(true);
    try {
      // Validar transición de estados (misma lógica que rep-handler.ts)
      const transicionesValidas: Record<string, string[]> = {
        'aceptado': ['asignado'],
        'recibido': ['aceptado', 'asignado', 'pendiente'],
        'en_camino': ['recibido'],
        'entregado': ['en_camino'],
        'cancelado': ['asignado', 'aceptado', 'pendiente', 'recibido', 'en_camino'],
      };
      const estadosPrevios = transicionesValidas[nuevoEstado];
      
      let query = supabase.from('pedidos').update({ estado: nuevoEstado }).eq('id', id);
      if (estadosPrevios) {
        query = query.in('estado', estadosPrevios);
      }
      const { data, error } = await query.select();

      if (error) throw error;
      if (!data?.length) {
        toast.error('No se pudo avanzar', `El pedido ya no está en el estado correcto para pasar a "${nuevoEstado}".`);
        return;
      }
      toast.success(`Pedido actualizado a: ${nuevoEstado.replace('_', ' ')}`);
      setPedido((prev) => prev ? { ...prev, estado: nuevoEstado as any } : null);

      // BUG-26 fix: notify client via WhatsApp when state changes from web
      supabase.functions.invoke('notificar-whatsapp', {
        body: { tipo: nuevoEstado, pedido_id: id }
      }).catch(console.error);
    } catch (err: any) {
      toast.error('Error al actualizar el estado');
    } finally {
      setAceptando(false);
    }
  };

  const openNavigation = () => {
    if (pedido?.lat && pedido?.lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${pedido.lat},${pedido.lng}&travelmode=driving`, '_blank');
    } else if (pedido?.direccion) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pedido.direccion + ', Comitan')}&travelmode=driving`, '_blank');
    } else {
      // BUG-31 fix: show feedback instead of silently doing nothing
      toast.warning('Sin datos de ubicación', 'Este pedido no tiene dirección ni coordenadas GPS');
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="h-12 w-12 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white flex-col gap-4">
        <Package className="h-20 w-20 text-zinc-600" />
        <h2 className="text-2xl font-bold bg-gradient-to-r from-zinc-400 to-zinc-200 bg-clip-text text-transparent">Pedido No Encontrado</h2>
        <p className="text-zinc-500 max-w-sm text-center">Este servicio no existe o fue cancelado. Comunícate con cabina.</p>
      </div>
    );
  }

  const renderBotones = () => {
    switch (pedido.estado) {
      case 'asignado':
        return (
          <Button 
            onClick={() => handleActualizarEstado('recibido')} 
            disabled={aceptando}
            className="w-full h-14 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-3 text-lg group"
          >
            {aceptando ? <Loader2 className="animate-spin h-6 w-6" /> : <><CheckCircle2 className="h-6 w-6 group-hover:scale-110 transition-transform" /> ACEPTAR SERVICIO</>}
          </Button>
        );
      case 'recibido':
        return (
          <Button 
            onClick={() => handleActualizarEstado('en_camino')} 
            disabled={aceptando}
            className="w-full h-14 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold rounded-2xl shadow-[0_0_30px_rgba(59,130,246,0.3)] transition-all flex items-center justify-center gap-3 text-lg group"
          >
            {aceptando ? <Loader2 className="animate-spin h-6 w-6" /> : <><Package className="h-6 w-6 group-hover:scale-110 transition-transform" /> SALIR A ENTREGAR</>}
          </Button>
        );
      case 'en_camino':
        return (
          <Button 
            onClick={() => handleActualizarEstado('entregado')} 
            disabled={aceptando}
            className="w-full h-14 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold rounded-2xl shadow-[0_0_30px_rgba(249,115,22,0.3)] transition-all flex items-center justify-center gap-3 text-lg group"
          >
            {aceptando ? <Loader2 className="animate-spin h-6 w-6" /> : <><MapPin className="h-6 w-6 group-hover:scale-110 transition-transform" /> MARCAR ENTREGADO</>}
          </Button>
        );
      case 'entregado':
        return (
          <div className="w-full h-14 bg-emerald-950/40 border-2 border-emerald-500/50 flex items-center justify-center rounded-2xl gap-2 cursor-default">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <p className="text-emerald-400 font-bold text-sm tracking-wide">SERVICIO FINALIZADO</p>
          </div>
        );
      case 'cancelado':
        return (
          <div className="w-full h-14 bg-red-950/40 border-2 border-red-500/50 flex items-center justify-center rounded-2xl gap-2 cursor-default">
            <p className="text-red-400 font-bold text-sm tracking-wide">SERVICIO CANCELADO</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 p-4 sm:p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="mt-4 mb-8 text-center lg:text-left flex flex-col lg:flex-row items-center gap-4 lg:gap-6">
          <div className="inline-flex items-center justify-center p-4 bg-zinc-900 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20">
            <Package className="h-8 w-8 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">
              {pedido.restaurante || 'Servicio Express'}
            </h1>
            <p className="text-emerald-500 font-bold tracking-widest text-xs mt-2 lg:mt-1 uppercase">ESTADO: {pedido.estado.replace('_', ' ')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna Izquierda: Detalles */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-zinc-900/50 border-zinc-800/50 shadow-2xl backdrop-blur-sm h-full">
              <CardContent className="p-6 sm:p-8 space-y-8">
                <div className="space-y-6">
                  <div className="flex gap-4 items-start">
                    <div className="mt-1 bg-zinc-800/80 p-3 rounded-xl ring-1 ring-white/5">
                      <MapPin className="h-6 w-6 text-emerald-400" />
                    </div>
                    <div className="space-y-1 overflow-hidden">
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Entregar en</p>
                      <p className="text-base text-zinc-200 font-medium leading-relaxed">{pedido.direccion || 'Dirección por confirmar'}</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start">
                    <div className="mt-1 bg-zinc-800/80 p-3 rounded-xl ring-1 ring-white/5">
                      <Package className="h-6 w-6 text-indigo-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Detalle del paquete</p>
                      <p className="text-base text-zinc-200 font-medium leading-relaxed">{pedido.descripcion}</p>
                    </div>
                  </div>

                  {pedido.cliente_tel && (
                    <div className="flex gap-4 items-start">
                      <div className="mt-1 bg-zinc-800/80 p-3 rounded-xl ring-1 ring-white/5">
                        <Phone className="h-6 w-6 text-fuchsia-400" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Cliente / Teléfono</p>
                        <p className="text-base text-zinc-200 font-medium">
                          {pedido.cliente_nombre ? `${pedido.cliente_nombre} - ` : ''}
                          <a href={`tel:${pedido.cliente_tel}`} className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
                            {pedido.cliente_tel}
                          </a>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Columna Derecha: Acciones */}
          <div className="space-y-6">
             <Card className="bg-zinc-900/50 border-zinc-800/50 shadow-2xl backdrop-blur-sm lg:sticky lg:top-8">
               <CardContent className="p-6 space-y-6">
                  {/* Navegación */}
                  <div className="p-5 bg-black/40 rounded-2xl border border-white/5 flex flex-col items-center justify-center gap-3 group cursor-pointer hover:bg-black/60 transition-colors text-center" onClick={openNavigation}>
                    <div className="bg-emerald-500/20 p-3 rounded-full group-hover:bg-emerald-500/30 transition-colors">
                      <Navigation className="h-6 w-6 text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-base font-semibold text-zinc-200">Ruta Recomendada</p>
                        <p className="text-xs text-zinc-500 mt-1">Abrir en navegación GPS</p>
                    </div>
                  </div>
                  
                  {/* Botones */}
                  <div className="pt-2">
                    {renderBotones()}
                  </div>
               </CardContent>
             </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
