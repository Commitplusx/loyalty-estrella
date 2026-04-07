import { useState, useCallback } from 'react';
import type { Cliente } from '@/types';
import { 
  getClienteById, 
  acumularPuntoRPC,
  canjearEnvioGratisRPC,
  subscribeToCliente 
} from '@/lib/supabase';

const ENVIOS_PARA_GRATIS = 5;

interface UsePuntosReturn {
  cliente: Cliente | null;
  isLoading: boolean;
  error: string | null;
  progreso: number;
  enviosRestantes: number;
  tieneEnvioGratis: boolean;
  cargarCliente: (clienteId: string) => Promise<void>;
  acumularPunto: (adminId: string) => Promise<{ success: boolean; message: string }>;
  canjearEnvioGratis: (adminId: string) => Promise<{ success: boolean; message: string }>;
  suscribirseACambios: (clienteId: string, callback: (cliente: Cliente) => void) => (() => void);
}

export function usePuntos(): UsePuntosReturn {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarCliente = useCallback(async (clienteId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await getClienteById(clienteId);
      if (data) {
        setCliente(data);
      } else {
        setError('Cliente no encontrado');
      }
    } catch (_err) {
      setError('Error al cargar el cliente');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const acumularPunto = useCallback(async (adminId: string): Promise<{ success: boolean; message: string }> => {
    if (!cliente) {
      return { success: false, message: 'No hay cliente seleccionado' };
    }

    setIsLoading(true);
    
    try {
      const result = await acumularPuntoRPC(cliente.id, adminId);
      
      if (!result.success) {
        return { success: false, message: result.message };
      }

      // El servidor actualizó el cliente. Recargamos la información.
      await cargarCliente(cliente.id);

      return { success: true, message: result.message };
    } catch (_err) {
      return { success: false, message: 'Error al acumular punto' };
    } finally {
      setIsLoading(false);
    }
  }, [cliente, cargarCliente]);

  const canjearEnvioGratis = useCallback(async (adminId: string): Promise<{ success: boolean; message: string }> => {
    if (!cliente) {
      return { success: false, message: 'No hay cliente seleccionado' };
    }

    if (cliente.envios_gratis_disponibles <= 0) {
      return { success: false, message: 'No tienes envíos gratis disponibles' };
    }

    setIsLoading(true);
    
    try {
      const result = await canjearEnvioGratisRPC(cliente.id, adminId);

      if (!result.success) {
        return { success: false, message: result.message };
      }

      // El servidor actualizó el cliente. Recargamos la información.
      await cargarCliente(cliente.id);

      return { success: true, message: result.message };
    } catch (_err) {
      return { success: false, message: 'Error al canjear el envío gratis' };
    } finally {
      setIsLoading(false);
    }
  }, [cliente, cargarCliente]);

  const suscribirseACambios = useCallback((clienteId: string, callback: (cliente: Cliente) => void) => {
    const unsubscribe = subscribeToCliente(clienteId, (updatedCliente) => {
      setCliente(updatedCliente);
      callback(updatedCliente);
    });

    return unsubscribe;
  }, []);

  const progreso = cliente ? (cliente.puntos / ENVIOS_PARA_GRATIS) * 100 : 0;
  const enviosRestantes = cliente ? ENVIOS_PARA_GRATIS - cliente.puntos : ENVIOS_PARA_GRATIS;
  const tieneEnvioGratis = cliente ? cliente.envios_gratis_disponibles > 0 : false;

  return {
    cliente,
    isLoading,
    error,
    progreso,
    enviosRestantes,
    tieneEnvioGratis,
    cargarCliente,
    acumularPunto,
    canjearEnvioGratis,
    suscribirseACambios,
  };
}
