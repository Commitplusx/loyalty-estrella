import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(url, key);

async function run() {
  const { data: user, error: uErr } = await supabase.auth.admin.createUser({
    email: 'caleb@estrella.local',
    password: 'password123!',
    email_confirm: true
  });
  
  if (uErr) {
    console.error("Auth error:", uErr);
    return;
  }
  
  console.log('Created user:', user.user.id);

  const { error: updErr } = await supabase.from('repartidores')
    .update({ user_id: user.user.id, telefono: '9601725763' })
    .eq('id', '18c3d81b-a195-4669-8276-b86739714a35');
    
  console.log('Updated caleb', updErr);

  // deleto the others
  const { error: delErr } = await supabase.from('repartidores').delete().in('id', [
    'ad59b5e4-a2a2-412a-956b-f86365112f91',
    '2bc0b4a7-64ea-4ed8-adad-af7d5954c9f6'
  ]);
  console.log('Deleted dupes', delErr);
}
run();
