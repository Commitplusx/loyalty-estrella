import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const envText = new TextDecoder().decode(Deno.readFileSync('.env'));
const dbUrl = envText.match(/DATABASE_URL=([^\r\n]+)/)?.[1]?.trim() || '';

if (!dbUrl) {
  console.error("No DATABASE_URL found");
  Deno.exit(1);
}

const client = new Client(dbUrl);
await client.connect();

const sql = `
SELECT created_at, message, meta
FROM bot_logs
WHERE source = 'whatsapp-bot' AND level = 'critical'
ORDER BY created_at DESC
LIMIT 1;
`;

try {
  const result = await client.queryObject(sql);
  console.log("Last Error:", JSON.stringify(result.rows, null, 2));
} catch (e) {
  console.error("Error executing SQL:", e);
} finally {
  await client.end();
}
