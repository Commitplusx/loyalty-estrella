import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { DataTable } from '../components/ui/DataTable';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { CheckCircle2, XCircle, Search, AlertCircle, ShieldAlert, LayoutList, Columns, Activity, Clock, Package } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { DndContext, DragOverlay, closestCorners, useDroppable } from '@dnd-kit/core';
import { motion, AnimatePresence } from 'framer-motion';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { KanbanCard } from '../components/pedidos/KanbanCard';
import { FlotaSidebar } from '../components/pedidos/FlotaSidebar';
import { RadarMap } from '../components/pedidos/RadarMap';
import { handleDbError } from '../lib/errorHandler';
import { DisputaModal } from '../components/pedidos/DisputaModal';
import { toast } from 'sonner';

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const phi1 = lat1 * Math.PI/180;
  const phi2 = lat2 * Math.PI/180;
  const deltaPhi = (lat2-lat1) * Math.PI/180;
  const deltaLambda = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in metres
}

function DroppableColumn({ col, children, count, isFullWidth }: any) {
  const { isOver, setNodeRef } = useDroppable({
    id: col.id,
    data: { type: 'columna' },
  });

  return (
    <div 
      ref={setNodeRef}
      className={`flex flex-col rounded-xl transition-all duration-300 ease-out ${
        isFullWidth ? 'flex-1 w-full h-full' : 'shrink-0 w-[85vw] md:min-w-[320px] md:w-[320px]'
      } ${
        isOver ? 'bg-blue-50/50 shadow-[0_0_20px_rgba(59,130,246,0.1)] scale-[1.01] ring-2 ring-blue-500/20' : 'bg-[#F9FAFB]'
      } snap-center`}
    >
      <div className="px-3 pt-3 pb-2 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${col.dotColor}`} />
          <h3 className="font-semibold text-zinc-800 text-[13px]">{col.label}</h3>
        </div>
        <span className="bg-zinc-200/50 text-zinc-600 text-[10px] font-bold px-1.5 py-0.5 rounded">
          {count}
        </span>
      </div>
      <div className={`flex-1 px-3 pb-8 overflow-y-auto custom-scrollbar ${isFullWidth ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 content-start' : 'flex flex-col gap-2.5'}`}>
        {children}
      </div>
    </div>
  );
}

export function Pedidos() {
  const { pedidos, pedidosLoaded, updatePedido, activityLogs } = useAppStore();
  const [loading, setLoading] = useState(!pedidosLoaded);
  const [showActivity, setShowActivity] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'map'>('kanban');
  const [actionConfirm, setActionConfirm] = useState<{ id: string, action: string, repartidorId?: string } | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [disputaPedido, setDisputaPedido] = useState<any>(null);
  const [externoName, setExternoName] = useState('');
  const [externoPhone, setExternoPhone] = useState('');
  const lastActionRef = useRef<{ id: string, action: string, time: number } | null>(null);

  useEffect(() => {
    if (pedidosLoaded) setLoading(false);
  }, [pedidosLoaded]);

  const handleForceAction = async (id: string, action: string, repartidorId?: string) => {
    const now = Date.now();
    if (
      lastActionRef.current &&
      lastActionRef.current.id === id &&
      lastActionRef.current.action === action &&
      now - lastActionRef.current.time < 2000
    ) {
      return; // Prevenir doble disparo de dnd-kit o React Strict Mode
    }
    lastActionRef.current = { id, action, time: now };

    if (action === 'entregado' || action === 'cancelado' || action === 'externo') {
       setActionConfirm({ id, action, repartidorId });
       return;
    }

    // Validación Robusta: Regla de Negocio de la Base de Datos
    // No permitir buscar repartidor o asignar en camino si la cocina no ha aceptado.
    if (action === 'buscando_repartidor' || action === 'en_camino') {
      const currentPedido = pedidos.find(p => p.id === id);
      if (currentPedido && (!currentPedido.tiempo_preparacion_minutos || currentPedido.estado_cocina === 'pendiente' || !currentPedido.estado_cocina)) {
        toast.error('⚠️ Acción Bloqueada: El restaurante debe aceptar el pedido en cocina y definir el tiempo de preparación antes de asignar un repartidor.', { duration: 5000 });
        return;
      }
    }

    await executeForceAction(id, action, repartidorId);
  };

  const executeForceAction = async (id: string, action: string, repartidorId?: string, phone?: string, name?: string) => {
    try {
      const currentPedido = pedidos.find(p => p.id === id);
      if (currentPedido) {
        const isUnassigning = action === 'buscando_repartidor' || action === 'recibido' || action === 'preparando';
        updatePedido({ 
          ...currentPedido, 
          estado: action, 
          ...(repartidorId && { repartidor_id: repartidorId }),
          ...(isUnassigning && { repartidor_id: null })
        });
      }
      
      const payload: any = { estado: action };
      if (repartidorId) {
        payload.repartidor_id = repartidorId;
      } else if (action === 'buscando_repartidor' || action === 'recibido' || action === 'preparando' || action === 'externo') {
        payload.repartidor_id = null;
      }

      const { error } = await supabase
        .from('pedidos')
        .update(payload)
        .eq('id', id);

      if (error) throw error;
      
      // Invocaciones a Supabase Edge Functions para automatizar
      if (action === 'externo') {
        supabase.functions.invoke('asignar-externo', {
          body: {
            pedido_id: id,
            telefono: phone,
            nombre: name,
            restaurante: currentPedido?.restaurante || 'Estrella',
            descripcion: currentPedido?.descripcion || 'Pedido',
            base_url: window.location.origin
          }
        }).catch(err => console.error('Error invocando asignar-externo:', err));
        toast.success('Pedido externo. Notificando por WhatsApp...');
      } else if (action === 'buscando_repartidor') {
        // NOTA: Se eliminó la invocación manual a 'asignar-repartidor' aquí.
        // La Base de Datos (Webhook) detecta el UPDATE a 'buscando_repartidor' y lo dispara automáticamente.
        toast.success('Búsqueda automática de repartidor iniciada por el sistema');
      } else if (repartidorId && action === 'ofrecido') {
        // 1. PING REALTIME INSTANTÁNEO (Frontend a App Foreground)
        const currentPedido = pedidos.find(p => p.id === id);
        supabase.channel('repartidores_ping').send({
          type: 'broadcast',
          event: 'order_offered',
          payload: { 
            target_driver_id: repartidorId, 
            pedido_id: id,
            restaurante: currentPedido?.restaurante || 'Estrella',
            direccion: currentPedido?.direccion || '',
            total: currentPedido?.total || 0,
            es_asignacion_manual: true
          }
        }).catch(err => console.error('Error ping realtime:', err));

        // 2. PUSH NOTIFICATION BACKUP (Backend a App Background/Cerrada)
        supabase.functions.invoke('send-fcm', {
          body: { 
            type: 'manual_assign', 
            repartidor_id: repartidorId,
            pedido_id: id 
          }
        }).catch(err => console.error('Error invocando send-fcm:', err));
        toast.success('Oferta forzada exitosamente al repartidor');
      } else {
        toast.success('Estado de pedido actualizado');
      }
      
    } catch (e: any) {
      handleDbError(e, 'Error al ejecutar la acción');
    } finally {
      setActionConfirm(null);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const pedidoId = active.id as string;
    const overId = over.id as string;

    if (overId.startsWith('repartidor-')) {
      const repartidorId = overId.replace('repartidor-', '');
      handleForceAction(pedidoId, 'ofrecido', repartidorId);
    } else {
      const columnId = overId;
      const currentPedido = pedidos.find(p => p.id === pedidoId);
      
      // Validar regla de negocio: No puede estar "En Camino" sin un repartidor asignado
      if (columnId === 'en_camino' && !currentPedido?.repartidor_id) {
        toast.error('⚠️ Arrastra el pedido hacia el nombre de un Repartidor (en la barra lateral) para asignarlo y ponerlo en camino.');
        return;
      }

      // Validar regla de negocio: Si ya está con repartidores, no puede regresar a la cocina
      const estadosAvanzados = ['buscando_repartidor', 'ofrecido', 'asignado', 'preparando', 'en_camino', 'entregado'];
      const estadosCocina = ['pendiente', 'recibido', 'restaurante'];
      if (currentPedido && estadosAvanzados.includes(currentPedido.estado) && estadosCocina.includes(columnId)) {
        toast.error('🚫 Acción Bloqueada: No puedes regresar el pedido a la cocina porque ya está en la fase de logística.');
        return;
      }

      // Permitir re-disparar la búsqueda si lo vuelven a soltar en la misma columna de buscando_repartidor
      if (currentPedido && (currentPedido.estado !== columnId || columnId === 'buscando_repartidor')) {
        // No permitimos forzar 'restaurante' desde el drag-and-drop del Kanban porque el Admin no debería
        // cambiar entre pendiente y recibido. Eso lo hace el restaurante.
        if (columnId === 'restaurante') {
           toast.error('⚠️ Deja que el Restaurante acepte el pedido en su propia pantalla.');
           return;
        }
        handleForceAction(pedidoId, columnId);
      }
    }
  };


  const getStatusBadge = (row: any) => {
    const estado = row.estado;
    
    if (estado === 'entregado') {
      let isFraud = false;
      let distMeters = 0;
      if (row.lat && row.lng && row.lat_entrega && row.lng_entrega) {
         distMeters = calculateDistance(row.lat, row.lng, row.lat_entrega, row.lng_entrega);
         if (distMeters > 200) isFraud = true;
      }
      
      if (isFraud) {
        return (
          <div className="flex flex-col gap-1 w-max" title="El repartidor marcó entregado lejos del cliente">
            <span className="px-2 py-1 bg-rose-50 text-rose-600 border border-rose-200 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
              🚩 Fraude Detectado
            </span>
            <span className="text-[9px] font-bold text-rose-400 uppercase tracking-wider">
              A {(distMeters >= 1000 ? (distMeters/1000).toFixed(1) + 'km' : Math.round(distMeters) + 'm')} de dist.
            </span>
          </div>
        );
      }
      return <span className="px-2 py-1 bg-zinc-100 text-zinc-900 border border-zinc-200 rounded-md text-[10px] font-bold uppercase tracking-widest">Entregado</span>;
    }

    switch (estado) {
      case 'cancelado':
        return <span className="px-2 py-1 bg-white text-zinc-500 border border-zinc-200 rounded-md text-[10px] font-bold uppercase tracking-widest line-through">Cancelado</span>;
      case 'externo':
        return <span className="px-2 py-1 bg-orange-50 text-orange-600 border border-orange-200 rounded-md text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 w-max"><Package size={10}/>Externo</span>;
      case 'buscando_repartidor':
        return <span className="px-2 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-md text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 w-max"><AlertCircle size={10}/>Buscando Repartidor</span>;
      default:
        return <span className="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-md text-[10px] font-bold uppercase tracking-widest">{estado.replace('_', ' ')}</span>;
    }
  };

  const filteredPedidos = pedidos.filter(p => {
    if (p.estado === 'pendiente_pago') return false;
    
    const searchMatch = ((p.cliente_nombre?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (p.restaurante?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (p.id?.toLowerCase() || '').includes(searchTerm.toLowerCase()));

    let statusMatch = true;
    if (filterStatus === 'en_cocina') statusMatch = ['pendiente', 'recibido', 'en_cocina', 'listo_para_recoger'].includes(p.estado);
    if (filterStatus === 'asignando') statusMatch = ['buscando_repartidor', 'ofrecido'].includes(p.estado);
    if (filterStatus === 'en_ruta') statusMatch = ['asignado', 'preparando', 'en_camino'].includes(p.estado);
    if (filterStatus === 'entregados') statusMatch = p.estado === 'entregado';
    if (filterStatus === 'cancelados') statusMatch = p.estado === 'cancelado';
    if (filterStatus === 'externos') statusMatch = p.estado === 'externo';

    return searchMatch && statusMatch;
  });

  /*
  const todayStr = new Date().toDateString();
  const hoyPedidos = pedidos.filter(p => new Date(p.created_at).toDateString() === todayStr);
  const totalHoy = hoyPedidos.length;
  const activos = pedidos.filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado' && p.estado !== 'pendiente_pago');
  const completados = hoyPedidos.filter(p => p.estado === 'entregado').length;
  
  const nowTime = Date.now();
  const retrasados = activos.filter(p => (nowTime - new Date(p.created_at).getTime()) > 30 * 60 * 1000).length;
  */
  const columns = [
    {
      header: 'ID / Fecha',
      accessor: (row: any) => (
        <div>
          <p className="font-mono text-xs font-bold text-zinc-400">{row.id.split('-')[0]}</p>
          <p className="text-xs font-medium text-zinc-900 mt-0.5">{new Date(row.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
        </div>
      )
    },
    {
      header: 'Restaurante / Cliente',
      accessor: (row: any) => (
        <div>
          <p className="font-bold text-zinc-900 tracking-tight">{row.restaurante}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{row.cliente_nombre} • {row.cliente_telefono}</p>
        </div>
      )
    },
    {
      header: 'Estado',
      accessor: (row: any) => getStatusBadge(row)
    },
    {
      header: 'Total',
      accessor: (row: any) => (
        <div>
          <p className="font-black text-zinc-900 tracking-tight">${row.total}</p>
          <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mt-0.5">{row.metodo_pago}</p>
        </div>
      )
    },
    {
      header: 'PIN Recolección',
      accessor: (row: any) => (
        <div className="flex flex-col gap-1" title="Verificación: Restaurante ↔ Repartidor">
          <span className="font-mono font-bold text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded-md border border-zinc-200 text-xs w-max">
            {row.pickup_pin || '---'}
          </span>
          {row.pickup_pin && <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold">Rest. ↔ Repart.</span>}
        </div>
      )
    },
    {
      header: 'God Mode',
      accessor: (row: any) => (
        <div className="flex gap-2">
          {row.estado !== 'entregado' && row.estado !== 'cancelado' && (
            <>
              <button 
                onClick={() => handleForceAction(row.id, 'entregado')}
                className="p-1.5 bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-900 rounded-md transition-colors shadow-sm"
                title="Forzar Entrega"
              >
                <CheckCircle2 size={16} />
              </button>
              <button 
                onClick={() => handleForceAction(row.id, 'cancelado')}
                className="p-1.5 bg-white hover:bg-rose-50 border border-zinc-200 hover:border-rose-200 text-rose-500 rounded-md transition-colors shadow-sm"
                title="Forzar Cancelación"
              >
                <XCircle size={16} />
              </button>
              <button 
                onClick={() => handleForceAction(row.id, 'externo')}
                className="p-1.5 bg-white hover:bg-orange-50 border border-zinc-200 hover:border-orange-200 text-orange-500 rounded-md transition-colors shadow-sm"
                title="Mandar Externo"
              >
                <Package size={16} />
              </button>
            </>
          )}
          {(row.estado === 'entregado' || row.estado === 'cancelado') && (
            <button 
              onClick={() => setDisputaPedido(row)}
              className="p-1.5 bg-white hover:bg-rose-50 border border-zinc-200 hover:border-rose-200 text-rose-500 rounded-md transition-colors shadow-sm"
              title="Iniciar Disputa / Reembolso"
            >
              <ShieldAlert size={16} />
            </button>
          )}
        </div>
      )
    }
  ];

  const KANBAN_COLUMNS = [
    { id: 'en_camino', label: 'En Curso (Logística)', dotColor: 'bg-emerald-400' },
    { id: 'buscando_repartidor', label: 'Asignando Repartidor', dotColor: 'bg-amber-400' },
    { id: 'restaurante', label: 'En Restaurante', dotColor: 'bg-slate-400' }
  ];

  return (
    <div className="space-y-4 flex flex-col h-[calc(100vh-5rem)] min-h-[650px]">

      {/* Header y Buscador */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0 bg-white p-4 rounded-xl shadow-sm border border-zinc-200">
        <div className="shrink-0 flex-1">
          <h2 className="text-xl font-black text-zinc-900 tracking-tight flex items-center gap-2 whitespace-nowrap">
            <ShieldAlert size={22} className="text-zinc-900" />
            Torre de Control
          </h2>
          <p className="text-zinc-500 text-sm mt-0.5 tracking-tight hidden sm:block">Despacho Kanban y monitoreo en tiempo real.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto shrink-0">
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={16} className="text-zinc-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar pedido..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-2 pl-9 pr-4 text-sm text-zinc-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-zinc-900 transition-all"
            />
          </div>
          
          <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200 shrink-0 w-full sm:w-auto">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${viewMode === 'kanban' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
            >
              <Columns size={16} /> Kanban
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${viewMode === 'list' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
            >
              <LayoutList size={16} /> Tabla
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${viewMode === 'map' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
            >
              <Activity size={16} /> Mapa
            </button>
            <div className="w-px bg-zinc-200 mx-1"></div>
            <button
              onClick={() => setShowActivity(!showActivity)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${showActivity ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
            >
              <Clock size={16} /> Actividad
            </button>
          </div>
        </div>
      </div>

      {/* Píldoras de Filtro (Pills) */}
      <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar shrink-0 px-1">
        {[
          { id: 'todos', label: 'Todos', count: pedidos.filter(p => p.estado !== 'pendiente_pago').length },
          { id: 'en_cocina', label: 'Restaurante / Cocina', count: pedidos.filter(p => ['pendiente', 'recibido', 'en_cocina', 'listo_para_recoger'].includes(p.estado)).length },
          { id: 'asignando', label: 'Asignando', count: pedidos.filter(p => ['buscando_repartidor', 'ofrecido'].includes(p.estado)).length },
          { id: 'en_ruta', label: 'En Ruta', count: pedidos.filter(p => ['asignado', 'preparando', 'en_camino'].includes(p.estado)).length },
          { id: 'entregados', label: 'Entregados', count: pedidos.filter(p => p.estado === 'entregado').length },
          { id: 'cancelados', label: 'Cancelados', count: pedidos.filter(p => p.estado === 'cancelado').length },
          { id: 'externos', label: 'Externos', count: pedidos.filter(p => p.estado === 'externo').length }
        ].map(f => (
          <button
            key={f.id}
            onClick={() => {
              setFilterStatus(f.id);
              if (f.id === 'entregados' || f.id === 'cancelados' || f.id === 'externos') {
                setViewMode('list'); // Forzar vista de tabla porque Kanban no muestra estos estados
              }
            }}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all whitespace-nowrap border flex items-center gap-1.5 ${
              filterStatus === f.id 
                ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm' 
                : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:text-zinc-900 hover:bg-zinc-50'
            }`}
          >
            {f.label}
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${filterStatus === f.id ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-100 text-zinc-400'}`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Contenido Principal */}
      <div className="flex-1 min-h-[400px] relative pb-2">
        {viewMode === 'map' ? (
          <div className="h-full bg-zinc-100 rounded-xl overflow-hidden border border-zinc-200">
            <RadarMap pedidos={filteredPedidos} repartidores={useAppStore.getState().repartidores} />
          </div>
        ) : viewMode === 'list' ? (
          <div className="h-full overflow-y-auto custom-scrollbar pr-2">
            <DataTable 
              columns={columns} 
              data={filteredPedidos} 
              isLoading={loading} 
              keyExtractor={(row) => row.id} 
            />
          </div>
        ) : (
          <DndContext
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="h-full flex">
              <div className="flex-1 flex gap-4 md:gap-6 overflow-x-auto pb-4 custom-scrollbar snap-x snap-mandatory px-4 md:px-0">
                {KANBAN_COLUMNS.filter(col => {
                  if (filterStatus === 'todos') return true;
                  if (filterStatus === 'en_cocina' && col.id === 'restaurante') return true;
                  if (filterStatus === 'asignando' && col.id === 'buscando_repartidor') return true;
                  if (filterStatus === 'en_ruta' && col.id === 'en_camino') return true;
                  return false;
                }).map(col => {
                  let items = filteredPedidos.filter(p => {
                    if (col.id === 'restaurante') return p.estado === 'pendiente' || p.estado === 'recibido' || p.estado === 'en_cocina' || p.estado === 'listo_para_recoger';
                    if (col.id === 'buscando_repartidor') return p.estado === 'buscando_repartidor' || p.estado === 'ofrecido';
                    if (col.id === 'en_camino') return p.estado === 'en_camino' || p.estado === 'asignado' || p.estado === 'preparando';
                    return false;
                  });
                  
                  // Ordenar para que los pedidos más "avanzados" o "en curso" salgan primero arriba
                  items.sort((a, b) => {
                    const getRank = (estado: string) => {
                      // Ranks de En Camino
                      if (estado === 'en_camino') return 100;
                      if (estado === 'preparando') return 90;
                      if (estado === 'asignado') return 80;
                      // Ranks de Buscando Repartidor
                      if (estado === 'ofrecido') return 70;
                      if (estado === 'buscando_repartidor') return 60;
                      // Ranks de Restaurante
                      if (estado === 'listo_para_recoger') return 50;
                      if (estado === 'en_cocina') return 40;
                      if (estado === 'recibido') return 30;
                      if (estado === 'pendiente') return 20;
                      return 0;
                    };
                    return getRank(b.estado) - getRank(a.estado);
                  });

                  return (
                    <DroppableColumn key={col.id} col={col} count={items.length} isFullWidth={filterStatus !== 'todos'}>
                      <AnimatePresence>
                        {items.map(pedido => (
                          <KanbanCard key={pedido.id} pedido={pedido} onForceAction={handleForceAction} />
                        ))}
                      </AnimatePresence>
                      {items.length === 0 && (
                        <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-zinc-200/50 rounded-xl bg-zinc-50/50">
                          <Package size={24} className="text-zinc-300 mb-2 opacity-50" />
                          <p className="text-xs font-bold text-zinc-400 text-center">Todo limpio por aquí</p>
                        </div>
                      )}
                    </DroppableColumn>
                  );
                })}
              </div>
              <div className="hidden xl:flex gap-4">
                <FlotaSidebar />
                
                {/* Live Activity Logs Sidebar */}
                {showActivity && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex flex-col w-[300px] lg:w-[350px] bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden shrink-0"
                  >
                    <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-zinc-500" />
                        <h3 className="font-bold text-zinc-900 text-sm">Live Activity</h3>
                      </div>
                      <button onClick={() => setShowActivity(false)} className="text-zinc-400 hover:text-zinc-700">
                        <XCircle size={16} />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-3">
                      <AnimatePresence>
                        {activityLogs.length === 0 && (
                          <p className="text-xs text-center text-zinc-400 mt-10">Sin actividad reciente</p>
                        )}
                        {activityLogs.map((log) => (
                          <motion.div 
                            key={log.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`p-3 rounded-lg border text-xs ${
                              log.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-900' :
                              log.type === 'error' ? 'bg-rose-50 border-rose-100 text-rose-900' :
                              'bg-blue-50 border-blue-100 text-blue-900'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-bold">#{log.pedido_id}</span>
                              <span className="text-[9px] opacity-70 font-mono">{new Date(log.time).toLocaleTimeString()}</span>
                            </div>
                            <p className="font-medium opacity-90">{log.message}</p>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            <DragOverlay>
              {activeDragId ? (
                <div className="opacity-95 scale-105 shadow-2xl rotate-2">
                  <KanbanCard pedido={pedidos.find(p => p.id === activeDragId)} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <ConfirmSheet
        isOpen={!!actionConfirm}
        onClose={() => { setActionConfirm(null); setExternoName(''); setExternoPhone(''); }}
        onConfirm={() => {
          if (actionConfirm) {
            if (actionConfirm.action === 'externo' && externoPhone.length < 10) {
              toast.error('El teléfono debe tener 10 dígitos');
              return;
            }
            executeForceAction(actionConfirm.id, actionConfirm.action, actionConfirm.repartidorId, externoPhone, externoName);
          }
        }}
        title={actionConfirm?.action === 'externo' ? "Asignar a Externo" : "¿Forzar Estado?"}
        description={actionConfirm?.action === 'externo' 
          ? `Al confirmar, el pedido se marcará como externo y se enviará un WhatsApp al repartidor con el link de seguimiento.`
          : `¿Estás seguro de que deseas forzar el estado a ${actionConfirm?.action?.toUpperCase()}? Esta es una acción de "God Mode" y afectará al usuario y al repartidor inmediatamente.`
        }
        confirmText={actionConfirm?.action === 'externo' ? "Enviar WhatsApp" : "Sí, Forzar Estado"}
        isDestructive={actionConfirm?.action !== 'externo'}
      >
        {actionConfirm?.action === 'externo' && (
          <div className="flex flex-col gap-3 mt-4 text-left">
            <div>
              <label className="text-xs font-bold text-zinc-700">Teléfono (10 dígitos) *</label>
              <input type="number" value={externoPhone} onChange={e => setExternoPhone(e.target.value)} placeholder="Ej. 9631234567" className="w-full mt-1 bg-zinc-50 border border-zinc-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-700">Nombre del Repartidor (Opcional)</label>
              <input type="text" value={externoName} onChange={e => setExternoName(e.target.value)} placeholder="Ej. Juan de Moto Express" className="w-full mt-1 bg-zinc-50 border border-zinc-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        )}
      </ConfirmSheet>

      <DisputaModal
        isOpen={!!disputaPedido}
        onClose={() => setDisputaPedido(null)}
        pedido={disputaPedido}
        onSuccess={() => setDisputaPedido(null)}
      />
    </div>
  );
}
