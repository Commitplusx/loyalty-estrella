import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  phone: string;
}

interface AppState {
  user: User | null;
  setUser: (user: User | null) => void;
  
  // Pedido State
  pedidoActivo: any | null;
  setPedidoActivo: (pedido: any | null) => void;

  // Global Location
  currentAddress: string;
  setCurrentAddress: (address: string) => void;
  currentLocation: { lat: number; lng: number } | null;
  setCurrentLocation: (location: { lat: number; lng: number } | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),

      pedidoActivo: null,
      setPedidoActivo: (pedidoActivo) => set({ pedidoActivo }),

      currentAddress: 'Buscando tu ubicación...',
      setCurrentAddress: (currentAddress) => set({ currentAddress }),
      currentLocation: null,
      setCurrentLocation: (currentLocation) => set({ currentLocation }),
    }),
    {
      name: 'estrella-envios-auth',
      partialize: (state) => ({ user: state.user }), // Solo guardar el usuario en localStorage
    }
  )
);
