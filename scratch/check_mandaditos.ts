import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || process.env.VITE_SUPABASE_URL,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || process.env.VITE_SUPABASE_ANON_KEY
)

async function test() {
  const { data, error } = await supabase.from('mandaditos').select('*').limit(1);
  if (error) console.log('Error:', error);
  if (data && data.length > 0) {
    console.log(Object.keys(data[0]));
  }
}

test();
