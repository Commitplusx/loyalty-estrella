import { load } from "https://deno.land/std@0.208.0/dotenv/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const envText = new TextDecoder().decode(Deno.readFileSync(".env"));
const supabaseUrl = envText.match(/SUPABASE_URL=([^\r\n]+)/)?.[1]?.trim() || envText.match(/VITE_SUPABASE_URL=([^\r\n]+)/)?.[1]?.trim();
const supabaseKey = envText.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1]?.trim() || envText.match(/VITE_SUPABASE_ANON_KEY=([^\r\n]+)/)?.[1]?.trim();

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing credentials");
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const { data, error } = await supabase.from('bot_memory').delete().like('phone', 'mandadito_txt_%');

if (error) {
  console.error("Error clearing cache:", error);
} else {
  console.log("Cache cleared successfully. Data:", data);
}
