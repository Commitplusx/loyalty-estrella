import { Bike } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { useAppStore } from '../../store/useAppStore';

function DroppableRepartidor({ repartidor, workload }: { repartidor: any, workload: number }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `repartidor-${repartidor.user_id}`,
    data: { type: 'repartidor', repartidorId: repartidor.user_id },
  });

  const isOverloaded = workload > 3;
  const hasWork = workload > 0;

  return (
    <div
      ref={setNodeRef}
      className={`p-2.5 rounded-lg border transition-all flex items-center gap-3 ${
        isOver 
          ? 'border-blue-500 bg-blue-50/50 scale-[1.02] ring-2 ring-blue-500/20' 
          : 'border-zinc-200/60 bg-white hover:border-zinc-300 hover:shadow-sm'
      }`}
    >
      <div className="relative shrink-0">
        {repartidor.foto_url ? (
          <img src={repartidor.foto_url} alt={repartidor.nombre} className="w-8 h-8 rounded-full object-cover bg-zinc-50" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center border border-zinc-200/60">
            <Bike size={14} className="text-zinc-400" />
          </div>
        )}
        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 border-white rounded-full ${isOverloaded ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
      </div>
      <div className="min-w-0 flex-1 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-zinc-800 leading-tight truncate">{repartidor.nombre}</p>
          <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">En Línea</p>
        </div>
        {hasWork && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
            isOverloaded ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 text-zinc-600'
          }`}>
            {workload} <span className="opacity-70">📦</span>
          </span>
        )}
      </div>
    </div>
  );
}

export function FlotaSidebar() {
  const { repartidores, pedidos } = useAppStore();
  const activos = repartidores.filter(r => r.activo && r.lat !== null);

  return (
    <div className="w-64 shrink-0 bg-white border-l border-zinc-200 h-full flex flex-col">
      <div className="p-4 border-b border-zinc-200 flex justify-between items-center bg-zinc-50/50 shrink-0">
        <h3 className="font-bold text-zinc-900 text-sm">Despacho Manual</h3>
        <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-full shrink-0">
          {activos.length} Activos
        </span>
      </div>
      <div className="p-4 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3">
        <p className="text-xs text-zinc-500 font-medium mb-2 leading-relaxed shrink-0">
          Arrastra un pedido aquí para forzar su asignación.
        </p>
        {activos.map(r => {
          const w = pedidos.filter(p => p.repartidor_id === r.user_id && !['entregado', 'cancelado', 'ofrecido', 'pendiente_pago'].includes(p.estado)).length;
          return <DroppableRepartidor key={r.id} repartidor={r} workload={w} />;
        })}
        {activos.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
            <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mb-3">
              <span className="text-xl">🛵</span>
            </div>
            <p className="text-sm font-bold text-zinc-900">Sin repartidores</p>
            <p className="text-xs text-zinc-500 mt-1">No hay nadie en línea para despachar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
