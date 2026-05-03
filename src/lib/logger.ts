import { supabase } from './supabase';

type LogLevel = 'info' | 'warn' | 'error' | 'critical';

/**
 * Registra un log en la tabla system_logs.
 * Este logger está diseñado para errores en el Frontend (React).
 */
export async function logSystemEvent(
  level: LogLevel,
  message: string,
  metadata: Record<string, any> = {}
) {
  try {
    // Inject browser metadata implicitly
    const enrichMetadata = {
      ...metadata,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString()
    };

    // Llama a la función RPC que configuramos en SQL (log_system_error)
    const { error } = await supabase.rpc('log_system_error', {
      p_level: level,
      p_source: 'frontend',
      p_message: message,
      p_metadata: enrichMetadata
    });

    if (error) {
      console.error('Failed to log to system_logs RPC:', error);
    }
  } catch (err) {
    console.error('Crash in frontend logger:', err);
  }
}

/**
 * Helper rápido para loggear errores críticos
 */
export function logCriticalError(message: string, errorObj?: any) {
  console.error('[CRITICAL]', message, errorObj);
  const metadata = errorObj instanceof Error 
    ? { name: errorObj.name, stack: errorObj.stack, message: errorObj.message }
    : { rawError: JSON.stringify(errorObj) };
    
  logSystemEvent('critical', message, metadata).catch(() => {});
}
