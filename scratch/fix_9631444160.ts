import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import "https://deno.land/std@0.167.0/dotenv/load.ts"

const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL') || Deno.env.get('SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseKey) {
    console.error("Faltan variables de entorno");
    Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const telefono = '9631444160';

async function main() {
    console.log("1. Eliminando repartidor...");
    const { error: errRep } = await supabase.from('repartidores').delete().eq('telefono', telefono);
    if (errRep) console.error("Error borrando repartidor:", errRep.message);
    else console.log("Repartidor eliminado.");

    console.log("2. Agregando/Actualizando cliente...");
    const { data: clienteDB } = await supabase.from('clientes').select('telefono').eq('telefono', telefono).maybeSingle();
    
    if (clienteDB) {
        console.log("El cliente ya existe, actualizando acepta_terminos...");
        const { error: errUpd } = await supabase.from('clientes').update({ acepta_terminos: true }).eq('telefono', telefono);
        if (errUpd) console.error("Error actualizando:", errUpd.message);
    } else {
        console.log("Creando cliente...");
        const { error: errIns } = await supabase.from('clientes').insert({ 
            telefono: telefono,
            nombre: 'Nuevo Cliente',
            acepta_terminos: true
        });
        if (errIns) console.error("Error insertando:", errIns.message);
    }

    console.log("Listo!");
}

main();
