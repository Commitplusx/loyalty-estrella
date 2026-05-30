import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import 'https://deno.land/std@0.167.0/dotenv/load.ts';
const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
const { data, error } = await supabase.from('restaurantes').select('*').limit(1)
console.log('Columns:', data && data.length > 0 ? Object.keys(data[0]) : 'No data or error:', error)
