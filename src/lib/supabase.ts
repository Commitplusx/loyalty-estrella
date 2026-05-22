import { createClient } from '@supabase/supabase-js';
import type { Cliente, AppConfig } from '@/types';

// Las credenciales deben venir de variables de entorno para mayor seguridad, sin fallbacks manuales.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no están configuradas en .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ==================== CLIENTES ====================

export async function getClienteByTelefono(telefono: string): Promise<Cliente | { found: false } | null> {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('telefono', telefono)
    .maybeSingle(); // returns null data (no error) when row doesn't exist

  if (error) return null;          // real DB / network error
  if (!data) return { found: false }; // number not registered
  return data as Cliente;
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

// ==================== CALIFICACIONES ====================

export async function submitRating(registroPuntoId: string, puntuacion: number, comentario?: string) {
  const payload: Record<string, unknown> = {
    registro_punto_id: registroPuntoId,
    puntuacion,
  };
  // Solo incluimos el comentario si realmente tiene contenido.
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

export async function canjearSaldoBilleteraRPC(
  clienteId: string,
  monto: number,
  concepto: string
): Promise<{ ok: boolean; error?: string; nuevo_saldo?: number; codigo?: string; mensaje?: string }> {
  try {
    const { data, error } = await supabase.rpc('canjear_saldo', {
      p_cliente_id: clienteId,
      p_admin_id: null, // Autocanje web: null indica que fue autoservicio del cliente
      p_monto: monto,
      p_concepto: concepto
    });

    if (error) {
      console.error('[RPC canjear_saldo] Error:', error);
      return { ok: false, error: 'Error de servidor al procesar el canje' };
    }

    // El RPC retorna jsonb: { ok, error?, nuevo_saldo, codigo, mensaje }
    return data as { ok: boolean; error?: string; nuevo_saldo?: number; codigo?: string; mensaje?: string };
  } catch (err) {
    console.error('[RPC canjear_saldo] Exception:', err);
    return { ok: false, error: 'Error al conectar con la base de datos' };
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
    // Valores por defecto del esquema (puntos y envíos gratis).
    puntos_por_envio: 1,
    envios_para_gratis: 5
  } as AppConfig;
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
    // Controlamos errores en el canal para notificar si la conexión en tiempo real falla.
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error(`[Realtime] Channel error for cliente ${clienteId}: ${status}`);
        onError?.(status);
      }
    });

  return () => {
    supabase.removeChannel(channel);
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
