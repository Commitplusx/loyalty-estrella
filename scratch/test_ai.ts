import { load } from "https://deno.land/std@0.208.0/dotenv/mod.ts";
await load({ export: true, envPath: "../.env" });
import { conversacionDeepSeek } from '../supabase/functions/whatsapp-bot/ai.ts';

const res = await conversacionDeepSeek([
  { role: 'system', content: 'Eres un bot que extrae direcciones.' },
  { role: 'user', content: 'Me podría realizar un servicio?' },
  { role: 'assistant', content: '¿Desde dónde recogemos el paquete?' },
  { role: 'user', content: 'Ahí en mi casa te lo entrega mi mamá. Porfis. Se lleva a Ximena Roque Calle revolución sin número, Col. Mariano N Ruiz, entre avenida libertad y Venustiano Carranza Donde está la "s" de la Mariano Casa Blanca con una pared curva gris, a lado de una casa gris que está justo en la esquina Tel. 9631467360' }
], 'mandadito');
console.log(JSON.stringify(res, null, 2));
