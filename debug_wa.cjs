async function hack() {
  const edgeUrl = 'https://jdrrkpvodnqoljycixbg.supabase.co/functions/v1/whatsapp-bot';
  const response = await fetch(edgeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        id: "123456789",
        changes: [{
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "529631234567", phone_number_id: "123" },
            contacts: [{ profile: { name: "Debug Test" }, wa_id: "529631371902" }],
            messages: [{
              from: "529631371902", // Yoko's number
              id: "wamid.debug_" + Date.now(),
              timestamp: String(Math.floor(Date.now() / 1000)),
              type: "text",
              text: { body: "Hola bot, estas vivo?" }
            }]
          },
          field: "messages"
        }]
      }]
    })
  });

  console.log("STATUS:", response.status);
  console.log("TEXT:", await response.text());
}

hack();
