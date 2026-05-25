import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import satori from 'https://esm.sh/satori@0.10.11';
import { html } from 'https://esm.sh/satori-html@0.3.2';
import { initWasm, Resvg } from 'https://deno.land/x/resvg_wasm@0.2.0/mod.ts';

// Initialize WASM for Resvg
let wasmInitialized = false;
async function initializeWasm() {
  if (wasmInitialized) return;
  try {
    await initWasm(fetch('https://deno.land/x/resvg_wasm@0.2.0/index_bg.wasm'));
    wasmInitialized = true;
  } catch (e) {
    console.error("Error initializing wasm", e);
  }
}

serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const telefono = url.searchParams.get('telefono');

    if (!telefono) {
      return new Response('Parámetro "telefono" es requerido', { status: 400 });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: cliente } = await supabase
      .from('clientes')
      .select('*')
      .eq('telefono', telefono)
      .single();

    if (!cliente) {
      return new Response('Cliente no encontrado', { status: 404 });
    }

    // Load fonts dynamically
    const fontRegularRes = await fetch('https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf');
    const fontRegular = await fontRegularRes.arrayBuffer();
    
    const fontBoldRes = await fetch('https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYMZhrib2Bg-4.ttf');
    const fontBold = await fontBoldRes.arrayBuffer();

    const qrUrl = `https://quickchart.io/qr?text=https://www.app-estrella.shop/loyalty/${cliente.telefono}&size=300&dark=0a0a0a&margin=1`;
    const logoUrl = 'https://jdrrkpvodnqoljycixbg.supabase.co/storage/v1/object/public/public-assets/logo.png';

    const isVip = cliente.es_vip;
    const rangoColor = isVip ? '#fbbf24' : '#3b82f6'; 
    const rangoText = isVip ? 'SOCIO VIP • ESTRELLA' : 'SOCIO • ESTRELLA';

    // The HTML layout must be Flexbox only. CSS Grid/Block is NOT supported by Satori.
    const markup = html`
      <div style="display: flex; width: 1000px; height: 600px; background-color: #0a0a0a; color: white; font-family: 'Inter'; overflow: hidden; position: relative;">
        <!-- Fondo -->
        <div style="display: flex; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(135deg, #18181b 0%, #000000 100%);"></div>
        
        <!-- Logo gigante de fondo tipo marca de agua -->
        <img src="${logoUrl}" style="position: absolute; right: -150px; top: -150px; width: 900px; height: 900px; opacity: 0.05;" />
        
        <!-- Contenido principal -->
        <div style="display: flex; flex-direction: column; justify-content: space-between; padding: 60px; width: 100%; height: 100%; position: absolute; top: 0; left: 0;">
          
          <!-- Header (Logo y Rango) -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
            <div style="display: flex; align-items: center;">
              <img src="${logoUrl}" style="width: 90px; height: 90px; border-radius: 20px; margin-right: 24px;" />
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 28px; color: #a1a1aa; letter-spacing: 6px;">ESTRELLA</span>
                <span style="font-size: 24px; color: ${rangoColor}; font-weight: 700; margin-top: 5px; letter-spacing: 2px;">${rangoText}</span>
              </div>
            </div>
          </div>

          <!-- Body (Datos y QR) -->
          <div style="display: flex; justify-content: space-between; align-items: flex-end; width: 100%;">
            <!-- Datos del Cliente -->
            <div style="display: flex; flex-direction: column; gap: 40px;">
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 22px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 2px;">Nombre del Cliente</span>
                <span style="font-size: 56px; font-weight: 700; color: white; margin-top: 5px;">${cliente.nombre}</span>
              </div>
              
              <div style="display: flex; margin-top: 20px;">
                <div style="display: flex; flex-direction: column; margin-right: 80px;">
                  <span style="font-size: 20px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 2px;">Puntos</span>
                  <span style="font-size: 48px; font-weight: 700; color: #fbbf24; margin-top: 5px;">${cliente.puntos || 0}</span>
                </div>
                ${isVip ? `
                <div style="display: flex; flex-direction: column;">
                  <span style="font-size: 20px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 2px;">Billetera</span>
                  <span style="font-size: 48px; font-weight: 700; color: #10b981; margin-top: 5px;">$${(cliente.saldo_billetera || 0).toFixed(2)}</span>
                </div>
                ` : ''}
              </div>
            </div>

            <!-- Caja Blanca para el QR -->
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: white; padding: 24px; border-radius: 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
              <img src="${qrUrl}" style="width: 220px; height: 220px; border-radius: 16px;" />
              <span style="font-size: 20px; font-weight: 700; color: #000; margin-top: 20px; letter-spacing: 3px;">${cliente.telefono}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    const svg = await satori(markup, {
      width: 1000,
      height: 600,
      fonts: [
        {
          name: 'Inter',
          data: fontRegular,
          weight: 400,
          style: 'normal',
        },
        {
          name: 'Inter',
          data: fontBold,
          weight: 700,
          style: 'normal',
        },
      ],
    });

    await initializeWasm();
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1000 },
    });
    
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    return new Response(pngBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
