// Social preview images (1200x630) for every page family, EN + ES, from one template with each page's own
// worked example (numbers come from the calculators' own examples). Not deployed (scripts/ is skipped).
//   node scripts/brand/og.mjs        -> assets/og/*.png
// Needs puppeteer-core and system Chrome (see the release evidence folder for the setup used).
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '../..');
const PUPPETEER = process.env.PUPPETEER_MODULE;
if (!PUPPETEER) throw new Error('Set PUPPETEER_MODULE to puppeteer-core/lib/esm/puppeteer/puppeteer-core.js');
const { default: puppeteer } = await import(pathToFileURL(PUPPETEER).href);

const font = (w) => `url(data:font/woff2;base64,${readFileSync(path.join(ROOT, `assets/fonts/barlow-latin-${w}-normal.woff2`)).toString('base64')})`;
const MARK = readFileSync(path.join(ROOT, 'assets/brand/mark.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

const T = {
  en: { tag: 'POWERED BY AI. PRICED BY YOU.', free: 'Free · No signup · English & Spanish', site: 'talkestimate.com' },
  es: { tag: 'IMPULSADO POR IA. CON TUS PRECIOS.', free: 'Gratis · Sin registrarte · Español e inglés', site: 'talkestimate.com' },
};

// [file, lang, headline (with *yellow* part), sheet title, rows [label, value, kind], footer]
const CARDS = [
  ['og-home-en', 'en', 'Talk the job. Send the estimate *before you leave the driveway.*', 'Your estimate', [['Interior wall painting · 416 sq ft', '$673.92'], ['Drywall patch · 3', '$100.80'], ['Door installation · 1', '$120.00'], ['Material pickup', 'needs your hours', 'flag']], 'tag'],
  ['og-home-es', 'es', 'Habla el trabajo. Envía el estimado *antes de irte.*', 'Tu estimado', [['Pintura interior · 416 sqft', '$673.92'], ['Parche de drywall · 3', '$100.80'], ['Instalación de puerta · 1', '$120.00'], ['Ida a la tienda', 'faltan tus horas', 'flag']], 'tag'],
  ['og-tools-en', 'en', 'Free estimating tools *that work on your phone.*', 'Free tools', [['Markup vs margin calculator', 'live'], ['Painting estimate calculator', 'live'], ['Labor & job quote calculator', 'live'], ['Your numbers never leave the page', '✓', 'ok']], 'free'],
  ['og-tools-es', 'es', 'Herramientas para estimar *desde tu teléfono.*', 'Herramientas gratis', [['Calculadora de markup y margen', 'lista'], ['Calculadora de pintura', 'lista'], ['Mano de obra y cotización', 'lista'], ['Tus números no salen de la página', '✓', 'ok']], 'free'],
  ['og-markup-en', 'en', 'Markup vs margin: *same job, two prices.*', '$1,000 job cost', [['20% markup', '$1,200.00'], ['Keeps', '16.7%', 'muted'], ['20% margin', '$1,250.00', 'total'], ['Keeps', '20%', 'muted']], 'free'],
  ['og-markup-es', 'es', 'Markup y margen: *el mismo trabajo, dos precios.*', 'Costo de $1,000', [['20% de markup', '$1,200.00'], ['Te queda', '16.7%', 'muted'], ['20% de margen', '$1,250.00', 'total'], ['Te queda', '20%', 'muted']], 'free'],
  ['og-painting-en', 'en', 'Paint job estimate: *gallons, labor, price.*', '12 × 11 ft bedroom, 2 coats', [['Paintable area', '314 sq ft'], ['Gallons to buy', '3 gal'], ['Labor · 2 × 6 h', '$384.00'], ['Selling price', '$820.59', 'total']], 'free'],
  ['og-painting-es', 'es', 'Estimado de pintura: *galones, mano de obra, precio.*', 'Recámara de 12 × 11 pies, 2 manos', [['Área a pintar', '314 sqft'], ['Galones a comprar', '3 gal'], ['Mano de obra · 2 × 6 h', '$384.00'], ['Precio de venta', '$820.59', 'total']], 'free'],
  ['og-labor-en', 'en', 'Price the labor. *Quote the whole job.*', 'Siding repair, two-person crew', [['Labor · 18 crew hours', '$594.00'], ['Materials, travel, disposal', '$401.00'], ['Contingency 10%', '$99.50'], ['Selling price', '$1,616.88', 'total']], 'free'],
  ['og-labor-es', 'es', 'Cobra bien la mano de obra. *Cotiza todo el trabajo.*', 'Reparación de siding, 2 personas', [['Mano de obra · 18 horas', '$594.00'], ['Materiales, traslado, escombro', '$401.00'], ['Imprevistos 10%', '$99.50'], ['Precio de venta', '$1,616.88', 'total']], 'free'],
];

const html = ([, lang, head, title, rows, foot]) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
@font-face{font-family:B;src:${font(800)} format("woff2");font-weight:800}
@font-face{font-family:B;src:${font(700)} format("woff2");font-weight:700}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;background:#0B1220;color:#fff;font-family:'Segoe UI',Roboto,Arial,sans-serif;position:relative}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(96,140,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(96,140,255,.08) 1px,transparent 1px);background-size:40px 40px}
.glow{position:absolute;right:-180px;top:-200px;width:700px;height:700px;background:radial-gradient(circle,rgba(29,78,216,.55),transparent 65%)}
.lock{position:absolute;left:64px;top:56px;display:flex;align-items:center;gap:14px}
.lock svg{width:56px;height:56px}
.wm{font:800 38px/1 B;letter-spacing:-.4px}.wm em{font-style:normal;color:#8FB0FF}
h1{position:absolute;left:64px;top:162px;width:600px;font:800 64px/1.02 B;letter-spacing:-1px}
h1 em{font-style:normal;color:#FFC52E}
.foot{position:absolute;left:64px;bottom:56px;font:700 22px B;letter-spacing:.3px;color:#B9C6E8}
.foot.tag{color:#FFC52E;letter-spacing:1.6px;font-size:20px}
.sheet{position:absolute;right:64px;top:118px;width:430px;background:#FFFDF7;color:#0B1220;border-radius:22px;padding:28px 30px;box-shadow:0 30px 70px rgba(0,0,0,.45)}
.sheet .t{font:800 15px B;letter-spacing:1.4px;text-transform:uppercase;color:#475467}
.sheet .r{display:flex;justify-content:space-between;gap:14px;padding:13px 0;border-bottom:1px solid #E9E4D6;font-size:19px}
.sheet .r b{font:800 22px B;font-variant-numeric:tabular-nums;white-space:nowrap}
.sheet .r.total{border-bottom:0;border-top:3px solid #0B1220;margin-top:6px;padding-top:16px}
.sheet .r.total span{font-weight:700}.sheet .r.total b{font-size:34px;color:#1D4ED8}
.sheet .r.muted{color:#667085;font-size:16px;padding:6px 0 12px}.sheet .r.muted b{font-size:18px;color:#15803D}
.sheet .r.flag b{font:700 16px 'Segoe UI',Arial;color:#B45309}
.sheet .r.ok b{color:#15803D}
.bar{height:8px;border-radius:4px;background:linear-gradient(90deg,#1D4ED8 0 46%,#8A9BC9 46% 76%,#F5B800 76%);margin:14px 0 4px}
</style></head><body><div class="grid"></div><div class="glow"></div>
<div class="lock">${MARK}<span class="wm">Talk<em>Estimate</em></span></div>
<h1>${head.replace(/\*([^*]+)\*/g, '<em>$1</em>')}</h1>
<div class="sheet"><div class="t">${title}</div><div class="bar"></div>${rows.map(([a, v, k]) => `<div class="r ${k || ''}"><span>${a}</span><b>${v}</b></div>`).join('')}</div>
<div class="foot ${foot === 'tag' ? 'tag' : ''}">${foot === 'tag' ? T[lang].tag : T[lang].free}</div>
</body></html>`;

mkdirSync(path.join(ROOT, 'assets/og'), { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
for (const card of CARDS) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.setContent(html(card), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(ROOT, `assets/og/${card[0]}.png`) });
  await page.close();
  console.log('wrote', card[0]);
}
await browser.close();
