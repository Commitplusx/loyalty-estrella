import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Star, Package, History, ShieldCheck, Phone, CheckCircle2, Ban } from 'lucide-react';

export function ClienteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [cliente, setCliente] = useState<any>(null);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDatos = async () => {
      try {
        setLoading(true);
        if (!id) return;
        
        // Fetch Cliente
        const { data: clienteData, error: clienteError } = await supabase
          .from('clientes')
          .select('*')
          .eq('id', id)
          .single();
          
        if (clienteError) throw clienteError;
        setCliente(clienteData);
        
        // Fetch Movimientos
        const { data: movData, error: movError } = await supabase
          .from('pedidos')
          .select('id, total, estado, created_at, restaurantes(nombre)')
          .eq('cliente_tel', id)
          .order('created_at', { ascending: false })
          .limit(20);
          
        if (!movError && movData) {
          const mapped = movData.map((d: any) => ({
            id: d.id,
            fecha: new Date(d.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
            restaurante: (d.restaurantes as any)?.nombre || 'Desconocido',
            total: Number(d.total) || 0,
            estado: d.estado
          }));
          setMovimientos(mapped);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDatos();
  }, [id]);

  const toggleBan = async () => {
    if (!cliente) return;
    const nuevoEstado = cliente.estado === 'activo' ? 'baneado' : 'activo';
    
    // Optimistic
    setCliente({ ...cliente, estado: nuevoEstado });
    
    // BD
    await supabase.from('clientes').update({ estado: nuevoEstado }).eq('id', cliente.id);
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-zinc-500">Cargando perfil del cliente...</div>;
  }

  if (!cliente) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <h2 className="text-xl font-bold text-zinc-700">Cliente no encontrado</h2>
        <button onClick={() => navigate('/clientes')} className="mt-4 px-4 py-2 bg-zinc-900 text-white rounded-lg">Volver</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Navigation */}
      <button 
        onClick={() => navigate('/clientes')}
        className="flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <ArrowLeft size={16} /> Volver a Clientes
      </button>

      {/* Header Info */}
      <div className={`p-8 rounded-2xl border flex flex-col md:flex-row items-center gap-6 ${cliente.estado === 'baneado' ? 'bg-rose-50 border-rose-200' : 'bg-white border-zinc-200 shadow-sm'}`}>
        <div className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl font-black shadow-sm border ${cliente.estado === 'baneado' ? 'bg-rose-100 border-rose-300 text-rose-600' : 'bg-zinc-100 border-zinc-300 text-zinc-900'}`}>
          {cliente.nombre ? cliente.nombre.charAt(0).toUpperCase() : '?'}
        </div>
        <div className="flex-1 text-center md:text-left">
          <h1 className={`text-3xl font-black tracking-tight leading-tight ${cliente.estado === 'baneado' ? 'text-rose-900' : 'text-zinc-900'}`}>
            {cliente.nombre}
          </h1>
          <p className={`text-sm font-medium flex items-center justify-center md:justify-start gap-1.5 mt-2 tracking-tight ${cliente.estado === 'baneado' ? 'text-rose-600' : 'text-zinc-500'}`}>
            <Phone size={14} /> {cliente.telefono}
          </p>
        </div>
        
        {/* Moderation Button Mobile/Tablet usually hidden, but here on the side */}
        <div className="w-full md:w-auto">
           <button 
              onClick={toggleBan}
              className={`w-full md:w-auto px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors text-sm tracking-tight shadow-sm ${
                cliente.estado === 'baneado' 
                  ? 'bg-zinc-900 hover:bg-black text-white'
                  : 'bg-white border border-rose-200 hover:bg-rose-50 text-rose-600'
              }`}
            >
              {cliente.estado === 'baneado' ? (
                <><CheckCircle2 size={18} /> Restaurar Acceso</>
              ) : (
                <><Ban size={18} /> Suspender Cliente</>
              )}
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda: Stats */}
        <div className="space-y-6 lg:col-span-1">
           <div className="bg-amber-50 border border-amber-200 shadow-sm p-6 rounded-2xl flex flex-col items-center justify-center text-center">
              <Star size={36} strokeWidth={2.5} className="fill-amber-500 text-amber-500 mb-3" />
              <p className="text-4xl font-black text-amber-900 tracking-tight">{cliente.puntos || 0}</p>
              <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mt-1.5">Puntos Estrella</p>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 shadow-sm p-6 rounded-2xl flex flex-col items-center justify-center text-center">
              <Package size={36} strokeWidth={2.5} className="text-indigo-600 mb-3" />
              <p className="text-4xl font-black text-indigo-900 tracking-tight">{cliente.pedidos_totales || 0}</p>
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mt-1.5">Pedidos Totales</p>
            </div>
            
            {cliente.estado === 'baneado' && (
               <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-sm">
                 <h4 className="text-[11px] font-bold text-rose-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <ShieldCheck size={16} /> Estado de la Cuenta
                </h4>
                <p className="text-xs text-zinc-600 font-medium">Este usuario está suspendido y no puede realizar pedidos en la plataforma actualmente. La suspensión es indefinida hasta que se restaure su acceso.</p>
               </div>
            )}
        </div>

        {/* Columna Derecha: Movimientos */}
        <div className="lg:col-span-2">
           <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 h-full">
             <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                <History size={16} /> Historial de Movimientos
              </h4>
              
              <div className="space-y-4">
                {movimientos.length === 0 ? (
                  <div className="text-center p-8 text-zinc-400 font-medium text-sm border-2 border-dashed border-zinc-100 rounded-xl">No hay pedidos recientes.</div>
                ) : (
                  movimientos.map(mov => (
                    <div key={mov.id} className="p-4 border border-zinc-200 bg-white shadow-sm rounded-xl flex justify-between items-center group hover:border-zinc-300 transition-colors">
                      <div>
                        <p className="font-bold text-base text-zinc-900 tracking-tight">{mov.restaurante}</p>
                        <p className="text-xs font-medium text-zinc-500 mt-1">{mov.fecha}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-base text-zinc-900 tracking-tight">${mov.total}</p>
                        <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${mov.estado === 'entregado' ? 'text-zinc-900' : 'text-zinc-400'}`}>
                          {mov.estado}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
