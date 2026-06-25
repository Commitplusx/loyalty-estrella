import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejar CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Obtener los datos del pedido desde el cliente
    const { 
      pedidoId,
      items, 
      costo_envio,
      descuento,
      total,
      originUrl
    } = await req.json()

    // Preparar el payload para Mercado Pago
    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')
    if (!mpAccessToken) throw new Error("MP_ACCESS_TOKEN no configurado en Supabase")

    const mpItems = items.map((item: any) => ({
      title: item.item.nombre,
      description: item.item.opcionesSeleccionadas?.map((o: any) => o.opcion).join(', ') || '',
      quantity: item.cantidad,
      unit_price: Number(item.item.precio),
      currency_id: "MXN"
    }))

    // Agregar costo de envío como un item extra si existe
    if (costo_envio > 0) {
      mpItems.push({
        title: "Costo de Envío",
        quantity: 1,
        unit_price: Number(costo_envio),
        currency_id: "MXN"
      })
    }

    // Para simplificar y evitar problemas con MP si el cupón causa precios negativos, mandamos un solo item condensado si hay descuento.
    let preferenceItems = mpItems;
    if (descuento > 0) {
      preferenceItems = [{
        title: `Pedido en Estrella Eats (Descuento aplicado -$${descuento})`,
        quantity: 1,
        unit_price: Number(total), // El total final calculado en el frontend y validado
        currency_id: "MXN"
      }];
    }

    const payload = {
      items: preferenceItems,
      back_urls: {
        success: `${originUrl}/success?pedido=${pedidoId}`,
        failure: `${originUrl}/?cart=open`,
        pending: `${originUrl}/?cart=open`
      },
      auto_return: "approved",
      external_reference: pedidoId.toString(),
      statement_descriptor: "ESTRELLA EATS"
    }

    // Llamar a la API de Mercado Pago
    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mpAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const mpData = await mpResponse.json()

    if (!mpResponse.ok) {
      console.error("Mercado Pago Error:", mpData)
      throw new Error("Error al crear preferencia en Mercado Pago")
    }

    // Retornar la URL de inicio
    return new Response(
      JSON.stringify({ 
        url: mpData.init_point, 
        sandbox_url: mpData.sandbox_init_point
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Error en mercadopago-checkout:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
