import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const id = "fbac48b1-dba9-4a82-bd7e-35382bf77dd3";

async function main() {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*, restaurante_data:restaurantes(nombre, lat, lng)')
    .eq('id', id)
    .single();

  console.log("Error:", error);
}

main();
