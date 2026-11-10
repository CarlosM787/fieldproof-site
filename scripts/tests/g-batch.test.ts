// Digest G website audit (WO-20261106-10, directive V5 §10): pins for the W-01..W-22 fixes on site/g-batch-2026-11.
// One block per theme. No price amount is pinned here (prices ship with the Stripe cutover, pricing-20-35.test.ts).
// Run with:  npx deno test --allow-read scripts/tests/g-batch.test.ts

import { assert, assertEquals } from 'jsr:@std/assert@1';

const root = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, root)).replace(/\r\n/g, '\n');
const HOME = ['index.html', 'es.html'];

// ── Claims and copy (W-02, W-03, W-04, W-05, W-06, W-07) ─────────────────────────────────────────────────────────────

Deno.test('W-03/W-07: no quote-marked composite complaint, no "most common" superlative, no empty quote slot (EN+ES)', () => {
  for (const p of HOME) {
    const html = read(p);
    assert(!/most common complaint|most common complaints|office suite with a learning curve|quejas m[aá]s comunes|queja m[aá]s com[uú]n|nom[aá]s quiero/i.test(html), `${p}: composite complaint`);
    assert(!/Your quote goes here|Aqu[ií] va tu frase|pain-card/.test(html), `${p}: placeholder quote card`);
  }
  // The section keeps its anchor and the founder card, and says what the product is without quoting anyone.
  assert(read('index.html').includes('<h2>One flow, not an office suite</h2>'));
  assert(read('es.html').includes('<h2>Un solo flujo, no un sistema de oficina</h2>'));
  for (const p of HOME) assert(/<section id="why-switch">[\s\S]*?class="founder"/.test(read(p)), `${p}: founder card kept`);
});

Deno.test('W-05: the demo is "an example walkthrough", never "real" or "exactly as spoken" (EN+ES)', () => {
  assert(read('index.html').includes('<p class="lead">An example walkthrough:</p>'));
  assert(read('es.html').includes('<p class="lead">Un recorrido de ejemplo:</p>'));
  for (const p of HOME) assert(!/exactly as spoken|real walkthrough|tal como se habl[oó]|recorrido real/i.test(read(p)), p);
});

Deno.test('W-06: no untested glove/sunlight claim and no "I never agreed to that is over" promise (EN+ES)', () => {
  for (const p of HOME) {
    const html = read(p);
    assert(!/glove|sunlight|never agreed|guantes|para el sol|nunca acept[eé]/i.test(html), p);
    assert(!html.includes('🧤'), `${p}: glove icon gone with the glove claim`);
  }
  assert(read('index.html').includes('Big buttons, high-contrast screens, and a recording made with no signal'));
  assert(read('es.html').includes('Botones grandes, pantallas de alto contraste, y si grabas sin señal'));
});

Deno.test('W-04: the Spanish FAQ makes no "perfectly" accuracy claim and claims no more than the English page', () => {
  const es = read('es.html');
  assert(!/perfectamente/i.test(es));
  assert(!/facturas y recibos/i.test(es), 'receipts are not claimed in English either');
  assert(es.includes('Si algo no se oye bien, lo corriges en la pantalla de revisión antes de enviar.'));
});

Deno.test('W-02: support says the app is not public yet before it points app users at the account page (EN+ES)', () => {
  const s = read('support.html').replace(/\s+/g, ' ');
  const en = s.indexOf('TalkEstimate is not released to the public yet.');
  const es = s.indexOf('TalkEstimate todavía no está disponible al público.');
  assert(en > 0 && en < s.indexOf('<a href="/account/">account page</a>'), 'EN status before the account link');
  assert(es > 0 && es < s.indexOf('<a href="/es/cuenta/">página de cuenta</a>'), 'ES status before the account link');
  assert(s.includes('If you already use the app, sign in on your <a href="/account/">account page</a>'));
  assert(s.includes('Si ya usas la app, entra a tu <a href="/es/cuenta/">página de cuenta</a>'));
  assert(!/To buy Starter|Para comprar Starter/.test(s), 'no unconditional "buy Starter" instruction');
  assertEquals((s.match(/Last updated: November 10, 2026/g) ?? []).length, 1);
});

// ── Style (W-19) ──────────────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('W-19: the home pages use few em dashes in visible text (was 32 each); the rest sit on price-coordinated lines', () => {
  for (const p of HOME) {
    const html = read(p);
    const text = html.slice(html.indexOf('<body')).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
    const n = (text.match(/—/g) ?? []).length;
    assert(n <= 8, `${p}: ${n} em dashes in visible text`);
  }
});

// ── 404, redirects, analytics settings link (W-01, W-13, W-18) ───────────────────────────────────────────────────────

Deno.test('W-13: /es/ redirects (301) to the Spanish home instead of a 404; /es still rewrites', () => {
  const rules = read('_redirects').split('\n').map((l) => l.trim().split(/\s+/));
  assert(rules.some(([f, t, c]) => f === '/es/' && t === '/es.html' && c === '301'), '/es/ -> /es.html 301');
  assert(rules.some(([f, t, c]) => f === '/es' && t === '/es.html' && c === '200'), '/es kept');
});

Deno.test('W-01: the 404 body is a column (the analytics band stacks above the card), the card is in <main>, a footer hosts the settings link', () => {
  const h = read('404.html');
  const body = /body \{([^}]*)\}/.exec(h)![1];
  assert(/flex-direction: column/.test(body) && !/justify-content: center/.test(body), 'body is a column, not a centred row');
  assert(/<main>\s*<div class="card">[\s\S]*<\/main>\s*<footer><div class="foot"><div>/.test(h));
  assert(h.includes('href="/apple-touch-icon.png"'), 'absolute icon path works at any 404 depth');
});

type N = { tag: string; kids: N[]; text: string; cls?: string; parentNode: N | null; on: Record<string, () => void>; style: { cssText: string }; attrs: Record<string, string>; appendChild: (c: N) => N; [k: string]: unknown };
function node(tag: string): N {
  const n = { tag, kids: [], text: '', parentNode: null, on: {}, style: { cssText: '' }, attrs: {} } as unknown as N;
  Object.assign(n, {
    appendChild(c: N) { c.parentNode = n; n.kids.push(c); return c; },
    insertBefore(c: N, ref: N | null) { c.parentNode = n; const i = ref ? n.kids.indexOf(ref) : -1; if (i < 0) n.kids.push(c); else n.kids.splice(i, 0, c); return c; },
    removeChild(c: N) { n.kids = n.kids.filter((x) => x !== c); c.parentNode = null; },
    setAttribute(k: string, v: string) { n.attrs[k] = v; }, addEventListener(t: string, f: () => void) { n.on[t] = f; }, focus() {},
    querySelector: (q: string) => (q === '.te-consent-link' ? n.kids.find((k) => k.className === 'te-consent-link') ?? null : null),
  });
  Object.defineProperty(n, 'textContent', { get: () => n.text, set: (v: string) => { n.text = v; } });
  return n;
}

Deno.test('W-18: "Analytics settings" joins the footer link line; reopened, the band sits above the footer row; GA still waits for Allow', () => {
  const body = node('body'), footer = node('footer'), row = node('div'), brand = node('div'), links = node('div');
  footer.appendChild(row); row.appendChild(brand); row.appendChild(links); body.appendChild(footer);
  const loaded: string[] = [];
  const document = {
    readyState: 'complete', referrer: '', documentElement: { lang: 'en' }, cookie: '', body,
    head: { appendChild: (e: { src?: string }) => { if (e.src) loaded.push(e.src); } },
    createElement: (t: string) => node(t), createTextNode: (t: string) => ({ tag: '#text', text: t, kids: [] }),
    querySelector: (q: string) => (q === 'footer .foot > div:last-child' ? links : q === 'footer' ? footer : null), querySelectorAll: () => [], addEventListener() {},
  };
  const mem: Record<string, string> = { 'te.consent.v1': JSON.stringify({ v: 1, analytics: 'denied' }) };
  const localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
  const win = { addEventListener() {}, removeEventListener() {} };
  new Function('window', 'document', 'location', 'localStorage', read('analytics.js'))(win, document, { hostname: 'talkestimate.com', pathname: '/', search: '' }, localStorage);
  const btn = links.kids.find((k) => k.className === 'te-consent-link')!;
  assert(btn && btn.text === 'Analytics settings', 'button inside the link line');
  assert(links.kids.some((k) => k.className === 'te-consent-sep' && k.text === ' · '), 'separated like the other links');
  assertEquals(footer.kids.length, 1, 'nothing appended after the footer row');
  btn.on.click();
  const i = footer.kids.findIndex((k) => k.attrs.role === 'region');
  assert(i >= 0 && footer.kids[i + 1] === row, 'reopened band sits right above the footer row, full width');
  assertEquals(loaded, [], 'reopening never loads GA');
  assert(read('analytics.js').includes('.te-consent,.te-consent-link,.te-consent-sep{display:none!important}'), 'print hides it');
});

// ── Structure (W-12 one H1, W-14 legal-page navigation, W-15 <main>) ────────────────────────────────────────────────

const LEGAL = ['support.html', 'privacy.html', 'delete-account.html', 'terms.html'];

Deno.test('W-15: home EN/ES, support, privacy, delete-account and terms each have exactly one <main>, with nav and footer outside it', () => {
  for (const p of [...HOME, ...LEGAL]) {
    const h = read(p);
    assertEquals((h.match(/<main[\s>]/g) ?? []).length, 1, `${p}: one <main>`);
    const main = h.slice(h.indexOf('<main'), h.indexOf('</main>'));
    assert(!/<nav[\s>]/.test(main) && !/<footer[\s>]/.test(main), `${p}: nav/footer outside <main>`);
    assert(h.indexOf('<footer') > h.indexOf('</main>'), `${p}: footer after main`);
  }
  for (const p of HOME) assert(/<main id="main">\s*<header class="hero">/.test(read(p)), `${p}: main starts at the hero`);
});

Deno.test('W-14: every legal/support page has a way home (logo + Home/Inicio) and the site footer; every footer link resolves', () => {
  for (const p of LEGAL) {
    const h = read(p);
    assert(h.includes('<nav class="site-top" aria-label="Main">'), `${p}: top bar`);
    assert(h.includes('<a class="logo" href="/" aria-label="TalkEstimate home">'), `${p}: logo links home`);
    assert(h.includes('<a href="/es.html" lang="es" hreflang="es">Inicio</a>'), `${p}: Spanish home`);
    assert(h.includes('<footer class="site-foot">') && h.includes('© 2026 Morales Labs LLC'), `${p}: footer`);
    for (const [, href] of h.matchAll(/href="\/([a-z0-9-]+\.html)"/g)) {
      try { Deno.statSync(new URL(href, root)); } catch { throw new Error(`${p} -> ${href} missing`); }
    }
  }
  assert(read('assets/brand/brand.css').includes('.site-top {') && read('assets/brand/brand.css').includes('.site-foot .foot {'));
});

Deno.test('W-12 (part): one H1 per bilingual legal page; the Spanish title is an h2 styled like it, sections unchanged', () => {
  for (const p of LEGAL) assertEquals((read(p).match(/<h1[\s>]/g) ?? []).length, 1, p);
  for (const [p, t] of [['support.html', 'Soporte de TalkEstimate'], ['privacy.html', 'Política de privacidad de TalkEstimate'], ['delete-account.html', 'Eliminar tu cuenta o tus datos de TalkEstimate']]) {
    assert(read(p).includes(`<div id="es" lang="es">\n      <h2 class="es-title">${t}</h2>`) || read(p).includes(`<h2 class="es-title">${t}</h2>`), p);
  }
});

// ── SEO metadata (W-08 sitemap lastmod, W-09 titles/descriptions, W-10 FAQPage + logo; canonicals and hreflang) ─────

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const sitemap = read('sitemap.xml');
const urls = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, u]) => ({
  loc: /<loc>([^<]+)<\/loc>/.exec(u)![1], lastmod: /<lastmod>([^<]+)<\/lastmod>/.exec(u)?.[1] ?? '',
  alts: [...u.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map(([, l, h]) => [l, h]),
}));
const fileFor = (loc: string) => {
  const p = new URL(loc).pathname;
  for (const c of p.endsWith('/') ? [p + 'index.html'] : [p, p + '.html']) {
    try { if (Deno.statSync(new URL(c.slice(1), root)).isFile) return c.slice(1); } catch { /* next */ }
  }
  throw new Error(`no file for ${loc}`);
};

Deno.test('W-09: every sitemap page has a title of at most 60 characters and a description of at most 160', () => {
  assertEquals(urls.length, 22);
  for (const { loc } of urls) {
    const h = read(fileFor(loc));
    const t = decode(/<title>([^<]+)<\/title>/.exec(h)![1]);
    const d = decode(/<meta name="description" content="([^"]+)"/.exec(h)![1]);
    assert([...t].length <= 60, `${loc}: title ${[...t].length}`);
    assert([...d].length <= 160, `${loc}: description ${[...d].length}`);
  }
});

Deno.test('canonicals and hreflang: each sitemap page is self-canonical and its hreflang links match the sitemap pairs', () => {
  for (const { loc, alts } of urls) {
    const h = read(fileFor(loc));
    assert(h.includes(`<link rel="canonical" href="${loc}" />`), `${loc}: canonical`);
    for (const [lang, href] of alts) assert(h.includes(`<link rel="alternate" hreflang="${lang}" href="${href}" />`), `${loc}: hreflang ${lang}`);
  }
});

Deno.test('W-08: every lastmod is a real date, not in the future, and not older than the page\'s own "Last updated" line', () => {
  const now = new Date().toISOString().slice(0, 10);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  for (const { loc, lastmod } of urls) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(lastmod) && !isNaN(Date.parse(lastmod)), `${loc}: ${lastmod}`);
    assert(lastmod <= now || lastmod <= new Date(Date.now() + 14 * 3600e3).toISOString().slice(0, 10), `${loc}: future ${lastmod}`);
    const m = /Last updated: (\w+) (\d+), (\d{4})/.exec(read(fileFor(loc)));
    if (m) {
      const shown = `${m[3]}-${String(months.indexOf(m[1]) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
      assert(lastmod >= shown, `${loc}: lastmod ${lastmod} older than "Last updated" ${shown}`);
    }
  }
  assert(!sitemap.includes('2026-07-12'), 'the July dates are gone');
});

const PLAN_PRICE = /\$\s?\d[\d.,]*\s?\/\s?(mo|month|mes)\b/i;
const plain = (s: string) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const FAQ_PAGES = ['index.html', 'es.html', 'tools/markup-margin-calculator.html', 'tools/painting-estimate-calculator.html', 'tools/labor-job-quote-calculator.html',
  'tools/labor-cost-per-hour-calculator.html', 'es/herramientas/calculadora-markup-margen.html', 'es/herramientas/calculadora-estimado-pintura.html',
  'es/herramientas/calculadora-mano-de-obra-cotizacion.html', 'es/herramientas/calculadora-costo-hora-mano-de-obra.html'];

Deno.test('W-10: FAQPage data on the home and calculator pages says exactly what the visible FAQ says, never a plan price', () => {
  for (const p of FAQ_PAGES) {
    const h = read(p);
    const ld = /<script type="application\/ld\+json" id="faq-ld">([\s\S]*?)<\/script>/.exec(h);
    assert(ld, `${p}: FAQPage block`);
    const data = JSON.parse(ld[1]);
    assertEquals(data['@type'], 'FAQPage');
    const faq = h.slice(h.indexOf('<div class="faq"'));
    const visible = [...faq.matchAll(/<details><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map(([, q, a]) => [plain(q), plain(a)])
      .filter(([, a]) => !PLAN_PRICE.test(a));
    const marked = data.mainEntity.map((x: { name: string; acceptedAnswer: { text: string } }) => [x.name, x.acceptedAnswer.text]);
    assertEquals(marked, visible, `${p}: FAQPage == visible FAQ`);
    assert(marked.length >= 5, `${p}: ${marked.length} questions`);
    for (const [, a] of marked) assert(!PLAN_PRICE.test(a), `${p}: plan price in FAQPage`);
  }
  for (const p of HOME) assert(read(p).includes('"logo": "https://talkestimate.com/assets/brand/icon-512.png"'), `${p}: square logo`);
});

// ── security.txt and IndexNow (W-17 part, W-11) ───────────────────────────────────────────────────────────────────────

Deno.test('W-17 (part): /.well-known/security.txt (RFC 9116) names the public support inbox and expires within a year', () => {
  const s = read('.well-known/security.txt');
  assert(/^Contact: mailto:support@talkestimate\.com$/m.test(s));
  assert(/^Canonical: https:\/\/talkestimate\.com\/\.well-known\/security\.txt$/m.test(s));
  assert(/^Preferred-Languages: en, es$/m.test(s));
  const exp = Date.parse(/^Expires: (\S+)$/m.exec(s)![1]);
  assert(exp > Date.now(), 'not expired (renew before it lapses)');
  assert(exp < Date.UTC(2027, 11, 31), 'less than about a year ahead');
  // cf-assets copies every root entry except its SKIP list, so .well-known ships; wrangler only skips _headers/_redirects/.assetsignore.
  assert(!/'\.well-known'/.test(read('scripts/cf-assets.mjs')), '.well-known is not skipped');
});

Deno.test('W-11: an IndexNow key is served at /<key>.txt by the prod build only; the raw key file and the plan file never ship', () => {
  const key = read('indexnow-key.txt').trim();
  assert(/^[a-f0-9]{32,128}$/.test(key));
  const cf = read('scripts/cf-assets.mjs');
  assert(cf.includes("'indexnow-key.txt', '.indexnow-plan.json']"), 'skipped as files');
  assert(cf.includes("if (mode === 'prod' && existsSync('indexnow-key.txt'))") && cf.includes('writeFileSync(path.join(OUT, `${indexNowKey}.txt`), indexNowKey);'));
  assert(read('.gitignore').includes('.indexnow-plan.json'));
  const tool = read('scripts/indexnow.mjs');
  assert(tool.includes("const key = readFileSync('indexnow-key.txt', 'utf8').trim();") && tool.includes('https://api.indexnow.org/indexnow'));
  assert(tool.includes("if (cmd === 'plan')") && tool.includes('--dry-run'), 'plan before deploy, send only after (owner-run)');
});

// ── Assets and the approval page (W-16, W-20) ─────────────────────────────────────────────────────────────────────────

Deno.test('W-16: founder.jpg is a small square image for the 96 px circle (was 400,152 bytes, 1187x1200)', () => {
  const b = Deno.readFileSync(new URL('founder.jpg', root));
  assert(b.length < 20000, `${b.length} bytes`);
  // JPEG SOFn frame header: height and width (big-endian) follow the 0xFFC0/0xFFC2 marker.
  let i = 2; let w = 0, h = 0;
  while (i < b.length) { const m = b[i + 1]; const len = (b[i + 2] << 8) | b[i + 3]; if (m === 0xc0 || m === 0xc2) { h = (b[i + 5] << 8) | b[i + 6]; w = (b[i + 7] << 8) | b[i + 8]; break; } i += 2 + len; }
  assertEquals([w, h], [192, 192]);
  for (const p of HOME) assert(read(p).includes('<img src="founder.jpg" width="96" height="96" loading="lazy"'), `${p}: same 96 px slot`);
});

Deno.test('W-20: the no-token approval page sets its own font at zero specificity and has a favicon; the approval script is untouched', () => {
  const p = read('p/index.html');
  assert(p.includes(":where(html) { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }"));
  assert(p.indexOf('<style id="doc-css"></style>') < p.indexOf(':where(html)'), 'after doc-css in source, but :where() keeps the proposal CSS in charge');
  assert(p.includes('<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">'));
  assert(p.includes("var API = 'https://api.talkestimate.com/functions/v1/get-public-proposal';"), 'same endpoint');
  assert(!/googletagmanager|analytics\.js/.test(p), 'still no analytics on a page with a secret token');
});

// ── Tools hub and calculator sources (W-21, W-22) ────────────────────────────────────────────────────────────────────

Deno.test('W-21: neither tools hub advertises the unshipped estimate template (tools-pages.test.ts pins the cards)', () => {
  for (const p of ['tools/index.html', 'es/herramientas/index.html']) assert(!/Coming next|Lo que viene|card soon|estimate template|Plantilla de estimado/i.test(read(p)), p);
});

Deno.test('W-22: the Idaho workers\' comp rates are labelled as one state\'s example, not Arizona\'s, in EN and ES', () => {
  const en = read('tools/labor-cost-per-hour-calculator.html'), es = read('es/herramientas/calculadora-costo-hora-mano-de-obra.html');
  assert(en.includes('An example from one state (Idaho, not Arizona): the <a href="https://iic.idaho.gov/') && en.includes('Use your own state’s rate.'));
  assert(es.includes('Un ejemplo de un solo estado (Idaho, no Arizona): las <a href="https://iic.idaho.gov/') && es.includes('Usa la tarifa de tu propio estado.'));
});

// ── Neutral Spanish (directive V5: Latin American / Puerto Rico, no Mexico-only words) ──────────────────────────────

Deno.test('Spanish pages avoid Mexico-only words (recámara, troca, resanar/resanador, zoclo); neutral words of the same gender are used', () => {
  const es = ['es.html', 'es/herramientas/index.html', 'es/herramientas/calculadora-markup-margen.html', 'es/herramientas/calculadora-estimado-pintura.html',
    'es/herramientas/calculadora-mano-de-obra-cotizacion.html', 'es/herramientas/calculadora-costo-hora-mano-de-obra.html',
    'es/guias/markup-vs-margen.html', 'es/guias/como-estimar-pintura.html', 'es/guias/como-cobrar-mano-de-obra.html'];
  for (const p of es) assert(!/rec[aá]mara|\btroca|resan|zoclo|nom[aá]s\b/i.test(read(p)), p);
  assert(read('es.html').includes('La habitación principal, doce por catorce'));
  assert(read('es/guias/como-estimar-pintura.html').includes('una habitación de 12 × 11 pies'));
});

Deno.test('local preview (scripts/dev-server.mjs) serves /.well-known/ like Cloudflare, and still hides other dot paths', () => {
  const src = read('scripts/dev-server.mjs');
  // Pull the guard regex literal out of the server source and exercise it.
  const lit = /\.test\(file\.slice\(ROOT\.length\)\)/.test(src) ? /\/(\[\\\\\/\][^\n]*?)\/\.test\(file\.slice/.exec(src)![1] : '';
  const guard = new RegExp(lit);
  assert(lit.includes('(?!well-known'), 'well-known exception present');
  assert(guard.test('/.git/config') && guard.test('/.wrangler/x') && guard.test('/scripts/x.mjs') && !guard.test('/.well-known/security.txt') && !guard.test('/es/herramientas/'), 'guard behaviour');
});

// ── CLS: the analytics band never pushes the page down (Growth 2026-11-10: CLS 0.149 on /es/herramientas/calculadora-markup-margen) ──

Deno.test('CLS: every page that loads analytics.js reserves the band space in <head>, before first paint, on the prod host only', () => {
  const pages: string[] = [];
  const walk = (d: string) => { for (const e of Deno.readDirSync(new URL(d || '.', root))) { const p = d ? `${d}/${e.name}` : e.name;
    if (e.isDirectory) { if (!['scripts', 'node_modules', '.git', '.cf-dist', '.wrangler', '.well-known'].includes(e.name)) walk(p); } else if (p.endsWith('.html')) pages.push(p); } };
  walk('');
  const withGa = pages.filter((p) => read(p).includes('src="/analytics.js"'));
  assertEquals(withGa.length, 23);
  for (const p of withGa) {
    const h = read(p);
    const i = h.indexOf("document.documentElement.classList.add('te-ask')");
    assert(i > 0 && i < h.indexOf('</head>'), `${p}: reserve line in head`);
    assert(h.includes(String.raw`/^(www\.)?talkestimate\.com$/.test(location.hostname)&&localStorage.getItem('te.consent.v1')===null`), `${p}: same conditions as analytics.js`);
    assert(h.includes("setTimeout(function(){document.documentElement.classList.remove('te-ask')},6000)"), `${p}: never stuck if analytics.js is blocked`);
  }
  const css = read('assets/brand/brand.css');
  assert(css.includes('html.te-ask body::before { content: ""; display: block; height: 153px; background: #101828; }'));
  assert(css.includes('@media (min-width: 768px) { html.te-ask body::before { height: 64px; } html.te-ask[lang="es"] body::before { height: 81px; } }'));
});

Deno.test('CLS: analytics.js clears the reserved space in the same task it inserts the band, and also when it will not ask', () => {
  for (const [stored, host, expectBar] of [[null, 'talkestimate.com', true], ['granted', 'talkestimate.com', false], [null, 'localhost', false]] as const) {
    const cls = new Set(['te-ask']);
    const body = node('body'), footer = node('footer');
    body.appendChild(footer);
    let clsWhenBarInserted: boolean | null = null;
    const ins = body.insertBefore as (c: N, r: N | null) => N;
    body.insertBefore = (c: N, r: N | null) => { const out = ins(c, r); if (c.attrs.role === 'region') clsWhenBarInserted = cls.has('te-ask'); return out; };
    const document = {
      readyState: 'complete', referrer: '', documentElement: { lang: 'es', classList: { remove: (c: string) => cls.delete(c), add: (c: string) => cls.add(c) } }, cookie: '', body,
      head: { appendChild: () => {} }, createElement: (t: string) => node(t), createTextNode: (t: string) => ({ tag: '#text', text: t, kids: [] }),
      querySelector: (q: string) => (q === 'footer' ? footer : null), querySelectorAll: () => [], addEventListener() {},
    };
    const mem: Record<string, string> = stored ? { 'te.consent.v1': JSON.stringify({ v: 1, analytics: stored }) } : {};
    const localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
    new Function('window', 'document', 'location', 'localStorage', read('analytics.js'))({ addEventListener() {}, removeEventListener() {} }, document, { hostname: host, pathname: '/', search: '' }, localStorage);
    assertEquals(cls.has('te-ask'), false, `${stored}/${host}: reserve cleared`);
    assertEquals(clsWhenBarInserted !== null, expectBar, `${stored}/${host}: band shown?`);
    if (expectBar) assertEquals(clsWhenBarInserted, true, 'band inserted while the space is still reserved (same task, one frame)');
  }
});

Deno.test('support.html is linked from every shared footer (EN -> /support.html, ES -> /support.html#es); Google saw 1 inlink', () => {
  const pages = ['index.html', 'es.html', 'tools/index.html', 'es/herramientas/index.html', 'tools/markup-margin-calculator.html', 'tools/painting-estimate-calculator.html',
    'tools/labor-job-quote-calculator.html', 'tools/labor-cost-per-hour-calculator.html', 'es/herramientas/calculadora-markup-margen.html',
    'es/herramientas/calculadora-estimado-pintura.html', 'es/herramientas/calculadora-mano-de-obra-cotizacion.html', 'es/herramientas/calculadora-costo-hora-mano-de-obra.html',
    'guides/markup-vs-margin.html', 'guides/how-to-estimate-a-paint-job.html', 'guides/how-to-price-labor.html', 'es/guias/markup-vs-margen.html',
    'es/guias/como-estimar-pintura.html', 'es/guias/como-cobrar-mano-de-obra.html', ...LEGAL];
  for (const p of pages) {
    const h = read(p); const foot = h.slice(h.indexOf('<footer'), h.indexOf('</footer>'));
    const es = h.includes('<html lang="es"');
    assert(foot.includes(es ? '<a href="/support.html#es">Soporte</a>' : '<a href="/support.html">Support</a>'), p);
  }
});

// ── /p/ CSP (Advisor V5-D06) ─────────────────────────────────────────────────────────────────────────────────────────

async function sha256b64(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return btoa(String.fromCharCode(...d));
}

Deno.test('V5-D06: /p/ has a CSP that allows exactly its one inline script (LF and CRLF hashes), its API origins and logo images, nothing third-party', async () => {
  const headers = read('_headers');
  const block = headers.slice(headers.indexOf('\n/p/*\n'), headers.indexOf('\n/account/\n'));
  const csp = /Content-Security-Policy: ([^\n]+)/.exec(block)?.[1] ?? '';
  assert(csp, '/p/* sends a CSP');
  const scripts = [...read('p/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assertEquals(scripts.length, 1, 'one inline script, no external script');
  const lf = scripts[0];
  for (const h of [await sha256b64(lf), await sha256b64(lf.replace(/\n/g, '\r\n'))]) assert(csp.includes(`'sha256-${h}'`), `script hash ${h} listed`);
  const dir = (n: string) => (new RegExp(`(?:^|; )${n} ([^;]+)`).exec(csp)?.[1] ?? '').split(' ');
  assertEquals(dir('default-src'), ["'none'"]);
  assert(!dir('script-src').includes("'unsafe-inline'") && dir('script-src').every((s) => s.startsWith("'sha256-")), 'script-src is hashes only');
  assertEquals(dir('connect-src').sort(), ['https://api.talkestimate.com', 'https://zjggusmqgzvbfxwbvmsu.supabase.co']);
  assertEquals(dir('img-src'), ["'self'", 'https:', 'data:']);
  assertEquals(dir('frame-ancestors'), ["'self'"], 'same as the site-wide X-Frame-Options: SAMEORIGIN');
  assert(block.includes('Referrer-Policy: no-referrer') && block.includes('X-Robots-Tag: noindex, nofollow') && block.includes('Cache-Control: no-store'), 'existing /p/ headers kept');
});
