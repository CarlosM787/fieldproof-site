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
