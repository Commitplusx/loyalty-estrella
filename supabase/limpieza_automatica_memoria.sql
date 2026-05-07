-- ══════════════════════════════════════════════════════════════════════════════
-- LIMPIEZA AUTOMÁTICA DE MEMORIA DEL BOT (pg_cron)
-- Este script configura una tarea programada para borrar los registros 
-- temporales del bot (idempotencia y rate limits) evitando que la base 
-- de datos se llene de basura con el paso de los meses.
-- ══════════════════════════════════════════════════════════════════════════════

-- Habilitar extensión pg_cron (viene preinstalada en Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Eliminar el job si ya existe para evitar duplicados
SELECT cron.unschedule('limpiar-bot-memory');

-- Programar la limpieza todos los días a las 3:00 AM
SELECT cron.schedule('limpiar-bot-memory', '0 3 * * *',
  $$ 
    -- Borra registros de mensajes procesados hace más de 1 hora
    DELETE FROM bot_memory 
    WHERE phone LIKE 'processed_msg:%' 
      AND updated_at < NOW() - INTERVAL '1 hour';
      
    -- Borra registros de Rate Limit (anti-spam) hace más de 2 horas
    DELETE FROM bot_memory 
    WHERE phone LIKE 'rate_limit_%' 
      AND updated_at < NOW() - INTERVAL '2 hours'; 
  $$
);

-- Fin del script
