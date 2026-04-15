import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  
  const { data: user, error: uErr } = await supabase.auth.admin.createUser({
    email: 'caleb@estrella.local',
    password: 'password123!',
    email_confirm: true
  })
  
  if (uErr) return new Response(JSON.stringify({ok: false, err: uErr.message}))

  await supabase.from('repartidores')
    .update({ user_id: user.user.id, telefono: '9601725763' })
    .eq('id', '18c3d81b-a195-4669-8276-b86739714a35')

  await supabase.from('repartidores').delete().in('id', [
    'ad59b5e4-a2a2-412a-956b-f86365112f91',
    '2bc0b4a7-64ea-4ed8-adad-af7d5954c9f6'
  ])

  return new Response(JSON.stringify({ok: true, caleb: user.user.id}))
})
