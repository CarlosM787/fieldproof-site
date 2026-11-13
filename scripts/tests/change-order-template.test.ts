// V6 batch 6: the free printable change order template (EN /tools/change-order-template, ES
// /es/herramientas/plantilla-orden-de-cambio), modeled on the estimate template (estimate-template.test.ts).
// (a) page structure: one #join form, a label for every field, the print button, first-party scripts only;
// (b) the script never makes a request, stores nothing, escapes everything typed and puts no TalkEstimate credit on the
//     printout; the money goes through estimate-math.js in whole cents;
// (c) the example job recomputed with estimate-math.js equals every figure the pages (and the social cards) print;
// (d) EN/ES parity; (e) FAQ structured data, hub cards, routes, sitemap, links; (f) inform, never instruct (legal/tax).
// SEO wiring shared with every tool page (canonical, hreflang, routes) is also in tools-pages.test.ts; the inline
// waitlist form in inline-waitlist.test.ts.
// Run with:  npx deno test --allow-read scripts/tests/change-order-template.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import * as math from '../../tools/assets/estimate-math.js';
// deno-lint-ignore no-explicit-any
const M: any = math;

const root = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, root)).replace(/\r\n/g, '\n');
const SITE = 'https://talkestimate.com';
const PAGES = [
  { file: 'tools/change-order-template.html', url: '/tools/change-order-template', lang: 'en' },
  { file: 'es/herramientas/plantilla-orden-de-cambio.html', url: '/es/herramientas/plantilla-orden-de-cambio', lang: 'es' },
] as const;
const JS = read('tools/assets/change-order-template.js');
const CODE = JS.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''); // the script without its comments
const CSS = read('tools/assets/tools.css');
const usd = (c: number) => M.formatMoney(c, 'en');
const MINUS = '−';
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
    assert(html.includes('<button type="submit" data-cta="tool_change_order_template_waitlist">'));
    const nav = html.split('</nav>')[0];
    assert(nav.includes(pg.lang === 'es'
      ? '<a class="btn" href="#join" data-cta="tool_nav_waitlist">Únete<span class="nav-more"> a la lista de espera</span></a>'
      : '<a class="btn" href="#join" data-cta="tool_nav_waitlist">Join<span class="nav-more"> the waitlist</span></a>'));
    assert(html.includes(pg.lang === 'es'
      ? '<p class="note">Todavía no disponible — pronto en Android · construida y probada en un teléfono real</p>'
      : '<p class="note">Not released yet — Android coming soon · built and tested on a real phone</p>'));
    const a = html.indexOf('<script src="/analytics.js" defer></script>');
    const w = html.indexOf('<script src="/assets/waitlist.js" defer></script>');
    const t = html.indexOf('<script type="module" src="/tools/assets/change-order-template.js"></script>');
    assert(a > 0 && w > a && t > w, 'analytics.js, then waitlist.js, then the template');
  });

  Deno.test(`${pg.file}: the CTA describes the app in existing words only (labor page pitch + the home FAQ's change order line)`, () => {
    const twin = read(pg.lang === 'es' ? 'es/herramientas/calculadora-mano-de-obra-cotizacion.html' : 'tools/labor-job-quote-calculator.html');
    const pitch = (h: string) => /<div class="cta-band">\s*<div>\s*<h2>[^<]*<\/h2>\s*<p>([^<]*)<\/p>/.exec(h)![1];
    assertEquals(pitch(html), pitch(twin));
    // The one change order sentence restates what the home page FAQ already says about the (pre-launch) app.
    const home = read(pg.lang === 'es' ? 'es.html' : 'index.html');
    if (pg.lang === 'es') {
      assert(home.includes('di qué cambió, y mándale una orden de cambio con precio para que la apruebe antes de hacer el trabajo extra'));
      assert(html.includes('<p>También los cambios a medio trabajo: di qué cambió y mándale a tu cliente una orden de cambio con precio para que la apruebe antes de hacer el trabajo extra.</p>'));
    } else {
      assert(home.includes('say what changed, and send them a priced change order to approve — before you do the extra work'));
      assert(html.includes('<p>Mid-job changes too: say what changed and send your customer a priced change order to approve, before you do the extra work.</p>'));
    }
    const band = html.slice(html.indexOf('<div class="cta-band">'), html.indexOf('<form class="wl-inline"'));
    assertEquals((band.match(/<p[ >]/g) ?? []).length, 3, 'pitch, the change order line, the release note: nothing else');
    assert(!/available now|ya disponible|download|descarga|Google Play|App Store|\$\d/i.test(band.replace(/<[^>]+>/g, ' ')), 'no release or price claim');
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
    // Every aria-describedby points at an element on the page (or one the script creates for that field).
    for (const m of html.matchAll(/aria-describedby="([^"]+)"/g)) for (const id of m[1].split(' ')) assert(html.includes(`id="${id}"`), `#${id}`);
  });

  Deno.test(`${pg.file}: the print button, the print-only change order, the assurance chip, the line rules said on the page`, () => {
    assert(/<button type="button" class="btn" id="printBtn">(Print or save PDF|Imprimir o guardar PDF)<\/button>/.test(html));
    assert(html.includes('<div class="print-only est-doc" id="doc"></div>'));
    assert(html.includes('<body class="tool-page tool-b">') && html.includes('<main class="est-page">'), 'the estimate template print layout');
    assert(html.includes(pg.lang === 'es' ? '<span>Tus números no salen de esta página</span>' : '<span>Your numbers never leave this page</span>'));
    assert(html.includes(pg.lang === 'es' ? '<b>Deja la cantidad en blanco para un precio fijo:</b> el precio que escribes es el total de la línea.'
      : '<b>Leave the quantity blank for a flat price:</b> the price you type is the line total.'));
    assert(html.includes(pg.lang === 'es' ? 'y escribe la cantidad sin signo de menos' : 'and type the amount without a minus sign'), 'how to type a credit');
  });

  Deno.test(`${pg.file}: first-party scripts only, no inline handlers, nothing typed is prefilled`, () => {
    for (const m of html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)) assert(m[1].startsWith('/') && !m[1].startsWith('//'), `external script ${m[1]}`);
    assert(!/\son[a-z]+="/i.test(html), 'no inline event handlers');
    for (const m of html.matchAll(/<input\b[^>]*>/g)) assert(!/\svalue="/.test(m[0]), `prefilled: ${m[0]}`);
    for (const m of html.matchAll(/<textarea\b[^>]*>([^<]*)<\/textarea>/g)) assertEquals(m[1], '', 'empty textarea');
  });

  Deno.test(`${pg.file}: every element the script looks up is on the page`, () => {
    const used = new Set([...JS.matchAll(/(?:\$|\bv|readMoney|readNumber)\('([A-Za-z0-9-]+)'/g)].map((m) => m[1]));
    assert(used.size > 15, `${used.size} ids`);
    for (const id of used) assert(html.includes(`id="${id}"`), `missing #${id}`);
    for (const id of ['lineRows', 'calc', 'result', 'pricebar', 'pbPrice', 'prevKind']) assert(html.includes(`id="${id}"`), id);
  });

  Deno.test(`${pg.file}: its own share image (1200 x 630), the same one for Open Graph and X`, () => {
    const url = `${SITE}/assets/og/og-change-order-${pg.lang}.png`;
    assert(html.includes(`<meta property="og:image" content="${url}" />`) && html.includes(`<meta name="twitter:image" content="${url}" />`));
    const b = Deno.readFileSync(new URL(`assets/og/og-change-order-${pg.lang}.png`, root));
    assertEquals(String.fromCharCode(...b.slice(1, 4)), 'PNG');
    const v = new DataView(b.buffer, b.byteOffset);
    assertEquals([v.getUint32(16), v.getUint32(20)], [1200, 630]);
  });

  Deno.test(`${pg.file}: title, description of at most 155 characters, canonical, hreflang pair, x-default English`, () => {
    const title = /<title>([^<]+)<\/title>/.exec(html)![1];
    const desc = /<meta name="description" content="([^"]+)"/.exec(html)![1];
    assert(title.endsWith('| TalkEstimate') && [...title].length <= 60, title); // g-batch W-09: at most 60
    assert(desc.length >= 110 && desc.length <= 155, `description ${desc.length}`);
    assert(html.includes(`<link rel="canonical" href="${SITE}${pg.url}" />`));
    assert(html.includes(`<link rel="alternate" hreflang="en" href="${SITE}/tools/change-order-template" />`));
    assert(html.includes(`<link rel="alternate" hreflang="es" href="${SITE}/es/herramientas/plantilla-orden-de-cambio" />`));
    assert(html.includes(`<link rel="alternate" hreflang="x-default" href="${SITE}/tools/change-order-template" />`));
    assert(html.includes(`<meta property="og:url" content="${SITE}${pg.url}" />`));
    assertEquals((html.match(/<h1>/g) ?? []).length, 1);
  });
}

// ── (b) the script ──────────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('change-order-template.js: no request, no storage, no cookie, no beacon; analytics carry event names only', () => {
  for (const bad of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'sendBeacon', 'indexedDB', 'document.cookie', 'location.search', 'teTrack', 'WebSocket', 'EventSource', 'navigator.', 'import(', 'new Image', 'src=']) {
    assert(!CODE.includes(bad), bad);
  }
  assertEquals([...CODE.matchAll(/^import [^;]*? from '([^']+)';/gm)].map((m) => m[1]).sort(), ['./estimate-math.js', './tool-ui.js']);
  assert(JS.includes("makeTracker('change_order_template')"));
  const calls = [...JS.matchAll(/track\('([a-z_]+)'(,[^)]*)?\)/g)];
  assertEquals(calls.map((c) => c[1]).sort(), ['tool_calc_complete', 'tool_first_interaction', 'tool_print', 'tool_view']);
  for (const c of calls) assertEquals(c[2], undefined, `${c[1]} carries no parameters`);
  assert(JS.includes('const reportInputError = makeErrorReporter(track);') && JS.includes('reportInputError();'), 'tool_input_error: field id only (tool-ui.js)');
  assert(/\$\('exampleBtn'\)\.addEventListener\('click', \(\) => \{ firstTouch\(\); loadExample\(\); \}\);/.test(JS), 'the example counts as the first interaction');
  assertEquals((JS.match(/window\.print\(\)/g) ?? []).length, 1);
  // tool-ui.js (the only helper it uses) sends nothing either.
  assert(!/fetch\(|sendBeacon|XMLHttpRequest|localStorage|sessionStorage|document\.cookie/.test(read('tools/assets/tool-ui.js')));
});

Deno.test('change-order-template.js: typed text reaches the page only through esc()', () => {
  // No raw interpolation of a field value; descriptions and units of the lines are escaped.
  for (const m of JS.matchAll(/\$\{v\('([A-Za-z]+)'\)\}/g)) assert(false, `unescaped ${m[1]}`);
  assert(JS.includes('${esc(l.desc)}') && JS.includes("${l.unit ? esc(l.unit) : flat ? D.flat : ''}"));
  // The three printout helpers escape whatever value they print; phone and email too.
  assert(JS.includes("if (value) return `<div class=\"${cls}\">${prefix ? `<span class=\"d-lbl\">${prefix}</span> ` : ''}${esc(value)}</div>`;"));
  assert(JS.includes('const text = (value, rules = 3) => (value ? `<div class="d-text">${esc(value)}</div>`'));
  assert(JS.includes('const kv = (label, value) => (value ? `<tr><th>${label}</th><td>${esc(value)}</td></tr>`'));
  assert(JS.includes('`<div>${esc(phone)} · ${esc(email)}</div>`'));
  // Every v('...') read goes into one of those helpers, into a variable that is escaped, or is only a yes/no test.
  const reads = [...JS.matchAll(/v\('([A-Za-z]+)'\)/g)];
  assert(reads.length >= 9, `${reads.length} reads`);
  for (const m of reads) {
    const before = JS.slice(Math.max(0, m.index! - 40), m.index);
    const after = JS.slice(m.index! + m[0].length, m.index! + m[0].length + 3);
    const ok = /\b(line|kv|text)\([^()]*$/.test(before) || /const (phone|email) = $/.test(before) || after === ' ? ';
    assert(ok, `v('${m[1]}') is used outside an escaping helper`);
  }
});

Deno.test('esc() (tool-ui.js) turns typed HTML into text: <img src=x onerror=alert(1)> prints as characters', async () => {
  // tool-ui.js reads <html lang> when it loads; give it the one property it needs.
  (globalThis as unknown as { document: unknown }).document = { documentElement: { lang: 'en' }, getElementById: () => null };
  const ui = await import('../../tools/assets/tool-ui.js');
  assertEquals(ui.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assertEquals(ui.esc(`"'&`), '&quot;&#39;&amp;');
  assertEquals(ui.esc('Línea 1 · $85.00'), 'Línea 1 · $85.00');
});

Deno.test("the printout carries no TalkEstimate credit (the change order is the contractor's own document)", () => {
  assert(!/talkestimate|d-foot/i.test(CODE), 'no credit, name or address of ours in the script');
  const DOC = literal('const DOC = {', '\n};');
  for (const lang of ['en', 'es']) assert(!/talkestimate/i.test(JSON.stringify(DOC[lang])), lang);
});

Deno.test('change-order-template.js: the money goes through estimate-math.js in whole cents (flat price, qty x unit price, credits)', () => {
  assert(JS.includes("import { lineTotal, estimateTotals, formatMoney, MAX_CENTS } from './estimate-math.js';"));
  // The same flat-price rule as the estimate template, word for word.
  const est = read('tools/assets/estimate-template.js');
  const rule = 'const helperLine = (l) => (l.qty === null ? { fixedPriceCents: l.priceCents } : { qty: l.qty, unitPriceCents: l.priceCents });';
  assert(JS.includes(rule) && est.includes(rule));
  // Added work and credits are each summed by estimateTotals (no tax); the change and the new total are whole-cent sums.
  assert(JS.includes("const adds = estimateTotals(priced.filter((l) => l.kind === 'add').map(helperLine), 0);"));
  assert(JS.includes("const credits = estimateTotals(priced.filter((l) => l.kind === 'credit').map(helperLine), 0);"));
  assert(JS.includes('const changeCents = adds.totalCents - credits.totalCents;'));
  assert(JS.includes("const prevCents = prev.empty ? null : $('prevKind').value === 'credit' ? -prev.cents : prev.cents;"));
  assert(JS.includes('const newCents = origCents === null ? null : origCents + (prevCents ?? 0) + changeCents;'));
  assert(!/parseFloat|Number\(.*\.value|toFixed/.test(CODE), 'no float money parsing outside estimate-math / tool-ui');
  // Bad input is refused like the estimate template: money via readMoney, numbers via readNumber, red field, no print.
  assert(JS.includes("const orig = readMoney('origAmt');") && JS.includes("const prev = readMoney('prevAmt');"));
  assert(JS.includes("const days = readNumber('days', { integer: true, max: 365 });"));
  assert(JS.includes('const q = readNumber(qEl, { max: 1000000 });') && JS.includes('const p = readMoney(pEl);'));
  assert(JS.includes('if (L.bad || orig.bad || prev.bad || days.bad) { revealInvalid(); reportInputError(); return renderBlocked(FIX_MSG); }'));
  assert(JS.includes("if (newCents !== null && !blank && newCents < 0) return renderBlocked('', T.warn.negTotal);"), 'credits past the contract block printing');
  assert(/function renderBlocked[\s\S]*?\$\('printBtn'\)\.disabled = true;/.test(JS));
  // estimate-math refuses what tool-ui would refuse: letters, a minus sign, an unclear thousands dot.
  for (const bad of ['abc', '-42', '1.250', '4e2', '']) assertEquals(M.parseAmount(bad), null, bad);
  assertEquals(M.amountProblem('-42').kind, 'negative');
  // A credit of a flat $42 and an added 2 x $62: whole cents, half-up once per line.
  assertEquals(M.lineTotal({ qty: 2, unitPriceCents: 6200 }).cents, 12400);
  assertEquals(M.lineTotal({ qty: 1.5, unitPriceCents: 333 }).cents, 500);
});

Deno.test('the printout drops empty lines, marks credits, and prints a blank form only when no line is filled in', () => {
  assert(JS.includes('line.empty = !desc && !unit && q.empty && p.empty;'));
  assert(JS.includes('s.lines.filter((l) => !l.empty).map('));
  assert(JS.includes('const blank = L.lines.every((l) => l.empty);'));
  assert(JS.includes('<b class="d-tag">${D.credit}:</b> ') && JS.includes("`${credit ? MINUS : ''}${m(l.cents)}`"), 'a credit line says Credit and prints a minus');
  assert(/const BLANK_ROWS = \d+;/.test(JS));
  // Plain signature and date lines on paper; nothing to sign on screen, nothing collected.
  assert(JS.includes("out.push(`<div class=\"d-sign\"><div class=\"d-sig\">${sig(D.sigC)}</div><div class=\"d-sig\"><p class=\"d-accept\">${D.accept}</p>${sig(D.sigK)}</div></div>`);"));
  assert(!/<canvas|signature_pad|toDataURL|type="file"/i.test(JS + PAGES.map((p) => read(p.file)).join('')), 'no e-signature');
});

Deno.test('tools.css: the change order rules are scoped to the estimate template classes, so no other page changes', () => {
  const block = CSS.slice(CSS.indexOf('/* V6 batch 6: the free change order template'));
  assert(block.length > 300, 'its own block at the end of tools.css');
  for (const sel of block.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g) ?? []) {
    for (const part of sel.trim().split(',')) assert(/\.est-(page|line|doc)/.test(part), `unscoped rule: ${part.trim()}`);
  }
});

// ── (c) the example job ─────────────────────────────────────────────────────────────────────────────────────────────

const EX = [...JS.matchAll(/\{ kind: '(add|credit)', qty: '([^']*)', unit: \['([^']*)', '([^']*)'\], price: '([^']*)', text: \['/g)]
  .map(([, kind, qty, unitEn, unitEs, price]) => ({ kind, qty, unit: { en: unitEn, es: unitEs }, priceCents: M.toCents(M.parseAmount(price)) }));
const ORIGINAL = M.toCents(M.parseAmount(/const EXAMPLE_ORIGINAL = '([^']+)';/.exec(JS)![1]));
const DAYS = Number(/const EXAMPLE_DAYS = '(\d+)';/.exec(JS)![1]);
const helper = (l: typeof EX[number]) => (l.qty === '' ? { fixedPriceCents: l.priceCents } : { qty: M.parseAmount(l.qty), unitPriceCents: l.priceCents });
const adds = EX.filter((l) => l.kind === 'add');
const credits = EX.filter((l) => l.kind === 'credit');
const addT = M.estimateTotals(adds.map(helper), 0);
const creditT = M.estimateTotals(credits.map(helper), 0);
const CHANGE = addT.totalCents - creditT.totalCents;
const NEW_TOTAL = ORIGINAL + CHANGE;

Deno.test('example: five lines (four added: two with a quantity, two flat; one flat credit), whole cents, the numbers add up', () => {
  assertEquals(EX.length, 5);
  assertEquals([adds.length, credits.length], [4, 1]);
  assertEquals(adds.filter((l) => l.qty === '').length, 2);
  for (const l of EX) assert(Number.isInteger(l.priceCents) && l.priceCents > 0);
  assertEquals(EX.map((l) => M.lineTotal(helper(l)).cents), [14000, 12400, 2860, 8500, 4200]);
  assertEquals([addT.totalCents, creditT.totalCents, CHANGE, ORIGINAL, NEW_TOTAL, DAYS], [37760, 4200, 33560, 85440, 119000, 1]);
});

Deno.test('example: the original amount is the estimate template example, recomputed; the hourly rate is the estimate’s own', () => {
  const est = read('tools/assets/estimate-template.js');
  const lines = [...est.matchAll(/\{ qty: '([^']*)', unit: \['[^']*', '[^']*'\], price: '([^']*)', text: \['/g)]
    .map(([, qty, price]) => (qty === '' ? { fixedPriceCents: M.toCents(M.parseAmount(price)) } : { qty: M.parseAmount(qty), unitPriceCents: M.toCents(M.parseAmount(price)) }));
  assertEquals(M.estimateTotals(lines, 0).subtotalCents, ORIGINAL, 'change order #1 changes estimate #1001 ($854.40, no tax)');
  assert(est.includes("estNo: '1001'") && JS.includes("estNo: '1001'") && JS.includes("custAddr: '123 Main St'") && est.includes("custAddr: '123 Main St'"));
  const hourly = EX.find((l) => l.unit.en === 'hr')!;
  assert(est.includes(`unit: ['hr', 'h'], price: '${hourly.priceCents / 100}'`), 'same $62 an hour as the estimate');
});

for (const pg of PAGES) {
  Deno.test(`${pg.file}: every dollar figure on the page is the example recomputed with estimate-math.js`, () => {
    const text = visible(read(pg.file));
    const figures = new Map<string, string>([
      ['original', usd(ORIGINAL)], ['added work', usd(addT.totalCents)], ['credit', usd(creditT.totalCents)],
      ['change', usd(CHANGE)], ['new total', usd(NEW_TOTAL)],
    ]);
    assertEquals([...figures.values()], ['$854.40', '$377.60', '$42.00', '$335.60', '$1,190.00']);
    // Each quantity line as the page states it ("2 hr × $62.00 = $124.00"), flat prices by amount.
    for (const l of EX) {
      const total = usd(M.lineTotal(helper(l)).cents);
      if (l.qty === '') { assert(text.includes(total), `flat ${total}`); figures.set(`flat ${total}`, total); continue; }
      const stated = `${l.qty} ${l.unit[pg.lang]} × ${usd(l.priceCents)} = ${total}`;
      assert(text.includes(stated), `missing "${stated}"`);
      figures.set(`unit ${stated}`, usd(l.priceCents)); figures.set(`line ${stated}`, total);
    }
    // The two sums, written out.
    assert(text.includes(`${usd(addT.totalCents)} − ${usd(creditT.totalCents)} = ${usd(CHANGE)}`), 'added − credits = change');
    assert(text.includes(`${usd(ORIGINAL)} + ${usd(CHANGE)} = ${usd(NEW_TOTAL)}`), 'original + change = new total');
    assert(text.includes(pg.lang === 'es' ? `Agrega ${DAYS} día al plazo del trabajo` : `It adds ${DAYS} day to the schedule`));
    for (const [what, f] of figures) assert(text.includes(f), `${what}: ${f} not on the page`);
    // And nothing else: every $ amount on the page is one of those (or the empty $0.00 before anything is typed).
    const allowed = new Set([...figures.values(), '$0.00']);
    for (const m of text.matchAll(/\$\d[\d,]*(?:\.\d+)?/g)) assert(allowed.has(m[0]), `${m[0]} is not an example figure`);
    // The words match the data, and the prices are labelled as examples.
    for (const s of pg.lang === 'es'
      ? ['cinco líneas', 'Cuatro líneas agregan trabajo', 'Dos llevan cantidad', 'Dos son precios fijos', 'Una línea es un crédito', 'Cada precio es un ejemplo, no un precio de mercado']
      : ['five lines', 'Four lines add work', 'Two use a quantity', 'Two are flat prices', 'One line is a credit', 'Every price is an example, not a market rate']) {
      assert(text.includes(s), s);
    }
  });
}

Deno.test('the social cards show the example: $854.40 + $377.60 − $42.00 = $1,190.00', () => {
  const og = read('scripts/brand/og.mjs');
  for (const lang of ['en', 'es']) {
    const card = og.split('\n').find((l) => l.includes(`['og-change-order-${lang}'`)) ?? '';
    for (const v of [usd(ORIGINAL), usd(addT.totalCents), `${MINUS}${usd(creditT.totalCents)}`, usd(NEW_TOTAL)]) assert(card.includes(`'${v}'`), `${lang} card shows ${v}`);
    assert(card.includes(lang === 'es' ? '4 líneas' : '4 lines'), `${lang}: four added lines`);
    for (const m of card.matchAll(/\$\d[\d,]*\.\d\d/g)) assert([usd(ORIGINAL), usd(addT.totalCents), usd(creditT.totalCents), usd(NEW_TOTAL)].includes(m[0]), `${lang}: ${m[0]}`);
  }
});

// ── (d) EN/ES parity ────────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('EN and ES pages carry the same element ids, field types, select options and FAQ count', () => {
  const [en, es] = PAGES.map((p) => read(p.file));
  assertEquals(ids(en).sort(), ids(es).sort());
  const types = (h: string) => [...h.matchAll(/<(input|select|textarea)\b[^>]*\sid="([^"]+)"[^>]*>/g)].map((m) => `${m[2]}:${m[1]}:${/type="([^"]+)"/.exec(m[0])?.[1] ?? ''}`).sort();
  assertEquals(types(en), types(es));
  const opts = (h: string) => [...h.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
  assertEquals(opts(en), opts(es));
  assert(en.includes('<option value="en" selected>English</option>') && en.includes('<option value="es" lang="es">Español</option>'));
  assert(es.includes('<option value="en" lang="en">English</option>') && es.includes('<option value="es" selected>Español</option>'));
  const faqs = (h: string) => (h.match(/<details><summary>/g) ?? []).length;
  assertEquals(faqs(en), 8); assertEquals(faqs(es), 8);
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
  assertEquals([DOC.en.days(0), DOC.en.days(1), DOC.en.days(3)], ['This change doesn’t change the schedule.', 'This change adds 1 day to the schedule.', 'This change adds 3 days to the schedule.']);
  assertEquals([DOC.es.days(1), DOC.es.days(2)], ['Este cambio agrega 1 día al plazo del trabajo.', 'Este cambio agrega 2 días al plazo del trabajo.']);
  const EXAMPLE = literal('const EXAMPLE = {', '\n}[LANG];');
  assertEquals(Object.keys(EXAMPLE.en).sort(), Object.keys(EXAMPLE.es).sort());
  for (const p of PAGES) for (const id of Object.keys(EXAMPLE.en)) assert(read(p.file).includes(`id="${id}"`), `${p.file}: #${id}`);
  // The example is plainly fictional: reserved 555-01xx numbers and example.com addresses, the estimate example's people.
  for (const lang of ['en', 'es']) {
    assert(/^\(555\) 010-01\d\d$/.test(EXAMPLE[lang].bizPhone) && EXAMPLE[lang].bizEmail.endsWith('@example.com'));
    assert(EXAMPLE[lang].reason.includes('#1001') && EXAMPLE[lang].notes.includes('#1001'));
  }
  assertEquals([EXAMPLE.en.custName, EXAMPLE.es.custName], ['Alex Johnson', 'Ana Torres']);
});

// ── (e) FAQ data, hubs, routes, sitemap, links ──────────────────────────────────────────────────────────────────────

const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const plain = (s: string) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

for (const pg of PAGES) {
  Deno.test(`${pg.file}: FAQPage structured data says exactly what the visible FAQ says (faq-ld.mjs keeps it)`, () => {
    const h = read(pg.file);
    assert(read('scripts/faq-ld.mjs').includes(`'${pg.file}'`), 'listed in faq-ld.mjs');
    const ld = /<script type="application\/ld\+json" id="faq-ld">([\s\S]*?)<\/script>/.exec(h)!;
    const data = JSON.parse(ld[1]);
    assertEquals([data['@type'], data.inLanguage], ['FAQPage', pg.lang]);
    const faq = h.slice(h.indexOf('<div class="faq"'));
    const shown = [...faq.matchAll(/<details><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map(([, q, a]) => [plain(q), plain(a)]);
    assertEquals(data.mainEntity.map((x: { name: string; acceptedAnswer: { text: string } }) => [x.name, x.acceptedAnswer.text]), shown);
    assertEquals(shown.length, 8);
  });

  Deno.test(`${pg.url}: served by its route and listed in the sitemap with the EN/ES/x-default triplet`, () => {
    assert(read('_redirects').split('\n').some((l) => { const [from, to, code] = l.trim().split(/\s+/); return from === pg.url && to === `/${pg.file}` && code === '200'; }), 'route');
    const sm = read('sitemap.xml');
    const at = sm.indexOf(`<loc>${SITE}${pg.url}</loc>`);
    assert(at > 0, 'in the sitemap');
    const block = sm.slice(at, sm.indexOf('</url>', at));
    assert(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(block));
    for (const [hl, u] of [['en', '/tools/change-order-template'], ['es', '/es/herramientas/plantilla-orden-de-cambio'], ['x-default', '/tools/change-order-template']]) {
      assert(block.includes(`<xhtml:link rel="alternate" hreflang="${hl}" href="${SITE}${u}"/>`), `${hl}`);
    }
  });
}

Deno.test('both tool hubs: a live card and a CollectionPage entry for the change order template', () => {
  for (const [f, href] of [['tools/index.html', '/tools/change-order-template'], ['es/herramientas/index.html', '/es/herramientas/plantilla-orden-de-cambio']]) {
    const h = read(f);
    assert(h.includes(`<a class="card" href="${href}" data-cta="tools_card_change_order_template">`), `${f}: card`);
    assert(h.includes(`"url": "${SITE}${href}" }`), `${f}: hasPart`);
    JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h)![1]);
    // Next to the estimate template card.
    assert(h.indexOf(`href="${href}"`) > h.indexOf('data-cta="tools_card_estimate_template"'));
  }
});

Deno.test('internal links: estimate template <-> change order template, and the write-an-estimate guides point to it', () => {
  const pairs: [string, string][] = [
    ['tools/estimate-template.html', '/tools/change-order-template'], ['es/herramientas/plantilla-de-estimado.html', '/es/herramientas/plantilla-orden-de-cambio'],
    ['guides/how-to-write-an-estimate.html', '/tools/change-order-template'], ['es/guias/como-hacer-un-estimado.html', '/es/herramientas/plantilla-orden-de-cambio'],
    ['tools/change-order-template.html', '/tools/estimate-template'], ['es/herramientas/plantilla-orden-de-cambio.html', '/es/herramientas/plantilla-de-estimado'],
    ['tools/change-order-template.html', '/guides/how-to-write-an-estimate'], ['es/herramientas/plantilla-orden-de-cambio.html', '/es/guias/como-hacer-un-estimado'],
  ];
  for (const [f, href] of pairs) assert(read(f).includes(`href="${href}"`), `${f} -> ${href}`);
  // The language toggle and footer go to the twin page, not the hub.
  for (const pg of PAGES) {
    const h = read(pg.file);
    const twin = pg.lang === 'en' ? '/es/herramientas/plantilla-orden-de-cambio' : '/tools/change-order-template';
    assert(h.split('</nav>')[0].includes(`href="${twin}"`) && h.slice(h.indexOf('<footer')).includes(`href="${twin}"`), pg.file);
  }
});

// ── (f) inform, never instruct (legal and tax) ──────────────────────────────────────────────────────────────────────

Deno.test('legal and tax: examples are labelled, no law is stated, and the approved "not legal advice" pattern is kept', () => {
  const law = /\blaw (requires|says)|required by law|legally (required|binding)|by law you|state law|la ley (exige|requiere|obliga|dice)|lo exige la ley|por ley|legalmente obligatori/i;
  for (const pg of PAGES) {
    const h = read(pg.file);
    const text = visible(h);
    assert(!law.test(text), `${pg.file}: states a law`);
    assert(!/\b(guarantee|guaranteed|protects you|enforceable|garantiza|te protege|exigible)\b/i.test(text), `${pg.file}: legal promise`);
    if (pg.lang === 'en') {
      assert(text.includes('The gray text is only an example, not legal advice: write the terms you actually use.'));
      assert(text.includes('They’re terms contractors commonly use, not legal advice. If your state has rules for home improvement contracts, follow them; this template doesn’t replace them.'));
      assert(text.includes('Your state’s rules (or your accountant) decide whether you add any tax line.'), 'the approved tax wording (Advisor pass 42 P2-1)');
    } else {
      assert(text.includes('El texto gris es solo un ejemplo, no asesoría legal: escribe las condiciones que de verdad usas.'));
      assert(text.includes('Son condiciones que los contratistas usan mucho, no asesoría legal. Si tu estado tiene reglas para los contratos de mejoras del hogar, síguelas; esta plantilla no las reemplaza.'));
      assert(text.includes('Las reglas de tu estado (o tu contador) deciden si agregas una línea de impuesto.'));
    }
    assert(!/Sales tax on materials|Impuesto sobre materiales|add (a|the) sales tax line/i.test(text), 'no instruction to bill a tax line');
  }
  assert(!law.test(JS), 'the script states no law either');
});

Deno.test('Spanish page: US Spanish the site already uses (estimado, drywall, orden de cambio, anticipo-style "tú"), no Mexico-only words', () => {
  const es = read('es/herramientas/plantilla-orden-de-cambio.html');
  assert(!/rec[aá]mara|\btroca|resan|zoclo|nom[aá]s\b|parchar|cotizaci[oó]n de cambio|\busted\b/i.test(es));
  for (const w of ['estimado', 'drywall', 'orden de cambio', 'Escribe', 'Elige', 'tu cliente']) assert(es.includes(w), w);
  const js = literal('const T = {', '\n}[LANG];');
  assert(!/\busted\b/i.test(JSON.stringify(js.es)));
});
