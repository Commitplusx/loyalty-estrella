import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import "https://deno.land/std@0.167.0/dotenv/load.ts"

const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL') || Deno.env.get('SUPABASE_URL');
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Buscando el último error en bot_logs...");
    const { data, error } = await supabase
        .from('bot_logs')
        .select('*')
        .eq('source', 'whatsapp-bot')
        .eq('level', 'critical')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("No se pudo leer bot_logs", error);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}
main();
