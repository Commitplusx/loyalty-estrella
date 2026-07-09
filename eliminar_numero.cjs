const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://jdrrkpvodnqoljycixbg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ'
);

async function eliminarNumero() {
  const numeroTarget = '9631601852';
  console.log(`\n======================================================`);
  console.log(`🧹 INICIANDO LIMPIEZA PROFUNDA DEL NÚMERO: ${numeroTarget}`);
  console.log(`======================================================\n`);

  try {
    // 1. Eliminar de la tabla PEDIDOS (columna cliente_tel)
    console.log(`⏳ Buscando en la tabla 'pedidos'...`);
    const { error: errorPedidos } = await supabase
      .from('pedidos')
      .delete()
      .eq('cliente_tel', numeroTarget);
    
    if (errorPedidos) throw errorPedidos;
    console.log(`✅ Pedidos eliminados correctamente.`);

    // 2. Eliminar de la tabla CLIENTES (columna telefono)
    console.log(`\n⏳ Buscando en la tabla 'clientes'...`);
    const { error: errorClientes } = await supabase
      .from('clientes')
      .delete()
      .eq('telefono', numeroTarget);
    
    if (errorClientes) throw errorClientes;
    console.log(`✅ Cliente eliminado correctamente.`);

    // 3. Eliminar de la tabla REPARTIDORES (por si estuviera registrado ahí)
    console.log(`\n⏳ Buscando en la tabla 'repartidores'...`);
    const { error: errorRepartidores } = await supabase
      .from('repartidores')
      .delete()
      .eq('telefono', numeroTarget);
    
    if (errorRepartidores) throw errorRepartidores;
    console.log(`✅ Repartidor eliminado correctamente.`);

    console.log(`\n======================================================`);
    console.log(`🎉 LIMPIEZA COMPLETADA AL 100%`);
    console.log(`======================================================\n`);

  } catch (error) {
    console.error(`\n❌ ERROR CRÍTICO DURANTE LA LIMPIEZA:`, error.message);
  }
}

eliminarNumero();
