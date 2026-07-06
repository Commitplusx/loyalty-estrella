import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

serve(async (req) => {
  // Manejar el webhook
  try {
    const url = new URL(req.url)
    
    // Mercado Pago envía parámetros en el querystring para notificaciones IPN/Webhooks
    const type = url.searchParams.get('type') || url.searchParams.get('topic')
    const id = url.searchParams.get('data.id') || url.searchParams.get('id')

    const pedidoUrlParam = url.searchParams.get('pedido')

    if (!id || (type !== 'payment' && type !== 'merchant_order')) {
      return new Response('Ignored', { status: 200 })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Necesitamos el token del restaurante para consultar a MP.
    // Si tenemos el pedido en la URL, lo usamos para buscar el restaurante.
    let mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN'); // Fallback

    if (pedidoUrlParam) {
      const { data: pedidoInfo } = await supabaseClient
        .from('pedidos')
        .select('restaurante')
        .eq('wb_message_id', pedidoUrlParam)
        .single();
        
      if (pedidoInfo?.restaurante) {
        const { data: restInfo } = await supabaseClient
          .from('restaurantes')
          .select('mp_access_token')
          .eq('nombre', pedidoInfo.restaurante)
          .single();
          
        if (restInfo?.mp_access_token) {
          mpAccessToken = restInfo.mp_access_token;
        }
      }
    }

    if (!mpAccessToken) {
      console.warn("No se pudo obtener el MP_ACCESS_TOKEN para el pedido:", pedidoUrlParam);
      return new Response('Missing Token', { status: 200 }); // Retornar 200 para que MP no reintente
    }

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

          // 1. Obtener detalles del pedido para WhatsApp
          const { data: pedidoData, error: selectError } = await supabaseClient
            .from('pedidos')
            .select('wb_message_id, restaurante, descripcion, tipo_pedido, direccion, referencias_entrega, total, lat, lng')
            .eq('wb_message_id', pedidoId)
            .single()

          if (!selectError && pedidoData) {
            // 2. Actualizar el pedido en Supabase a pagado
            const { error: updateError } = await supabaseClient
              .from('pedidos')
              .update({ 
                estado: 'pendiente',
                estado_pago: 'pagado',
                mp_payment_id: id.toString()
              })
              .eq('wb_message_id', pedidoId)

            if (updateError) throw new Error(`Error actualizando pedido: ${updateError.message}`)
            
            // 3. Enviar notificación de WhatsApp ahora que está pagado
            await supabaseClient.functions.invoke('notificar-whatsapp', {
              body: {
                tipo: 'nueva_orden_admin',
                ticket_id: pedidoData.wb_message_id,
                restaurante: pedidoData.restaurante,
                descripcion: pedidoData.descripcion,
                tipo_entrega: pedidoData.tipo_pedido
              }
            }).catch(err => console.warn('Error mandando WA desde webhook:', err))

            // 4. Asignar repartidor (Garantía de que siempre suene la venta tras pagar en línea)
            if (pedidoData.tipo_pedido === 'domicilio') {
              console.log(`Disparando asignacion de repartidor para pedido en linea: ${pedidoId}`)
              await supabaseClient.functions.invoke('asignar-repartidor', {
                body: { id: pedidoId } // Pasamos el wb_message_id o id, asignar-repartidor maneja ambos internamente si adaptamos
              }).catch(err => console.warn('Error invocando asignar-repartidor desde webhook MP:', err))
            }

            
            
            console.log(`Pedido ${pedidoId} marcado como pagado exitosamente y notificado.`)
          } else {
            console.warn(`No se encontró el pedido ${pedidoId} en la base de datos.`)
          }
        }
      }
    }

    return new Response('OK', { status: 200 })

  } catch (error: any) {
    console.error('Webhook Error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
