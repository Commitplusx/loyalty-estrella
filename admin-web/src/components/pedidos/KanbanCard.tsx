import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { AlertCircle, Bike, ChefHat, Store, MoreVertical, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '../../store/useAppStore';
import { motion } from 'framer-motion';

export function KanbanCard({ pedido, onForceAction }: { pedido: any, onForceAction?: (id: string, action: string) => void }) {
  const [showOptions, setShowOptions] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { repartidores } = useAppStore();
  const prevEstado = useRef(pedido.estado);
  const prevDriverId = useRef(pedido.repartidor_id);
  
  // Use effectively dummy interval to force re-renders if we want to show dynamic time ago, but for now we'll just omit ticker
  useEffect(() => {
    const interval = setInterval(() => {}, 30000); 
    return () => clearInterval(interval);
  }, []);
  
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: pedido.id,
    data: { type: 'pedido', pedido },
  });

  const now = Date.now();
  const createdTime = new Date(pedido.created_at).getTime();
  const diffMinutes = (now - createdTime) / (1000 * 60);
  const isCritical = diffMinutes > 30 && (pedido.estado !== 'entregado' && pedido.estado !== 'cancelado');

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  const assignedDriver = pedido.repartidor_id 
    ? repartidores.find(r => r.user_id === pedido.repartidor_id) 
    : null;

  useEffect(() => {
    if (
      (prevEstado.current === 'buscando_repartidor' || prevEstado.current === 'ofrecido') &&
      (pedido.estado === 'preparando' || pedido.estado === 'en_camino') &&
      pedido.repartidor_id &&
      pedido.repartidor_id !== prevDriverId.current
    ) {
      toast.success(`¡${assignedDriver?.nombre || 'Un repartidor'} aceptó el viaje!`, {
        icon: '🛵',
        style: { background: '#22c55e', color: 'white', border: 'none', fontWeight: 'bold' },
        duration: 5000,
      });
    }
    prevEstado.current = pedido.estado;
    prevDriverId.current = pedido.repartidor_id;
  }, [pedido.estado, pedido.repartidor_id, assignedDriver]);

  let rechazados = [];
  if (Array.isArray(pedido.ofertas_rechazadas)) {
    rechazados = pedido.ofertas_rechazadas.map((id: string) => {
      const r = repartidores.find(rep => rep.user_id === id);
      return r ? r.nombre : 'Desconocido';
    });
  }

  return (
    <motion.div
      layout
      layoutId={pedido.id}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onPointerDown={(e) => {
        // Ejecuta la logica del drag original
        if (listeners && listeners.onPointerDown) {
          listeners.onPointerDown(e);
        }
      }}
      onClick={() => setIsExpanded(!isExpanded)}
      className={`bg-white p-3 rounded-xl border ${
        isDragging 
          ? 'border-blue-500 shadow-xl shadow-blue-500/20 scale-105 rotate-2 ring-2 ring-blue-500/50 opacity-95 z-50' 
          : isCritical 
            ? 'border-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.3)] ring-1 ring-rose-400/50 bg-rose-50/30' 
            : 'border-zinc-200/60 hover:border-zinc-300 hover:shadow-sm'
      } cursor-grab active:cursor-grabbing relative flex flex-col gap-2 transition-all duration-200`}
    >
      {isCritical && (
        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center animate-bounce shadow-sm">
          <AlertCircle size={10} className="text-white" />
        </div>
      )}
      
      {/* Top Header: ID & Options */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-semibold text-zinc-400 bg-zinc-50 px-1.5 py-0.5 rounded">#{pedido.id.split('-')[0]}</span>
          <span className="text-[10px] font-medium text-zinc-400">
            {new Date(pedido.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
            pedido.estado === 'buscando_repartidor' ? 'bg-amber-100 text-amber-700' :
            pedido.estado === 'ofrecido' ? 'bg-blue-100 text-blue-700' :
            pedido.estado === 'preparando' ? 'bg-purple-100 text-purple-700' :
            pedido.estado === 'en_camino' ? 'bg-emerald-100 text-emerald-700' :
            'bg-zinc-100 text-zinc-600'
          }`}>
            {pedido.estado.replace('_', ' ')}
          </span>
          {onForceAction && (
            <div className="relative">
              <div className="flex items-center">
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1 rounded-md hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowOptions(!showOptions); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1 rounded-md hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <MoreVertical size={14} />
                </button>
              </div>
              {showOptions && (
                <div 
                  className="absolute right-0 top-full mt-1 w-40 bg-white border border-zinc-200 rounded-lg shadow-xl z-50 py-1 overflow-hidden"
                  onPointerLeave={() => setShowOptions(false)}
                >
                  <button 
                    onClick={(e) => { e.stopPropagation(); onForceAction(pedido.id, 'entregado'); setShowOptions(false); }}
                    className="w-full text-left px-3 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-50 flex items-center gap-2"
                  >
                    <CheckCircle2 size={14} /> Forzar Entrega
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onForceAction(pedido.id, 'cancelado'); setShowOptions(false); }}
                    className="w-full text-left px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                  >
                    <XCircle size={14} /> Forzar Cancelación
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div>
        <p className="text-[13px] font-black text-zinc-900 leading-tight truncate">{pedido.restaurante}</p>
        {isExpanded && (
          <motion.p 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }} 
            className="text-[11px] font-medium text-zinc-500 truncate mt-0.5"
          >
            {pedido.cliente_nombre}
          </motion.p>
        )}
      </div>

      {/* Driver & Status Tags (Inline) */}
      <div className="flex flex-wrap items-center gap-1.5 mt-1">
        {pedido.estado === 'pendiente' && (
          <div className="flex items-center gap-1 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-200/60">
            <Store size={10} className="text-zinc-500" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Restaurante</span>
          </div>
        )}
        {(pedido.estado === 'recibido' || pedido.estado_cocina === 'en_cocina') && pedido.estado !== 'buscando_repartidor' && pedido.estado !== 'ofrecido' && (
          <div className="flex items-center gap-1 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200/60">
            <ChefHat size={10} className="text-orange-500" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-orange-600">En Cocina</span>
          </div>
        )}
        
        {/* Compact Driver Pill */}
        {assignedDriver ? (
          <div className={`flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full border ${pedido.estado === 'ofrecido' ? 'bg-blue-50 border-blue-200/60' : 'bg-emerald-50 border-emerald-200/60'}`}>
            {assignedDriver.foto_url ? (
              <img src={assignedDriver.foto_url} alt={assignedDriver.nombre} className="w-4 h-4 rounded-full object-cover" />
            ) : (
              <div className={`w-4 h-4 rounded-full flex items-center justify-center ${pedido.estado === 'ofrecido' ? 'bg-blue-200' : 'bg-emerald-200'}`}>
                <Bike size={8} className={pedido.estado === 'ofrecido' ? 'text-blue-700' : 'text-emerald-700'} />
              </div>
            )}
            <span className={`text-[9px] font-bold truncate max-w-[80px] ${pedido.estado === 'ofrecido' ? 'text-blue-700' : 'text-emerald-700'}`}>
              {assignedDriver.nombre.split(' ')[0]}
            </span>
          </div>
        ) : (pedido.estado === 'preparando' || pedido.estado === 'buscando_repartidor') ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border bg-amber-50 border-amber-200/60 animate-pulse">
            <svg className="animate-spin h-2.5 w-2.5 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-[8px] font-bold text-amber-600 uppercase tracking-widest">Asignando Moto...</span>
          </div>
        ) : null}
      </div>

      {/* Control de Rechazos */}
      {isExpanded && rechazados.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }} 
          animate={{ opacity: 1, height: 'auto' }} 
          className="mt-2 bg-rose-50/50 border border-rose-100 rounded-lg p-2"
        >
          <span className="text-[9px] font-bold text-rose-600 uppercase tracking-wider block mb-1">
            Rechazado por ({rechazados.length}):
          </span>
          <p className="text-[10px] text-rose-500 font-medium leading-tight">
            {rechazados.join(', ')}
          </p>
        </motion.div>
      )}

      {/* PIN y Total */}
      {isExpanded && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }} 
          animate={{ opacity: 1, height: 'auto' }} 
          className="mt-1 pt-2 border-t border-zinc-100/80 flex justify-between items-center"
        >
          <span className="font-bold text-zinc-900 text-sm">${pedido.total}</span>
          {pedido.pickup_pin && (
            <div className="flex items-center gap-1 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-200/50" title="PIN de Recolección">
              <span className="text-[8px] text-zinc-400 font-bold uppercase tracking-wider">PIN</span>
              <span className="font-mono font-bold text-zinc-600 text-[10px]">{pedido.pickup_pin}</span>
            </div>
          )}
        </motion.div>
      )}

      {/* Animaciones de Búsqueda Compactas */}
      {(pedido.estado === 'buscando_repartidor' || pedido.estado === 'ofrecido') && (
        <div className="absolute bottom-3 right-3 flex items-center justify-center">
          <svg className={`animate-spin h-3.5 w-3.5 ${pedido.estado === 'ofrecido' ? 'text-blue-500' : 'text-amber-500'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      )}
      

    </motion.div>
  );
}
