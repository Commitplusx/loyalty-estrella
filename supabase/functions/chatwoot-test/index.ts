import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CW_BASE = Deno.env.get('CHATWOOT_BASE_URL') ?? 'https://app.chatwoot.com'
const CW_ACCOUNT = Deno.env.get('CHATWOOT_ACCOUNT_ID') ?? '162525'
const CW_API_TOKEN = Deno.env.get('CHATWOOT_API_TOKEN')!

serve(async (_req: Request) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  
  // 1. Get client
  const { data: c } = await supabase.from('clientes').select('*').eq('telefono', '9631601852').single()
  
  // 2. Find contact ID
  const searchRes = await fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/contacts/search?q=9631601852`, {
    headers: { 'api_access_token': CW_API_TOKEN }
  })
  const searchData = await searchRes.json()
  const contactId = searchData.payload?.[0]?.id

  let putStatus = 0
  if (contactId && c) {
    // 3. Put attributes
    const putRes = await fetch(`${CW_BASE}/api/v1/accounts/${CW_ACCOUNT}/contacts/${contactId}`, {
      method: 'PUT',
      headers: { 'api_access_token': CW_API_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_attributes: {
        puntos_lealtad: String(c.puntos || 0),
        es_vip: c.es_vip ? 'Sí ⭐' : 'No',
        saldo_billetera: String(c.saldo_billetera || 0),
        reputacion: c.reputacion || 'Sin calificar'
      }})
    })
    putStatus = putRes.status
  }

  return new Response(JSON.stringify({ c, contactId, putStatus }, null, 2), { headers: { 'Content-Type': 'application/json' } })
})
