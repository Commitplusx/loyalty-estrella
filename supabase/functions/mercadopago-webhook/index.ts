import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

serve(async (req) => {
  // Manejar el webhook
  try {
    const url = new URL(req.url)
    
    // Mercado Pago envía parámetros en el querystring para notificaciones IPN/Webhooks
    const type = url.searchParams.get('type') || url.searchParams.get('topic')
    const id = url.searchParams.get('data.id') || url.searchParams.get('id')

    if (!id || (type !== 'payment' && type !== 'merchant_order')) {
      return new Response('Ignored', { status: 200 })
    }

    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')
    if (!mpAccessToken) throw new Error("MP_ACCESS_TOKEN no configurado")

    // Si es un pago, consultar los detalles a Mercado Pago
    if (type === 'payment') {
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
        headers: {
          'Authorization': `Bearer ${mpAccessToken}`
        }
      })

      const payment = await response.json()

      if (payment.status === 'approved') {
        const pedidoId = payment.external_reference

        if (pedidoId) {
          const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
          )

          // Actualizar el pedido en Supabase a pagado
          const { error } = await supabaseClient
            .from('pedidos')
            .update({ 
              estado_pago: 'pagado',
              mp_payment_id: id.toString()
            })
            .eq('id', pedidoId)

          if (error) throw new Error(`Error actualizando pedido: ${error.message}`)
          
          console.log(`Pedido ${pedidoId} marcado como pagado exitosamente.`)
        }
      }
    }

    return new Response('OK', { status: 200 })

  } catch (error: any) {
    console.error('Webhook Error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
