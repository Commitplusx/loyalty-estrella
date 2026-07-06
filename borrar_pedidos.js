/**
 * SCRIPT PARA BORRAR TODOS LOS REGISTROS DE LA TABLA PEDIDOS
 * 
 * Ejecuta: node borrar_pedidos.js
 */

const SUPABASE_URL = 'https://jdrrkpvodnqoljycixbg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ';

async function borrarPedidos() {
  console.log("Iniciando borrado de pedidos...");

  try {
    // Hace una petición DELETE a la tabla pedidos donde id no sea nulo (es decir, todos)
    const response = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=not.is.null`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    });

    if (response.ok) {
      console.log("✅ ¡Todos los pedidos fueron borrados exitosamente!");
    } else {
      const errorText = await response.text();
      console.error("❌ Error al borrar pedidos:", response.status, errorText);
      console.log("⚠️ Es probable que las políticas RLS (Row Level Security) bloqueen el borrado global con la clave pública.");
      console.log("En ese caso, por favor usa el panel web cuando regrese.");
    }
  } catch (error) {
    console.error("Error de red:", error.message);
  }
}

borrarPedidos();
