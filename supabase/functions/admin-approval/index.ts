import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN')!
const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')!

async function sendWA(to: string, text: string) {
  await fetch(`https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text } })
  })
}

function htmlResponse(title: string, message: string, isError = false) {
  const color = isError ? '#ef4444' : '#10b981'
  return new Response(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f0f0f; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
        .card { background: #1a1a1a; padding: 2rem; border-radius: 20px; border-top: 4px solid ${color}; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-width: 400px; }
        h1 { margin-top: 0; color: ${color}; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>${title}</h1>
        <p>${message}</p>
      </div>
    </body>
    </html>
  `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

serve(async (req: Request) => {
  if (req.method !== 'GET') return htmlResponse('Error', 'Método no permitido', true)

  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  const tel = url.searchParams.get('tel')

  if (!action || !tel) return htmlResponse('Error', 'Faltan parámetros (action o tel).', true)

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // 1. Buscar la solicitud pendiente
  const { data: sol, error: solErr } = await supabase.from('restaurantes_solicitudes')
    .select('*').eq('telefono', tel).eq('estado', 'pendiente').order('creado_en', { ascending: false }).limit(1).maybeSingle()

  if (solErr || !sol) {
    return htmlResponse('Solicitud no encontrada', 'No se encontró una solicitud pendiente para este teléfono o ya fue procesada.', true)
  }

  const sendPhone = `52${tel}`

  if (action === 'reject') {
    await supabase.from('restaurantes_solicitudes').update({ estado: 'rechazado' }).eq('id', sol.id)
    await sendWA(sendPhone, `Estimado comercio, por el momento no estamos aceptando más registros en su zona o los datos proporcionados no cumplen con las políticas. Gracias por su interés en Estrella Delivery.`)
    return htmlResponse('Rechazado', `La solicitud de ${sol.nombre_restaurante} ha sido denegada y se le ha notificado por WhatsApp.`)
  }

  if (action === 'accept') {
    // Generar contraseña
    const genPassword = `Estrella${Math.floor(Math.random() * 9000) + 1000}!`

    // Crear Usuario en Auth
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: sol.correo,
      password: genPassword,
      email_confirm: true
    })

    if (authErr) {
      if (authErr.message.includes('already exists')) {
        return htmlResponse('Error de Auth', `El correo ${sol.correo} ya está registrado en el sistema. Dile que inicie sesión con su correo o recupere su contraseña.`, true)
      }
      return htmlResponse('Error de Auth', `Fallo al crear usuario: ${authErr.message}`, true)
    }

    const userId = authData.user.id

    // Crear fila en Restaurantes
    const { error: restErr } = await supabase.from('restaurantes').insert({
      nombre: sol.nombre_restaurante,
      telefono: tel,
      admin_id: userId,
      activo: true
    })

    if (restErr) {
      // Revertir usuario si falla
      await supabase.auth.admin.deleteUser(userId)
      return htmlResponse('Error de BD', `No se pudo registrar en la base de datos: ${restErr.message}`, true)
    }

    // Actualizar solicitud
    await supabase.from('restaurantes_solicitudes').update({ estado: 'aprobado' }).eq('id', sol.id)

    // Enviar WhatsApp de bienvenida
    const msg = `🎉 *¡Felicidades!*\n\nTu restaurante *${sol.nombre_restaurante}* ha sido aprobado en Estrella Delivery.\n\nYa puedes acceder a tu panel de control (Menú Digital) y subir tus productos:\n\n🌐 *Portal:* https://restaurantes-app-estrella.shop\n📧 *Correo:* ${sol.correo}\n🔑 *Contraseña temporal:* ${genPassword}\n\nPor seguridad, te sugerimos cambiar tu contraseña al iniciar sesión.`
    await sendWA(sendPhone, msg)

    return htmlResponse('¡Aprobado con éxito!', `El restaurante <b>${sol.nombre_restaurante}</b> fue dado de alta y se le enviaron sus accesos a su WhatsApp.`)
  }

  return htmlResponse('Acción desconocida', 'La acción no es accept ni reject.', true)
})
