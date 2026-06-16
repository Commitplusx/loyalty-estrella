import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN')!
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')!
const ADMIN_PHONES = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''

serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { action, telefono, codigo, nuevaPassword } = await req.json()

    if (!telefono) {
      return new Response(JSON.stringify({ error: 'Falta el teléfono' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    }

    const cleanPhone = telefono.replace(/\D/g, '')

    // ── ACCIÓN: REQUEST OTP ──
    if (action === 'request') {
      // 1. Verificar si es admin o repartidor
      const extract10 = (p: string) => {
        const c = p.replace(/\D/g, '')
        return c.length >= 10 ? c.slice(-10) : c
      }
      
      const adminsEnv10 = ADMIN_PHONES.split(',').map((n: string) => extract10(n)).filter(Boolean)
      const cleanPhone10 = extract10(cleanPhone)
      
      let targetPhone = cleanPhone
      let isAuthorized = false
      let role = 'admin'

      if (adminsEnv10.includes(cleanPhone10)) {
        isAuthorized = true
        // Extraemos el original del .env para usarlo como destino (con su country code)
        const originalEnv = ADMIN_PHONES.split(',').find(n => extract10(n) === cleanPhone10)
        targetPhone = originalEnv ? originalEnv.trim().replace(/\D/g, '') : cleanPhone
      }

      if (!isAuthorized) {
        // Buscar en tabla admins ignorando el prefijo de país usando 'like'
        const { data: adminData } = await supabase.from('admins').select('id, telefono').like('telefono', `%${cleanPhone}`).maybeSingle()
        if (adminData) {
          isAuthorized = true
          targetPhone = adminData.telefono || cleanPhone
        } else {
          // Buscar en tabla repartidores
          const { data: repData } = await supabase.from('repartidores').select('id, telefono').like('telefono', `%${cleanPhone}`).eq('activo', true).maybeSingle()
          if (repData) {
            isAuthorized = true
            role = 'repartidor'
            targetPhone = repData.telefono || cleanPhone
          }
        }
      }

      if (!isAuthorized) {
        return new Response(JSON.stringify({ error: 'Número no autorizado o inactivo' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
      }

      // Asegurar que tenga el código de país de México si solo son 10 dígitos y falló todo lo anterior (fallback)
      if (targetPhone.length === 10 && targetPhone.startsWith('963')) {
        targetPhone = `521${targetPhone}`
      }

      // 2. Generar PIN de 6 dígitos
      const pin = Math.floor(100000 + Math.random() * 900000).toString()

      // 3. Guardar en otp_codes (expira en 5 minutos)
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
      const { error: dbError } = await supabase.from('otp_codes').insert({
        telefono: cleanPhone, // Guardamos la versión original ingresada en el móvil para la validación
        codigo: pin,
        expires_at: expiresAt
      })

      if (dbError) throw dbError

      // 4. Enviar WhatsApp
      const waRes = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: targetPhone,
          type: 'text',
          text: { body: `⭐ *Estrella Delivery*\n\n🔐 Tu código de acceso es: *${pin}*\n\nIngresa este PIN en la aplicación. Caduca en 5 minutos.` }
        })
      })

      if (!waRes.ok) {
        console.error('WhatsApp Error:', await waRes.text())
      }

      return new Response(JSON.stringify({ ok: true, role }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    }

    // ── ACCIÓN: VERIFY & SET PASSWORD ──
    if (action === 'set-password') {
      if (!codigo || !nuevaPassword) {
        return new Response(JSON.stringify({ error: 'Falta código o contraseña' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
      }

      // 1. Validar OTP
      const { data: otpRecords } = await supabase
        .from('otp_codes')
        .select('*')
        .eq('telefono', cleanPhone)
        .eq('codigo', codigo)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)

      if (!otpRecords || otpRecords.length === 0) {
        return new Response(JSON.stringify({ error: 'Código inválido o expirado' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
      }

      // 2. Determinar Rol para el email (admin o repartidor)
      const extract10 = (p: string) => {
        const c = p.replace(/\D/g, '')
        return c.length >= 10 ? c.slice(-10) : c
      }
      const adminsEnv10 = ADMIN_PHONES.split(',').map((n: string) => extract10(n)).filter(Boolean)
      let isAdmin = adminsEnv10.includes(extract10(cleanPhone))
      if (!isAdmin) {
        const { data: aData } = await supabase.from('admins').select('id').like('telefono', `%${extract10(cleanPhone)}`).maybeSingle()
        if (aData) isAdmin = true
      }

      const dummyEmail = isAdmin ? `${cleanPhone}@admin.com` : `${cleanPhone}@repartidor.com`

      // 3. Crear o actualizar usuario en Auth
      const { data: users, error: listErr } = await supabase.auth.admin.listUsers()
      if (listErr) throw listErr

      let targetUser = users.users.find((u: any) => u.email === dummyEmail)

      if (targetUser) {
        // Actualizar contraseña
        const { error: updErr } = await supabase.auth.admin.updateUserById(targetUser.id, { password: nuevaPassword }); if (isAdmin) { await supabase.from('admins').update({id: targetUser.id}).eq('telefono', cleanPhone); } else { await supabase.from('repartidores').update({user_id: targetUser.id}).eq('telefono', cleanPhone); }
        if (updErr) throw updErr
      } else {
        // Crear usuario
        const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email: dummyEmail,
          password: nuevaPassword,
          email_confirm: true
        })
        if (createErr) throw createErr
        targetUser = newUser.user; if (isAdmin) { await supabase.from('admins').update({id: targetUser.id}).eq('telefono', cleanPhone); } else { await supabase.from('repartidores').update({user_id: targetUser.id}).eq('telefono', cleanPhone); }
      }

      // 4. Marcar OTP como usado (borrarlo)
      await supabase.from('otp_codes').delete().eq('id', otpRecords[0].id)

      return new Response(JSON.stringify({ ok: true, email: dummyEmail }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Acción inválida' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error('Error in auth-otp:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }
})
