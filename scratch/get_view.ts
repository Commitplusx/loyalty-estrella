import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const envText = new TextDecoder().decode(Deno.readFileSync('.env'));
const supabaseUrl = envText.match(/SUPABASE_URL=([^\r\n]+)/)?.[1]?.trim() || envText.match(/VITE_SUPABASE_URL=([^\r\n]+)/)?.[1]?.trim();
const supabaseKey = envText.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)?.[1]?.trim() || envText.match(/VITE_SUPABASE_ANON_KEY=([^\r\n]+)/)?.[1]?.trim();

const urlObj = new URL(supabaseUrl);
const dbHost = `db.${urlObj.hostname.split('.')[0]}.supabase.co`;

const client = new Client({
  user: "postgres",
  database: "postgres",
  hostname: dbHost,
  port: 5432,
  password: "YOUR_PASSWORD" // Wait, I don't have the password!
});
