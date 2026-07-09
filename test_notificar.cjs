const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jdrrkpvodnqoljycixbg.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY; // Se necesita para llamar la función, o llamarla directo si CORS lo permite

async function runTest() {
  console.log("🚀 Verificando Edge Function: notificar-whatsapp...");
  
  // Payload simulando una orden de admin (usando la lógica actualizada con restaurante_id)
  const payload = {
    tipo: 'nueva_orden_admin',
    restaurante: 'TestRest',
    restaurante_id: '00000000-0000-0000-0000-000000000000', // UUID falso para forzar validación segura
    descripcion: '1x Hamburguesa (Prueba de sistema)',
    ticket_id: 'TEST-123',
    tipo_entrega: 'domicilio'
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/notificar-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    
    if (res.ok) {
      console.log("✅ EXITOSO: La función respondió HTTP " + res.status);
      console.log("Respuesta:", data);
    } else {
      console.error("❌ ERROR: La función falló con HTTP " + res.status);
      console.error("Detalle:", data);
    }
  } catch (err) {
    console.error("💥 CRASH DE CONEXIÓN:", err.message);
  }
}

runTest();
