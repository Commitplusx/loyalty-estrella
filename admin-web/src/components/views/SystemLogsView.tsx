import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Bot, Gift, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type LogEntry = {
  id: string;
  source: 'pedido_log' | 'cliente_evento';
  title: string;
  details: string;
  created_at: string;
  icon: any;
  colorClass: string;
  metadata?: any;
};

export function SystemLogsView() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch pedido logs (Bot assigning drivers, etc)
      const { data: pedidoLogs, error: err1 } = await supabase
        .from('pedido_logs')
        .select(`
          id,
          accion,
          detalles,
          created_at,
          pedidos ( codigo_rastreo )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (err1) throw err1;

      // Fetch cliente eventos (Points, Promos, etc)
      const { data: clienteEventos, error: err2 } = await supabase
        .from('cliente_eventos')
        .select(`
          id,
          tipo,
          metadata,
          created_at,
          clientes ( nombre, telefono )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (err2) throw err2;

      // Map and merge
      const mergedLogs: LogEntry[] = [];

      pedidoLogs?.forEach((log: any) => {
        let icon = Bot;
        let colorClass = 'bg-blue-100 text-blue-600';
        
        if (log.accion?.toLowerCase().includes('repartidor')) {
          colorClass = 'bg-emerald-100 text-emerald-600';
        }

        mergedLogs.push({
          id: log.id,
          source: 'pedido_log',
          title: `Bot: ${log.accion}`,
          details: `${log.detalles} (Pedido: ${log.pedidos?.codigo_rastreo || 'N/A'})`,
          created_at: log.created_at,
          icon,
          colorClass
        });
      });

      clienteEventos?.forEach((evt: any) => {
        let icon = Gift;
        let colorClass = 'bg-orange-100 text-[#FA4A0C]';
        let title = 'Evento Cliente';
        
        if (evt.tipo === 'PROMO_5H') {
          title = 'Bot: Promoción 5H Enviada';
        } else if (evt.tipo === 'REACTIV') {
          title = 'Bot: Reactivación de Cliente';
        } else {
          title = `Sistema: ${evt.tipo}`;
        }

        const clienteStr = evt.clientes?.nombre ? `${evt.clientes.nombre} (${evt.clientes.telefono})` : 'Cliente Desconocido';

        mergedLogs.push({
          id: evt.id,
          source: 'cliente_evento',
          title,
          details: `Se registró el evento para ${clienteStr}`,
          created_at: evt.created_at,
          icon,
          colorClass,
          metadata: evt.metadata
        });
      });

      // Sort combined array by created_at desc
      mergedLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setLogs(mergedLogs.slice(0, 50)); // Keep top 50 recent events
    } catch (err: any) {
      console.error('Error fetching logs:', err);
      setError(err.message || 'Ocurrió un error al cargar el historial del bot.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
      <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-black text-zinc-900 tracking-tight">Actividad del Bot y Sistema</h2>
          <p className="text-zinc-500 text-sm mt-1">Monitorea asignaciones automáticas, puntos y promociones otorgadas a los clientes.</p>
        </div>
        <button 
          onClick={fetchLogs}
          disabled={loading}
          className="px-4 py-2 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-bold text-sm rounded-xl transition-all border border-zinc-200 flex items-center gap-2"
        >
          <Clock size={16} /> {loading ? 'Actualizando...' : 'Refrescar'}
        </button>
      </div>

      <div className="p-6">
        {loading && logs.length === 0 ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="animate-spin text-[#FA4A0C]" size={32} />
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 p-6 rounded-xl flex items-center gap-3 text-rose-600">
            <AlertCircle size={24} />
            <p className="font-bold">{error}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 font-medium">
            No hay actividad reciente registrada por el sistema.
          </div>
        ) : (
          <div className="relative space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-zinc-200 before:to-transparent">
            {logs.map((log) => {
              const IconComponent = log.icon;
              return (
                <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white ${log.colorClass} shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10`}>
                    <IconComponent size={16} />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-zinc-50 border border-zinc-100 p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-zinc-900 text-sm">{log.title}</span>
                      <time className="text-xs font-medium text-zinc-400">
                        {format(new Date(log.created_at), "d MMM, h:mm a", { locale: es })}
                      </time>
                    </div>
                    <p className="text-sm text-zinc-600 leading-relaxed mb-2">{log.details}</p>
                    
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div className="bg-zinc-100 p-2 rounded-lg text-xs font-mono text-zinc-500 overflow-x-auto">
                        {JSON.stringify(log.metadata)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
