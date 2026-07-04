const cp = require('child_process');
const fs = require('fs');
const key = fs.readFileSync('private_key.pem', 'utf8');
const envFile = 'temp_secrets.env';
fs.writeFileSync(envFile, `FLOWS_PRIVATE_KEY="${key.replace(/\n/g, '\\n')}"\n`);
console.log('Pushing to supabase...');
cp.execSync('npx supabase secrets set --env-file temp_secrets.env', { stdio: 'inherit' });
fs.unlinkSync(envFile);
console.log('Done!');
