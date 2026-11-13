// V6 batch 3: the free printable estimate template (EN /tools/estimate-template, ES /es/herramientas/plantilla-de-estimado).
// (a) page structure: one #join form, a label for every field, the print button, first-party scripts only, and a script
//     that never makes a request or stores anything; (b) the example job recomputed with estimate-math.js equals every
//     figure the pages print about it; (c) EN/ES parity: same field ids, same words on both sides of the shared script.
// SEO wiring (routes, sitemap, hreflang, JSON-LD) is in tools-pages.test.ts; the inline form in inline-waitlist.test.ts.
// Run with:  npx deno test --allow-read scripts/tests/estimate-template.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import * as math from '../../tools/assets/estimate-math.js';
// deno-lint-ignore no-explicit-any
const M: any = math;

const root = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, root)).replace(/\r\n/g, '\n');
const PAGES = [
  { file: 'tools/estimate-template.html', lang: 'en' },
  { file: 'es/herramientas/plantilla-de-estimado.html', lang: 'es' },
] as const;
const JS = read('tools/assets/estimate-template.js');
const CSS = read('tools/assets/tools.css');
const usd = (c: number) => M.formatMoney(c, 'en');
/** What a visitor reads: scripts and tags stripped, entities that matter here decoded, whitespace collapsed. */
const visible = (h: string) => h.slice(h.indexOf('<body')).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const ids = (h: string) => [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

// ── (a) structure ───────────────────────────────────────────────────────────────────────────────────────────────────

for (const pg of PAGES) {
  const html = read(pg.file);

  Deno.test(`${pg.file}: one #join waitlist form, nav button to it, the approved CTA note, scripts in order`, () => {
    assertEquals((html.match(/<form class="wl-inline" id="join" data-waitlist>/g) ?? []).length, 1);
    assertEquals((html.match(/ id="join"/g) ?? []).length, 1);
    assert(html.includes('<button type="submit" data-cta="tool_estimate_template_waitlist">'));
    const nav = html.split('</nav>')[0];
    assert(nav.includes(pg.lang === 'es'
      ? '<a class="btn" href="#join" data-cta="tool_nav_waitlist">Únete<span class="nav-more"> a la lista de espera</span></a>'
      : '<a class="btn" href="#join" data-cta="tool_nav_waitlist">Join<span class="nav-more"> the waitlist</span></a>'));
    assert(html.includes(pg.lang === 'es'
      ? '<p class="note">Todavía no disponible — pronto en Android · construida y probada en un teléfono real</p>'
      : '<p class="note">Not released yet — Android coming soon · built and tested on a real phone</p>'));
    const a = html.indexOf('<script src="/analytics.js" defer></script>');
    const w = html.indexOf('<script src="/assets/waitlist.js" defer></script>');
    const t = html.indexOf('<script type="module" src="/tools/assets/estimate-template.js"></script>');
    assert(a > 0 && w > a && t > w, 'analytics.js, then waitlist.js, then the template');
  });

  Deno.test(`${pg.file}: the CTA describes the app in the labor page's own words (no new claim)`, () => {
    const twin = read(pg.lang === 'es' ? 'es/herramientas/calculadora-mano-de-obra-cotizacion.html' : 'tools/labor-job-quote-calculator.html');
    const pitch = (h: string) => /<div class="cta-band">\s*<div>\s*<h2>[^<]*<\/h2>\s*<p>([^<]*)<\/p>/.exec(h)![1];
    assertEquals(pitch(html), pitch(twin));
  });

  Deno.test(`${pg.file}: every field has a label bound to it; the honeypot is the only unlabelled input`, () => {
    const fields = [...html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)].map((m) => m[2]);
    assert(fields.length >= 18, `${fields.length} fields`);
    for (const attrs of fields) {
      if (/class="hp"/.test(attrs)) { assert(/aria-hidden="true"/.test(attrs) && /tabindex="-1"/.test(attrs)); continue; }
      const id = /\sid="([^"]+)"/.exec(attrs)?.[1];
      assert(id, `a field without an id: ${attrs}`);
      assertEquals((html.match(new RegExp(`<label for="${id}"[ >]`, 'g')) ?? []).length, 1, `label for #${id}`);
    }
  });

  Deno.test(`${pg.file}: the print button, the print-only estimate, the assurance chip`, () => {
    assert(/<button type="button" class="btn" id="printBtn">(Print or save PDF|Imprimir o guardar PDF)<\/button>/.test(html));
    assert(html.includes('<div class="print-only est-doc" id="doc"></div>'));
    assert(html.includes('<body class="tool-page tool-b">') && html.includes('<main class="est-page">'));
    assert(html.includes(pg.lang === 'es' ? '<span>Tus números no salen de esta página</span>' : '<span>Your numbers never leave this page</span>'));
    // The flat-price rule is said on the page, where the lines are typed.
    assert(html.includes(pg.lang === 'es' ? '<b>Deja la cantidad en blanco para un precio fijo:</b> el precio que escribes es el total de la línea.'
      : '<b>Leave the quantity blank for a flat price:</b> the price you type is the line total.'));
    // Sales tax: state rules, no legal advice.
    assert(html.includes(pg.lang === 'es' ? 'revisa las reglas de tu estado' : 'check your state’s rules'));
    assert(html.includes(pg.lang === 'es' ? 'no asesoría legal' : 'not legal advice'));
  });

  Deno.test(`${pg.file}: first-party scripts only, no inline handlers, nothing typed is prefilled`, () => {
    for (const m of html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)) assert(m[1].startsWith('/') && !m[1].startsWith('//'), `external script ${m[1]}`);
    assert(!/\son[a-z]+="/i.test(html), 'no inline event handlers');
    for (const m of html.matchAll(/<input\b[^>]*>/g)) assert(!/\svalue="/.test(m[0]), `prefilled: ${m[0]}`);
  });

  Deno.test(`${pg.file}: every element the script looks up is on the page`, () => {
    const used = new Set([...JS.matchAll(/(?:\$|\bv|readMoney|readNumber)\('([A-Za-z0-9-]+)'/g)].map((m) => m[1]));
    assert(used.size > 15);
    for (const id of used) assert(html.includes(`id="${id}"`), `missing #${id}`);
    for (const id of ['valid-chips', 'lineRows', 'calc', 'result', 'pricebar', 'pbPrice']) assert(html.includes(`id="${id}"`), id);
  });
}

Deno.test('estimate-template.js: no request, no storage, no beacon; analytics carry event names only', () => {
  for (const bad of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'sendBeacon', 'indexedDB', 'document.cookie', 'location.search', 'teTrack']) {
    assert(!JS.includes(bad), bad);
  }
  assert(JS.includes("makeTracker('estimate_template')"));
  const calls = [...JS.matchAll(/track\('([a-z_]+)'(,[^)]*)?\)/g)];
  assertEquals(calls.map((c) => c[1]).sort(), ['tool_calc_complete', 'tool_first_interaction', 'tool_print', 'tool_view']);
  for (const c of calls) assertEquals(c[2], undefined, `${c[1]} carries no parameters`);
  assert(JS.includes('const reportInputError = makeErrorReporter(track);'), 'tool_input_error: field id only (tool-ui.js)');
  // Typed text reaches the page only through esc(); the printout is built locally and only window.print() sees it.
  assertEquals((JS.match(/window\.print\(\)/g) ?? []).length, 1);
  for (const m of JS.matchAll(/\$\{v\('([A-Za-z]+)'\)\}/g)) assert(false, `unescaped ${m[1]}`);
  assert(/\$\{esc\(l\.desc\)\}/.test(JS) && /\$\{esc\(l\.unit\)\}/.test(JS));
});

Deno.test('estimate-template.js: the money rules (flat price, qty x unit price, tax rounded once) go through estimate-math.js', () => {
  assert(JS.includes("import { lineTotal, estimateTotals, formatMoney, MAX_CENTS } from './estimate-math.js';"));
  assert(JS.includes('const helperLine = (l) => (l.qty === null ? { fixedPriceCents: l.priceCents } : { qty: l.qty, unitPriceCents: l.priceCents });'));
  assert(JS.includes('estimateTotals(priced.map(helperLine), tax.empty ? 0 : tax.value)'));
  // A flat price is exactly what was typed; a quantity line is qty x unit price, half-up once.
  assertEquals(M.lineTotal({ fixedPriceCents: 28500 }).cents, 28500);
  assertEquals(M.lineTotal({ qty: 4.5, unitPriceCents: 6200 }).cents, 27900);
  assertEquals(M.lineTotal({ qty: 1.5, unitPriceCents: 333 }).cents, 500); // 499.5 -> 500
  // Tax: once on the subtotal, not per line (3 x $0.10 at 5%: per line would be $0.03, once is $0.02).
  const t = M.estimateTotals([{ fixedPriceCents: 10 }, { fixedPriceCents: 10 }, { fixedPriceCents: 10 }], 5);
  assertEquals([t.subtotalCents, t.taxCents, t.totalCents], [30, 2, 32]);
});

Deno.test('tools.css: in print only the estimate shows; the form, the totals panel and the page head are left off', () => {
  const block = CSS.slice(CSS.indexOf('/* V6 batch 3: the free estimate template'));
  assert(block.length > 500, 'scoped block at the end of tools.css');
  assert(block.includes('.est-page .crumbs, .est-page .page-head, .est-page .calc { display: none !important; }'));
  assert(CSS.includes('.print-only { display: none; }') && /@media print \{[\s\S]*?\.print-only \{ display: block; \}/.test(CSS));
  assert(CSS.includes('.tool-page section.block') && CSS.includes('nav.top, .pricebar'), 'nav, CTA, FAQ and footer already hidden in print');
  assert(block.includes('.est-doc .d-items tr { break-inside: avoid; }'));
  // Every new rule is scoped to the template, so no other page changes.
  for (const sel of block.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g) ?? []) {
    const s = sel.trim();
    if (s.startsWith('@media')) continue;
    for (const part of s.split(',')) assert(/\.est-(page|line|doc)/.test(part), `unscoped rule: ${part.trim()}`);
  }
});

Deno.test('the printout drops empty lines and prints a blank form only when no line is filled in', () => {
  assert(JS.includes('line.empty = !desc && !unit && q.empty && p.empty;'));
  assert(JS.includes("s.lines.filter((l) => !l.empty).map("));
  assert(JS.includes('const blank = L.lines.every((l) => l.empty);'));
});

// ── (b) the example job ─────────────────────────────────────────────────────────────────────────────────────────────

const EX = [...JS.matchAll(/\{ qty: '([^']*)', unit: \['([^']*)', '([^']*)'\], price: '([^']*)', text: \['/g)]
  .map(([, qty, unitEn, unitEs, price]) => ({ qty, unit: { en: unitEn, es: unitEs }, priceCents: M.toCents(M.parseAmount(price)) }));
const DEPOSIT = M.toCents(M.parseAmount(/const EXAMPLE_DEPOSIT = '([^']+)';/.exec(JS)![1]));
const helper = (l: typeof EX[number]) => (l.qty === '' ? { fixedPriceCents: l.priceCents } : { qty: M.parseAmount(l.qty), unitPriceCents: l.priceCents });

Deno.test('example: five lines (three with a quantity, two flat), every amount a whole cent', () => {
  assertEquals(EX.length, 5);
  assertEquals(EX.filter((l) => l.qty === '').length, 2);
  for (const l of EX) assert(Number.isInteger(l.priceCents) && l.priceCents > 0);
  assertEquals(EX.map((l) => M.lineTotal(helper(l)).cents), [28500, 27900, 14400, 8640, 6000]);
});

for (const pg of PAGES) {
  Deno.test(`${pg.file}: every dollar figure on the page is the example recomputed with estimate-math.js`, () => {
    const text = visible(read(pg.file));
    // The tax rate the page uses for its "add a sales tax" sentence.
    const rate = Number((pg.lang === 'es' ? /impuesto sobre la venta de (\d+(?:\.\d+)?)%/ : /Add a (\d+(?:\.\d+)?)% sales tax/).exec(text)![1]);
    const lines = EX.map(helper);
    const noTax = M.estimateTotals(lines, 0);
    const taxed = M.estimateTotals(lines, rate);
    assert(noTax.ok && taxed.ok);
    const figures = new Map<string, string>([
      ['subtotal', usd(noTax.subtotalCents)], ['deposit', usd(DEPOSIT)], ['balance', usd(noTax.totalCents - DEPOSIT)],
      ['tax', usd(taxed.taxCents)], ['taxExact', `$${(noTax.subtotalCents * rate / 100 / 100).toFixed(3)}`],
      ['total with tax', usd(taxed.totalCents)], ['balance with tax', usd(taxed.totalCents - DEPOSIT)],
    ]);
    assertEquals([...figures.values()], ['$854.40', '$250.00', '$604.40', '$55.54', '$55.536', '$909.94', '$659.94']);
    // Each line, as the page states it: "4.5 hr × $62.00 = $279.00", flat prices by amount.
    for (const l of EX) {
      const total = usd(M.lineTotal(helper(l)).cents);
      if (l.qty === '') { assert(text.includes(total), `flat ${total}`); figures.set(`flat ${total}`, total); continue; }
      const stated = `${l.qty} ${l.unit[pg.lang]} × ${usd(l.priceCents)} = ${total}`;
      assert(text.includes(stated), `missing "${stated}"`);
      figures.set(`unit ${stated}`, usd(l.priceCents)); figures.set(`line ${stated}`, total);
    }
    for (const [what, f] of figures) assert(text.includes(f), `${what}: ${f} not on the page`);
    // And nothing else: every $ amount the page shows is one of those (or the empty $0.00 before anything is typed).
    const allowed = new Set([...figures.values(), '$0.00']);
    for (const m of text.matchAll(/\$\d[\d,]*(?:\.\d+)?/g)) assert(allowed.has(m[0]), `${m[0]} is not an example figure`);
    // "five lines", "Three lines use a quantity", "Two are flat prices" (and the Spanish words) match the data.
    for (const s of pg.lang === 'es' ? ['cinco líneas', 'Tres líneas llevan cantidad', 'Dos son precios fijos'] : ['five lines', 'Three lines use a quantity', 'Two are flat prices']) {
      assert(text.includes(s), s);
    }
  });
}

// ── (c) EN/ES parity ────────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('EN and ES pages carry the same element ids, field types and chips', () => {
  const [en, es] = PAGES.map((p) => read(p.file));
  assertEquals(ids(en).sort(), ids(es).sort());
  const types = (h: string) => [...h.matchAll(/<(input|select|textarea)\b[^>]*\sid="([^"]+)"[^>]*>/g)].map((m) => `${m[2]}:${m[1]}:${/type="([^"]+)"/.exec(m[0])?.[1] ?? ''}`).sort();
  assertEquals(types(en), types(es));
  const chips = (h: string) => [...h.matchAll(/data-v="(\d+)"/g)].map((m) => m[1]);
  assertEquals(chips(en), chips(es));
  // Each page prints in its own language by default; both offer both.
  assert(en.includes('<option value="en" selected>English</option>') && en.includes('<option value="es" lang="es">Español</option>'));
  assert(es.includes('<option value="en" lang="en">English</option>') && es.includes('<option value="es" selected>Español</option>'));
  // The same seven FAQ questions on both sides (faq-ld.mjs / g-batch W-10 check the structured data matches them).
  const faqs = (h: string) => (h.match(/<details><summary>/g) ?? []).length;
  assertEquals(faqs(en), 7); assertEquals(faqs(es), 7);
});

/** A plain-data object literal from the script (strings and arrow functions only), evaluated without the page. */
function literal(start: string, end: string) {
  const i = JS.indexOf(start);
  const src = JS.slice(i + start.length - 1, JS.indexOf(end, i) + 2); // from the "{" through the closing "}"
  return new Function(`return (${src});`)();
}
function shape(o: unknown, path = ''): string[] {
  if (typeof o !== 'object' || o === null) return [`${path}:${typeof o}`];
  return Object.keys(o).sort().flatMap((k) => shape((o as Record<string, unknown>)[k], `${path}.${k}`));
}

Deno.test('the script has the same words in both languages: form messages, the printout, the example', () => {
  const T = literal('const T = {', '\n}[LANG];');
  assertEquals(shape(T.en), shape(T.es));
  const DOC = literal('const DOC = {', '\n};');
  assertEquals(shape(DOC.en), shape(DOC.es));
  assertEquals([DOC.en.locale, DOC.es.locale], ['en-US', 'es-US']);
  assertEquals(DOC.es.tax('6.5'), 'Impuesto sobre la venta (6.5%)');
  const EXAMPLE = literal('const EXAMPLE = {', '\n}[LANG];');
  assertEquals(Object.keys(EXAMPLE.en).sort(), Object.keys(EXAMPLE.es).sort());
  for (const p of PAGES) for (const id of Object.keys(EXAMPLE.en)) assert(read(p.file).includes(`id="${id}"`), `${p.file}: #${id}`);
  // The example is plainly fictional: reserved 555-01xx numbers and example.com addresses.
  for (const lang of ['en', 'es']) {
    assert(/^\(555\) 010-01\d\d$/.test(EXAMPLE[lang].bizPhone) && /^\(555\) 010-01\d\d$/.test(EXAMPLE[lang].custContact));
    assert(EXAMPLE[lang].bizEmail.endsWith('@example.com'));
  }
});

Deno.test("the printout carries no TalkEstimate credit (the estimate is the contractor's own document)", () => {
  const js = Deno.readTextFileSync(new URL('../../tools/assets/estimate-template.js', import.meta.url));
  assert(!/d-foot|talkestimate\.com['"]/.test(js.replace(/^\/\/.*$/gm, '')), 'no footer credit in the printed estimate');
});
