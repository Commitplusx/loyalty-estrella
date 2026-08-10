import { useState, useEffect } from 'react';
import { MessageCircle, QrCode, ShieldCheck, Loader2 } from 'lucide-react';

export function WhatsAppSetupView() {
  const [isSdkLoaded, setIsSdkLoaded] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    // 1. Initialize Facebook SDK
    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({
        appId: '1663378581434704',
        cookie: true,
        xfbml: true,
        version: 'v19.0',
      });
      setIsSdkLoaded(true);
    };

    // 2. Load the SDK script
    (function (d, s, id) {
      let js: any, fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) return;
      js = d.createElement(s);
      js.id = id;
      js.src = 'https://connect.facebook.net/es_LA/sdk.js';
      fjs?.parentNode?.insertBefore(js, fjs);
    })(document, 'script', 'facebook-jssdk');
  }, []);

  const launchWhatsAppSignup = () => {
    if (!isSdkLoaded || !(window as any).FB) {
      alert('El SDK de Meta aún se está cargando. Intenta de nuevo en unos segundos.');
      return;
    }

    setIsConnecting(true);

    (window as any).FB.login(
      (response: any) => {
        setIsConnecting(false);
        console.log('Respuesta cruda completa de Meta:', response);
        
        if (response.error) {
          alert('ERROR DE META:\n' + JSON.stringify(response.error, null, 2));
        } else if (response.authResponse) {
          alert('RESPUESTA DE META:\n' + JSON.stringify(response, null, 2));
        } else {
          alert('CANCELADO O SIN RESPUESTA:\n' + JSON.stringify(response, null, 2));
        }
      },
      {
        scope: 'whatsapp_business_management,whatsapp_business_messaging',
        extras: { 
          setup: { 
            metadata: 'estrella_eats_setup'
          },
          feature: 'whatsapp_business_app_onboarding'
        },
      }
    );
  };

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-zinc-200">
      <div className="flex items-center gap-4 mb-6">
        <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
          <MessageCircle size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Coexistencia WhatsApp API</h2>
          <p className="text-zinc-500 mt-1">Conecta la API sin perder el acceso en tu celular.</p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-8">
        <h3 className="font-bold text-zinc-900 flex items-center gap-2 mb-4">
          <ShieldCheck size={20} className="text-emerald-500" />
          Conexión Segura Meta API
        </h3>
        <p className="text-zinc-600 text-sm leading-relaxed mb-4">
          Esta herramienta utiliza el inicio de sesión nativo de Facebook para empresas. 
          Al hacer clic en el botón de abajo, se abrirá una ventana segura de Meta. Sigue 
          los pasos y obtendrás un <strong>Código QR</strong>. Escanéalo con tu aplicación 
          de WhatsApp Business para activar la coexistencia.
        </p>
        
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          <QrCode size={20} className="shrink-0" />
          <p>
            <strong>Paso Crítico:</strong> Asegúrate de escanear el QR desde la opción "Conectarme a la plataforma para empresas" en tu App de WhatsApp.
          </p>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={launchWhatsAppSignup}
          disabled={!isSdkLoaded || isConnecting}
          className="bg-[#1877f2] hover:bg-[#166fe5] text-white font-bold py-4 px-8 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isConnecting ? (
            <>
              <Loader2 size={24} className="animate-spin" />
              Conectando con Meta...
            </>
          ) : (
            <>
              Generar Código QR de Meta
            </>
          )}
        </button>
      </div>
    </div>
  );
}
