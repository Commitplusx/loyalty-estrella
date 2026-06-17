import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN')!
const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')!
const APPROVAL_SECRET = Deno.env.get('ADMIN_APPROVAL_SECRET') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendWA(to: string, text: string) {
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text } })
    })
    if (!res.ok) console.error(`Error sending WA message to ${to}:`, await res.text())
  } catch (error) {
    console.error(`Exception sending WA message to ${to}:`, error)
  }
}

function sendResponse(message: string, isError = false, isJson = false) {
  if (isJson) {
    return new Response(JSON.stringify({ error: isError, message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: isError ? 400 : 200
    })
  }
  const color = isError ? '#ef4444' : '#10b981'
  return new Response(`
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><title>Aprobación</title></head>
    <body style="font-family: system-ui; background: #0f0f0f; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center;">
      <div style="background: #1a1a1a; padding: 2rem; border-radius: 20px; border-top: 4px solid ${color}; max-width: 400px;">
        <h1 style="color: ${color}">Aprobación</h1><p>${message}</p>
      </div>
    </body></html>
  `, { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let action = ''
  let tel = ''
  let secret = ''
  const isJson = req.headers.get('content-type')?.includes('application/json') || req.method === 'POST'
  
  if (req.method === 'GET') {
    const url = new URL(req.url)
    action = url.searchParams.get('action') || ''
    tel = url.searchParams.get('tel') || ''
    secret = url.searchParams.get('secret') || ''
  } else if (req.method === 'POST') {
    const body = await req.json()
    action = body.action || ''
    tel = body.tel || ''
  }

  if (!action || !tel) return sendResponse('Faltan parámetros.', true, isJson)

  const authHeader = req.headers.get('Authorization')
  if ((!APPROVAL_SECRET || secret !== APPROVAL_SECRET) && !authHeader) {
    return sendResponse('No Autorizado.', true, isJson)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const { data: sol, error: solErr } = await supabase.from('restaurantes_solicitudes')
    .select('*').eq('telefono', tel).eq('estado', 'pendiente').order('creado_en', { ascending: false }).limit(1).maybeSingle()

  if (solErr || !sol) {
    return sendResponse('Solicitud no encontrada.', true, isJson)
  }

  const sendPhone = `52${tel}`

  if (action === 'reject') {
    const { error: updErr } = await supabase.from('restaurantes_solicitudes').update({ estado: 'rechazado' }).eq('telefono', tel).eq('estado', 'pendiente').select()
    if (updErr) {
      return sendResponse(`Error al actualizar DB: ${updErr.message}`, true, isJson)
    }
    await sendWA(sendPhone, `Estimado comercio, por el momento no estamos aceptando más registros. Gracias.`)
    return sendResponse(`Rechazado.`, false, isJson)
  }

  if (action === 'accept') {
    const rNum = Math.floor(1000 + Math.random() * 9000);
    const genPassword = `Estrella${rNum}*`;

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: sol.correo,
      password: genPassword,
      email_confirm: true
    })

    let isAuthCreated = true;
    let adminId = authData?.user?.id;

    if (authErr) {
      if (authErr.message.includes('already been registered') || authErr.message.includes('already exists')) {
        isAuthCreated = false;
        // Obtener el ID del usuario existente usando la función RPC
        const { data: existingId } = await supabase.rpc('get_user_id_by_email', { email_to_search: sol.correo });
        adminId = existingId;
      } else {
        return sendResponse(`Error de Auth: ${authErr.message}`, true, isJson)
      }
    }

    const { error: restErr } = await supabase.from('restaurantes').insert({
      nombre: sol.nombre_restaurante,
      telefono: tel,
      activo: true,
      admin_id: adminId
    })

    if (restErr && restErr.code !== '23505') {
      return sendResponse(`Error de BD: ${restErr.message}`, true, isJson)
    }

    await supabase.from('restaurantes_solicitudes').update({ estado: 'aprobado' }).eq('id', sol.id)

    let msgCredenciales = `🎉 *¡Felicidades, ${sol.encargado}! Tu restaurante ha sido APROBADO.*\n\nYa puedes gestionar todo enviándonos la palabra *Menú* o *Hola* por este mismo chat.`;
    if (isAuthCreated) {
      msgCredenciales += `\n\nPara administrar tu menú e información, ingresa a:\n🌐 *https://restaurantes-app-estrella.shop*\n\n_(Tus credenciales web son:_ Correo: ${sol.correo} _/ Clave:_ ${genPassword}_)_`;
    }
    await sendWA(sendPhone, msgCredenciales)

    return sendResponse('¡Aprobado con éxito!', false, isJson)
  }

  return sendResponse('Acción desconocida.', true, isJson)
})
