import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Parsear el body
    const { clienteTel, tipo, montoPedido, saldoAUsar, restaurante } = await req.json()

    if (!clienteTel || !tipo) {
      throw new Error('Faltan parámetros requeridos (clienteTel, tipo)')
    }

    // Ejecutar la función atómica que maneja todo de forma segura
    const { data: result, error: rpcError } = await supabase.rpc('fn_canjear_beneficio', {
      p_cliente_tel: clienteTel,
      p_tipo: tipo, // 'envio_normal' | 'envio_vip' | 'billetera'
      p_monto_pedido: montoPedido || 0,
      p_saldo_a_usar: saldoAUsar || 0,
      p_restaurante: restaurante || null
    })

    if (rpcError) {
      console.error("Error en fn_canjear_beneficio:", rpcError)
      throw rpcError
    }

    // El RPC retorna: { ok: true, codigo: "CANJE-...", valor_pesos: X, ... }
    if (!result || !result.ok) {
      return new Response(
        JSON.stringify({ success: false, error: result?.error || 'Error desconocido al canjear' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Notificar al cliente vía WhatsApp (en background, no bloqueamos la respuesta HTTP)
    const payloadNotificacion = {
      tipo: 'cupon_generado',
      cliente_tel: clienteTel,
      cliente_nombre: result.cliente_nombre || 'Cliente',
      codigo_cupon: result.codigo,
      descuento: result.valor_pesos,
      expires_at: result.expires_at,
      tipo_canje: tipo
    }

    // BUG FIX #5: Use supabase.functions.invoke instead of raw fetch for reliable auth
    supabase.functions.invoke('notificar-whatsapp', {
      body: payloadNotificacion
    }).catch((err: any) => console.error("Error disparando notificar-whatsapp:", err))

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error("Error Edge Function canjear-puntos:", error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
