require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkUser(id) {
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(id);
  console.log("Auth User:", userData ? userData.user.email : userError);
  
  const { data: restData, error: restError } = await supabase.from('restaurantes').select('*').eq('admin_id', id).maybeSingle();
  console.log("Restaurant:", restData || restError);
}

checkUser('4e5f7e46-5777-4dea-a369-4ca018747f33');
