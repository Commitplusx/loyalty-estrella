import { callGeminiWithTools } from '../../_shared/gemini.ts'

const MANDADITO_AGENT_SYSTEM_PROMPT = `Eres Estrella 🌟, el asistente logístico premium e hiper-inteligente de Estrella Envíos en Comitán, Chiapas.
Tu misión es gestionar la conversación con un cliente que desea un servicio de mandadito (envío, compras, recolección) de forma fluida, natural y humana.

REGLAS DE ORO:
1. NO SEAS ROBÓTICO. No enumeres preguntas como un formulario. Platica natural: "¡Claro! ¿Qué te recojo y a dónde lo llevamos?".
2. GEOFENCE (SOLO COMITÁN). Nuestro servicio es EXCLUSIVAMENTE dentro de la ciudad de Comitán de Domínguez, Chiapas. Si el cliente pide ir a otra ciudad, pueblo o municipio (ej. Tuxtla Gutiérrez, San Cristóbal, La Trinitaria, Margaritas), debes RECHAZAR el pedido amablemente explicando que por ahora solo cubrimos el área urbana de Comitán.
3. USA EL MAPA. Tienes la herramienta 'buscar_en_mapa'. Cuando el cliente mencione un lugar (ej. "Boutique Aura", "Escuela Benito Juárez"), ¡BÚSCALO EN EL MAPA INMEDIATAMENTE!
4. CONFIRMA CON EL CLIENTE. Si la herramienta de mapa encuentra la dirección (ej. Colonia Guadalupe), dile: "Veo que está en la col. Guadalupe, ¿es correcto?".
5. FINALIZAR. Solo cuando tengas el Origen exacto, el Destino exacto y la descripción del paquete, usa la herramienta 'finalizar_cotizacion'.
6. MULTIMEDIA (FOTOS Y AUDIOS). PUEDES VER FOTOS Y ESCUCHAR AUDIOS PERFECTAMENTE. Si el cliente te manda una foto de un paquete o una nota de voz con instrucciones, procésalo con normalidad. NUNCA digas que no puedes escuchar audios o ver fotos, ¡porque sí puedes!

7. BREVEDAD ABSOLUTA. Si ya saludaste en el mensaje anterior, NO vuelvas a saludar ni repitas "¡Hola!" o "Con mucho gusto te ayudo". Ve directo al grano en cada mensaje. Haz preguntas cortas y directas.

HERRAMIENTAS DISPONIBLES:
- 'buscar_en_mapa': Busca comercios, calles o escuelas en Comitán. Úsala para validar lugares.
- 'finalizar_cotizacion': Finaliza la conversación y manda a cotizar.

TONO: Chiapaneco, muy amable, usas emojis. Eres proactivo. Si el cliente dice "Aura", tú buscas "Aura Comitán" y le confirmas la calle.`

const TOOLS_DECLARATION = [
  {
    name: 'buscar_en_mapa',
    description: 'Busca una dirección, comercio, restaurante o colonia en Comitán para obtener sus coordenadas. Usa esto SIEMPRE que el cliente mencione un lugar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'El nombre del lugar a buscar en Comitán' }
      },
      required: ['query']
    }
  },
  {
    name: 'finalizar_cotizacion',
    description: 'Llama a esta herramienta SOLAMENTE cuando estés 100% seguro del Origen, el Destino y el Paquete.',
    parameters: {
      type: 'OBJECT',
      properties: {
        origen_texto: { type: 'STRING', description: 'Dirección validada del origen' },
        origen_lat: { type: 'NUMBER', description: 'Latitud del origen' },
        origen_lng: { type: 'NUMBER', description: 'Longitud del origen' },
        destino_texto: { type: 'STRING', description: 'Dirección validada del destino' },
        destino_lat: { type: 'NUMBER', description: 'Latitud del destino' },
        destino_lng: { type: 'NUMBER', description: 'Longitud del destino' },
        paquete: { type: 'STRING', description: 'Descripción de lo que se va a transportar' },
        instrucciones_origen: { type: 'STRING', description: 'A nombre de quién, etc.' },
        instrucciones_destino: { type: 'STRING', description: 'A quién entregar, referencias' }
      },
      required: ['origen_texto', 'destino_texto', 'paquete']
    }
  }
]

export async function runMandaditoAgent(
  supabase: any,
  historial: any[],
  nuevoMensaje: string,
  userPhone: string,
  mediaData?: { base64: string; mimeType: string } | null,
  clienteCtx?: any
): Promise<{ textResponse?: string; action?: string; data?: any, newHistory: any[] }> {
  
  const userParts: any[] = []
  if (nuevoMensaje) userParts.push({ text: nuevoMensaje })
  if (mediaData) {
    userParts.push({
      inlineData: { data: mediaData.base64, mimeType: mediaData.mimeType }
    })
  }
  // Fallback if empty
  if (userParts.length === 0) userParts.push({ text: 'Hola' })

  let systemPrompt = MANDADITO_AGENT_SYSTEM_PROMPT
  
  // Agregar CEREBRO IA: Rutas y Ubicaciones Semánticas
  if (clienteCtx) {
    let ubicacionesGuardadas = ''
    if (clienteCtx.ubicacionesGuardadas && clienteCtx.ubicacionesGuardadas.length > 0) {
      ubicacionesGuardadas = clienteCtx.ubicacionesGuardadas.map((u: any) => `- [${u.tipo}]: ${u.colonia_nombre} (Lat: ${u.lat}, Lng: ${u.lng})`).join('\n')
    }
    
    let aliasGraph = '{}'
    if (clienteCtx.perfilInteligente && clienteCtx.perfilInteligente.ubicaciones_semanticas) {
      aliasGraph = JSON.stringify(clienteCtx.perfilInteligente.ubicaciones_semanticas)
    }
    
    systemPrompt += `\n\n🧠 CEREBRO IA - CONTEXTO DEL CLIENTE:
- Nombre: ${clienteCtx.nombre || 'Desconocido'}
- Direcciones Frecuentes:\n${ubicacionesGuardadas}
- Mapa Semántico (Alias como "mi negocio", "casa de mi abuela"): ${aliasGraph}

CRÍTICO: Si el cliente menciona ir a "su casa", "su trabajo", o cualquier lugar guardado en sus Direcciones Frecuentes o su Mapa Semántico, NO le pidas la dirección. Utiliza exactamente la lat/lng guardada y avanza la cotización.`
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...historial,
    { role: 'user', parts: userParts, content: nuevoMensaje }
  ]

  const returnedHistory = [...historial, { role: 'user', parts: userParts, content: nuevoMensaje }]

  let isDone = false
  let loopCount = 0
  let finalResponse = { textResponse: '', action: 'RESPONDER', data: {}, newHistory: returnedHistory }

  while (!isDone && loopCount < 6) {
    loopCount++
    const geminiRes = await callGeminiWithTools(messages, TOOLS_DECLARATION, 'gemini-3.1-pro-preview-customtools', 1000)

    if (!geminiRes) {
      finalResponse.textResponse = '😔 Uy, tuve un cruce de cables. ¿Me repites eso último por favor?'
      isDone = true
      break
    }

    const parts = geminiRes.parts || []
    const functionCallParts = parts.filter((p: any) => p.functionCall)
    const textPart = parts.find((p: any) => p.text)

    if (functionCallParts.length > 0) {
      messages.push({ role: 'assistant', functionCalls: functionCallParts })
      returnedHistory.push({ role: 'assistant', functionCalls: functionCallParts })

      const functionResponses: any[] = []

      // Ejecutar herramientas en paralelo
      await Promise.all(functionCallParts.map(async (part: any) => {
        const call = part.functionCall
        console.log(`[AGENT] 🤖 Invocando herramienta (Paralelo): ${call.name}`, call.args)

        if (call.name === 'buscar_en_mapa') {
          const query = call.args.query
          let mapResultStr = ''
          try {
            const { resolverUbicacion } = await import('./geo.ts')
            const mockState = { texto: query }
            const geoRes = await resolverUbicacion(supabase, mockState as any, userPhone)
            
            if (geoRes?.colonia) {
              mapResultStr = `Encontrado en Base de Datos: ${geoRes.colonia.nombre} (Lat: ${geoRes.colonia.lat}, Lng: ${geoRes.colonia.lng})`
            } else if (geoRes?.opciones?.length) {
              mapResultStr = `Múltiples opciones encontradas: ${geoRes.opciones.map((o:any) => o.name).join(', ')}`
            } else {
              mapResultStr = `No se encontró "${query}" en el mapa de Comitán. Pídele referencias al cliente.`
            }
          } catch (e) {
            mapResultStr = 'Error buscando en el mapa.'
          }

          console.log(`[AGENT] 🗺️ Resultado de mapa (${query}):`, mapResultStr)
          functionResponses.push({ name: call.name, response: { result: mapResultStr } })
          
        } else if (call.name === 'finalizar_cotizacion') {
          const d = call.args
          let errores = []
          if (!d.origen_lat || !d.origen_lng) {
            if (!d.origen_texto?.includes('[UBICACIÓN GPS COMPARTIDA')) {
              errores.push("Faltan coordenadas del ORIGEN. Dile al usuario que necesitas referencias más exactas o que te comparta su ubicación GPS.")
            }
          }
          if (!d.destino_lat || !d.destino_lng) {
            if (!d.destino_texto?.includes('[UBICACIÓN GPS COMPARTIDA')) {
              errores.push("Faltan coordenadas del DESTINO. Dile al usuario que necesitas referencias más exactas o que te comparta su ubicación GPS.")
            }
          }
          if (!d.paquete || d.paquete.length < 3) {
            errores.push("Falta la descripción del paquete. Pregúntale al usuario qué es exactamente lo que vamos a transportar.")
          }

          if (errores.length > 0) {
            console.log(`[WATCHDOG] 🐕 Error en finalizar_cotizacion:`, errores)
            functionResponses.push({ name: call.name, response: { error: errores.join(' | ') } })
          } else {
            // Signal loop to finish
            finalResponse.action = 'FINALIZAR_COTIZACION'
            finalResponse.data = call.args
            isDone = true
          }
        }
      }))

      if (functionResponses.length > 0) {
        messages.push({ role: 'function', functionResponses })
        returnedHistory.push({ role: 'function', functionResponses })
      }
    } else if (textPart) {
      finalResponse.textResponse = textPart.text
      returnedHistory.push({ role: 'assistant', content: textPart.text })
      isDone = true
    } else {
      isDone = true
      break
    }
  }

  if (loopCount >= 6 && !finalResponse.textResponse && finalResponse.action !== 'FINALIZAR_COTIZACION') {
    finalResponse.textResponse = '⏳ Dame un segundito, sigo revisando la dirección en el mapa...'
  }

  return finalResponse
}
