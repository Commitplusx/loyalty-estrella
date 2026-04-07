import { createClient } from '@supabase/supabase-js';
import type { Cliente, RegistroPunto, AdminUser, AppConfig } from '@/types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Debugging for Vercel
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Estrella Delivery] CRITICAL: Supabase environment variables are missing!');
  console.log('VITE_SUPABASE_URL defined:', !!supabaseUrl);
  console.log('VITE_SUPABASE_ANON_KEY defined:', !!supabaseAnonKey);
}

export const supabase = createClient(supabaseUrl || 'https://placeholder-to-avoid-crash.supabase.co', supabaseAnonKey || 'placeholder');

// ==================== CLIENTES ====================

export async function getClienteByTelefono(telefono: string): Promise<Cliente | { found: false } | null> {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('telefono', telefono)
    .maybeSingle();          // returns null data (no error) when row doesn't exist

  if (error) return null;   // real DB / network error
  if (!data) return { found: false };  // number not registered
  return data as Cliente;
}

export async function getOrCreateClienteByTelefono(telefono: string): Promise<Cliente | null> {
  const { data, error } = await supabase.rpc('get_or_create_cliente', { p_telefono: telefono });
  
  if (error) {
    console.error('Error fetching or creating cliente:', error);
    return null;
  }
  return data as Cliente;
}

export async function getClienteByQR(qrCode: string): Promise<Cliente | null> {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('qr_code', qrCode)
    .single();
  
  if (error) return null;
  return data;
}

export async function getClienteById(id: string): Promise<Cliente | null> {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) return null;
  return data;
}

export async function createCliente(
  nombre: string, 
  telefono: string, 
  qrCode: string
): Promise<Cliente | null> {
  const { data, error } = await supabase
    .from('clientes')
    .insert([{
      nombre,
      telefono,
      qr_code: qrCode,
      puntos: 0,
      envios_gratis_disponibles: 0,
      envios_totales: 0,
    }])
    .select()
    .single();
  
  if (error) {
    console.error('Error creating cliente:', error);
    return null;
  }
  return data;
}

export async function updateClientePuntos(
  clienteId: string, 
  nuevosPuntos: number,
  enviosGratis: number,
  enviosTotales: number
): Promise<boolean> {
  const { error } = await supabase
    .from('clientes')
    .update({
      puntos: nuevosPuntos,
      envios_gratis_disponibles: enviosGratis,
      envios_totales: enviosTotales,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clienteId);
  
  if (error) {
    console.error('Error updating cliente:', error);
    return false;
  }
  return true;
}

export async function getAllClientes(): Promise<Cliente[]> {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching clientes:', error);
    return [];
  }
  return data || [];
}

// ==================== REGISTROS DE PUNTOS ====================

export async function createRegistroPunto(
  clienteId: string,
  tipo: 'acumulacion' | 'canje',
  puntos: number,
  descripcion: string,
  adminId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('registros_puntos')
    .insert([{
      cliente_id: clienteId,
      tipo,
      puntos,
      descripcion,
      created_by: adminId,
    }]);
  
  if (error) {
    console.error('Error creating registro:', error);
    return false;
  }
  return true;
}

export async function getRegistrosByCliente(clienteId: string): Promise<RegistroPunto[]> {
  const { data, error } = await supabase
    .from('registros_puntos')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching registros:', error);
    return [];
  }
  return data || [];
}

export async function submitRating(registroPuntoId: string, puntuacion: number, comentario?: string) {
  const payload: Record<string, unknown> = {
    registro_punto_id: registroPuntoId,
    puntuacion,
  };
  // Only include comentario if it has actual content
  if (comentario && comentario.trim().length > 0) {
    payload.comentario = comentario.trim();
  }

  const { error } = await supabase
    .from('calificaciones_servicio')
    .insert(payload);

  if (error) {
    console.error('Error submitting rating:', error);
    return false;
  }
  return true;
}


// ==================== PROCEDIMIENTOS ALMACENADOS (RPC) ====================

export async function acumularPuntoRPC(
  clienteId: string,
  adminId: string
): Promise<{ success: boolean; message: string; puntos?: number; envios_gratis?: number }> {
  try {
    const { data, error } = await supabase.rpc('acumular_punto', {
      p_cliente_id: clienteId,
      p_admin_id: adminId
    });

    if (error) {
      console.error('RPC Error:', error);
      return { success: false, message: 'Error de servidor al acumular punto' };
    }

    return data;
  } catch (err) {
    console.error('Error in acumularPuntoRPC:', err);
    return { success: false, message: 'Error al conectar con la base de datos' };
  }
}

export async function canjearEnvioGratisRPC(
  clienteId: string,
  adminId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc('canjear_envio_gratis', {
      p_cliente_id: clienteId,
      p_admin_id: adminId
    });

    if (error) {
      console.error('RPC Error:', error);
      return { success: false, message: 'Error de servidor al canjear envío gratis' };
    }

    return data;
  } catch (err) {
    console.error('Error in canjearEnvioGratisRPC:', err);
    return { success: false, message: 'Error al conectar con la base de datos' };
  }
}

// ==================== CONFIGURACIÓN ====================

export async function getAppConfig(): Promise<AppConfig | null> {
  const { data, error } = await supabase
    .from('app_config')
    .select('*')
    .eq('id', 'default')
    .single();
    
  if (error || !data) {
    console.error('Error fetching app config:', error);
    return null;
  }
  
  return {
    horarios: data.horarios,
    horas_felices: data.horas_felices,
    contacto: data.contacto,
    // Add default values since they are hardcoded in schema defaults
    puntos_por_envio: 1, 
    envios_para_gratis: 5
  } as AppConfig;
}

// ==================== AUTENTICACIÓN ====================

export async function signInAdmin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true, data };
}

export async function signOutAdmin() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getAdminProfile(userId: string): Promise<AdminUser | null> {
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) return null;
  return data;
}

// ==================== SUSCRIPCIONES EN TIEMPO REAL ====================

export function subscribeToCliente(
  clienteId: string,
  callback: (cliente: Cliente) => void,
  onError?: (status: string) => void
): () => void {
  const channel = supabase
    .channel(`cliente_${clienteId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'clientes',
        filter: `id=eq.${clienteId}`,
      },
      (payload) => {
        callback(payload.new as Cliente);
      }
    )
    // Bug #29 fix: handle channel errors so callers know if Realtime fails
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error(`[Realtime] Channel error for cliente ${clienteId}: ${status}`);
        onError?.(status);
      }
    });

  return () => {
    channel.unsubscribe();
  };
}

// ==================== EXTRAS WEB PRO ====================

export async function getPromocionesActivas() {
  const { data, error } = await supabase
    .from('promociones_dinamicas')
    .select('*')
    .eq('activa', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching promos:', error);
    return [];
  }
  return data;
}

export async function getHistorialCliente(clienteId: string) {
  const { data, error } = await supabase.rpc('get_historial_cliente', {
    p_cliente_id: clienteId,
  });

  if (error) {
    console.error('Error fetching historial:', error);
    return [];
  }
  return data || [];
}
