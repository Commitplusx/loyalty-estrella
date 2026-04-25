import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Package, Clock, Phone, Loader2, Navigation, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

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
  // join
  restaurante_data?: { nombre: string; lat?: number; lng?: number };
}

export function PedidoView() {
  const { id } = useParams();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [loading, setLoading] = useState(true);
  const [aceptando, setAceptando] = useState(false);

  useEffect(() => {
    const fetchPedido = async () => {
      try {
        const { data, error } = await supabase
          .from('pedidos')
          .select('*, restaurante_data:restaurantes(nombre, lat, lng)')
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
    if (id) fetchPedido();
  }, [id]);

  const handleAceptar = async () => {
    setAceptando(true);
    try {
      const { error } = await supabase
        .from('pedidos')
        .update({ estado: 'recibido' })
        .eq('id', id);

      if (error) throw error;
      toast.success('Pedido recibido exitosamente');
      setPedido({ ...pedido, estado: 'recibido' });
      
      // Intentar notificar al bot via un HTTP post (opcional) pero ya actualizamos DB
    } catch (err: any) {
      toast.error('No se pudo aceptar el pedido');
    } finally {
      setAceptando(false);
    }
  };

  const openNavigation = () => {
    if (pedido.lat && pedido.lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${pedido.lat},${pedido.lng}&travelmode=driving`, '_blank');
    } else {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pedido.direccion + ', Comitan')}&travelmode=driving`, '_blank');
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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 p-4 font-sans max-w-lg mx-auto">
      <div className="mt-8 mb-6 text-center">
        <div className="inline-flex items-center justify-center p-3 bg-zinc-900 rounded-full mb-4 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20">
          <Package className="h-8 w-8 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">
          {pedido.restaurante || 'Servicio Express'}
        </h1>
        <p className="text-emerald-500 font-medium tracking-wide mt-2">NUEVA ASIGNACIÓN</p>
      </div>

      <Card className="bg-zinc-900/50 border-zinc-800/50 shadow-2xl backdrop-blur-sm -mx-2 sm:mx-0">
        <CardContent className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="mt-1 bg-zinc-800/80 p-2 rounded-xl ring-1 ring-white/5">
                <MapPin className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="space-y-1 overflow-hidden">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Entregar en</p>
                <p className="text-sm text-zinc-300 font-medium leading-relaxed truncate">{pedido.direccion || 'Dirección por confirmar'}</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="mt-1 bg-zinc-800/80 p-2 rounded-xl ring-1 ring-white/5">
                <Package className="h-5 w-5 text-indigo-400" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Detalle del paquete</p>
                <p className="text-sm text-zinc-300 font-medium leading-relaxed">{pedido.descripcion}</p>
              </div>
            </div>

            {pedido.cliente_tel && (
              <div className="flex gap-4">
                <div className="mt-1 bg-zinc-800/80 p-2 rounded-xl ring-1 ring-white/5">
                  <Phone className="h-5 w-5 text-fuchsia-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Cliente / Teléfono</p>
                  <p className="text-sm text-zinc-300 font-medium">
                    {pedido.cliente_nombre ? `${pedido.cliente_nombre} - ` : ''}
                    <a href={`tel:${pedido.cliente_tel}`} className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
                      {pedido.cliente_tel}
                    </a>
                  </p>
                </div>
              </div>
            )}
          </div>
          
          <div className="p-4 bg-black/40 rounded-2xl border border-white/5 mt-6 flex justify-between items-center group cursor-pointer hover:bg-black/60 transition-colors" onClick={openNavigation}>
             <div className="flex items-center gap-3">
               <div className="bg-emerald-500/20 p-2 rounded-lg group-hover:bg-emerald-500/30 transition-colors">
                 <Navigation className="h-5 w-5 text-emerald-400" />
               </div>
               <div>
                  <p className="text-sm font-semibold text-zinc-200">Ruta Recomendada</p>
                  <p className="text-xs text-zinc-500">Abrir en navegación GPS</p>
               </div>
             </div>
          </div>
          
          <div className="pt-6">
            {pedido.estado === 'asignado' ? (
              <Button 
                onClick={handleAceptar} 
                disabled={aceptando}
                className="w-full h-14 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-3 text-lg group"
              >
                {aceptando ? <Loader2 className="animate-spin h-6 w-6" /> : <><CheckCircle2 className="h-6 w-6 group-hover:scale-110 transition-transform" /> ACEPTAR SERVICIO</>}
              </Button>
            ) : (
                <div className="w-full h-14 bg-zinc-800 border-2 border-dashed border-zinc-700/50 flex items-center justify-center rounded-2xl gap-2">
                  <CheckCircle2 className="h-5 w-5 text-zinc-500" />
                  <p className="text-zinc-400 font-semibold text-sm">Servicio marcado como {pedido.estado}</p>
                </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
