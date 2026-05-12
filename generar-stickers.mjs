// ─────────────────────────────────────────────────────────────
// generar-stickers.mjs  —  Sellos de seguridad Estrella
// Uso:  node generar-stickers.mjs
// Abre stickers-estrella.html en Chrome y descarga los PNG.
// ─────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH   = path.join(__dirname, 'public', 'logo.png');
const OUT_HTML    = path.join(__dirname, 'stickers-estrella.html');

const logoBase64  = fs.readFileSync(LOGO_PATH).toString('base64');
const logoDataUrl = `data:image/png;base64,${logoBase64}`;

// Print sizes at 300 DPI
// 6 cm  → 6/2.54*300 = 709 px
// 3.5cm → 3.5/2.54*300 = 413 px
const SIZES = { grande: 709, pequeno: 413 };

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Sellos Estrella — Listo para imprimir</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:'Segoe UI',system-ui,sans-serif;
      background:#0f0f0f;color:#fff;
      min-height:100vh;display:flex;flex-direction:column;
      align-items:center;padding:48px 20px 60px;gap:36px;
    }
    h1{font-size:1.6rem;font-weight:800;letter-spacing:-.5px;text-align:center}
    h1 span{color:#ef4444}
    .sub{font-size:.85rem;color:#666;text-align:center;margin-top:4px}
    .row{display:flex;flex-wrap:wrap;justify-content:center;gap:40px}
    .card{
      background:#1a1a1a;border:1px solid #2a2a2a;border-radius:24px;
      padding:32px;display:flex;flex-direction:column;align-items:center;gap:20px;
      width:300px;box-shadow:0 20px 60px rgba(0,0,0,.5);
    }
    .card h2{font-size:1rem;font-weight:800;text-align:center;letter-spacing:.3px}
    .card h2 span{color:#ef4444}
    canvas{border-radius:50%;box-shadow:0 6px 28px rgba(239,68,68,.25)}
    .badge{
      font-size:.7rem;font-weight:700;letter-spacing:.8px;text-transform:uppercase;
      padding:4px 12px;border-radius:999px;background:#1f0a0a;color:#ef4444;
      border:1px solid #ef4444;
    }
    .dl{
      width:100%;padding:13px;border-radius:12px;border:none;
      background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;
      font-size:.9rem;font-weight:800;cursor:pointer;
      transition:opacity .15s,transform .1s;box-shadow:0 4px 20px rgba(239,68,68,.3);
    }
    .dl:hover{opacity:.9;transform:translateY(-1px)}
    .dl:active{transform:scale(.98)}
    .info{font-size:.72rem;color:#444;text-align:center;line-height:1.7;max-width:540px}
    .info strong{color:#666}
  </style>
</head>
<body>

<div style="text-align:center">
  <h1>Sellos de Seguridad — <span>Estrella</span></h1>
  <p class="sub">Diseños listos para imprenta · 300 DPI · PNG circular</p>
</div>

<div class="row">

  <!-- GRANDE: Charola Unicell -->
  <div class="card">
    <h2>Sello <span>Grande</span></h2>
    <span class="badge">6 cm · Charola unicell</span>
    <canvas id="c-grande" width="280" height="280"></canvas>
    <button class="dl" onclick="dl('grande')">⬇ Descargar PNG (709×709px)</button>
  </div>

  <!-- PEQUEÑO: Bolsa -->
  <div class="card">
    <h2>Sello <span>Pequeño</span></h2>
    <span class="badge">3.5 cm · Bolsa</span>
    <canvas id="c-pequeno" width="180" height="180"></canvas>
    <button class="dl" onclick="dl('pequeno')">⬇ Descargar PNG (413×413px)</button>
  </div>

</div>

<p class="info">
  <strong>Para imprenta:</strong> descarga ambos PNG y entrega el archivo. 
  Son círculos a 300 DPI listos para cualquier imprenta de stickers.<br>
  Recomendamos papel <strong>vinilo brillante</strong> con adhesivo fuerte para mayor durabilidad.
</p>

<script>
const LOGO = new Image();
LOGO.src = '${logoDataUrl}';

const PRINT_SIZES = { grande: ${SIZES.grande}, pequeno: ${SIZES.pequeno} };

// ── Dibujar sello ─────────────────────────────────────────────
function drawSeal(canvas, printSize) {
  const S   = canvas.width;   // display size (pixels on screen)
  const ctx = canvas.getContext('2d');
  const cx  = S / 2;
  const cy  = S / 2;
  const R   = S / 2 - 2;     // outer radius

  ctx.clearRect(0, 0, S, S);

  // ─── 1. Clip everything to circle ───────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();

  // ─── 2. Background negro ─────────────────────────────────────
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, S, S);

  // ─── 3. Outer red ring ───────────────────────────────────────
  const ringW  = R * 0.28;          // width of red band
  const ringR  = R - ringW / 2;     // center radius of ring

  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = '#cc0000';
  ctx.lineWidth = ringW;
  ctx.stroke();

  // thin outer bright red line
  ctx.beginPath();
  ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = S * 0.008;
  ctx.stroke();

  // thin inner line (separator)
  ctx.beginPath();
  ctx.arc(cx, cy, R - ringW - S * 0.01, 0, Math.PI * 2);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = S * 0.006;
  ctx.stroke();

  // ─── 4. Curved text on ring ──────────────────────────────────
  const textTop    = '✦ SELLADO POR ESTRELLA ✦';
  const textBottom = '✦ MOTO SERVICIO ✦';
  const fontSize   = Math.round(ringW * 0.38);

  ctx.save();
  ctx.font = \`900 \${fontSize}px 'Segoe UI', Arial, sans-serif\`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  drawArcText(ctx, textTop,    cx, cy, ringR, -Math.PI * 0.58, true);
  drawArcText(ctx, textBottom, cx, cy, ringR,  Math.PI * 0.42, true);
  ctx.restore();

  // ─── 5. Inner circle (logo area) ─────────────────────────────
  const innerR = R - ringW - S * 0.025;

  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0a0a';
  ctx.fill();

  // subtle radial glow
  const grd = ctx.createRadialGradient(cx, cy - innerR * 0.1, innerR * 0.05, cx, cy, innerR);
  grd.addColorStop(0, 'rgba(239,68,68,0.08)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  // ─── 6. Logo ─────────────────────────────────────────────────
  const logoSize = innerR * 1.55;
  const logoX    = cx - logoSize / 2;
  const logoY    = cy - logoSize / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, innerR * 0.96, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(LOGO, logoX, logoY, logoSize, logoSize);
  ctx.restore();

  ctx.restore(); // restore clip
}

// ── Curved text helper ────────────────────────────────────────
function drawArcText(ctx, text, cx, cy, radius, startAngle, clockwise) {
  const dir   = clockwise ? 1 : -1;
  const chars = text.split('');
  // Measure total angular span
  let totalW = 0;
  chars.forEach(c => totalW += ctx.measureText(c).width);
  const totalAngle = totalW / radius;
  let angle = startAngle - (dir * totalAngle / 2);

  chars.forEach(c => {
    const cw   = ctx.measureText(c).width;
    const cAngle = cw / radius;
    angle += dir * cAngle / 2;
    ctx.save();
    ctx.translate(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(c, 0, 0);
    ctx.restore();
    angle += dir * cAngle / 2;
  });
}

// ── Descarga en resolución de imprenta ───────────────────────
function dl(which) {
  const printSize = PRINT_SIZES[which];
  const c = document.createElement('canvas');
  c.width  = printSize;
  c.height = printSize;
  drawSeal(c, printSize);

  // pequeño delay para que el logo esté listo
  setTimeout(() => {
    const a = document.createElement('a');
    a.download = 'sello-estrella-' + which + '-' + printSize + 'px.png';
    a.href = c.toDataURL('image/png');
    a.click();
  }, 80);
}

// ── Init: dibujar previews cuando el logo cargue ─────────────
function init() {
  drawSeal(document.getElementById('c-grande'),  280);
  drawSeal(document.getElementById('c-pequeno'), 180);
}

if (LOGO.complete) init();
else LOGO.onload = init;
</script>
</body>
</html>`;

fs.writeFileSync(OUT_HTML, html, 'utf8');
console.log('\n✅  Archivo generado:', OUT_HTML);
console.log('   Grande:  6 cm / 709×709 px  →  charola unicell');
console.log('   Pequeño: 3.5 cm / 413×413 px →  bolsa\n');
