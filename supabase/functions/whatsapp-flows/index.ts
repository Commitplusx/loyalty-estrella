import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1'
import { sendWA, sendInteractiveButtons } from '../whatsapp-bot/whatsapp.ts'

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryDerString = atob(pemContents)
  const binaryDer = new Uint8Array(binaryDerString.length)
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i)
  }

  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['decrypt']
  )
}

async function decryptAesKey(encryptedAesKeyBase64: string, privateKey: CryptoKey): Promise<Uint8Array> {
  const encryptedBytes = Uint8Array.from(atob(encryptedAesKeyBase64), c => c.charCodeAt(0))
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encryptedBytes
  )
  return new Uint8Array(decryptedBuffer)
}

serve(async (req) => {
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      
      const FLOWS_PRIVATE_KEY = Deno.env.get('FLOWS_PRIVATE_KEY')
      if (!FLOWS_PRIVATE_KEY) throw new Error("FLOWS_PRIVATE_KEY no configurado")

      const { encrypted_flow_data, encrypted_aes_key, initial_vector } = body

      // 1. Decrypt AES key
      const privateKey = await importPrivateKey(FLOWS_PRIVATE_KEY)
      const aesKeyBytes = await decryptAesKey(encrypted_aes_key, privateKey)
      
      const aesKey = await crypto.subtle.importKey(
        'raw',
        aesKeyBytes,
        { name: 'AES-GCM' },
        false,
        ['decrypt', 'encrypt']
      )

      // 2. Decrypt Flow Data
      const iv = Uint8Array.from(atob(initial_vector), c => c.charCodeAt(0))
      const encryptedData = Uint8Array.from(atob(encrypted_flow_data), c => c.charCodeAt(0))
      
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        encryptedData
      )
      
      const decryptedText = new TextDecoder().decode(decryptedBuffer)
      const flowData = JSON.parse(decryptedText)
      
      let responsePayload: any = {}

      if (flowData.action === "ping") {
        responsePayload = { data: { status: "active" } }
      } 
      else if (flowData.action === "INIT") {
        responsePayload = { data: {} }
      } 
      else if (flowData.action === "data_exchange") {
        const payload = flowData.data
        const tokenData = JSON.parse(flowData.flow_token || '{}')
        const fromPhone = tokenData.phone // The phone number of the user who submitted the flow
        
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        if (payload.accion === "REGISTRO_CLIENTE") {
          // Process Client Registration - requires Admin Approval
          const { nombre, colonia, cumpleanos } = payload
          const tel10 = fromPhone.slice(-10)
          
          await supabase.from('bot_memory').upsert({
            phone: `pending_reg_${tel10}`,
            history: [{
              nombre, telefono: tel10, colonia, cumpleanos,
              solicitado: new Date().toISOString()
            }],
            updated_at: new Date().toISOString()
          })

          // Notificar al admin
          const ADMIN_PHONES_ENV = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''
          const admin10 = (ADMIN_PHONES_ENV.split(',')[0]?.replace(/\D/g, '').slice(-10)) || ''
          if (admin10) {
            await sendInteractiveButtons(`52${admin10}`, 
              `🔔 *Nueva Solicitud VIP (Flow)*\n\n👤 Nombre: ${nombre}\n📞 Tel: wa.me/52${tel10}\n🏠 Colonia: ${colonia}\n🎂 Cumple: ${cumpleanos || 'No especificado'}`,
              [
                { id: `reg_accept_${tel10}`, title: '✅ Aprobar' },
                { id: `reg_reject_${tel10}`, title: '❌ Rechazar' }
              ]
            ).catch(err => console.error('Error sendInteractiveButtons:', err))
            
            await sendWA(`52${tel10}`, 
              `🎉 ¡Excelente, *${nombre.split(' ')[0]}*!\nTu solicitud VIP fue enviada. En unos minutos el equipo la aprobará y recibirás tu tarjeta digital aquí mismo. ⏳`
            ).catch(err => console.error('Error sendWA:', err))
          }

        } 
        else if (payload.accion === "REGISTRO_RESTAURANTE") {
          // Process Restaurant Registration
          const { nombre_negocio, categoria, encargado, direccion } = payload
          const tel10 = fromPhone.slice(-10)
          
          const { error: insError } = await supabase.from('restaurantes_solicitudes').insert({
            nombre_restaurante: nombre_negocio,
            categoria: categoria,
            encargado: encargado,
            direccion: direccion,
            telefono: tel10,
            correo: `aliado_${tel10}@app-estrella.shop` // Correo único usando el teléfono para evitar colisiones en Auth
          })
          
          if (insError) {
             console.error("Error insertando en restaurantes_solicitudes:", insError);
          }
          
          const ADMIN_PHONES_ENV = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''
          const admin10 = (ADMIN_PHONES_ENV.split(',')[0]?.replace(/\D/g, '').slice(-10)) || ''
          if (admin10) {
            await sendInteractiveButtons(`52${admin10}`, 
              `🔔 *Nueva Solicitud de Restaurante (Flow)*\nNombre: ${nombre_negocio}\nCategoría: ${categoria}\nEncargado: ${encargado}\nDirección: ${direccion}\nTel: wa.me/52${tel10}`,
              [
                { id: `flow_rest_accept_${tel10}`, title: '✅ Aprobar' },
                { id: `flow_rest_reject_${tel10}`, title: '❌ Rechazar' }
              ]
            ).catch(err => console.error('Error sendInteractiveButtons rest:', err))

            await sendWA(`52${tel10}`, 
              `🎉 Solicitud de restaurante enviada con éxito. Nuestro equipo la revisará y te contactará pronto. 🏪`
            ).catch(err => console.error('Error sendWA rest:', err))
          }
        }
        else if (payload.calle_gps) {
          // Process Solicitar Moto
          const { telefono, nombre, calle_gps, colonia, referencias, pedido, cobro, pago } = payload
          // Notificar al admin
          const ADMIN_PHONES_ENV = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''
          const admin10 = (ADMIN_PHONES_ENV.split(',')[0]?.replace(/\D/g, '').slice(-10)) || ''
          if (admin10) {
            await sendWA(`52${admin10}`, 
              `🛵 *NUEVO MOTO (B2B FLOW)*\n\n🏢 De: ${nombre}\n📞 Tel: wa.me/${telefono}\n📍 Calle: ${calle_gps}\n🏠 Colonia: ${colonia}\n📝 Referencias: ${referencias || 'Ninguna'}\n📦 Pedido: ${pedido}\n💰 Cobro: $${cobro}\n💳 Pago: ${pago}`
            ).catch(err => console.error('Error sendWA admin moto:', err))
            
            await sendWA(`52${fromPhone.slice(-10)}`, 
              `🛵 Hemos recibido tu solicitud para despachar moto. ¡Vamos en camino!`
            ).catch(err => console.error('Error sendWA cli moto:', err))
          }
        }
        else if (payload.accion === "CREAR_PROMO_B2B") {
          const { titulo, mensaje, audiencia, caducidad } = payload
          const { restId, restName, phone } = tokenData
          
          if (restId) {
            // Validar límite de 1 promo al día
            const hoyInicio = new Date()
            hoyInicio.setUTCHours(0, 0, 0, 0) // Start of UTC day, or adjust to local timezone
            const { count: promosHoy } = await supabase.from('restaurante_loyalty_log')
              .select('id', { count: 'exact', head: true })
              .eq('restaurante_id', restId)
              .eq('accion', 'broadcast_promo')
              .gte('created_at', hoyInicio.toISOString())
            
            const { sendWA } = await import('../whatsapp-bot/whatsapp.ts')

            if ((promosHoy || 0) >= 1) {
              await sendWA(phone, `⚠️ Lo sentimos, ya has enviado una promoción el día de hoy.\nPor políticas de la plataforma, el límite es de *1 promoción diaria* para evitar saturar a los clientes.`)
            } else {
              // Obtener teléfonos según audiencia
              let clientPhones: string[] = []
              
              const { data: logs } = await supabase.from('restaurante_loyalty_log')
                .select('cliente_tel, created_at')
                .eq('restaurante_id', restId)
                
              if (logs) {
                const phoneCounts: Record<string, number> = {}
                const phoneLastVisit: Record<string, number> = {}
                
                logs.forEach((l: any) => {
                  phoneCounts[l.cliente_tel] = (phoneCounts[l.cliente_tel] || 0) + 1
                  const t = new Date(l.created_at).getTime()
                  if (!phoneLastVisit[l.cliente_tel] || t > phoneLastVisit[l.cliente_tel]) {
                    phoneLastVisit[l.cliente_tel] = t
                  }
                })
                
                if (audiencia === 'top_vip') {
                  const sorted = Object.keys(phoneCounts).sort((a, b) => phoneCounts[b] - phoneCounts[a])
                  clientPhones = sorted.slice(0, 20)
                } else if (audiencia === 'ausentes') {
                  const treintaDias = 30 * 24 * 60 * 60 * 1000
                  const ahora = Date.now()
                  clientPhones = Object.keys(phoneLastVisit).filter(p => (ahora - phoneLastVisit[p]) > treintaDias)
                } else {
                  // 'todos'
                  clientPhones = Object.keys(phoneCounts)
                }
              }
              
              if (clientPhones.length === 0) {
                await sendWA(phone, `⚠️ No se encontraron clientes en la categoría seleccionada (*${audiencia}*). La promoción no fue enviada.`)
              } else {
                // Registrar envío
                await supabase.from('restaurante_loyalty_log').insert({
                  restaurante_id: restId,
                  accion: 'broadcast_promo',
                  valor: clientPhones.length,
                  cliente_tel: 'MULTIPLE'
                })
                
                const caducidadTxt = caducidad ? `\n⏳ *Válida hasta:* ${caducidad}` : ''
                const msgBroadcast = `🎁 *NUEVA PROMOCIÓN* 🎁\n🏪 De: *${restName}*\n\n🔥 *${titulo}*\n${mensaje}${caducidadTxt}\n\n_Para hacerla válida, muestra tu tarjeta digital VIP al visitar el local o realizar tu pedido._`
                
                for (const clientPhone of clientPhones) {
                  // Pequeña pausa para no saturar API
                  await new Promise(r => setTimeout(r, 100))
                  await sendWA(`52${clientPhone}`, msgBroadcast).catch(console.error)
                }
                
                await sendWA(phone, `✅ *¡Promoción Enviada con Éxito!*\nSe ha despachado el mensaje a *${clientPhones.length}* clientes de la categoría *${audiencia}*.`)
              }
            }
          }
        }
        // As per Meta specs, if we are at a terminal screen, we can return screen "SUCCESS" with data 
        // to show a native success screen, or if it's terminal, we can just return empty data and it closes.
        // Wait, the action must return the next screen name defined in routing_model.
        // We only defined one screen, so let's return a special command to close it.
        // "If you want to close the flow after data exchange, you can route to a screen that doesn't exist, or use a specific flow structure."
        // Let's assume returning an empty response or routing to 'SUCCESS' closes it.
        responsePayload = {
          version: "3.0",
          screen: "SUCCESS",
          data: {
            extension_message_response: {
              params: {
                flow_token: flowData.flow_token
              }
            }
          }
        }
      }

      // 3. Encrypt Response
      const responseBytes = new TextEncoder().encode(JSON.stringify(responsePayload))
      const flippedIv = new Uint8Array(iv.length)
      for (let i = 0; i < iv.length; i++) flippedIv[i] = ~iv[i]
      
      const encryptedResponseBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: flippedIv },
        aesKey,
        responseBytes
      )
      
      const encryptedResponseBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedResponseBuffer)))

      return new Response(encryptedResponseBase64, {
        headers: { 'Content-Type': 'text/plain' },
        status: 200
      })

    } catch (e: any) {
      console.error(e)
      return new Response("Error procesando", { status: 500 })
    }
  }

  return new Response("Method not allowed", { status: 405 })
})
