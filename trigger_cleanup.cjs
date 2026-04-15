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
            contacts: [{ profile: { name: "Agent Test" }, wa_id: "521234567890" }],
            messages: [{
              from: "521234567890", 
              id: "wamid.debug_" + Date.now(),
              timestamp: String(Math.floor(Date.now() / 1000)),
              type: "text",
              text: { body: "SANEAMIENTO_TOTAL" }
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
