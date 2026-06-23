import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { initializeApp, cert } from "npm:firebase-admin@11.11.1/app";
import { getMessaging } from "npm:firebase-admin@11.11.1/messaging";

// Inicializamos Firebase Admin usando la variable de entorno SERVICE_ACCOUNT_JSON
// Esta variable se configurará en el dashboard de Supabase
let isFirebaseInitialized = false;

serve(async (req) => {
  try {
    const payload = await req.json();

    // Verificamos si es un INSERT o UPDATE
    const record = payload.record || payload.new;
    const oldRecord = payload.old;
    
    // Solo enviar notificación si el estado es 'pendiente'
    // Y (es un insert O es un update desde otro estado hacia pendiente)
    if (!record || record.estado !== "pendiente") {
      return new Response(JSON.stringify({ message: "No es un pedido pendiente." }), { status: 200 });
    }

    if (record.tipo_pedido === "tienda") {
      return new Response(JSON.stringify({ message: "Es un pedido para tienda, no se envía notificación al admin/repartidor." }), { status: 200 });
    }

    if (payload.type === "UPDATE" && oldRecord && oldRecord.estado === "pendiente") {
      return new Response(JSON.stringify({ message: "El pedido ya era pendiente, se ignoró." }), { status: 200 });
    }

    if (!isFirebaseInitialized) {
      const serviceAccountStr = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
      if (!serviceAccountStr) {
        throw new Error("Missing FIREBASE_SERVICE_ACCOUNT environment variable.");
      }
      
      const serviceAccount = JSON.parse(serviceAccountStr);
      initializeApp({
        credential: cert(serviceAccount),
      });
      isFirebaseInitialized = true;
    }

    const restaurante = record.restaurante || "Estrella";
    const total = record.total || "0.0";
    
    // Configuramos el mensaje para el topic "admins"
    const message = {
      topic: "admins",
      notification: {
        title: "🔔 ¡Nuevo Pedido!",
        body: `De: ${restaurante} - $${total}`,
      },
      android: {
        priority: "high" as const,
        notification: {
          channelId: "high_importance_channel_v2",
          sound: "alarm", // Reproducirá res/raw/alarm.ogg nativamente
        },
      },
      data: {
        pedidoId: record.id,
        click_action: "FLUTTER_NOTIFICATION_CLICK"
      }
    };

    const response = await getMessaging().send(message);
    console.log("FCM Notification sent successfully:", response);

    return new Response(JSON.stringify({ success: true, messageId: response }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error al procesar el webhook FCM:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
