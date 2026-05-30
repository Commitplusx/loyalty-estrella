import { handleAdminMessage, executeAdminAction } from './whatsapp-bot/admin-handler.ts'
import { handleRepMessage } from './whatsapp-bot/rep-handler.ts'
import { handleRestaurantCommand } from './whatsapp-bot/restaurant-b2b-handler.ts'

console.log('🌟 INICIANDO SIMULACIÓN TOTAL DEL SISTEMA (LOYALTY ESTRELLA) 🌟\n')

// -- MOCKS --
let db: any = {
  clientes: [{ id: 1, telefono: '529630000000', nombre: 'Juan Cliente', puntos: 0, rango: 'bronce', acepta_terminos: false }],
  restaurantes: [{ id: 10, telefono: '529630000010', nombre_restaurante: 'Burger B2B', acepta_terminos: true }],
  repartidores: [{ id: 20, user_id: 'user20', telefono: '529630000020', nombre: 'Pedro Rep' }],
  pedidos: []
}

let sentMessages: string[] = []

// Override global fetch to mock Meta API (sendWA) and DeepSeek API
globalThis.fetch = async (url: string, opts: any) => {
  if (url.includes('messages')) {
    const body = JSON.parse(opts.body)
    const text = body.text?.body || body.interactive?.body?.text || body.template?.name || 'MEDIA'
    sentMessages.push(`📱 WhatsApp a ${body.to}: ${text.replace(/\n/g, ' ')}`)
    return new Response(JSON.stringify({ messages: [{ id: 'msg123' }] }), { status: 200 })
  }
  if (url.includes('deepseek')) {
    const prompt = JSON.parse(opts.body).messages.pop().content
    let accion = 'RESPONDER'
    let mensaje = 'Hola soy IA'
    if (prompt.includes('suma')) { accion = 'SUMAR_PUNTOS' }
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ accion, mensajeUsuario: mensaje, datosAExtraer: { clienteTel: '9630000000', puntosASumar: 10 } }) } }]
    }), { status: 200 })
  }
  return new Response('OK', { status: 200 })
}

const originalEnvGet = Deno.env.get
Deno.env.get = (key: string) => {
  if (key === 'ADMIN_PHONES' || key === 'ADMIN_PHONE') return '529631539156'
  if (key === 'WA_PHONE_NUMBER_ID' || key === 'WA_TOKEN') return 'TEST'
  if (key === 'DEEPSEEK_API_KEY') return 'TEST'
  return originalEnvGet.call(Deno.env, key)
}

const mockSupabase: any = {
  from: (table: string) => {
    return {
      select: () => mockSupabase.from(table),
      eq: (k: string, v: any) => mockSupabase.from(table),
      or: () => mockSupabase.from(table),
      limit: () => mockSupabase.from(table),
      single: async () => ({ data: db[table]?.[0] || {}, error: null }),
      maybeSingle: async () => ({ data: db[table]?.[0] || null, error: null }),
      upsert: async (data: any) => { console.log(`[DB] Upsert en ${table}`); return { data, error: null } },
      update: async (data: any) => { console.log(`[DB] Update en ${table}`); return { data, error: null } },
      insert: async (data: any) => { console.log(`[DB] Insert en ${table}`); return { data, error: null } },
      in: async () => ({ data: [], error: null }),
      ilike: () => mockSupabase.from(table)
    }
  },
  rpc: async (fn: string) => {
    console.log(`[DB] Executing RPC: ${fn}`)
    return { data: { ok: true }, error: null }
  }
}

// -- SIMULATION EXECUTION --
async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function start() {
  console.log('--- ETAPA 1: FLUJO RESTAURANTE (B2B) ---')
  console.log('👤 Restaurante (Burger B2B) intenta regalar puntos al cliente sin T&C')
  // B2B State 1 = Sumar Puntos
  let b2bState = { step: 'esperando_telefono', subAction: 'sumar_puntos' }
  // Mandamos el numero 9630000000 que tiene acepta_terminos = false
  await handleRestaurantCommand(mockSupabase, '529630000010', 'msg1', '9630000000', db.restaurantes[0], b2bState)
  console.log('Resultado:\n' + sentMessages.join('\n') + '\n')
  sentMessages = []

  console.log('--- ETAPA 2: FLUJO REPARTIDOR ---')
  console.log('🛵 Repartidor manda comando de SOS y califica al cliente')
  await handleRepMessage(mockSupabase, '529630000020', 'msg2', '/sos CHOQUE', db.repartidores[0])
  await sleep(100)
  // Calificación (Botón IA no envía pero Admin Handler procesa)
  const repData = db.repartidores[0]
  await handleRepMessage(mockSupabase, '529630000020', 'msg3', 'RATE_EXC_9630000000', repData)
  console.log('Resultado:\n' + sentMessages.join('\n') + '\n')
  sentMessages = []

  console.log('--- ETAPA 3: FLUJO ADMIN & IA ---')
  console.log('👑 Admin pide sumar puntos vía IA al cliente y lanza Cancelar Todos')
  // Simular respuesta de IA
  const chatInfo = { respuesta: { accion: 'SUMAR_PUNTOS', datosAExtraer: { clienteTel: '9630000000', puntosASumar: 15 } } }
  await executeAdminAction(mockSupabase, '529631539156', 'msg4', chatInfo)
  
  // Cancelar todos pero protegido
  const chatInfo2 = { respuesta: { accion: 'CANCELAR_TODOS', datosAExtraer: {} } }
  await executeAdminAction(mockSupabase, '529631539156', 'msg5', chatInfo2)
  console.log('Resultado:\n' + sentMessages.join('\n') + '\n')
  sentMessages = []

  console.log('✅ SIMULACIÓN FINALIZADA CON ÉXITO: Todo operó sin crashear y con la lógica Loyalty viva.')
}

start()
