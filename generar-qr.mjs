// ─────────────────────────────────────────────────
// generar-qr.mjs  —  Generador QR Estrella
// Uso:  node generar-qr.mjs
// Abre qr-estrella-final.html en el navegador y
// usa el botón "Descargar PNG" para obtener el archivo.
// ─────────────────────────────────────────────────
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const URL_DESTINO = 'https://www.app-estrella.shop';
const LOGO_PATH   = path.join(__dirname, 'public', 'logo.png');
const OUT_HTML    = path.join(__dirname, 'qr-estrella-final.html');

// 1. Generar QR como SVG string
const svgString = await QRCode.toString(URL_DESTINO, {
  type: 'svg',
  errorCorrectionLevel: 'H',
  margin: 1,
  color: { dark: '#000000', light: '#ffffff' },
});

// 2. Leer logo como base64
const logoBase64 = fs.readFileSync(LOGO_PATH).toString('base64');
const logoDataUrl = `data:image/png;base64,${logoBase64}`;

// 3. Generar también versión oscura del SVG (módulos blancos, fondo negro)
const svgDark = svgString
  .replace(/fill="#000000"/g, 'fill="__WHITE__"')
  .replace(/fill="#ffffff"/g, 'fill="#000000"')
  .replace(/fill="__WHITE__"/g, 'fill="#ffffff"');

const svgRed = svgString
  .replace(/fill="#000000"/g, 'fill="#ef4444"');

const svgRedDark = svgDark
  .replace(/fill="#ffffff"/g, 'fill="#ef4444"');

// 4. Encode SVGs as base64 for embedding
const enc = (s) => Buffer.from(s).toString('base64');

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>QR Estrella — Listo para imprimir</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:'Segoe UI',system-ui,sans-serif;
      background:#0f0f0f;color:#fff;
      min-height:100vh;display:flex;flex-direction:column;
      align-items:center;justify-content:center;padding:40px 20px;gap:28px;
    }
    h1{font-size:1.6rem;font-weight:800;letter-spacing:-0.5px}
    h1 span{color:#ef4444}
    .sub{font-size:.85rem;color:#777;margin-top:4px;text-align:center}
    .card{
      background:#1a1a1a;border:1px solid #2a2a2a;border-radius:24px;
      padding:32px;display:flex;flex-direction:column;align-items:center;
      gap:22px;width:100%;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,.5);
    }
    #qrWrap{position:relative;display:inline-flex;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.6)}
    #qrCanvas{display:block}
    label-s{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#777;display:block;margin-bottom:6px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;width:100%}
    .sb{
      padding:10px 12px;border-radius:10px;border:2px solid #333;
      background:#111;color:#aaa;font-size:.78rem;font-weight:700;
      cursor:pointer;transition:all .15s;text-align:center;line-height:1.4;
    }
    .sb.on{border-color:#ef4444;color:#fff;background:#1f0a0a}
    .sb:hover:not(.on){border-color:#555;color:#fff}
    .dl{
      width:100%;padding:14px;border-radius:12px;border:none;
      background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;
      font-size:1rem;font-weight:800;cursor:pointer;letter-spacing:.3px;
      transition:opacity .15s,transform .1s;box-shadow:0 4px 20px rgba(239,68,68,.35);
    }
    .dl:hover{opacity:.9;transform:translateY(-1px)}
    .dl:active{transform:scale(.98)}
    .info{font-size:.72rem;color:#555;text-align:center;line-height:1.7}
    .info strong{color:#888}
    .szinfo{font-size:.72rem;color:#ef4444;font-weight:700;text-align:center}
  </style>
</head>
<body>
<div style="text-align:center">
  <h1>QR — <span>Estrella</span> Moto Servicio</h1>
  <p class="sub">Generador offline · Alta resolución para imprenta</p>
</div>

<div class="card">
  <canvas id="qrCanvas" width="340" height="340" style="border-radius:12px"></canvas>
  <p class="szinfo" id="szlbl">Descarga: 2000 × 2000 px</p>

  <div style="width:100%;display:flex;flex-direction:column;gap:14px">

    <div>
      <label-s>Estilo</label-s>
      <div class="grid">
        <button class="sb"    id="b-dark"      onclick="setStyle('dark')">⚫ Oscuro</button>
        <button class="sb on" id="b-light"     onclick="setStyle('light')">⚪ Claro ✓ recomendado</button>
        <button class="sb"    id="b-red-light" onclick="setStyle('red-light')">🔴 Rojo / blanco</button>
        <button class="sb"    id="b-red-dark"  onclick="setStyle('red-dark')">🔴 Rojo / negro</button>
      </div>
    </div>

    <div>
      <label-s>Tamaño de descarga</label-s>
      <div class="grid">
        <button class="sb"    id="b-1200" onclick="setSz(1200)">1200 px<br><small style="font-weight:400;color:#666">digital</small></button>
        <button class="sb on" id="b-2000" onclick="setSz(2000)">2000 px<br><small style="font-weight:400;color:#666">imprenta</small></button>
        <button class="sb"    id="b-3000" onclick="setSz(3000)">3000 px<br><small style="font-weight:400;color:#666">gran formato</small></button>
        <button class="sb"    id="b-4000" onclick="setSz(4000)">4000 px<br><small style="font-weight:400;color:#666">máxima calidad</small></button>
      </div>
    </div>

    <button class="dl" onclick="download()">⬇ Descargar PNG listo para imprenta</button>
  </div>
</div>

<p class="info">
  <strong>Corrección de error nivel H (30%)</strong><br>
  El logo cubre ~20% del QR — compatible con todos los lectores.<br>
  URL: <strong style="color:#ef4444">${URL_DESTINO}</strong>
</p>

<script>
// ── SVGs embebidos (base64) ──────────────────────
const SVGS = {
  dark:      atob('${enc(svgDark)}'),
  light:     atob('${enc(svgString)}'),
  'red-light': atob('${enc(svgRed)}'),
  'red-dark':  atob('${enc(svgRedDark)}'),
};
const BG = { dark:'#000000', light:'#ffffff', 'red-light':'#ffffff', 'red-dark':'#000000' };

// ── Logo embebido ────────────────────────────────
const LOGO_SRC = '${logoDataUrl}';

let cStyle = 'light', cSz = 2000;

function drawQR(canvas, svgStr, bg, size) {
  return new Promise(resolve => {
    canvas.width  = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Draw SVG via Image
    const blob = new Blob([svgStr], {type:'image/svg+xml'});
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);

      // Logo overlay
      const logo = new Image();
      logo.onload = () => {
        const ls  = Math.round(size * 0.20);
        const lx  = Math.round((size - ls) / 2);
        const ly  = Math.round((size - ls) / 2);
        const r   = Math.round(ls * 0.14);
        const pad = Math.round(size * 0.011);

        // Padding square (same color as BG)
        roundRect(ctx, lx-pad, ly-pad, ls+pad*2, ls+pad*2, r+pad);
        ctx.fillStyle = bg; ctx.fill();

        // Logo clipped
        ctx.save();
        roundRect(ctx, lx, ly, ls, ls, r);
        ctx.clip();
        ctx.drawImage(logo, lx, ly, ls, ls);
        ctx.restore();
        resolve();
      };
      logo.onerror = resolve;
      logo.src = LOGO_SRC;
    };
    img.onerror = resolve;
    img.src = url;
  });
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

function activate(group, id) {
  group.forEach(i => document.getElementById(i)?.classList.remove('on'));
  document.getElementById(id)?.classList.add('on');
}

function setStyle(s){
  cStyle = s;
  activate(['b-dark','b-light','b-red-light','b-red-dark'], 'b-'+s);
  refresh();
}
function setSz(s){
  cSz = s;
  activate(['b-1200','b-2000','b-3000','b-4000'], 'b-'+s);
  document.getElementById('szlbl').textContent = 'Descarga: '+s+' × '+s+' px';
}

async function refresh(){
  const c = document.getElementById('qrCanvas');
  await drawQR(c, SVGS[cStyle], BG[cStyle], 340);
}

async function download(){
  const c = document.createElement('canvas');
  await drawQR(c, SVGS[cStyle], BG[cStyle], cSz);
  const a = document.createElement('a');
  a.download = 'qr-estrella-' + cSz + 'px-' + cStyle + '.png';
  a.href = c.toDataURL('image/png');
  a.click();
}

refresh();
</script>
</body>
</html>`;

fs.writeFileSync(OUT_HTML, html, 'utf8');
console.log('\n✅  Archivo generado:', OUT_HTML);
console.log('   Ábrelo en Chrome o Edge para ver y descargar el QR.\n');
