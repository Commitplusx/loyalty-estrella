import { create } from 'zustand';

export interface AppState {
  // Pedidos
  pedidos: any[];
  pedidosLoaded: boolean;
  setPedidos: (pedidos: any[]) => void;
  updatePedido: (pedido: any) => void;

  // Repartidores
  repartidores: any[];
  repartidoresLoaded: boolean;
  setRepartidores: (repartidores: any[]) => void;
  updateRepartidor: (repartidor: any) => void;

  // Activity Logs
  activityLogs: any[];
  addLog: (log: any) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Pedidos
  pedidos: [],
  pedidosLoaded: false,
  setPedidos: (pedidos) => set({ pedidos, pedidosLoaded: true }),
  updatePedido: (newRecord) => set((state) => {
    const exists = state.pedidos.find(p => p.id === newRecord.id);
    let newLogs = [...state.activityLogs];
    
    // Auto-generate logs if state changes
    if (exists && exists.estado !== newRecord.estado) {
      newLogs.unshift({
        id: Math.random().toString(),
        time: new Date(),
        pedido_id: newRecord.id.split('-')[0],
        message: `Pedido ${newRecord.id.split('-')[0]} cambió a ${newRecord.estado.replace('_', ' ')}`,
        type: newRecord.estado === 'entregado' ? 'success' : newRecord.estado === 'cancelado' ? 'error' : 'info'
      });
    }

    if (exists) {
      return { 
        pedidos: state.pedidos.map(p => p.id === newRecord.id ? { ...p, ...newRecord } : p),
        activityLogs: newLogs.slice(0, 50) // Keep last 50
      };
    }
    // Optimistic insert at top
    newLogs.unshift({
      id: Math.random().toString(),
      time: new Date(),
      pedido_id: newRecord.id.split('-')[0],
      message: `Nuevo pedido: ${newRecord.restaurante || 'Estrella'}`,
      type: 'info'
    });
    return { 
      pedidos: [newRecord, ...state.pedidos],
      activityLogs: newLogs.slice(0, 50)
    };
  }),

  // Repartidores
  repartidores: [],
  repartidoresLoaded: false,
  setRepartidores: (repartidores) => set({ repartidores, repartidoresLoaded: true }),
  updateRepartidor: (newRecord) => set((state) => {
    const exists = state.repartidores.find(r => r.id === newRecord.id);
    if (exists) {
      return { repartidores: state.repartidores.map(r => r.id === newRecord.id ? { ...r, ...newRecord } : r) };
    }
    return { repartidores: [...state.repartidores, newRecord] };
  }),

  // Activity Logs
  activityLogs: [],
  addLog: (log) => set((state) => ({ 
    activityLogs: [{ id: Math.random().toString(), time: new Date(), ...log }, ...state.activityLogs].slice(0, 50) 
  })),
}));
