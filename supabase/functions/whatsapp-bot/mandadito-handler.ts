import { sendWA, sendInteractiveButtons, sendInteractiveList, sendLocationRequest } from './whatsapp.ts'
import { validarDatosMandaditoIA, extraerResumenFinalIA } from './ai.ts'
import * as h3 from 'npm:h3-js@4.1.0'

export type UbicacionMandadito = { texto?: string; lat?: number; lng?: number }

// ── Construye lista interactiva con direcciones guardadas del cliente ──────────
export async function enviarSelectorUbicacion(
  supabase: any,
  fromPhone: string,
  from10: string,
  titulo: string,
  paso: 1 | 2,
  role?: string
) {
  const { data: favsRaw } = await supabase.from('cliente_ubicaciones')
    .select('tipo, colonia_nombre')
    .eq('cliente_telefono', from10)
    .order('ultima_vez', { ascending: false })
    .limit(20)  // traemos más para poder deduplicar

  // Bug 3 fix: deduplicar por tipo — si tiene 2 entradas de "casa", mostrar solo la más reciente
  const tiposVistos = new Set<string>()
  const favs = favsRaw?.filter((f: any) => {
    if (tiposVistos.has(f.tipo)) return false
    tiposVistos.add(f.tipo)
    return true
  }) ?? []

  // ¿Debe salir el botón del GPS? 
  // Solo si sabemos con seguridad que el cliente ESTÁ FÍSICAMENTE en ese lugar
  // - Paso 1 (Origen) y el cliente ENVÍA el paquete
  // - Paso 2 (Destino) y el cliente RECIBE el paquete
  // Si no tenemos role (ej. flujo rápido por texto), por defecto NO mandamos el botón GPS para evitar confusiones.
  const debeMostrarGPS = (paso === 1 && role === 'envio') || (paso === 2 && role === 'recibo')

  if (favs && favs.length > 0) {
    const rows = favs.map((f: any) => ({
      // Bug 2 fix: NO embedemos la colonia en el ID (podría truncarse y crashear decodeURIComponent).
      // En su lugar usamos solo el tipo como clave y hacemos lookup en BD al recibir el botón.
      id: `MAND_USAR_DIR_${paso}_${f.tipo}`.substring(0, 200),
      title: `${etiquetaEmoji(f.tipo)} ${capitalizar(f.tipo)}`,
      description: f.colonia_nombre?.substring(0, 60) || 'Dirección guardada'
    }))
    rows.push({
      id: `MAND_ESCRIBIR_${paso}`,
      title: `✏️ Escribir dirección`,
      description: 'Escribir colonia y calle'
    })
    
    // 1. Mandamos la lista de favoritos
    await sendInteractiveList(
      fromPhone,
      titulo,
      `Ver mis direcciones 📋`,
      [{ title: `Mis direcciones guardadas`, rows }]
    )
    
    // 2. Si aplica, mandamos el botón de GPS nativo en un mensaje separado
    if (debeMostrarGPS) {
      await sendLocationRequest(fromPhone, `O si prefieres, compárteme tu *Ubicación GPS* exacta tocando el botón de abajo 📍👇`)
    }
    
  } else {
    // Sin libreta de direcciones
    if (debeMostrarGPS) {
      await sendLocationRequest(fromPhone, titulo + `\n\nEscribe el nombre de la colonia/barrio, o toca el botón abajo para mandar tu *Ubicación GPS* 📍👇`)
    } else {
      await sendWA(fromPhone, titulo + `\n\n_Escribe el nombre de la colonia/barrio y la calle por favor._`)
    }
  }
}

function etiquetaEmoji(tipo: string): string {
  const m: Record<string, string> = { casa: '🏠', trabajo: '🏢', escuela: '🏫', oficina: '🏢', gym: '💪', iglesia: '⛪', favorita: '⭐', origen: '🕒', destino: '🕒' }
  return m[tipo?.toLowerCase()] || '📍'
}

function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

const stripPrefijos = (s: string) => s.replace(/^(Barrio|Colonia|Fraccionamiento|Polígono|Poligono)\s+/i, '').trim()

export async function getBarrioFromMaps(lat: number, lng: number): Promise<string | null> {
  try {
    const MAPS_KEY = Deno.env.get('GOOGLE_MAPS_KEY') || ''
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=es&result_type=neighborhood|sublocality|locality&key=${MAPS_KEY}`
    const res = await fetch(url)
    const json = await res.json()
    if (json.status !== 'OK' || !json.results?.length) return null
    const prioridades = ['neighborhood', 'sublocality_level_1', 'sublocality', 'locality']
    for (const result of json.results) {
      for (const tipo of prioridades) {
        const comp = result.address_components?.find((c: any) => c.types.includes(tipo))
        if (comp?.long_name) return stripPrefijos(comp.long_name)
      }
    }
    return null
  } catch { return null }
}

export async function resolveH3Location(supabase: any, lat: number | string, lng: number | string) {
  const numLat = Number(lat);
  const numLng = Number(lng);

  if (isNaN(numLat) || isNaN(numLng)) {
    // BUG-C1 fix: precio fallback no longer hardcoded to 45.
    // resolveH3Location callers should pass a default from app_config.
    // Here we use 45 as last-resort only when no config is available.
    return { precio: 45, colonia_nombre: 'Zona Desconocida', colonia_id: null };

  }

  // RESOLUCIÓN H3 PRIMARIA
  try {
    const hexIndex = h3.latLngToCell(numLat, numLng, 10);
    const { data } = await supabase.from('h3_zonas').select('precio, nombre').eq('h3_index', hexIndex).maybeSingle();
    
    if (data && data.precio) {
      console.log(`[H3 HIT] ${numLat},${numLng} -> ${hexIndex} -> ${data.nombre} ($${data.precio})`);
      return { precio: data.precio, colonia_nombre: data.nombre, colonia_id: null };
    }
    console.log(`[H3 MISS] ${numLat},${numLng} -> ${hexIndex} no encontrado en h3_zonas`);
  } catch (e) {
    console.error('Error H3 lookup:', e);
  }

  // FALLBACK A KML SI NO ENCUENTRA EN H3
  try {
    const { data: resolvedRaw } = await supabase.rpc('resolve_ubicacion_from_coords', { p_lat: numLat, p_lng: numLng });
    return Array.isArray(resolvedRaw) ? resolvedRaw[0] : resolvedRaw;
  } catch (e) {
    console.error('Error Postgres KML Fallback:', e);
    // BUG-C1 fix: same as above — precio 45 is the last-resort fallback
    return { precio: 45, colonia_nombre: 'Zona Extendida', colonia_id: null };

  }
}

// Inicia la máquina de estados del mandadito
export async function iniciarFlujoMandadito(
  supabase: any, fromPhone: string, from10: string,
  origen?: UbicacionMandadito, destino?: UbicacionMandadito,
  referencias?: string
) {
  // Si tenemos ambos datos de golpe, nos saltamos la máquina de estados y cotizamos directo
  if (origen && destino && (origen.texto || origen.lat) && (destino.texto || destino.lat)) {
    await sendWA(fromPhone, `⏳ *Calculando tu cotización...*`)
    return await cotizarMandaditoFinal(supabase, fromPhone, from10, { origen, destino, referencias })
  }

  // Si tenemos el origen (y opcionalmente destino/referencias para usarlos más tarde)
  if (origen && (origen.texto || origen.lat)) {
    // Guardar en el estado el origen + destino/referencias que ya vengan del primer mensaje
    await supabase.from('bot_memory').upsert({
      phone: `mandadito_state_${from10}`,
      history: [{ step: 2, origen, destinoPendiente: destino || null, referenciasPendientes: referencias || null }],
      updated_at: new Date().toISOString()
    })
    await enviarSelectorUbicacion(
      supabase, fromPhone, from10,
      `🏁 *¿Y a dónde lo entregamos?*\n\nElige una dirección guardada o escribe la colonia/barrio de destino:`,
      2
    )
    return
  }

  // Si no tenemos nada (inicio manual)
  await supabase.from('bot_memory').upsert({
    phone: `mandadito_state_${from10}`,
    history: [{ step: 0.5 }],
    updated_at: new Date().toISOString()
  })
  
  await sendInteractiveButtons(fromPhone,
    `📦 ¡Hola! Para iniciar tu mandadito, dime por favor:\n\n*¿Tú envías el paquete o tú lo recibes?*`,
    [
      { id: 'MAND_ROLE_ENVIO',  title: '⬆️ Yo envío' },
      { id: 'MAND_ROLE_RECIBO', title: '⬇️ Yo recibo' }
    ]
  )
}

// ── Analiza si el cliente ya dio referencias o detalles del mandadito en su mensaje ──
function extraerReferencias(ubi1?: UbicacionMandadito, ubi2?: UbicacionMandadito): string | null {
  const palabrasClave = ['recoger', 'recoge', 'llevar', 'lleva', 'entregar', 'entrega', 'a nombre de', 'paquete', 'caja', 'bolsa', 'sobre', 'documento', 'flores', 'comida', 'pedido']
  let refs: string[] = []
  
  const revisar = (ubi?: UbicacionMandadito) => {
    if (!ubi?.texto) return
    const txt = ubi.texto.trim().substring(0, 200)
    const tLower = txt.toLowerCase()
    const palabras = txt.split(/\s+/).length
    // Bug 6 fix: Solo marcar como referencia si contiene palabras clave
    if (palabrasClave.some(k => tLower.includes(k))) {
      refs.push(txt)
    }
  }
  
  revisar(ubi1)
  revisar(ubi2)
  
  return refs.length > 0 ? refs.join(' | ') : null
}



// BUG-A1 fix: moved to module scope (was incorrectly nested inside avanzarFlujoMandadito)
async function extraerOrigenDestinoIA(texto: string): Promise<{ origen: string|null, destino: string|null, nombreCortoOrigen: string|null }> {
  try {
    const key = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('OPENAI_API_KEY')
    if (!key) return { origen: null, destino: null, nombreCortoOrigen: null }
    const url = Deno.env.get('DEEPSEEK_API_KEY') ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions'
    const model = Deno.env.get('DEEPSEEK_API_KEY') ? 'deepseek-chat' : 'gpt-4o-mini'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Extrae "origen" (de dónde recogen) y "destino" (a dónde entregan) de este mensaje de mandadito. Además, extrae un "nombreCortoOrigen" (solo el lugar, ej. "Domino\'s", "Aurrera", "Casa"). Si solo hay un lugar, ponlo en "origen" y "destino" null. Responde en JSON estricto.' },
          { role: 'user', content: texto }
        ]
      })
    })
    const json = await res.json()
    const content = json.choices[0].message.content.trim().replace(/```json/gi, '').replace(/```/g, '')
    return JSON.parse(content)
  } catch (e) {
    return { origen: null, destino: null, nombreCortoOrigen: null }
  }
}

// Avanza la máquina de estados cuando el cliente responde
export async function avanzarFlujoMandadito(supabase: any, fromPhone: string, from10: string, currentState: any, ubicacionRecibida: UbicacionMandadito) {
  
  // ── GUARDIÁN DE SESIÓN: Detectar palabras que no son direcciones ──
  // Si el cliente está en el flujo de mandadito (pasos 1 o 2) y escribe algo
  // que claramente NO es una dirección, ofrecemos cancelar en lugar de
  // registrar "hola" o "salir" como una ubicación.
  if (ubicacionRecibida.texto && !ubicacionRecibida.lat && (currentState.step === 1 || currentState.step === 2)) {
    const txt = ubicacionRecibida.texto.trim().toLowerCase()
    const palabrasNoUbicacion = [
      'hola', 'hi', 'hello', 'hey', 'buenas', 'buenos dias', 'buen dia',
      'salir', 'exit', 'volver', 'regresar', 'atras', 'atrás', 'back',
      'cancelar', 'cancel', 'nada', 'olvídalo', 'olvidalo', 'dejalo',
      'menu', 'menú', 'inicio', 'home', 'start',
      'ayuda', 'help', 'soporte', '?',
      'gracias', 'ok', 'okey', 'okay', 'si', 'sí', 'no quiero',
      'adios', 'adiós', 'bye', 'chao', 'hasta luego'
    ]
    const esPalabraSinSentidoDeUbicacion = palabrasNoUbicacion.includes(txt) || txt.length <= 2
    
    if (esPalabraSinSentidoDeUbicacion) {
      const pasoActual = currentState.step === 1 ? 'el origen (dónde recogemos)' : 'el destino (dónde entregamos)'
      await sendInteractiveButtons(fromPhone,
        `🤔 Parece que escribiste _"${ubicacionRecibida.texto}"_ pero estoy esperando *${pasoActual}*.\n\n¿Quieres continuar con tu mandadito o prefieres cancelarlo?`,
        [
          { id: 'MAND_CONTINUAR_SESION', title: '▶️ Continuar mandadito' },
          { id: 'CANCELAR_MANDADITO',    title: '❌ Cancelar'            }
        ]
      )
      return
    }
  }

  if (currentState.step === 0.5) {
    const txt = ubicacionRecibida.texto?.trim().toLowerCase() || ''
    if (txt.includes('envio') || txt.includes('envío')) {
      // Actuar como si hubiera presionado MAND_ROLE_ENVIO
      await supabase.from('bot_memory').upsert({ phone: `mandadito_state_${from10}`, history: [{ step: 1, role: 'envio' }], updated_at: new Date().toISOString() })
      await enviarSelectorUbicacion(supabase, fromPhone, from10, `📍 ¡Perfecto! Por favor dime desde dónde enviamos el paquete:`, 1, 'envio')
      return
    } else if (txt.includes('recibo')) {
      // Actuar como si hubiera presionado MAND_ROLE_RECIBO
      await supabase.from('bot_memory').upsert({ phone: `mandadito_state_${from10}`, history: [{ step: 1, role: 'recibo' }], updated_at: new Date().toISOString() })
      await enviarSelectorUbicacion(supabase, fromPhone, from10, `📍 Entendido. ¿*En dónde recogemos* el paquete? (Especifica la colonia y calle, o el nombre del negocio)`, 1, 'recibo')
      return
    } else {
      await sendInteractiveButtons(fromPhone,
        `📦 ¡Hola! Para iniciar tu mandadito, dime por favor:\n\n*¿Tú envías el paquete o tú lo recibes?*`,
        [
          { id: 'MAND_ROLE_ENVIO',  title: '⬆️ Yo envío' },
          { id: 'MAND_ROLE_RECIBO', title: '⬇️ Yo recibo' }
        ]
      )
      return
    }
  }

  if (currentState.step === 1.5) {
    const num = parseInt(ubicacionRecibida.texto || '0')
    const maxOpciones = currentState.opciones.length + 1
    if (isNaN(num) || num < 1 || num > maxOpciones) {
      await sendWA(fromPhone, `⚠️ Por favor responde con un número válido del 1 al ${maxOpciones}.`)
      return
    }
    
    // Si eligió "Ninguna de las anteriores"
    if (num === maxOpciones) {
      await supabase.from('bot_memory').upsert({
        phone: `mandadito_state_${from10}`,
        history: [{ step: 1 }],
        updated_at: new Date().toISOString()
      })
      await sendWA(fromPhone, `🔄 Entendido. Vamos a intentar de nuevo.\n\n📍 *¿Desde dónde recogemos el paquete?*\n_Intenta enviar tu *ubicación GPS* o escribir el nombre con más detalle._`)
      return
    }

    const seleccion = currentState.opciones[num - 1]
    const originalState = currentState.originalState
    originalState.origen.lat = seleccion.lat
    originalState.origen.lng = seleccion.lng
    originalState.origen.texto = seleccion.name
    await supabase.from('bot_memory').delete().eq('phone', `mandadito_state_${from10}`)
    await sendWA(fromPhone, `⏳ Calculando cotización con *${seleccion.name}*...`)
    await cotizarMandaditoFinal(supabase, fromPhone, from10, originalState)
    return
  }

  if (currentState.step === 2.5) {
    const num = parseInt(ubicacionRecibida.texto || '0')
    const maxOpciones = currentState.opciones.length + 1
    if (isNaN(num) || num < 1 || num > maxOpciones) {
      await sendWA(fromPhone, `⚠️ Por favor responde con un número válido del 1 al ${maxOpciones}.`)
      return
    }
    
    // Si eligió "Ninguna de las anteriores"
    if (num === maxOpciones) {
      await supabase.from('bot_memory').upsert({
        phone: `mandadito_state_${from10}`,
        history: [{ step: 2, origen: currentState.originalState.origen }],
        updated_at: new Date().toISOString()
      })
      await sendWA(fromPhone, `🔄 Entendido. Vamos a intentar de nuevo.\n\n🏁 *¿A dónde entregamos el paquete?*\n_Intenta enviar tu *ubicación GPS* o escribir el nombre con más detalle._`)
      return
    }

    const seleccion = currentState.opciones[num - 1]
    const originalState = currentState.originalState
    originalState.destino.lat = seleccion.lat
    originalState.destino.lng = seleccion.lng
    originalState.destino.texto = seleccion.name
    await supabase.from('bot_memory').delete().eq('phone', `mandadito_state_${from10}`)
    await sendWA(fromPhone, `⏳ Calculando cotización con *${seleccion.name}*...`)
    await cotizarMandaditoFinal(supabase, fromPhone, from10, originalState)
    return
  }

  if (currentState.step === 1.6) {
    // Recibió la referencia faltante del origen
    const originalState = currentState.originalState
    originalState.origen.texto = `${currentState.coloniaAnterior}, ${ubicacionRecibida.texto}`
    
    // Como ya tenemos el origen y el destino (porque estamos calculando el precio final),
    // simplemente volvemos a cotizar con el nuevo texto del origen actualizado.
    await supabase.from('bot_memory').delete().eq('phone', `mandadito_state_${from10}`)
    await sendWA(fromPhone, `⏳ Recalculando cotización...`)
    await cotizarMandaditoFinal(supabase, fromPhone, from10, originalState)
    return
  }

  if (currentState.step === 2.6) {
    // Recibió la referencia faltante del destino
    const originalState = currentState.originalState
    originalState.destino.texto = `${currentState.coloniaAnterior}, ${ubicacionRecibida.texto}`
    
    // Recalculamos con el destino actualizado
    await supabase.from('bot_memory').delete().eq('phone', `mandadito_state_${from10}`)
    await sendWA(fromPhone, `⏳ Recalculando cotización...`)
    await cotizarMandaditoFinal(supabase, fromPhone, from10, originalState)
    return
  }


  if (currentState.step === 1) {
    let nombreCortoOrigenDisplay: string | null = null

    // Si el texto es largo, puede contener origen y destino juntos, o detalles extra
    if (ubicacionRecibida.texto && ubicacionRecibida.texto.split(/\s+/).length > 2 && !ubicacionRecibida.lat) {
      const ext = await extraerOrigenDestinoIA(ubicacionRecibida.texto)
      // if (ext.origen) {
      //   ubicacionRecibida.texto = ext.origen
      // }
      if (ext.destino && ext.origen?.toLowerCase() !== ext.destino.toLowerCase()) {
        currentState.destinoPendiente = { texto: ext.destino }
      }
      if (ext.nombreCortoOrigen) {
        nombreCortoOrigenDisplay = ext.nombreCortoOrigen
      }
    }

    // Fallback: si el texto era muy corto o la IA no extrajo nada, usamos todo el texto como origen
    let textoBase = ubicacionRecibida.texto ? ubicacionRecibida.texto.split(/,|\n/)[0].trim() : null
    let lblOrigen = null
    let msgConfirmacion = ''

    if (ubicacionRecibida.lat && ubicacionRecibida.lng) {
      const resolved = await resolveH3Location(supabase, ubicacionRecibida.lat, ubicacionRecibida.lng)
      
      let nombreColonia = resolved?.colonia_nombre
      if (!nombreColonia) {
        nombreColonia = await getBarrioFromMaps(ubicacionRecibida.lat, ubicacionRecibida.lng)
      }

      if (nombreColonia) {
        const gpsStr = `📍 Pin GPS Exacto`
        lblOrigen = textoBase ? `${gpsStr} _(${textoBase}, ${nombreColonia})_` : `${gpsStr} _(${nombreColonia})_`
        ubicacionRecibida.texto = textoBase ? `${textoBase} (${nombreColonia})` : nombreColonia
        msgConfirmacion = `✅ *Se recoge en:* ${lblOrigen}`
      }
    }
    
    if (!msgConfirmacion) {
      // UX Fix: Usar el nombre corto extraído por la IA si existe, para no sonar robóticos
      if (ubicacionRecibida.lat) {
        msgConfirmacion = `✅ *Se recoge en:* tu ubicación GPS exacta 📍`
      } else if (nombreCortoOrigenDisplay) {
        msgConfirmacion = `✅ *Se recoge en:* ${nombreCortoOrigenDisplay} 📍`
      } else {
        msgConfirmacion = `✅ *¡Origen registrado!* 📍`
      }
    }
    
    // ── INTELIGENTE: Si el estado ya tenía un destino pendiente (la IA lo extraío del primer mensaje), saltar directo ──
    if (currentState.destinoPendiente && (currentState.destinoPendiente.texto || currentState.destinoPendiente.lat)) {
      const estadoCompleto = {
        origen: ubicacionRecibida,
        destino: currentState.destinoPendiente,
        referencias: currentState.referenciasPendientes || null
      }
      await supabase.from('bot_memory').delete().eq('phone', `mandadito_state_${from10}`)
      
      const lblDestText = currentState.destinoPendiente.texto || 'Ubicación'
      const lblDest = currentState.destinoPendiente.lat ? `_${lblDestText}_ 📍` : `_${lblDestText}_ 📍`
      await sendWA(fromPhone, `${msgConfirmacion}\n✅ *Entregar en:* ${lblDest}\n\n⏳ *Calculando tu cotización...*`)
      await cotizarMandaditoFinal(supabase, fromPhone, from10, estadoCompleto)
      return
    }

    await supabase.from('bot_memory').update({
      history: [{ step: 2, origen: ubicacionRecibida, role: currentState.role }],
      updated_at: new Date().toISOString()
    }).eq('phone', `mandadito_state_${from10}`)

    // Enviar primer msj de confirmación y luego pedir destino
    await sendWA(fromPhone, msgConfirmacion)
    await enviarSelectorUbicacion(
      supabase, fromPhone, from10,
      `🏁 ¿Y a dónde lo llevamos? 📍\n_Escribe la colonia, el nombre del lugar, o compártenos el pin GPS._`,
      2,
      currentState.role
    )
  } 
  else if (currentState.step === 2) {
    if (!currentState.origen) {
      await sendWA(fromPhone, `⚠️ Perdimos el dato de origen. ¿Me lo dices de nuevo?`)
      await supabase.from('bot_memory').upsert({
        phone: `mandadito_state_${from10}`,
        history: [{ step: 1 }],
        updated_at: new Date().toISOString()
      })
      await enviarSelectorUbicacion(supabase, fromPhone, from10,
        `📍 *¿Desde dónde recogemos el paquete?*`, 1)
      return
    }

    let textoBaseD = ubicacionRecibida.texto ? ubicacionRecibida.texto.split(/,|\n/)[0].trim() : null
    let lblDestino = null
    let msgConfirmacionD = ''

    if (ubicacionRecibida.lat && ubicacionRecibida.lng) {
      const resolved = await resolveH3Location(supabase, ubicacionRecibida.lat, ubicacionRecibida.lng)
      
      let nombreColonia = resolved?.colonia_nombre
      if (nombreColonia) {
        nombreColonia = stripPrefijos(nombreColonia).replace(/pol[íi]gono/ig, '').trim();
      }

      const esNombreInterno = nombreColonia && (nombreColonia.toLowerCase().includes('zona ') || nombreColonia === 'Zona Extendida' || nombreColonia === 'Zona Desconocida');

      if (!nombreColonia || esNombreInterno) {
        // Fallback a Google Maps si H3 no tiene la colonia registrada o es un nombre interno
        const mapa = await getBarrioFromMaps(ubicacionRecibida.lat, ubicacionRecibida.lng)
        if (mapa) nombreColonia = mapa
        else if (!nombreColonia) nombreColonia = 'Ubicación GPS'
      }

      if (nombreColonia) {
        const gpsStr = `📍 Pin GPS Exacto`
        lblDestino = textoBaseD ? `${gpsStr} _(${textoBaseD}, ${nombreColonia})_` : `${gpsStr} _(${nombreColonia})_`
        ubicacionRecibida.texto = textoBaseD ? `${textoBaseD} (${nombreColonia})` : nombreColonia
        msgConfirmacionD = `✅ *Entregar en:* ${lblDestino}`
      }
    }
    
    if (!msgConfirmacionD) {
      const lblText = ubicacionRecibida.texto || 'Ubicación'
      msgConfirmacionD = ubicacionRecibida.lat ? `✅ *Entregar en:* tu ubicación GPS exacta 📍` : `✅ *Entregar en:* ${lblText} 📍`
    }

    // ── INTELIGENTE: Usar IA para decidir si pedir referencias ──
    const refsPendientes = currentState.referenciasPendientes || null

    if (refsPendientes) {
      const estadoCompleto = {
        origen: currentState.origen,
        destino: ubicacionRecibida,
        referencias: refsPendientes
      }
      await supabase.from('bot_memory').delete().eq('phone', `mandadito_state_${from10}`)
      await sendWA(fromPhone, `${msgConfirmacionD}\n\n⏳ Calculando el precio de tu mandadito...`)
      await cotizarMandaditoFinal(supabase, fromPhone, from10, estadoCompleto)
    } else {
      // Preguntar a la IA si faltan datos usando estructura JSON
      const validacion = await validarDatosMandaditoIA(
        currentState.origen?.texto || 'Ubicación GPS',
        ubicacionRecibida.texto || 'Ubicación GPS',
        from10,
        currentState.role
      )

      if (validacion.estaCompleto) {
        const estadoCompleto = {
          origen: currentState.origen,
          destino: ubicacionRecibida,
          referencias: null,
          datosEstructurados: validacion.datosEstructurados
        }
        await supabase.from('bot_memory').delete().eq('phone', `mandadito_state_${from10}`)
        await sendWA(fromPhone, `${msgConfirmacionD}\n\n⏳ Calculando el precio...`)
        await cotizarMandaditoFinal(supabase, fromPhone, from10, estadoCompleto)
      } else {
        await supabase.from('bot_memory').update({
          history: [{ step: 3, origen: currentState.origen, destino: ubicacionRecibida, datosEstructurados: validacion.datosEstructurados }],
          updated_at: new Date().toISOString()
        }).eq('phone', `mandadito_state_${from10}`)

        const msg = validacion.preguntaAlCliente || `📝 ¿Alguna referencia o seña para llegar? También puedes contarnos qué paquete llevamos.\n\n_Escribe *no* si no tienes ninguna._`
        await sendWA(fromPhone, `✅ *Entregar en:* ${lblDestino || ubicacionRecibida.texto || 'Ubicación GPS'}\n\n${msg}`)
      }
    }
  }

  else if (currentState.step === 3) {
    // Si el cliente escribe "no" o "ninguna", omitir referencias
    const textoBrief = (ubicacionRecibida.texto || '').toLowerCase().trim()
    const estadoCompleto = {
      origen: currentState.origen,
      destino: currentState.destino,
      referencias: ['no', 'ninguna', 'nada', 'n/a', 'sin referencia'].includes(textoBrief) ? null : ubicacionRecibida.texto,
      datosEstructurados: currentState.datosEstructurados
    }
    await supabase.from('bot_memory').delete().eq('phone', `mandadito_state_${from10}`)
    await sendWA(fromPhone, `⏳ *Calculando tu cotización...*`)
    await cotizarMandaditoFinal(supabase, fromPhone, from10, estadoCompleto)
  }
}

// Función central de cotización (soporta texto o GPS)
export async function cotizarMandaditoFinal(
  supabase: any,
  fromPhone: string,
  from10: string,
  mandaditoState: any
) {
  // 0. Leer configuración global de precios (Modo lluvia)
  let modoLluvia = false
  let recargoLluvia = 15
  try {
    const { data: appCfg } = await supabase.from('app_config').select('configuracion_precios').eq('id', 'default').maybeSingle()
    if (appCfg?.configuracion_precios) {
      modoLluvia = appCfg.configuracion_precios.modo_lluvia === true
      recargoLluvia = appCfg.configuracion_precios.recargo_lluvia ?? 15
    }
  } catch (e) { console.error('Error leyendo app_config:', e) }

  // ── Función reutilizable: quita prefijos de tipo "Colonia", "Barrio de", etc ──
  const stripPrefijos = (texto: string): string => {
    let limpio = texto.toLowerCase().trim()
    let prev = ''
    while (limpio !== prev) {
      prev = limpio
      limpio = limpio
        .replace(/^(se\s+recoge|recoger|entregar|llev[aá]lo|ll[eé]valo|voy|quiero\s+ir|mandar|m[aá]ndalo|vamos|aqu[ií])\s+/i, '')
        .replace(/^(a|en|para|por|rumbo\s+a|hasta|hacia)\s+/i, '')
        .replace(/^(fraccionamiento|fracc?\.?|colonia|col\.?|barrio\s+de\s+las?|barrio\s+de|barrio|secci[oó]n|delegaci[oó]n|ranchería|rancho)\s+/i, '')
        .replace(/^(la|el|los|las|de|del|un|una)\s+/i, '')
        .trim()
    }
    return limpio
  }

  const MAPS_KEY = Deno.env.get('GOOGLE_MAPS_KEY') ?? ''
  const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') ?? ''
  
  const withTimeout = <T>(p: Promise<T>, ms = 3000): Promise<T | null> =>
    Promise.race([p, new Promise<null>(res => setTimeout(() => res(null), ms))])

  // Validar que las coords estén dentro del municipio de Comitán (evita resultados de otra ciudad)
  const enComitan = (lat: number, lng: number): boolean =>
    lat > 15.9 && lat < 16.55 && lng > -92.6 && lng < -91.8

  // Cache texto→coords usando bot_memory como KV store (evita repetir Google APIs para el mismo texto)
  const getTextCache = async (key: string) => {
    const { data } = await supabase.from('bot_memory').select('history').eq('phone', key).maybeSingle()
    return (data?.history?.[0] ?? null) as { lat: number, lng: number, name: string } | null
  }
  const setTextCache = (key: string, lat: number, lng: number, name: string) =>
    supabase.from('bot_memory').upsert({ phone: key, history: [{ lat, lng, name, ts: Date.now() }], updated_at: new Date().toISOString() }).then()

  // Palabras clave para detectar negocios LOCALMENTE sin gastar en DeepSeek
  const PALABRAS_NEGOCIO = ['farmacia', 'oxxo', 'tienda', 'distribuidora', 'comercial', 'super', 'supermercado', 'restaurant', 'taqueria', 'hospital', 'clinica', 'escuela', 'colegio', 'bodega', 'mercado', 'plaza', 'hotel', 'banco', 'gasolinera', 'servecentro', 'ferreteria', 'papeleria', 'tortilleria', 'cremeria', 'carniceria', 'panaderia', 'abarrotes', 'veterinaria', 'consultorio', 'laboratorio', 'gym', 'salon', 'electrica', 'constructora', 'transporte', 'pollo', 'sushi', 'pizza', 'burger', 'helados', 'lavanderia', 'mecanico', 'taller', 'libreria', 'imprenta']

  // ── Expansor de abreviaturas callejeras mexicanas ─────────────────────────────
  // Corre GRATIS antes de DeepSeek y Maps para que entiendan el texto.
  // "7 av ote sur" → "7 avenida oriente sur"
  // "4 calle pte, col belisario" → "4 calle poniente, colonia belisario"
  const normalizarAbreviaturas = (texto: string): string => texto
    .replace(/\bav\.?\b/gi,    'avenida')
    .replace(/\bcalz\.?\b/gi,  'calzada')
    .replace(/\bblvd?\.?\b/gi, 'boulevard')
    .replace(/\bote\.?\b/gi,   'oriente')
    .replace(/\bpte\.?\b/gi,   'poniente')
    .replace(/\bnte\.?\b/gi,   'norte')
    .replace(/\bsur\.?\b/gi,   'sur')           // ya completo, pero limpia punto
    .replace(/\bno\.?\s*(\d)/gi, 'número $1')   // "No. 12" → "número 12"
    .replace(/\bfracc?\.?\b/gi,'fraccionamiento')
    .replace(/\bcol\.?\b/gi,   'colonia')
    .replace(/\bbarrio\b/gi,   'barrio')         // mantiene, pero estandariza
    .replace(/\bbo\.?\b/gi,    'barrio')
    .replace(/\bcda\.?\b/gi,   'cerrada')
    .replace(/\bpriv\.?\b/gi,  'privada')
    .replace(/\b(\d+)a\b/gi,   '$1a')            // "4a" → "4a" (mantiene)
    .replace(/\s{2,}/g, ' ')
    .trim()

  // Llama a DeepSeek para estructurar el texto de ubicación en JSON limpio
  // Siempre se llama para texto (costo ~$0.0001 USD, despreciable)
  const limpiarUbicacionTextoConIA = async (textoOriginal: string): Promise<{ calle: string, colonia: string | null, referencias: string | null, destinatario: string | null, telefono: string | null, esNegocio: boolean }> => {
    textoOriginal = textoOriginal.substring(0, 200) // 🛡️ Evitar prompt injection
    const esNegocioLocal = PALABRAS_NEGOCIO.some(kw => textoOriginal.toLowerCase().includes(kw))
    const defaultRes = { calle: textoOriginal, colonia: null, referencias: null, destinatario: null, telefono: null, esNegocio: esNegocioLocal }
    if (!DEEPSEEK_API_KEY) return defaultRes

    try {
      const res = await withTimeout(fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{
            role: 'system',
            content: `Eres un extractor de direcciones para Comitán de Domínguez, Chiapas, México.
Analiza el texto y devuelve estrictamente un JSON con estos campos:
{
  "calle": "la calle, avenida o número de calle principal (ej: '2a Calle Sur Oriente', 'Av. Rosario Castellanos', 'Farmacia del Ahorro')",
  "colonia": "el barrio, colonia o fraccionamiento mencionado (ej: 'Barrio La Pilita', 'Col. Belisario') o null si no hay",
  "referencias": "referencias de cruce o ubicación exacta como 'entre 3a y 4a Av Oriente', 'esquina con Calle Flores', 'junto a la iglesia' — o null si no hay",
  "destinatario": "el nombre de la persona que recibe o entrega el paquete (ej: 'Ximena Roque', 'Juan', 'mi mamá') o null si no hay",
  "telefono": "cualquier número de teléfono mencionado (ej: '9631467360') o null si no hay",
  "esNegocio": true si el destino PRINCIPAL es un establecimiento comercial (farmacia, oxxo, tienda, etc.), false si es una casa o calle
}
REGLAS:
- calle: solo la via principal, sin referencias ni colonia
- colonia: cualquier mención de barrio/col./fracc./unidad
- referencias: cruces, referencias visuales ('junto a', 'frente a', 'entre X y Y')
- Si el texto solo menciona una colonia sin calle, pon la colonia en "colonia" y null en "calle"
- Sin markdown, solo JSON puro`
          }, { role: 'user', content: textoOriginal }],
          temperature: 0.1, response_format: { type: 'json_object' }
        })
      }), 4000)

      if (!res) {
        console.log('🤖 [NLP] Timeout en DeepSeek')
        return defaultRes
      }

      const json = await res.json()
      let content = json?.choices?.[0]?.message?.content?.trim()
      if (content) {
        if (content.startsWith('```')) content = content.replace(/```json?/g, '').replace(/```/g, '').trim()
        const parsed = JSON.parse(content)
        console.log(`🤖 [NLP JSON] "${textoOriginal}" =>`, parsed)
        return {
          calle:       parsed.calle       || textoOriginal,
          colonia:     parsed.colonia     || null,
          referencias: parsed.referencias || null,
          destinatario: parsed.destinatario || null,
          telefono:    parsed.telefono    || null,
          esNegocio:   !!parsed.esNegocio
        }
      }
    } catch (e) {
      console.error('Error NLP:', e)
    }

    return defaultRes
  }

  // ── Extractor de coordenadas desde links de Google Maps ───────────────────────
  // Soporta: goo.gl/maps, maps.app.goo.gl, maps.google.com, google.com/maps
  // Ejemplo: "https://maps.app.goo.gl/ABC123" → { lat: 16.25, lng: -92.13 }
  const extractCoordsFromMapsUrl = async (text: string): Promise<{ lat: number, lng: number } | null> => {
    const urlMatch = text.match(/https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.com|google\.com\/maps)[^\s<>"']*/i)
    if (!urlMatch) return null
    let url = urlMatch[0]

    // Patrón directo: @lat,lng embebido en la URL
    const coordDirect = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
    if (coordDirect) {
      const lat = parseFloat(coordDirect[1]), lng = parseFloat(coordDirect[2])
      if (lat && lng) return { lat, lng }
    }

    // Patrón ?q=lat,lng
    const qParam = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/)
    if (qParam) {
      const lat = parseFloat(qParam[1]), lng = parseFloat(qParam[2])
      if (lat && lng) return { lat, lng }
    }

    // URL corta (goo.gl, maps.app.goo.gl) → resolver redirect para obtener coords
    try {
      const res = await withTimeout(fetch(url, { redirect: 'follow' }), 4000)
      if (res) {
        const finalUrl = res.url
        const coordRedirect = finalUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
        if (coordRedirect) {
          const lat = parseFloat(coordRedirect[1]), lng = parseFloat(coordRedirect[2])
          if (lat && lng) return { lat, lng }
        }
        const qRedirect = finalUrl.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/)
        if (qRedirect) {
          const lat = parseFloat(qRedirect[1]), lng = parseFloat(qRedirect[2])
          if (lat && lng) return { lat, lng }
        }
      }
    } catch {}

    return null
  }

  const resolverUbicacion = async (ubi: UbicacionMandadito): Promise<{ colonia?: any, zona: any, esGps: boolean } | null> => {
    const textoOriginal = (ubi.texto || '').substring(0, 200) // 🛡️ Límite de seguridad para DB y APIs
    
    // ── INTERCEPTOR: LINK DE GOOGLE MAPS ──────────────────────────────────────
    // Si el cliente pega un link de Maps en lugar de mandar pin GPS, lo extraemos
    if (!ubi.lat && !ubi.lng && textoOriginal.includes('http')) {
      const mapsCoords = await extractCoordsFromMapsUrl(textoOriginal)
      if (mapsCoords && enComitan(mapsCoords.lat, mapsCoords.lng)) {
        console.log(`🔗 [Maps Link] Coords extraídas: ${mapsCoords.lat}, ${mapsCoords.lng}`)
        ubi.lat = mapsCoords.lat
        ubi.lng = mapsCoords.lng
      }
    }

    // ── GUARDIA: INTERCEPTOR DE LIBRETA DE DIRECCIONES EN CÓDIGO ──
    // Vigila que la IA no sea el único punto de falla. Si el cliente escribe "mi casa", cruzamos con BD.
    if (!ubi.lat && !ubi.lng && textoOriginal.length > 2) {
      const labelLimpia = textoOriginal.toLowerCase().trim().replace(/^(mi|la|el|tu|a\s+mi|para\s+mi|rumbo\s+a)\s+/i, '').trim()
      const { data: favs } = await supabase.from('cliente_ubicaciones')
        .select('lat, lng, colonia_nombre, tipo')
        .eq('cliente_telefono', from10)
      if (favs && favs.length > 0) {
        const match = favs.find((f: any) => f.tipo?.toLowerCase() === labelLimpia || textoOriginal.toLowerCase().includes(f.tipo?.toLowerCase()))
        if (match && match.lat && match.lng) {
          console.log(`🛡️ [Address Guard] Interceptado: "${textoOriginal}" => ${match.tipo} (${match.lat}, ${match.lng})`)
          ubi.lat = match.lat
          ubi.lng = match.lng
          ubi.texto = match.colonia_nombre || match.tipo
        }
      }
    }

    if (ubi.lat && ubi.lng) {
      const latKey = ubi.lat.toFixed(3)
      const lngKey = ubi.lng.toFixed(3)
      let barrioMaps: string | null = null
      const { data: cached } = await supabase.from('geocode_cache').select('barrio, hits, created_at').eq('lat_key', latKey).eq('lng_key', lngKey).maybeSingle()

      // BUG-C3 fix: apply a 30-day TTL to geocode_cache entries.
      // Without it, a wrong barrio name returned by Google Maps would be cached forever.
      const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
      const isCacheStale = cached?.created_at
        ? Date.now() - new Date(cached.created_at).getTime() > CACHE_TTL_MS
        : false // if no created_at column yet, keep existing entry

      if (cached && !isCacheStale) {
        barrioMaps = cached.barrio
        supabase.from('geocode_cache').update({ hits: (cached.hits || 0) + 1 }).eq('lat_key', latKey).eq('lng_key', lngKey).then()
      } else {
        // Stale or missing: purge and re-geocode
        if (cached) supabase.from('geocode_cache').delete().eq('lat_key', latKey).eq('lng_key', lngKey).then()
        barrioMaps = await withTimeout(getBarrioFromMaps(ubi.lat, ubi.lng), 3000)
        if (barrioMaps) supabase.from('geocode_cache').insert({ lat_key: latKey, lng_key: lngKey, barrio: barrioMaps }).then()
      }

      // ── H3 + PostGIS: colonia exacta + precio con Regla de Oro ──
      const resolved = await resolveH3Location(supabase, ubi.lat, ubi.lng)
      
      // PRIORIDAD UX: Para la vista del cliente, usamos PRIMERO el nombre de nuestra base de datos (H3).
      // Si el nombre es un color interno (ej. "Zona Verde"), preferimos Google Maps.
      let nombreBD = resolved?.colonia_nombre;
      if (nombreBD) {
        nombreBD = stripPrefijos(nombreBD).replace(/pol[íi]gono/ig, '').trim();
      }
      const esNombreInterno = nombreBD && (nombreBD.toLowerCase().includes('zona ') || nombreBD === 'Zona Extendida' || nombreBD === 'Zona Desconocida');
      const coloniaFinalStr = (nombreBD && !esNombreInterno) 
        ? nombreBD 
        : (barrioMaps ?? nombreBD ?? 'Ubicación GPS');
      
      // Si el cliente mandó un pin de WA que tiene nombre (ej: "Oxxo Centro"), lo agregamos
      const nombreDisplayGps = ubi.texto ? `${ubi.texto.split(/,|\n/)[0].trim()} (${coloniaFinalStr})` : coloniaFinalStr
      
      if (resolved) {
        // Consultar la etiqueta_zona de la colonia para darle prioridad al color
        const { data: colDB } = await supabase.from('colonias').select('etiqueta_zona').eq('id', resolved.colonia_id).maybeSingle()
        const etiquetaZona = colDB?.etiqueta_zona || resolved.colonia_nombre
        
        return {
          colonia: { id: resolved.colonia_id, nombre: nombreDisplayGps, lat: ubi.lat, lng: ubi.lng, precio: resolved.precio },
          zona: { id: null, nombre: etiquetaZona, precio: resolved.precio },
          esGps: true
        }
      }
      return { colonia: { nombre: nombreDisplayGps, lat: ubi.lat, lng: ubi.lng }, zona: { id: null, nombre: 'Zona Extendida (Comitán)' }, esGps: true }
    }

    // ── CACHÉ DE TEXTO: Si ya resolvimos este mismo texto antes, regresar directo ──
    const textCacheKey = `geocache_txt_${textoOriginal.toLowerCase().trim().replace(/[\s,\.]+/g, '_').substring(0, 80)}`
    const textCachedData = await getTextCache(textCacheKey)
    if (textCachedData?.lat && enComitan(textCachedData.lat, textCachedData.lng)) {
      console.log(`📦 [TextCache HIT] "${textoOriginal}" => ${textCachedData.name} (${textCachedData.lat}, ${textCachedData.lng})`)
      const resolved = await resolveH3Location(supabase, textCachedData.lat, textCachedData.lng)
      
      // UX Cliente: Si la BD se llama "Polígono X", no lo mostramos al cliente porque lo confunde.
      const dbName = resolved?.colonia_nombre || ''
      const isInternal = dbName.toLowerCase().includes('políg') || dbName.toLowerCase().includes('polig')
      const nombreCacheDisplay = (dbName && !isInternal) ? `${textoOriginal} (${dbName})` : textCachedData.name
      
      return {
        colonia: { id: resolved?.colonia_id || null, nombre: nombreCacheDisplay, lat: textCachedData.lat, lng: textCachedData.lng, precio: resolved?.precio },
        zona: { id: null, nombre: resolved?.colonia_nombre ?? 'Zona Extendida (Comitán)', precio: resolved?.precio },
        esGps: true
      }
    }

    // ── PASO 2: BÚSQUEDA INTELIGENTE EN BD (gratis, sin APIs externas) ──────────
    // Primero expandir abreviaturas: "ote"→"oriente", "av"→"avenida", etc.
    // Así BD y Maps reciben texto limpio aunque el cliente escriba "7 av ote sur"
    const textoNorm = normalizarAbreviaturas(textoOriginal)
    if (textoNorm !== textoOriginal)
      console.log(`📝 [Abrev] "${textoOriginal}" → "${textoNorm}"`)

    let anclaLat: number | null = null
    let anclaLng: number | null = null
    let anclaRadio = 15000.0 // Default 15km Comitán

    const { data: smartResults } = await supabase.rpc('search_colonia_smart', { query_text: textoOriginal })
    if (smartResults?.length > 0) {
      const top = smartResults[0]
      const score: number = top.score ?? 0
      const palabras = textoOriginal.trim().split(/\s+/).length
      console.log(`🔍 [BD Smart] "${textoOriginal}" → "${top.nombre}" (score: ${score.toFixed(2)}, palabras: ${palabras})`)

      if (score >= 0.35) {
        anclaLat = top.lat
        anclaLng = top.lng
        anclaRadio = 500.0
        console.log(`⚓ [BD Smart Ancla] "${top.nombre}" → restricción de Maps a 500m`)
      }
    }

    // ── PASO 3: NLP con DeepSeek ─────────────────────────────────────────────────
    // DeepSeek extrae JSON estructurado: calle, colonia, referencias, esNegocio
    // "recoges en 2a calle sur, barrio la pilita, entre 3 y 4 oriente" =>
    //   { calle: "2a Calle Sur Oriente", colonia: "Barrio La Pilita", referencias: "entre 3a y 4a Oriente" }
    const nlpData = await limpiarUbicacionTextoConIA(textoNorm)
    const calle      = nlpData.calle        // via principal o negocio
    const coloniaNlp = nlpData.colonia      // barrio/colonia mencionado
    const referencias = nlpData.referencias // cruces, referencias visuales
    const destinatario = nlpData.destinatario
    const telefonoNlp = nlpData.telefono

    console.log(`🤖 [NLP] calle="${calle}" colonia="${coloniaNlp}" ref="${referencias}" dest="${destinatario}" tel="${telefonoNlp}" negocio=${nlpData.esNegocio}`)

    // Refinar ancla con la colonia que extrajo el NLP (si BD no la encontró antes)
    if (!anclaLat && coloniaNlp && coloniaNlp.length > 2) {
      const { data: nlpColList } = await supabase.rpc('search_colonia_smart', { query_text: coloniaNlp })
      if (nlpColList?.length && nlpColList[0].score >= 0.40) {
        anclaLat  = nlpColList[0].lat
        anclaLng  = nlpColList[0].lng
        anclaRadio = 400.0 // buscar en radio de 400m alrededor del centro de la colonia
        console.log(`⚓ [NLP Ancla] "${coloniaNlp}" → ${nlpColList[0].nombre} (${anclaLat}, ${anclaLng})`)
      }
    }

    // NUEVA REGLA: Si el cliente SOLO envió una colonia sin calle ni referencias, pedimos referencias explícitamente.
    // Solo aplica si el cliente mandó texto. Si es GPS, esto ni se ejecuta.
    if ((!calle || calle.length < 3) && (!referencias || referencias.length < 3)) {
      const col = coloniaNlp || (smartResults?.length > 0 ? smartResults[0].nombre : textoOriginal)
      console.log(`⚠️ [NLP] Faltan referencias para la colonia "${col}"`)
      return { requiereAclaracionReferencia: true, coloniaFaltante: col }
    }

    const centroBusqueda = (anclaLat && anclaLng)
      ? { latitude: anclaLat, longitude: anclaLng }
      : { latitude: 16.2516, longitude: -92.1332 }

    const useRestriction = false // NUNCA cegamos a Google Maps. Siempre usamos Bias y filtramos nosotros.
    const biasOrRestriction = { locationBias: { circle: { center: centroBusqueda, radius: anclaRadio } } }

    // Si la BD ya fijó el ancla en la colonia, omitimos el nombre de la colonia en la búsqueda de texto
    // para evitar que Google Maps se confunda con calles que se llamen igual que la colonia.
    let coloniaQuery = coloniaNlp
    if (!!(anclaLat && anclaLng && anclaRadio <= 500)) {
      coloniaQuery = null 
    } else if (coloniaNlp && !/barrio|colonia|col\.|fracc/i.test(coloniaNlp)) {
      coloniaQuery = `Colonia ${coloniaNlp}` 
    }

    // ── PASO 4: GOOGLE MAPS ────────────────────────────────────────────────────
    const queryPartes = [
      calle,
      referencias,               // "entre 3 y 4 avenida" → Maps lo entiende como cruce
      coloniaQuery,
      'Comitán, Chiapas'
    ].filter(Boolean).join(', ')

    // Por orden del usuario, TODO texto debe intentar buscarse en Maps para generar un link (esGps = true)
    if (queryPartes.length > 3) {
      const checkDistancia = (lat: number, lng: number, placeName?: string): boolean => {
        if (!anclaLat || !anclaLng) return true
        
        const p = 0.017453292519943295
        const c = Math.cos
        const a = 0.5 - c((lat - anclaLat) * p) / 2 + c(anclaLat * p) * c(lat * p) * (1 - c((lng - anclaLng) * p)) / 2
        const distMetros = 12742 * Math.asin(Math.sqrt(a)) * 1000
        
        let limite = anclaRadio + 200

        // Si NLP detectó negocio, ampliamos la tolerancia
        if (nlpData.esNegocio) limite = 3500

        // Si el nombre devuelto por Maps coincide fuertemente con lo que escribió el usuario,
        // confiamos en Maps e ignoramos el ancla (asumimos que el ancla fue un falso positivo de la IA)
        if (placeName && textoNorm) {
          const normPlace = placeName.toLowerCase()
          const palabras = textoNorm.split(/\s+/).filter(p => p.length > 4) // ignorar 'de', 'la', 'el'
          if (palabras.some(p => normPlace.includes(p)) || normPlace.includes(textoNorm.toLowerCase())) {
            limite = 5000 // 5km = básicamente aceptarlo mientras esté en Comitán
          }
        }

        if (distMetros > limite) {
          console.warn(`🚫 [Maps] Resultado rechazado: a ${distMetros.toFixed(0)}m del ancla (Límite: ${limite}m)`)
          return false
        }
        return true
      }

      const execPlaces = async () => {
        try {
          const url = 'https://places.googleapis.com/v1/places:searchText'
          const res = await withTimeout(fetch(url, {
            method: 'POST',
            headers: { 'X-Goog-Api-Key': MAPS_KEY, 'X-Goog-FieldMask': 'places.displayName,places.location', 'Content-Type': 'application/json' },
            body: JSON.stringify({ textQuery: queryPartes, ...biasOrRestriction })
          }), 3000)
          if (res) {
            const json = await res.json()
            if (json.places?.length > 0) {
              const validPlaces = []
              for (const p of json.places) {
                const lat = p.location?.latitude, lng = p.location?.longitude
                if (lat && lng && enComitan(lat, lng) && checkDistancia(lat, lng, p.displayName?.text)) {
                  validPlaces.push({ lat, lng, name: p.displayName?.text || calle, source: 'Places API' })
                }
                if (validPlaces.length >= 3) break // Max 3 opciones
              }
              if (validPlaces.length > 0) return validPlaces
            }
          }
        } catch {}
        return null
      }

      const execGeocoding = async () => {
        try {
          let boundsParam = ''
          if (useRestriction && anclaLat && anclaLng) {
            const d = anclaRadio / 111320 // aprox grados
            boundsParam = `&bounds=${anclaLat - d},${anclaLng - d}|${anclaLat + d},${anclaLng + d}`
          }
          const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(queryPartes)}${boundsParam}&key=${MAPS_KEY}`
          const geoRes = await withTimeout(fetch(geoUrl), 3000)
          if (geoRes) {
            const geoJson = await geoRes.json()
            if (geoJson.status === 'OK' && geoJson.results?.length > 0) {
              const gPlace = geoJson.results[0]
              const lat = gPlace.geometry?.location?.lat, lng = gPlace.geometry?.location?.lng
              const isCityOnly = gPlace.types?.includes('locality') && gPlace.types?.includes('political') && gPlace.types?.length <= 2
              if (!isCityOnly && lat && lng && enComitan(lat, lng) && checkDistancia(lat, lng, calle))
                return [{ lat, lng, name: calle, source: 'Geocoding API' }]
            }
          }
        } catch {}
        return null
      }

      // ⚡ Ambas en paralelo
      const [placesRes, geoRes] = await Promise.all([execPlaces(), execGeocoding()])
      const apiResults = placesRes || geoRes

      if (apiResults && apiResults.length > 0) {
        if (apiResults.length > 1) {
          // Si Maps devuelve varias opciones, pero la base de datos interna tiene una colonia con buena confianza, 
          // autoseleccionamos la opción de Maps más cercana al centroide de la colonia.
          // Esto evita forzar al usuario a desambiguar sin perder la precisión GPS exacta de la calle.
          if (smartResults?.length > 0 && (smartResults[0].score ?? 0) >= 0.35) {
            console.log(`🗺️ [Multi-sucursal] Maps devolvió varias opciones, pero la BD confía en "${smartResults[0].nombre}". Autoseleccionando la más cercana al centroide.`)
            const { lat: cLat, lng: cLng } = smartResults[0]
            apiResults.sort((a, b) => {
              const distA = Math.pow(a.lat - cLat, 2) + Math.pow(a.lng - cLng, 2)
              const distB = Math.pow(b.lat - cLat, 2) + Math.pow(b.lng - cLng, 2)
              return distA - distB
            })
            apiResults.splice(1) // Conservar solo la mejor
          } else {
            console.log(`🗺️ [Multi-sucursal] Se encontraron ${apiResults.length} opciones para "${calle}"`)
            return {
              requiereAclaracion: true,
              opciones: apiResults.map(r => ({ lat: r.lat, lng: r.lng, name: r.name, source: r.source }))
            }
          }
        }

        if (apiResults.length > 0) {
          const apiResult = apiResults[0]
          console.log(`🗺️ [${apiResult.source}] "${apiResult.name}" en ${apiResult.lat}, ${apiResult.lng}`)
          // Guardar en caché el texto original → coords (evita repetir para el mismo mensaje)
          setTextCache(textCacheKey, apiResult.lat, apiResult.lng, apiResult.name)
          if (apiResult) {
            const resolved = await resolveH3Location(supabase, apiResult.lat, apiResult.lng)
            // Mostrar colonia de PostGIS + calle que dio Maps como contexto, EXCEPTO si es "Polígono X"
            const dbName = resolved?.colonia_nombre || ''
            const isInternal = dbName.toLowerCase().includes('políg') || dbName.toLowerCase().includes('polig')
            const nombreDisplay = (dbName && !isInternal)
              ? `${calle} (${dbName})`
              : apiResult.name
            return {
              colonia: { id: resolved?.colonia_id || null, nombre: nombreDisplay, lat: apiResult.lat, lng: apiResult.lng, precio: resolved?.precio },
              zona: { id: null, nombre: resolved?.colonia_nombre ?? 'Zona Extendida (Comitán)', precio: resolved?.precio },
              esGps: true, destinatario, telefono: telefonoNlp
            }
          }
        }
      }
    }

    // ── PASO 5: FALLBACK FINAL — el mejor resultado BD aunque sea baja confianza ──
    if (smartResults?.length > 0) {
      const fallback = smartResults[0]
      console.log(`🆘 [BD Fallback] Usando "${fallback.nombre}" (score: ${fallback.score?.toFixed(2)}) como último recurso`)
      if (fallback) {
        // Obtenemos el precio directamente de la tabla colonias para asegurar exactitud con la base de datos
        const { data: colData } = await supabase.from('colonias').select('precio').eq('id', fallback.id).maybeSingle()
        const precioOficial = colData?.precio || fallback.precio || 45

        const fallbackNombreDisplay = calle ? `${calle} (${fallback.nombre})` : fallback.nombre
        return {
          colonia: { id: fallback.id, nombre: fallbackNombreDisplay, lat: fallback.lat, lng: fallback.lng, precio: precioOficial },
          zona: { id: null, nombre: fallback.nombre, precio: precioOficial },
          esGps: false, destinatario, telefono: telefonoNlp
        }
      }
    }

    return null
  }

  const [resOrigen, resDestino] = await Promise.all([
    resolverUbicacion(mandaditoState.origen),
    resolverUbicacion(mandaditoState.destino)
  ])

  // Manejo de Aclaraciones (Múltiples sucursales)
  if (resOrigen?.requiereAclaracion) {
    let textoOpciones = resOrigen.opciones.map((o: any, i: number) => `${i + 1}️⃣ ${o.name}`).join('\n')
    textoOpciones += `\n${resOrigen.opciones.length + 1}️⃣ ❌ Ninguna de las anteriores`
    await sendWA(fromPhone, `🤔 Encontré varias opciones para el *origen*, ¿a cuál te refieres?\n\n${textoOpciones}\n\n_Responde con el número de la opción._`)
    await supabase.from('bot_memory').upsert({
      phone: `mandadito_state_${from10}`,
      history: [{ step: 1.5, opciones: resOrigen.opciones, originalState: mandaditoState }],
      updated_at: new Date().toISOString()
    })
    return
  }

  // Manejo de Aclaración de Referencias (Origen)
  if (resOrigen?.requiereAclaracionReferencia) {
    await sendWA(fromPhone, `📝 Veo que vas a *${resOrigen.coloniaFaltante}*, pero es un área grande. Para darte el precio exacto, ¿me podrías indicar la *calle* o *alguna referencia* (ej. cerca del Oxxo)?`)
    await supabase.from('bot_memory').upsert({
      phone: `mandadito_state_${from10}`,
      history: [{ step: 1.6, coloniaAnterior: resOrigen.coloniaFaltante, originalState: mandaditoState }],
      updated_at: new Date().toISOString()
    })
    return
  }

  if (resDestino?.requiereAclaracion) {
    let textoOpciones = resDestino.opciones.map((o: any, i: number) => `${i + 1}️⃣ ${o.name}`).join('\n')
    textoOpciones += `\n${resDestino.opciones.length + 1}️⃣ ❌ Ninguna de las anteriores`
    await sendWA(fromPhone, `🤔 Encontré varias opciones para el *destino*, ¿a cuál te refieres?\n\n${textoOpciones}\n\n_Responde con el número de la opción._`)
    await supabase.from('bot_memory').upsert({
      phone: `mandadito_state_${from10}`,
      history: [{ step: 2.5, opciones: resDestino.opciones, originalState: mandaditoState }],
      updated_at: new Date().toISOString()
    })
    return
  }

  // Manejo de Aclaración de Referencias (Destino)
  if (resDestino?.requiereAclaracionReferencia) {
    await sendWA(fromPhone, `📝 Veo que vas a *${resDestino.coloniaFaltante}*, pero es un área grande. Para darte el precio exacto, ¿me podrías indicar la *calle* o *alguna referencia* (ej. cerca del Oxxo)?`)
    await supabase.from('bot_memory').upsert({
      phone: `mandadito_state_${from10}`,
      history: [{ step: 2.6, coloniaAnterior: resDestino.coloniaFaltante, originalState: mandaditoState }],
      updated_at: new Date().toISOString()
    })
    return
  }

  if (!resOrigen || !resDestino) {
    const msgs = []
    if (!resOrigen) msgs.push(`❌ *Origen no encontrado:* ${mandaditoState.origen?.texto || 'Ubicación desconocida'}`)
    if (!resDestino) msgs.push(`❌ *Destino no encontrado:* ${mandaditoState.destino?.texto || 'Ubicación desconocida'}`)
    
    await sendWA(fromPhone, `😔 No logré ubicar el origen o destino. Intenta escribir el nombre de otra forma o envíanos tu *Ubicación GPS* 📍\n\n${msgs.join('\n')}`)
    return
  }

  const { colonia: origenDB, zona: zonaOrigen, esGps: origenEsGps, destinatario: destOrigen, telefono: telOrigen }  = resOrigen
  const { colonia: destinoDB, zona: zonaDestino, esGps: destinoEsGps, destinatario: destDestino, telefono: telDestino } = resDestino


  let precioFinal: number | null = null

  // ── Fase 2: Una sola función PostgreSQL calcula el precio completo ───────────
  // calcular_precio_mandadito resuelve ambas coords, aplica Regla de Oro,
  // consulta tarifas_zona y redondea — todo en un viaje a la BD.
  if (origenDB?.lat && destinoDB?.lat) {
    const { data: cotizacion } = await supabase.rpc('calcular_precio_mandadito', {
      p_lat_origen:  origenDB.lat,
      p_lng_origen:  origenDB.lng,
      p_lat_destino: destinoDB.lat,
      p_lng_destino: destinoDB.lng,
    })
    const cot = Array.isArray(cotizacion) ? cotizacion[0] : cotizacion
    if (cot?.precio_final) {
      precioFinal = cot.precio_final
      console.log(`[PRECIO] 🚀 BD: ${cot.etiqueta_origen} → ${cot.etiqueta_destino} | Extra km: $${Number(cot.extra_km ?? 0).toFixed(0)} → Final: $${precioFinal}`)
    }
  }

  // ── Fallback: si la función de BD no respondió, calcular manualmente ─────────
  if (precioFinal === null && origenDB?.lat && destinoDB?.lat) {
    const distKm = ((lat1: number, lon1: number, lat2: number, lon2: number) => {
      const p = 0.017453292519943295; const c = Math.cos
      const a = 0.5 - c((lat2-lat1)*p)/2 + c(lat1*p)*c(lat2*p)*(1-c((lon2-lon1)*p))/2
      return 12742 * Math.asin(Math.sqrt(a))
    })(origenDB.lat, origenDB.lng, destinoDB.lat, destinoDB.lng)
    const pOrigen  = typeof origenDB?.precio  === 'number' ? origenDB.precio  : 45
    const pDestino = typeof destinoDB?.precio === 'number' ? destinoDB.precio : 45
    const baseCalculada = Math.max(pOrigen, pDestino)
    let extraDistancia = 0
    if (!origenDB?.id || !destinoDB?.id) {
      extraDistancia = distKm > 3.5 ? (distKm - 3.5) * 8 : 0
    }
    let tarifaSugerida = Math.round(baseCalculada + extraDistancia)
    if (tarifaSugerida % 5 !== 0) tarifaSugerida = Math.ceil(tarifaSugerida / 5) * 5
    precioFinal = tarifaSugerida
    console.log(`[PRECIO] ⚠️ Fallback: $${pOrigen} vs $${pDestino} | Extra km: $${extraDistancia.toFixed(0)} → $${precioFinal}`)
  }



  if (precioFinal === null) {
    await sendWA(fromPhone, `🤔 Todavía no tenemos un precio definido. Por favor consúltalo directamente con nosotros.`)
    return
  }

  let recargoAplicado = false
  if (modoLluvia) {
    precioFinal += recargoLluvia
    recargoAplicado = true
  }

  // Extraer referencias del texto original del cliente (lo que viene después de la calle y colonia)
  const extraerRefDeTexto = (textoOriginal: string | undefined, calleNombre: string | undefined): string | null => {
    if (!textoOriginal || !calleNombre) return null
    // Si el texto del cliente es más largo que el nombre de la calle, el resto son referencias
    const textoLimpio = textoOriginal.trim()
    const calleIdx = textoLimpio.toLowerCase().indexOf(calleNombre.toLowerCase())
    if (calleIdx >= 0) {
      const despuesDeCalle = textoLimpio.slice(calleIdx + calleNombre.length).trim()
      if (despuesDeCalle.length > 5) return despuesDeCalle.replace(/^[,.-\s]+/, '').trim()
    }
    // Si el texto es más del doble que el nombre de la calle, probablemente hay referencias
    if (textoLimpio.length > (calleNombre.length * 2 + 20)) {
      // Tomar lo que viene después de la primera mención de colonia o coma
      const parts = textoLimpio.split(/,|\n/)
      if (parts.length > 1) return parts.slice(1).join(', ').trim().replace(/^[,.-\s]+/, '')
    }
    return null
  }

  const origenInfo = mandaditoState.origen?.texto || 'Ubicación GPS'
  const destinoInfo = mandaditoState.destino?.texto || 'Ubicación GPS'
  const refsInfo = mandaditoState.referencias || extraerRefDeTexto(mandaditoState.origen?.texto, origenDB?.nombre) || extraerRefDeTexto(mandaditoState.destino?.texto, destinoDB?.nombre) || null

  // ── Llamada final a IA para generar resumen estructurado ──
  const resumenIA = await extraerResumenFinalIA(origenInfo, destinoInfo, refsInfo, from10)
  
  // Refinamiento final de visualización (priorizar lo que resolvió Google/Base de datos si la IA devolvió algo crudo)
  const origenDisplay = resumenIA.origenLimpio || origenDB?.nombre || 'Ubicación GPS'
  const destinoDisplay = resumenIA.destinoLimpio || destinoDB?.nombre || 'Ubicación GPS'
  
  const lblOrigen  = `${origenDisplay}${resOrigen?.esGps ? ' 📍' : ''}`
  const lblDestino = `${destinoDisplay}${resDestino?.esGps ? ' 📍' : ''}`

  const formatLugar = (lbl: string, remitente: string|null, receptor: string|null, tel: string|null) => {
    let linea = lbl
    if (remitente) linea += `\n   👤 *A nombre de:* ${remitente}`
    if (receptor) linea += `\n   👤 *Recibe:* ${receptor}`
    if (tel) linea += `\n   📞 *Tel:* ${tel}`
    return linea
  }

  // Tratamos de adivinar si el remitente o receptor pertenecen al origen o destino.
  // Por simplicidad en la UI:
  const bloqueOrigen = formatLugar(lblOrigen, resumenIA.remitente, null, null)
  const bloqueDestino = formatLugar(lblDestino, null, resumenIA.receptor, resumenIA.telefono)

  // ── Calcular distancia para mostrarla en la tarjeta ──────────────────────
  let distKmStr = ''
  if (origenDB?.lat && destinoDB?.lat) {
    const p = 0.017453292519943295
    const c = Math.cos
    const a = 0.5 - c((destinoDB.lat - origenDB.lat) * p) / 2
      + c(origenDB.lat * p) * c(destinoDB.lat * p) * (1 - c((destinoDB.lng - origenDB.lng) * p)) / 2
    const dist = 12742 * Math.asin(Math.sqrt(a))
    
    // 🛡️ GUARDIÁN DE ROBUSTEZ: Límite de 30km
    if (dist > 30.0) {
      console.log(`[COTIZACION RECHAZADA] Distancia excesiva: ${dist.toFixed(2)}km. Origen: ${origenDB?.lat}, Destino: ${destinoDB?.lat}`)
      await sendWA(fromPhone, `😔 *Distancia fuera de cobertura*\n\nLa ruta calculada es de *${dist.toFixed(1)} km*, lo cual supera nuestro límite máximo de *30 km* para mandaditos.\n\nPor favor intenta enviarnos una ubicación diferente o comunícate con soporte si crees que es un error.`)
      return
    }

    distKmStr = `(~${dist.toFixed(1)} km)`
    console.log(`[COTIZACION FINAL] Origen: ${origenDB?.nombre} (Zona: ${zonaOrigen?.nombre}), Destino: ${destinoDB?.nombre} (Zona: ${zonaDestino?.nombre}), Distancia calculada: ${dist.toFixed(2)}km, Precio Total Cobrado: $${precioFinal}`)
  } else {
    console.log(`[COTIZACION FINAL] Origen: ${origenDB?.nombre} (Zona: ${zonaOrigen?.nombre}), Destino: ${destinoDB?.nombre} (Zona: ${zonaDestino?.nombre}), Sin GPS, Precio Total Cobrado: $${precioFinal}`)
  }

  // ── Tarjeta de cotización limpia para el cliente (sin info técnica de zonas ni mapas) ──
  const separador = `━━━━━━━━━━━━━━━━━━━━━━━━`
  let msj = [
    `🛵 *COTIZACIÓN DE MANDADITO*`,
    separador,
    ``,
    `📍 *Recoger en:*  ${bloqueOrigen}`,
    `🏁 *Entregar en:* ${bloqueDestino}`,
    resumenIA.orden ? `🎫 *Orden/Ticket:* ${resumenIA.orden}` : '',
    resumenIA.detalles ? `📝 *Seña/Ref:*     _${resumenIA.detalles}_` : '',
    ``,
    separador,
    `💵 *Precio: $${precioFinal}*${ recargoAplicado ? `  _(incluye recargo lluvia 🌧️)_` : '' }`,
    separador,
    ``,
    `¿Confirmamos y te asignamos un repartidor? 🛵`,
  ].filter(l => l !== '').join('\n')

  // Bug fix: usar from10 directamente (from10Derived fue eliminado en fix anterior)
  const guardarUbicacionesCotizacion = async () => {
    const upsertOpts = { onConflict: 'cliente_telefono,tipo,colonia_nombre' }
    const updates: Promise<any>[] = []
    if (origenDB?.nombre) {
      updates.push(supabase.from('cliente_ubicaciones').upsert({
        cliente_telefono: from10,
        tipo: 'origen', colonia_nombre: origenDB.nombre,
        colonia_id: origenDB.id ?? null,
        lat: origenDB.lat ?? null, lng: origenDB.lng ?? null,
        ultima_vez: new Date().toISOString()
      }, upsertOpts))
    }
    if (destinoDB?.nombre) {
      updates.push(supabase.from('cliente_ubicaciones').upsert({
        cliente_telefono: from10,
        tipo: 'destino', colonia_nombre: destinoDB.nombre,
        colonia_id: destinoDB.id ?? null,
        lat: destinoDB.lat ?? null, lng: destinoDB.lng ?? null,
        ultima_vez: new Date().toISOString()
      }, upsertOpts))
    }
    await Promise.allSettled(updates)
  }
  guardarUbicacionesCotizacion().catch(e => console.error('[ubicaciones] Error guardando:', e))

  // Guardar cotización en estado para el botón de confirmación
  await supabase.from('bot_memory').upsert({
    phone: `mandadito_cotiz_${from10}`,
    history: [{
      precio: precioFinal,
      lblOrigen, lblDestino,
      origenId: origenDB?.id || null,
      destinoId: destinoDB?.id || null,
      referencias: resumenIA.detalles || mandaditoState.referencias || null,
      ts: Date.now()
    }],
    updated_at: new Date().toISOString()
  })

  // Se eliminó la generación de imágenes del mapa a petición del cliente para tener un chat limpio.
  await sendInteractiveButtons(fromPhone, msj, [
    { id: `CONFIR_MAND_EFECTIVO_${from10}`, title: '💵 Pago Efectivo' },
    { id: `CONFIR_MAND_TRANSF_${from10}`, title: '💳 Transferencia' },
    { id: `CANCELAR_MANDADITO`, title: '❌ Cancelar' }
  ])
}
