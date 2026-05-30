import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { conversacionDeepSeek } from '../whatsapp-bot/ai.ts'
import { sendWA, sendWALocation, sendInteractiveButtons } from '../whatsapp-bot/whatsapp.ts'
import { guardarMemoria } from '../whatsapp-bot/db.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const sendWAMulti = async (to: string, texto: string) => {
  const partes = texto.split('|||').map(p => p.trim()).filter(Boolean)
  for (let i = 0; i < partes.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 600))
    await sendWA(to, partes[i])
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MÁQUINA DE ESTADOS — Registro de cliente no registrado
// El CÓDIGO controla cada paso. La IA NO participa en este flujo.
//
// Paso 0: Primer contacto   → saludar, pedir nombre
// Paso 1: Recibe nombre     → validar, guardar, pedir colonia
// Paso 2: Recibe colonia    → guardar, pedir dirección (texto o ubicación)
// Paso 3: Recibe dirección  → guardar, mostrar resumen + botones SI/NO
// Paso 4: Recibe SI/NO      → registrar o reiniciar
// ════════════════════════════════════════════════════════════════════════════
async function handleRegistrationFlow(
  supabase: any,
  fromPhone: string,
  from10: string,
  texto: string,
  regState: { nombre?: string; tel?: string; colonia?: string; direccion?: string; lat?: number; lng?: number; step?: number; ts?: number } | undefined,
  locationData?: { lat: number; lng: number; address?: string; name?: string } | null
): Promise<boolean> {
  // ── TTL: Si el reg_state tiene más de 24h, reiniciar ─────────────────────
  const REG_TTL_MS = 24 * 60 * 60 * 1000
  if (regState?.ts && Date.now() - regState.ts > REG_TTL_MS) {
    await supabase.from('bot_memory').delete().eq('phone', `reg_state_${from10}`)
    regState = { tel: from10, step: 0 }
    console.log(`⏰ [RegSM] TTL expirado para ${from10} — reiniciando`)
  }

  const step      = regState?.step ?? 0
  const nombre    = regState?.nombre?.trim()    ?? ''
  const colonia   = regState?.colonia?.trim()   ?? ''
  const direccion = regState?.direccion?.trim()  ?? ''
  const msg       = texto.trim()

  const save = async (patch: Record<string, any>) => {
    const next = { nombre, tel: from10, colonia, direccion, lat: regState?.lat, lng: regState?.lng, step, ts: Date.now(), ...patch }
    await supabase.from('bot_memory').upsert({
      phone: `reg_state_${from10}`,
      history: [next],
      updated_at: new Date().toISOString()
    })
    console.log(`💾 [RegSM] step=${next.step} | nombre="${next.nombre}" | colonia="${next.colonia}" | dir="${next.direccion}"`)
  }

  const showConfirmation = async (coloniaFinal: string, dirFinal: string, latFinal?: number, lngFinal?: number) => {

    await sendWA(fromPhone,
      `¡Perfecto! Confirma tus datos 📋\n\n` +
      `👤 Nombre: *${nombre}*\n` +
      `📱 Tel: *${from10}*\n` +
      `🏠 Colonia: *${coloniaFinal}*\n` +
      `📍 Dirección: *${dirFinal}*`
    )
    // Mandar mapa real de WhatsApp si tenemos coordenadas
    if (latFinal && lngFinal) {
      await sendWALocation(fromPhone, latFinal, lngFinal, coloniaFinal, dirFinal)
    }
    await sendInteractiveButtons(fromPhone, '¿Todo correcto? 😊', [
      { id: `REG_CONFIRM_SI_${from10}`, title: '✅ Sí, registrarme' },
      { id: `REG_CONFIRM_NO_${from10}`, title: '❌ No, corregir' }
    ])
  }

  // ── PASO 0: Primer contacto ───────────────────────────────────────────────
  if (step === 0) {
    // Guard: ¿ya tiene una solicitud pendiente? (BUG-10 fix: 24h TTL)
    const { data: pending } = await supabase.from('bot_memory')
      .select('history').eq('phone', `pending_reg_${from10}`).maybeSingle()
    if (pending?.history?.[0]) {
      const solicitado = new Date(pending.history[0].solicitado).getTime()
      if (Date.now() - solicitado > 24 * 60 * 60 * 1000) {
        // Expiró, lo borramos silenciosamente y dejamos que se registre de nuevo
        await supabase.from('bot_memory').delete().eq('phone', `pending_reg_${from10}`)
        console.log(`⏰ [RegSM] pending_reg expirado para ${from10}`)
      } else {
        await sendWA(fromPhone,
          `⏳ Ya tienes una solicitud de registro pendiente.\nEn cuanto el equipo la revise, te avisamos aquí. 😊`
        )
        return true
      }
    }
    // Guard: ¿ya está registrado en clientes como VIP completo?
    const { data: yaCliente } = await supabase.from('clientes')
      .select('nombre, acepta_terminos').ilike('telefono', `%${from10}%`).maybeSingle()
    if (yaCliente && yaCliente.acepta_terminos === true) {
      await sendWA(fromPhone,
        `✅ *${yaCliente.nombre}*, ya estás registrado en Estrella Delivery.\n🔗 https://www.app-estrella.shop/loyalty/`
      )
      await supabase.from('bot_memory').delete().eq('phone', `reg_state_${from10}`)
      return true
    }
    await save({ step: 1 })
    await sendWAMulti(fromPhone,
      `👋 ¡Hola! Soy el asistente virtual de *Estrella Delivery* 🌟` +
      `|||Para brindarte un mejor servicio y beneficios VIP, vamos a registrarte. Como tu número ya está vinculado (*${from10}*), ¡no necesitas escribirlo! 📱` +
      `|||¿Me podrías decir tu *nombre completo*? 👤`
    )
    return true
  }

  // ── PASO 1: Esperando nombre ──────────────────────────────────────────────
  if (step === 1) {
    if (msg.length < 3 || /^\d+$/.test(msg)) {
      await sendWA(fromPhone, `👤 Por favor escríbeme tu *nombre completo* (ej: Juan Pérez).`)
      return true
    }
    await save({ nombre: msg, step: 2 })
    await sendWAMulti(fromPhone,
      `¡Perfecto, *${msg.split(' ')[0]}*! 👋` +
      `|||¿En qué *colonia* vives? Escríbela o comparte tu 📌 *ubicación* (botón 📎 → Ubicación) y listo.`
    )
    return true
  }

  // ── PASO 2: Esperando colonia (o ubicación directa) ──────────────────────
  if (step === 2) {
    // Caso A: El cliente compartió su ubicación en este paso → la usamos como colonia+dirección
    if (locationData) {
      const { lat, lng, address, name } = locationData
      // Guard: coordenadas inválidas (null island 0,0)
      if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) {
        await sendWA(fromPhone, `⚠️ No pude leer tu ubicación. ¿Intenta de nuevo o escribe tu dirección?`)
        return true
      }
      // BUG-12 fix: extraer colonia inteligente — evitar tomar la ciudad como colonia
      // address suele ser: "Calle, Colonia, Ciudad, Estado, Código"
      const partes = (address || '').split(',').map(p => p.trim()).filter(Boolean)
      const ESTADO_MUNICIPIO = ['comitán', 'comitan', 'chiapas', 'méxico', 'mexico']
      const coloniaDeUbicacion = partes.find((p, i) =>
        i > 0 && i < partes.length - 2 && !ESTADO_MUNICIPIO.some(c => p.toLowerCase().includes(c))
      ) || partes[1]?.trim() || partes[0]?.trim() || `${lat},${lng}`
      const dirCompleta = address || name || `${lat},${lng}`

      await save({ colonia: coloniaDeUbicacion, direccion: dirCompleta, lat, lng, step: 4 })
      await showConfirmation(coloniaDeUbicacion, dirCompleta, lat, lng)
      return true
    }

    // Caso B: Escribió texto como colonia
    if (msg.length < 3 || /^\d+$/.test(msg)) {
      await sendWA(fromPhone, `🏠 Por favor dime tu *colonia* (ej: La Esperanza, Centro...)`)
      return true
    }
    await save({ colonia: msg, step: 3 })
    await sendWAMulti(fromPhone,
      `¡Gracias! Ya casi 😊` +
      `|||📍 ¿Cuál es tu *dirección*? Escríbela o comparte tu *📌 ubicación* desde WhatsApp (botón 📎 → Ubicación).`
    )
    return true
  }

  // ── PASO 3: Esperando dirección (texto o pin de ubicación) ───────────────
  if (step === 3) {
    // Caso A: Cliente compartió su ubicación (pin de Google Maps)
    if (locationData) {
      const { lat, lng, address, name } = locationData
      const dirGuardada = address || name || `${lat}, ${lng}`
      await save({ direccion: dirGuardada, lat, lng, step: 4 })
      await showConfirmation(colonia, dirGuardada, lat, lng)
      return true
    }

    // Caso B: Cliente escribió su dirección como texto
    if (msg.length < 5) {
      await sendWAMulti(fromPhone,
        `📍 Por favor escribe tu *dirección completa* (ej: Calle Niños Héroes #12, Col. Centro)` +
        `|||...o usa el botón 📎 → *Ubicación* para compartir tu pin de Google Maps.`
      )
      return true
    }
    await save({ direccion: msg, step: 4 })
    await showConfirmation(colonia, msg)
    return true
  }

  // ── PASO 4: Esperando confirmación (viene de botones SI/NO) ───────────────
  if (step === 4) {
    const lower = msg.toLowerCase().trim()
    // BUG-08 fix: usar palabras completas para evitar falsos positivos (ej: "mal" en "mándalo")
    const wordMatch = (words: string[]) => words.some(w => new RegExp(`\\b${w}\\b`, 'i').test(lower) || lower === w)
    const esConfirmacion = wordMatch(['si', 'sí', 'yes', 'ok', 'correcto', 'exacto', 'confirmo', 'dale', 'va', 'listo', 'perfecto', 'claro', '✅'])
    const esRechazo = wordMatch(['no', 'nop', 'mal', 'error', 'cambiar', 'equivocado', 'incorrecto', 'cancel', 'reiniciar'])

    if (esRechazo) {
      // BUG-01 fix: un solo upsert reemplaza el estado — sin delete previo que puede dejar orphan state
      await supabase.from('bot_memory').upsert({
        phone: `reg_state_${from10}`,
        history: [{ nombre: '', tel: from10, colonia: '', direccion: '', lat: null, lng: null, step: 1, ts: Date.now() }],
        updated_at: new Date().toISOString()
      })
      await sendWAMulti(fromPhone, `Sin problema 😊 Vamos de nuevo.|||¿Cuál es tu *nombre completo*? 👤`)
      return true
    }

    if (esConfirmacion) {
      // Validar datos mínimos
      if (!nombre || !colonia) {
        await supabase.from('bot_memory').delete().eq('phone', `reg_state_${from10}`)
        await save({ nombre: '', colonia: '', direccion: '', step: 1 })
        await sendWAMulti(fromPhone, `⚠️ Faltan datos. Vamos a reiniciar.|||¿Cuál es tu *nombre completo*? 👤`)
        return true
      }

      const lat = regState?.lat
      const lng = regState?.lng
      const mapLink = lat && lng ? `\n📍 https://maps.google.com/?q=${lat},${lng}` : ''

      // Guardar solicitud pendiente para el admin
      await supabase.from('bot_memory').upsert({
        phone: `pending_reg_${from10}`,
        history: [{
          nombre, telefono: from10, colonia,
          direccion, lat, lng,
          solicitado: new Date().toISOString()
        }],
        updated_at: new Date().toISOString()
      })

      // Notificar al admin
      const ADMIN_PHONES_ENV = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''
      const admin10 = ADMIN_PHONES_ENV.split(',')[0]?.trim() || ''
      if (admin10) {

        await sendWA(`52${admin10}`,
          `🔔 *Nueva Solicitud VIP*\n\n` +
          `👤 Nombre: ${nombre}\n📞 Tel: ${from10}\n` +
          `🏠 Colonia: ${colonia}\n📍 Dir: ${direccion || 'no especificada'}`
        )
        // BUG-07 fix: mandar mapa real al admin si hay coordenadas
        if (lat && lng) {
          await sendWALocation(`52${admin10}`, lat, lng, `${nombre} — ${colonia}`, direccion || colonia)
        }
        await sendInteractiveButtons(`52${admin10}`, '¿Aprobar solicitud?', [
          { id: `reg_accept_${from10}`, title: '✅ Aprobar' },
          { id: `reg_reject_${from10}`, title: '❌ Rechazar' }
        ])
      }

      await sendWAMulti(fromPhone,
        `🎉 ¡Excelente, *${(nombre.split(' ')[0] || nombre) || 'amigo/a'}*!` +
        `|||Tu solicitud fue enviada. En unos minutos recibirás tu confirmación y código QR aquí mismo. ⏳`
      )

      // Limpiar estado de registro
      await supabase.from('bot_memory').delete().eq('phone', `reg_state_${from10}`)
      await supabase.from('bot_memory').delete().eq('phone', from10)
      return true
    }

    // Respuesta ambigua → repetir botones
    const mapLink = regState?.lat && regState?.lng
      ? `\n📍 https://maps.google.com/?q=${regState.lat},${regState.lng}`
      : ''

    await sendWA(fromPhone,
      `¿Confirmas estos datos? 😊\n\n` +
      `👤 *${nombre}* | 📱 *${from10}*\n🏠 *${colonia}* | 📍 *${direccion}*` + mapLink
    )
    await sendInteractiveButtons(fromPhone, '¿Todo correcto?', [
      { id: `REG_CONFIRM_SI_${from10}`, title: '✅ Sí, registrarme' },
      { id: `REG_CONFIRM_NO_${from10}`, title: '❌ No, corregir' }
    ])
    return true
  }

  return false
}

// ════════════════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  try {
    const {
      fromPhone, from10, texto,
      isRepartidor, repartidorInfo,
      isClient, clienteCtx, regState,
      locationData
    } = await req.json()

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    console.log(`🤖 [whatsapp-ai] ${fromPhone} | registrado=${!!clienteCtx} | step=${regState?.step ?? 0}`)

    // ── CLIENTE NO REGISTRADO → Máquina de estados (sin IA, sin loops) ──────
    if (!clienteCtx) {
      const handled = await handleRegistrationFlow(
        supabase, fromPhone, from10, texto, regState, locationData
      )
      if (handled) return new Response('OK', { status: 200 })
    }

    // ── CLIENTE REGISTRADO / REPARTIDOR → IA conversacional ─────────────────
    const resAI = await conversacionDeepSeek(
      supabase, fromPhone, texto,
      isRepartidor, repartidorInfo,
      isClient, clienteCtx, regState
    )

    if (resAI?.errorObj) {
      await sendWA(fromPhone, `⚠️ Tuvimos un problema. Reintenta en unos minutos.`)
      return new Response('OK', { status: 200 })
    }

    if (!resAI?.respuesta) return new Response('OK', { status: 200 })

    if (resAI.nuevoHistorial) {
      await guardarMemoria(supabase, from10, resAI.nuevoHistorial)
    }

    const accion = resAI.respuesta.accion
    const d = resAI.respuesta.datosAExtraer as any

    if (accion === 'REGISTRAR_RESTAURANTE') {
      const nombreRest = d?.nombre_restaurante?.trim()
      const correo = d?.correo?.trim()
      // BUG-09 fix: validar antes de insertar
      if (!nombreRest || !correo || !correo.includes('@')) {
        await sendWA(fromPhone, `⚠️ Para registrar el restaurante necesito su *nombre* y un *correo electrónico válido*.`)
        return new Response('OK', { status: 200 })
      }
      const { error: restErr } = await supabase.from('restaurantes_solicitudes').insert({ nombre_restaurante: nombreRest, correo, telefono: from10 })
      if (restErr) {
        console.error('[REST_SOL] Error insertando:', restErr)
        await sendWA(fromPhone, `❌ Hubo un error guardando tu solicitud. Inténtalo en un momento.`)
        return new Response('OK', { status: 200 })
      }
      const ADMIN_PHONES_ENV = Deno.env.get('ADMIN_PHONES') ?? Deno.env.get('ADMIN_PHONE') ?? ''
      const admin10 = ADMIN_PHONES_ENV.split(',')[0]?.trim() || ''
      const functionUrl = `${SUPABASE_URL}/functions/v1/admin-approval`
      const secret = Deno.env.get('ADMIN_APPROVAL_SECRET') || ''
      if (admin10) {
        await sendWA(`52${admin10}`, `🔔 *Nueva Solicitud de Restaurante*\nNombre: ${nombreRest}\nCorreo: ${correo}\nTel: wa.me/52${from10}`)
        await sendWA(`52${admin10}`, `✅ ${functionUrl}?action=accept&tel=${from10}&secret=${secret}`)
        await sendWA(`52${admin10}`, `❌ ${functionUrl}?action=reject&tel=${from10}&secret=${secret}`)
      }
      await sendWA(fromPhone, `🎉 Solicitud enviada. Te confirmamos pronto. ✉️`)
      await supabase.from('bot_memory').delete().eq('phone', from10)
    } else {
      const aiMsg = typeof resAI.respuesta.mensajeUsuario === 'string' && resAI.respuesta.mensajeUsuario.trim()
        ? resAI.respuesta.mensajeUsuario
        : '¡Hola! ¿En qué puedo ayudarte hoy? 😊'
      await sendWAMulti(fromPhone, aiMsg)
    }

    console.log(`✅ [whatsapp-ai] Listo para ${fromPhone} (${accion})`)
    return new Response('OK', { status: 200 })

  } catch (error: any) {
    console.error(`❌ [whatsapp-ai] Error crítico:`, error)
    return new Response('Internal Server Error', { status: 500 })
  }
})
