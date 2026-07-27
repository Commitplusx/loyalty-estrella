import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Star, Package, History, ShieldCheck, Phone, CheckCircle2, Ban, Bot, Gift, Loader2, Database, UserSearch, Activity } from 'lucide-react';

function ProfileLoader() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer1 = setTimeout(() => setStep(1), 800);
    const timer2 = setTimeout(() => setStep(2), 1600);
    const timer3 = setTimeout(() => setStep(3), 2400);
    return () => { clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3); };
  }, []);

  const steps = [
    { icon: Database, text: 'Conectando a base de datos...' },
    { icon: UserSearch, text: 'Analizando perfil del cliente...' },
    { icon: History, text: 'Recopilando historial y lealtad...' },
    { icon: Activity, text: 'Preparando panel...' }
  ];

  return (
    <div className="flex flex-col py-24 items-center justify-center max-w-sm mx-auto w-full px-6">
      <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-8 shadow-sm border border-blue-100 relative overflow-hidden">
        <div className="absolute inset-0 bg-blue-500/10 animate-pulse"></div>
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
      <div className="w-full space-y-4">
        {steps.map((s, i) => {
          const active = step >= i;
          const current = step === i;
          const Icon = s.icon;
          return (
            <div key={i} className={`flex items-center gap-4 transition-all duration-500 ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors duration-500 ${current ? 'bg-blue-100 text-blue-600 shadow-sm' : active ? 'bg-emerald-100 text-emerald-600 shadow-sm' : 'bg-zinc-50 text-zinc-300 border border-zinc-100'}`}>
                {active && !current ? <CheckCircle2 size={16} /> : <Icon size={14} className={current ? 'animate-pulse' : ''} />}
              </div>
              <span className={`text-sm font-bold tracking-tight transition-colors duration-500 ${current ? 'text-zinc-900' : active ? 'text-emerald-700' : 'text-zinc-400'}`}>
                {s.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ClienteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [cliente, setCliente] = useState<any>(null);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [minTimePassed, setMinTimePassed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinTimePassed(true), 3200); // Wait at least 3.2s to show animation
    return () => clearTimeout(t);
  }, []);

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
        
        // Fetch Movimientos (Pedidos)
        const { data: movData } = await supabase
          .from('pedidos')
          .select('id, total, estado, created_at, restaurantes(nombre)')
          .eq('cliente_tel', clienteData.telefono)
          .order('created_at', { ascending: false })
          .limit(20);
          
        // Fetch Eventos de Lealtad / Bot
        const { data: eventosData } = await supabase
          .from('cliente_eventos')
          .select('id, tipo, metadata, created_at')
          .eq('cliente_id', id)
          .order('created_at', { ascending: false })
          .limit(20);

        // Fetch Movimientos de Saldo / Puntos
        const { data: saldoData } = await supabase
          .from('movimientos_saldo')
          .select('id, tipo, descripcion, puntos_delta, created_at')
          .eq('cliente_tel', clienteData.telefono)
          .order('created_at', { ascending: false })
          .limit(20);

        // Fetch Registros de Puntos (Bonos masivos, etc)
        const { data: registrosData } = await supabase
          .from('registros_puntos')
          .select('id, tipo, descripcion, puntos, created_at')
          .eq('cliente_id', id)
          .order('created_at', { ascending: false })
          .limit(20);

        let allMovs: any[] = [];
        
        if (movData) {
          allMovs = [...allMovs, ...movData.map((d: any) => ({
            id: d.id,
            tipo: 'pedido',
            fecha: new Date(d.created_at),
            titulo: (d.restaurantes as any)?.nombre || 'Restaurante Desconocido',
            valor: `$${Number(d.total) || 0}`,
            estado: d.estado
          }))];
        }

        if (eventosData) {
          allMovs = [...allMovs, ...eventosData.map((d: any) => {
            let titulo = 'Evento del Sistema';
            let valor = 'Info';
            
            if (d.tipo === 'PROMO_5H') {
              titulo = 'Bot: Promoción 5H Enviada';
              valor = '+2 pts';
            } else if (d.tipo === 'PUNTOS_MANUALES') {
              titulo = 'Puntos Manuales';
              valor = `+${d.metadata?.puntos || 0} pts`;
            } else if (d.tipo === 'REACTIV') {
              titulo = 'Bot: Campaña Reactivación';
            } else {
              titulo = `Bot: ${d.tipo}`;
            }
            
            return {
              id: d.id,
              tipo: 'evento',
              fecha: new Date(d.created_at),
              titulo,
              valor,
              estado: 'completado'
            };
          })];
        }

        if (saldoData) {
          allMovs = [...allMovs, ...saldoData.map((d: any) => ({
            id: d.id,
            tipo: 'evento',
            fecha: new Date(d.created_at),
            titulo: d.descripcion || `Bot: ${d.tipo}`,
            valor: d.puntos_delta > 0 ? `+${d.puntos_delta} pts` : `${d.puntos_delta} pts`,
            estado: 'completado'
          }))];
        }

        if (registrosData) {
          allMovs = [...allMovs, ...registrosData.map((d: any) => ({
            id: d.id,
            tipo: 'evento',
            fecha: new Date(d.created_at),
            titulo: d.descripcion || `Puntos: ${d.tipo}`,
            valor: d.puntos > 0 ? `+${d.puntos} pts` : `${d.puntos} pts`,
            estado: 'completado'
          }))];
        }

        allMovs.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
        
        setMovimientos(allMovs.map(m => ({
          ...m,
          fechaStr: m.fecha.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        })));
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

  if (loading || !minTimePassed) {
    return <ProfileLoader />;
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
        className="group flex items-center gap-2 text-sm font-bold text-zinc-600 bg-white hover:bg-zinc-50 border border-zinc-200 hover:border-zinc-300 px-4 py-2 rounded-full transition-all shadow-sm w-max"
      >
        <ArrowLeft size={16} className="text-zinc-400 group-hover:-translate-x-1 transition-transform" /> 
        Volver a Clientes
      </button>

      {/* Header Info Minimalist */}
      <div className={`p-6 rounded-2xl border flex flex-col md:flex-row items-center gap-5 ${cliente.estado === 'baneado' ? 'bg-rose-50 border-rose-200' : 'bg-white border-zinc-200 shadow-sm'}`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold border ${cliente.estado === 'baneado' ? 'bg-rose-100 border-rose-300 text-rose-600' : 'bg-blue-50 border-blue-100 text-blue-600'}`}>
          {cliente.nombre ? cliente.nombre.charAt(0).toUpperCase() : '?'}
        </div>
        
        <div className="flex-1 text-center md:text-left">
          <div className="flex flex-col md:flex-row md:items-center gap-2 mb-1 justify-center md:justify-start">
            <h1 className={`text-2xl font-bold tracking-tight ${cliente.estado === 'baneado' ? 'text-rose-900' : 'text-zinc-900'}`}>
              {cliente.nombre}
            </h1>
            {cliente.estado === 'baneado' && (
              <span className="bg-rose-100 text-rose-600 border border-rose-200 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 w-max mx-auto md:mx-0">
                <Ban size={10} /> Suspendido
              </span>
            )}
          </div>
          <p className={`text-sm font-medium flex items-center justify-center md:justify-start gap-1.5 tracking-tight ${cliente.estado === 'baneado' ? 'text-rose-600' : 'text-zinc-500'}`}>
            <Phone size={14} /> {cliente.telefono}
          </p>
        </div>
        
        {/* Moderation Button */}
        <div className="w-full md:w-auto mt-2 md:mt-0">
           <button 
              onClick={toggleBan}
              className={`w-full md:w-auto px-5 py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors text-sm shadow-sm border ${
                cliente.estado === 'baneado' 
                  ? 'bg-zinc-900 text-white border-transparent hover:bg-black'
                  : 'bg-white border-rose-200 text-rose-600 hover:bg-rose-50'
              }`}
            >
              {cliente.estado === 'baneado' ? (
                <><CheckCircle2 size={16} /> Restaurar</>
              ) : (
                <><Ban size={16} /> Suspender</>
              )}
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda: Stats Clean */}
        <div className="space-y-4 lg:col-span-1">
           <div className="bg-white border border-zinc-200 shadow-sm p-5 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
                  <Star size={20} strokeWidth={2.5} />
                </div>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Puntos Estrella</p>
              </div>
              <p className="text-2xl font-black text-zinc-900">{cliente.puntos || 0}</p>
            </div>
            
            <div className="bg-white border border-zinc-200 shadow-sm p-5 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Package size={20} strokeWidth={2.5} />
                </div>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Pedidos Totales</p>
              </div>
              <p className="text-2xl font-black text-zinc-900">{cliente.pedidos_totales || 0}</p>
            </div>
            
            {cliente.estado === 'baneado' && (
               <div className="bg-rose-50 p-4 rounded-2xl border border-rose-200">
                 <h4 className="text-[11px] font-bold text-rose-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                  <ShieldCheck size={14} /> Cuenta Suspendida
                </h4>
                <p className="text-xs text-rose-700/80 font-medium">El usuario no puede realizar pedidos. La suspensión es indefinida.</p>
               </div>
            )}
        </div>

        {/* Columna Derecha: Movimientos Clean */}
        <div className="lg:col-span-2">
           <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6">
             <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <History size={16} /> Historial de Movimientos
              </h4>
              
              <div className="divide-y divide-zinc-100">
                {movimientos.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 text-sm">
                    No hay pedidos ni eventos recientes para este cliente.
                  </div>
                ) : (
                  movimientos.map(mov => (
                    <div key={mov.id} className="py-3 flex justify-between items-center group">
                      <div className="flex items-center gap-3">
                        {mov.tipo === 'evento' ? (
                          <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
                            {mov.titulo.includes('Promoción') || mov.titulo.includes('Puntos') ? <Gift size={16} /> : <Bot size={16} />}
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-500 flex items-center justify-center shrink-0">
                            <Package size={16} />
                          </div>
                        )}
                        <div>
                          <p className={`font-semibold text-sm tracking-tight ${mov.tipo === 'evento' ? 'text-orange-600' : 'text-zinc-900'}`}>{mov.titulo}</p>
                          <p className="text-[11px] text-zinc-400 font-medium mt-0.5">{mov.fechaStr}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm text-zinc-900 tracking-tight">{mov.valor}</p>
                        <span className={`inline-block text-[9px] font-bold uppercase tracking-widest mt-1 ${mov.estado === 'entregado' || mov.estado === 'completado' ? 'text-emerald-500' : 'text-zinc-400'}`}>
                          {mov.estado}
                        </span>
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
