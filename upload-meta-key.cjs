const fs = require('fs');
const https = require('https');

async function updatePublicKey() {
  const token = 'b11c8c40b07b6a63da0685d318cb6c7447076c6109c4f3a02ebe55a398b2431f'; // Extracted from Supabase Secrets task earlier
  const phoneId = '1155044321029650'; // New phone ID
  const publicKey = fs.readFileSync('public_key.pem', 'utf8');

  const data = new URLSearchParams({
    business_public_key: publicKey
  }).toString();

  const options = {
    hostname: 'graph.facebook.com',
    path: `/v20.0/${phoneId}/whatsapp_business_encryption`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  const req = https.request(options, (res) => {
    let responseData = '';
    res.on('data', (chunk) => responseData += chunk);
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Response:', responseData);
    });
  });

  req.on('error', (e) => {
    console.error('Error:', e);
  });

  req.write(data);
  req.end();
}

updatePublicKey();
