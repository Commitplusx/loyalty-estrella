// ── Lógica de Validación Inteligente de Mandaditos (Criterio) ────────────
export interface ValidacionMandadito {
  estaCompleto: boolean;
  datosFaltantes: string[];
  preguntaAlCliente: string | null;
}

export async function validarDatosMandaditoIA(origenInfo: string, destinoInfo: string): Promise<ValidacionMandadito> {
  const defaultFallback: ValidacionMandadito = {
    estaCompleto: false,
    datosFaltantes: ['referencias_generales'],
    preguntaAlCliente: `📝 ¿Alguna referencia o seña para llegar? También puedes contarnos qué paquete llevamos.\n\n_Escribe *no* si no tienes ninguna._`
  }

  const key = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('OPENAI_API_KEY')
  if (!key) return defaultFallback

  const url = Deno.env.get('DEEPSEEK_API_KEY') ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions'
  const model = Deno.env.get('DEEPSEEK_API_KEY') ? 'deepseek-chat' : 'gpt-4o-mini'

  const prompt = `Eres un auditor logístico experto para una app de entregas (Estrella Delivery).
Analiza el Origen y el Destino de un pedido de mandadito y decide si falta información crucial para el repartidor.

Origen: ${origenInfo}
Destino: ${destinoInfo}

REGLAS DE DEDUCCIÓN:
1. RESTAURANTES/COMERCIOS: Si el origen o destino es un comercio (ej. Domino's, Farmacia), se requiere saber a nombre de quién está el pedido, si hay número de orden/ticket, y si el repartidor debe pagarlo.
2. CASAS: Si el origen o destino es una colonia o casa, se requiere el número de teléfono/celular de la persona que recibe (si no lo han dado) y referencias de la fachada (color, portón).
3. LUGARES PÚBLICOS: Se requiere saber a quién buscar.
4. VIAJES SIMPLES: Si parece un viaje simple (ej. llevar unas llaves de una casa a otra cercana) y ya dieron direcciones, puede considerarse completo.

INSTRUCCIONES DE SALIDA:
Devuelve ÚNICAMENTE un objeto JSON con la siguiente estructura:
{
  "estaCompleto": boolean, // true si crees que ya hay suficientes datos para empezar el viaje, false si falta algo crítico.
  "datosFaltantes": string[], // Lista de datos faltantes (ej. ["telefono_receptor", "numero_ticket"]) o array vacío [].
  "preguntaAlCliente": string | null // Si estaCompleto es false, formula UNA SOLA pregunta MUY CORTA, amable y con emojis para pedir lo faltante. Al final agrega "(Si no aplica, escribe 'no')". Si estaCompleto es true, pon null.
}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.1
      })
    })

    if (!res.ok) return defaultFallback
    const json = await res.json()
    const content = json.choices?.[0]?.message?.content?.trim()
    if (!content) return defaultFallback

    const parsed = JSON.parse(content)
    return {
      estaCompleto: !!parsed.estaCompleto,
      datosFaltantes: Array.isArray(parsed.datosFaltantes) ? parsed.datosFaltantes : [],
      preguntaAlCliente: parsed.preguntaAlCliente || defaultFallback.preguntaAlCliente
    }
  } catch (e) {
    console.error('[IA] Error validando mandadito:', e)
    return defaultFallback
  }
}
