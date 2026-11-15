// V6 batch 8: the free printable invoice template (EN /tools/invoice-template, ES /es/herramientas/plantilla-de-factura),
// the third of the set (estimate template -> change order template -> invoice template), modeled on both.
// (a) page structure: one #join form, a label for every field, the print button, first-party scripts only;
// (b) the script never makes a request, stores nothing, escapes everything typed and puts no TalkEstimate credit on the
//     printout; the money goes through estimate-math.js in whole cents; payments larger than the total block printing;
// (c) the example (the invoice for the estimate template's job and the change order template's change order #1)
//     recomputed with estimate-math.js equals every figure the pages and the social cards print, and its $854.40,
//     $335.60 and $250.00 still match the estimate and change order templates' own examples;
// (d) EN/ES parity; (e) FAQ structured data, hub cards, routes, sitemap, links between the three templates;
// (f) inform, never instruct (legal and tax): no sentence states what a law requires, late fees only as "if your
//     contract has one", no interest rate, no payment service suggested.
// SEO wiring shared with every tool page (canonical, hreflang, routes) is also in tools-pages.test.ts; the inline
// waitlist form in inline-waitlist.test.ts.
// Run with:  npx deno test --allow-read scripts/tests/invoice-template.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import * as math from '../../tools/assets/estimate-math.js';
// deno-lint-ignore no-explicit-any
const M: any = math;

const root = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, root)).replace(/\r\n/g, '\n');
const SITE = 'https://talkestimate.com';
const PAGES = [
  { file: 'tools/invoice-template.html', url: '/tools/invoice-template', lang: 'en' },
  { file: 'es/herramientas/plantilla-de-factura.html', url: '/es/herramientas/plantilla-de-factura', lang: 'es' },
] as const;
const JS = read('tools/assets/invoice-template.js');
const CODE = JS.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''); // the script without its comments
const EST_JS = read('tools/assets/estimate-template.js');
const CO_JS = read('tools/assets/change-order-template.js');
const CSS = read('tools/assets/tools.css');
const usd = (c: number) => M.formatMoney(c, 'en');
const MINUS = '−';
/** What a visitor reads: scripts and tags stripped, entities that matter here decoded, whitespace collapsed. */
const visible = (h: string) => h.slice(h.indexOf('<body')).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const ids = (h: string) => [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const attr = (h: string, id: string, name: string) => new RegExp(`<(?:input|textarea)\\b[^>]*\\sid="${id}"[^>]*\\s${name}="([^"]*)"`).exec(h)?.[1] ?? '';

// ── (a) structure ───────────────────────────────────────────────────────────────────────────────────────────────────

for (const pg of PAGES) {
  const html = read(pg.file);

  Deno.test(`${pg.file}: one #join waitlist form, nav button to it, the approved CTA note, scripts in order`, () => {
    assertEquals((html.match(/<form class="wl-inline" id="join" data-waitlist>/g) ?? []).length, 1);
    assertEquals((html.match(/ id="join"/g) ?? []).length, 1);
    assert(html.includes('<button type="submit" data-cta="tool_invoice_template_waitlist">'));
    const nav = html.split('</nav>')[0];
    assert(nav.includes(pg.lang === 'es'
      ? '<a class="btn" href="#join" data-cta="tool_nav_waitlist">Únete<span class="nav-more"> a la lista de espera</span></a>'
      : '<a class="btn" href="#join" data-cta="tool_nav_waitlist">Join<span class="nav-more"> the waitlist</span></a>'));
    assert(html.includes(pg.lang === 'es'
      ? '<p class="note">Todavía no disponible — pronto en Android · construida y probada en un teléfono real</p>'
      : '<p class="note">Not released yet — Android coming soon · built and tested on a real phone</p>'));
    const a = html.indexOf('<script src="/analytics.js" defer></script>');
    const w = html.indexOf('<script src="/assets/waitlist.js" defer></script>');
    const t = html.indexOf('<script type="module" src="/tools/assets/invoice-template.js"></script>');
    assert(a > 0 && w > a && t > w, 'analytics.js, then waitlist.js, then the template');
  });

  Deno.test(`${pg.file}: the CTA describes the app in existing words only (labor page pitch + the home page's invoice caption)`, () => {
    const twin = read(pg.lang === 'es' ? 'es/herramientas/calculadora-mano-de-obra-cotizacion.html' : 'tools/labor-job-quote-calculator.html');
    const pitch = (h: string) => /<div class="cta-band">\s*<div>\s*<h2>[^<]*<\/h2>\s*<p>([^<]*)<\/p>/.exec(h)![1];
    assertEquals(pitch(html), pitch(twin));
    // The one invoice sentence restates the caption under the home page's real invoice screen (the pre-launch app).
    const home = read(pg.lang === 'es' ? 'es.html' : 'index.html');
    if (pg.lang === 'es') {
      assert(home.includes('<figcaption><b>Cobra.</b> La factura incluye la orden de cambio. Márcala como pagada.</figcaption>'));
      assert(html.includes('<p>Luego la factura: incluye la orden de cambio, y la marcas como pagada.</p>'));
    } else {
      assert(home.includes('<figcaption><b>Get paid.</b> The invoice includes the change order. Mark it paid.</figcaption>'));
      assert(html.includes('<p>Then the invoice: it includes the change order, and you mark it paid.</p>'));
    }
    const band = html.slice(html.indexOf('<div class="cta-band">'), html.indexOf('<form class="wl-inline"'));
    assertEquals((band.match(/<p[ >]/g) ?? []).length, 3, 'pitch, the invoice line, the release note: nothing else');
    assert(band.indexOf('<p class="note">') > band.indexOf(pg.lang === 'es' ? 'Luego la factura' : 'Then the invoice'), 'the app line sits right above "Not released yet"');
    assert(!/available now|ya disponible|download|descarga|Google Play|App Store|\$\d|automatic|autom[aá]tic/i.test(band.replace(/<[^>]+>/g, ' ')), 'no release, price or feature claim');
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
    for (const m of html.matchAll(/aria-describedby="([^"]+)"/g)) for (const id of m[1].split(' ')) assert(html.includes(`id="${id}"`), `#${id}`);
  });

  Deno.test(`${pg.file}: the print button, the print-only invoice, the assurance chip, the flat-price rule said on the page`, () => {
    assert(/<button type="button" class="btn" id="printBtn">(Print or save PDF|Imprimir o guardar PDF)<\/button>/.test(html));
    assert(html.includes('<div class="print-only est-doc" id="doc"></div>'));
    assert(html.includes('<body class="tool-page tool-b">') && html.includes('<main class="est-page">'), 'the estimate template print layout');
    assert(html.includes(pg.lang === 'es' ? '<span>Tus números no salen de esta página</span>' : '<span>Your numbers never leave this page</span>'));
    assert(html.includes(pg.lang === 'es' ? '<b>Deja la cantidad en blanco para un precio fijo:</b> el precio que escribes es el total de la línea.'
      : '<b>Leave the quantity blank for a flat price:</b> the price you type is the line total.'));
    for (const id of ['invNo', 'invDate', 'dueDate', 'estNo', 'coNos', 'custName', 'custAddr', 'taxPct', 'paid', 'payHow', 'notes']) assert(html.includes(`id="${id}"`), id);
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
    for (const id of ['lineRows', 'calc', 'result', 'pricebar', 'pbPrice']) assert(html.includes(`id="${id}"`), id);
  });

  Deno.test(`${pg.file}: its own share image (1200 x 630), the same one for Open Graph and X`, () => {
    const url = `${SITE}/assets/og/og-invoice-${pg.lang}.png`;
    assert(html.includes(`<meta property="og:image" content="${url}" />`) && html.includes(`<meta name="twitter:image" content="${url}" />`));
    const b = Deno.readFileSync(new URL(`assets/og/og-invoice-${pg.lang}.png`, root));
    assertEquals(String.fromCharCode(...b.slice(1, 4)), 'PNG');
    const v = new DataView(b.buffer, b.byteOffset);
    assertEquals([v.getUint32(16), v.getUint32(20)], [1200, 630]);
  });

  Deno.test(`${pg.file}: title of at most 60 characters, description of at most 155, canonical, hreflang pair, x-default English`, () => {
    const title = /<title>([^<]+)<\/title>/.exec(html)![1];
    const desc = /<meta name="description" content="([^"]+)"/.exec(html)![1];
    assert(title.endsWith('| TalkEstimate') && [...title].length <= 60, title); // g-batch W-09: at most 60
    assert(desc.length >= 110 && desc.length <= 155, `description ${desc.length}`);
    assert(html.includes(`<link rel="canonical" href="${SITE}${pg.url}" />`));
    assert(html.includes(`<link rel="alternate" hreflang="en" href="${SITE}/tools/invoice-template" />`));
    assert(html.includes(`<link rel="alternate" hreflang="es" href="${SITE}/es/herramientas/plantilla-de-factura" />`));
    assert(html.includes(`<link rel="alternate" hreflang="x-default" href="${SITE}/tools/invoice-template" />`));
    assert(html.includes(`<meta property="og:url" content="${SITE}${pg.url}" />`));
    assertEquals((html.match(/<h1>/g) ?? []).length, 1);
  });

  Deno.test(`${pg.file}: the sales tax hint is the estimate template's own inform-only wording, word for word`, () => {
    const hint = (h: string) => /<div class="hint" id="taxPct-hint">([^<]+)<\/div>/.exec(h)![1];
    const est = read(pg.lang === 'es' ? 'es/herramientas/plantilla-de-estimado.html' : 'tools/estimate-template.html');
    assertEquals(hint(html), hint(est));
  });
}

// ── (b) the script ──────────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('invoice-template.js: no request, no storage, no cookie, no beacon; analytics carry event names only', () => {
  for (const bad of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'sendBeacon', 'indexedDB', 'document.cookie', 'location.search', 'teTrack', 'WebSocket', 'EventSource', 'navigator.', 'import(', 'new Image', 'src=']) {
    assert(!CODE.includes(bad), bad);
  }
  assertEquals([...CODE.matchAll(/^import [^;]*? from '([^']+)';/gm)].map((m) => m[1]).sort(), ['./estimate-math.js', './tool-ui.js']);
  assert(JS.includes("makeTracker('invoice_template')"));
  const calls = [...JS.matchAll(/track\('([a-z_]+)'(,[^)]*)?\)/g)];
  assertEquals(calls.map((c) => c[1]).sort(), ['tool_calc_complete', 'tool_first_interaction', 'tool_print', 'tool_view']);
  for (const c of calls) assertEquals(c[2], undefined, `${c[1]} carries no parameters`);
  assert(JS.includes('const reportInputError = makeErrorReporter(track);') && JS.includes('reportInputError();'), 'tool_input_error: field id only (tool-ui.js)');
  assert(/\$\('exampleBtn'\)\.addEventListener\('click', \(\) => \{ firstTouch\(\); loadExample\(\); \}\);/.test(JS), 'the example counts as the first interaction');
  assertEquals((JS.match(/window\.print\(\)/g) ?? []).length, 1);
  assert(!/fetch\(|sendBeacon|XMLHttpRequest|localStorage|sessionStorage|document\.cookie/.test(read('tools/assets/tool-ui.js')));
});

Deno.test('invoice-template.js: typed text reaches the page only through esc()', () => {
  for (const m of JS.matchAll(/\$\{v\('([A-Za-z]+)'\)\}/g)) assert(false, `unescaped ${m[1]}`);
  assert(JS.includes('${esc(l.desc)}') && JS.includes("${l.unit ? esc(l.unit) : flat ? D.flat : ''}"));
  assert(JS.includes("if (value) return `<div class=\"${cls}\">${prefix ? `<span class=\"d-lbl\">${prefix}</span> ` : ''}${esc(value)}</div>`;"));
  assert(JS.includes('const text = (value, rules = 3) => (value ? `<div class="d-text">${esc(value)}</div>`'));
  assert(JS.includes('const kv = (label, value) => (value ? `<tr><th>${label}</th><td>${esc(value)}</td></tr>`'));
  assert(JS.includes('`<div>${esc(phone)} · ${esc(email)}</div>`'));
  // Every v('...') read goes into one of those helpers, into a variable that is escaped, or is only a yes/no test.
  const reads = [...JS.matchAll(/v\('([A-Za-z]+)'\)/g)];
  assert(reads.length >= 10, `${reads.length} reads`);
  for (const id of ['bizName', 'bizPhone', 'bizEmail', 'invNo', 'estNo', 'coNos', 'custName', 'custAddr', 'payHow', 'notes']) assert(reads.some((m) => m[1] === id), id);
  for (const m of reads) {
    const before = JS.slice(Math.max(0, m.index! - 40), m.index);
    const after = JS.slice(m.index! + m[0].length, m.index! + m[0].length + 3);
    const ok = /\b(line|kv|text)\([^()]*$/.test(before) || /const (phone|email) = $/.test(before) || after === ' ? ';
    assert(ok, `v('${m[1]}') is used outside an escaping helper`);
  }
});

Deno.test('esc() (tool-ui.js) turns typed HTML into text: <img src=x onerror=alert(1)> prints as characters', async () => {
  (globalThis as unknown as { document: unknown }).document = { documentElement: { lang: 'en' }, getElementById: () => null };
  const ui = await import('../../tools/assets/tool-ui.js');
  assertEquals(ui.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assertEquals(ui.esc(`"'&`), '&quot;&#39;&amp;');
  assertEquals(ui.esc('Saldo · $940.00'), 'Saldo · $940.00');
});

/** A plain-data object literal from the script (strings and arrow functions only), evaluated without the page. */
function literal(start: string, end: string, src = JS) {
  const i = src.indexOf(start);
  const body = src.slice(i + start.length - 1, src.indexOf(end, i) + 2); // from the "{" through the closing "}"
  return new Function(`return (${body});`)();
}
function shape(o: unknown, path = ''): string[] {
  if (typeof o !== 'object' || o === null) return [`${path}:${typeof o}`];
  return Object.keys(o).sort().flatMap((k) => shape((o as Record<string, unknown>)[k], `${path}.${k}`));
}

Deno.test("the printout carries no TalkEstimate credit or branding (the invoice is the contractor's own document)", () => {
  assert(!/talkestimate|d-foot|powered by|impulsado por/i.test(CODE), 'no credit, name or address of ours in the script');
  const DOC = literal('const DOC = {', '\n};');
  for (const lang of ['en', 'es']) assert(!/talkestimate|ai\b|\bia\b/i.test(JSON.stringify(DOC[lang])), lang);
  assertEquals([DOC.en.thanks, DOC.es.thanks], ['Thank you for your business.', 'Gracias por elegirnos.']);
  assert(JS.includes('out.push(`<p class="d-thanks">${D.thanks}</p>`);'), 'a plain printed thank-you line');
});

Deno.test('invoice-template.js: the money goes through estimate-math.js in whole cents; bad input and overpayment block printing', () => {
  assert(JS.includes("import { lineTotal, estimateTotals, formatMoney, MAX_CENTS } from './estimate-math.js';"));
  // The same flat-price rule and the same totals call as the estimate template, word for word.
  const rule = 'const helperLine = (l) => (l.qty === null ? { fixedPriceCents: l.priceCents } : { qty: l.qty, unitPriceCents: l.priceCents });';
  assert(JS.includes(rule) && EST_JS.includes(rule));
  const totals = 'const t = estimateTotals(priced.map(helperLine), tax.empty ? 0 : tax.value);';
  assert(JS.includes(totals) && EST_JS.includes(totals));
  assert(JS.includes('balanceCents: t.totalCents - (paidCents ?? 0),'), 'balance due = total - payments, whole cents');
  assert(!/parseFloat|Number\(.*\.value|toFixed/.test(CODE), 'no float money parsing outside estimate-math / tool-ui');
  assert(JS.includes("const tax = readNumber('taxPct', { max: 100 });") && JS.includes("const paid = readMoney('paid');"));
  assert(JS.includes('const q = readNumber(qEl, { max: 1000000 });') && JS.includes('const p = readMoney(pEl);'));
  assert(JS.includes('if (L.bad || tax.bad || paid.bad) { revealInvalid(); reportInputError(); return renderBlocked(FIX_MSG); }'));
  assert(JS.includes("if (paidCents !== null && !blank && paidCents > t.totalCents) return renderBlocked('', T.warn.paidOver);"), 'payments over the total block printing');
  assert(/function renderBlocked[\s\S]*?\$\('printBtn'\)\.disabled = true;/.test(JS));
  const T = literal('const T = {', '\n}[LANG];');
  assertEquals(T.en.warn.paidOver, 'The payments are more than the total. Check the payments before you print.');
  assertEquals(T.es.warn.paidOver, 'Los pagos son más que el total. Revisa los pagos antes de imprimir.');
  // The same refusal messages as every tool (tool-ui.js), so bad input reads the same as on the other templates.
  assert(JS.includes('FIX_MSG') && read('tools/assets/tool-ui.js').includes("fix: 'Fix the field marked in red to see the price.'"));
  for (const bad of ['abc', '-250', '1.250', '4e2', '']) assertEquals(M.parseAmount(bad), null, bad);
  assertEquals(M.amountProblem('-250').kind, 'negative');
  assertEquals(M.lineTotal({ qty: 4.5, unitPriceCents: 6200 }).cents, 27900);
  assertEquals(M.estimateTotals([{ fixedPriceCents: 85440 }], 6.5).taxCents, 5554, 'tax half-up once on the subtotal');
});

Deno.test('the printout drops empty lines, prints payments with a minus, and prints a blank form only when no line is filled in', () => {
  assert(JS.includes('line.empty = !desc && !unit && q.empty && p.empty;'));
  assert(JS.includes('s.lines.filter((l) => !l.empty).map('));
  assert(JS.includes('const blank = L.lines.every((l) => l.empty);'));
  assert(JS.includes("if (blank || paidCents !== null) amt(D.paid, paidCents, '', true);"), 'payments received are taken off, with a minus');
  assert(JS.includes("amt(D.bal, balanceCents, 'd-total');"), 'the balance due is the bold last line');
  assert(/const BLANK_ROWS = \d+;/.test(JS));
  // An invoice asks for no signature: no signature block, nothing to sign on screen, nothing collected.
  assert(!/d-sign|sigC|sigK/.test(CODE), 'no signature lines');
  assert(!/<canvas|signature_pad|toDataURL|type="file"/i.test(JS + PAGES.map((p) => read(p.file)).join('')), 'no e-signature');
});

Deno.test('tools.css: the invoice rules are scoped to the estimate template classes, so no other page changes', () => {
  const block = CSS.slice(CSS.indexOf('/* V6 batch 8: the free invoice template'));
  assert(block.length > 200, 'its own block at the end of tools.css');
  for (const sel of block.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g) ?? []) {
    for (const part of sel.trim().split(',')) assert(/\.est-(page|line|doc)/.test(part), `unscoped rule: ${part.trim()}`);
  }
});

// ── (c) the example job ─────────────────────────────────────────────────────────────────────────────────────────────

type Line = { qty: string; unit: { en: string; es: string }; price: string; priceCents: number; text: { en: string; es: string } };
const parseLines = (src: string): Line[] => [...src.matchAll(/\{ (?:kind: '(?:add|credit)', )?qty: '([^']*)', unit: \['([^']*)', '([^']*)'\], price: '([^']*)', text: \['([^']*)', '([^']*)'\] \}/g)]
  .map(([, qty, unitEn, unitEs, price, en, es]) => ({ qty, unit: { en: unitEn, es: unitEs }, price, priceCents: M.toCents(M.parseAmount(price)), text: { en, es } }));
const helper = (l: Line) => (l.qty === '' ? { fixedPriceCents: l.priceCents } : { qty: M.parseAmount(l.qty), unitPriceCents: l.priceCents });

const EX = parseLines(JS);
const EST_LINES = parseLines(EST_JS);
const CO_LINES = [...CO_JS.matchAll(/\{ kind: '(add|credit)', qty: '([^']*)', unit: \['[^']*', '[^']*'\], price: '([^']*)', text: \['/g)]
  .map(([, kind, qty, price]) => ({ kind, line: qty === '' ? { fixedPriceCents: M.toCents(M.parseAmount(price)) } : { qty: M.parseAmount(qty), unitPriceCents: M.toCents(M.parseAmount(price)) } }));
const PAID = M.toCents(M.parseAmount(/const EXAMPLE_PAID = '([^']+)';/.exec(JS)![1]));
const EST_DEPOSIT = M.toCents(M.parseAmount(/const EXAMPLE_DEPOSIT = '([^']+)';/.exec(EST_JS)![1]));
const EST_SUB = M.estimateTotals(EST_LINES.map(helper), 0).subtotalCents;
const CO_CHANGE = M.estimateTotals(CO_LINES.filter((l) => l.kind === 'add').map((l) => l.line), 0).totalCents
  - M.estimateTotals(CO_LINES.filter((l) => l.kind === 'credit').map((l) => l.line), 0).totalCents;
const T_EX = M.estimateTotals(EX.map(helper), 0); // the example has no sales tax
const BALANCE = T_EX.totalCents - PAID;

Deno.test('example: six lines, whole cents; the numbers add up to a $940.00 balance due', () => {
  assertEquals(EX.length, 6);
  for (const l of EX) assert(Number.isInteger(l.priceCents) && l.priceCents > 0);
  assertEquals(EX.map((l) => M.lineTotal(helper(l)).cents), [28500, 27900, 14400, 8640, 6000, 33560]);
  assertEquals([T_EX.subtotalCents, T_EX.taxCents, T_EX.totalCents, PAID, BALANCE], [119000, 0, 119000, 25000, 94000]);
  assert(!JS.includes("$('taxPct').value ="), 'the example types no sales tax');
});

Deno.test('example: $854.40, $335.60 and $250.00 are the estimate and change order templates’ own examples, recomputed', () => {
  // The first five lines are the estimate template's five lines, word for word (text, quantity, unit, price).
  assertEquals(EST_LINES.length, 5);
  assertEquals(EX.slice(0, 5), EST_LINES);
  assertEquals(EST_SUB, 85440, 'estimate #1001 subtotal');
  // The sixth is change order #1 on that estimate, at the change order template's own total, as one flat line.
  assertEquals(CO_LINES.length, 5);
  assertEquals(CO_CHANGE, 33560, 'change order #1');
  assertEquals(EX[5].qty, '');
  assertEquals(EX[5].priceCents, CO_CHANGE);
  assert(EX[5].text.en.startsWith('Change order #1, approved:') && EX[5].text.es.startsWith('Orden de cambio #1, aprobada:'));
  assertEquals(M.estimateTotals(EX.slice(0, 5).map(helper), 0).subtotalCents + EX[5].priceCents, T_EX.totalCents);
  assertEquals(EST_SUB + CO_CHANGE, 119000, 'the change order template’s own new contract total');
  // The payment already received is the estimate template's example deposit.
  assertEquals(PAID, EST_DEPOSIT);
  assertEquals(EST_DEPOSIT, 25000);
  // And those templates still print those figures themselves.
  for (const f of ['tools/estimate-template.html', 'es/herramientas/plantilla-de-estimado.html']) {
    const t = visible(read(f));
    assert(t.includes(usd(EST_SUB)) && t.includes(usd(EST_DEPOSIT)), f);
  }
  for (const f of ['tools/change-order-template.html', 'es/herramientas/plantilla-orden-de-cambio.html']) {
    const t = visible(read(f));
    assert(t.includes(`= ${usd(CO_CHANGE)}`) && t.includes(`${usd(EST_SUB)} + ${usd(CO_CHANGE)} = ${usd(T_EX.totalCents)}`), f);
  }
});

Deno.test('example: the same business, customer and job as the estimate and change order examples; plainly fictional', () => {
  const EX_INV = literal('const EXAMPLE = {', '\n}[LANG];');
  const EX_EST = literal('const EXAMPLE = {', '\n}[LANG];', EST_JS);
  const EX_CO = literal('const EXAMPLE = {', '\n}[LANG];', CO_JS);
  for (const lang of ['en', 'es']) {
    for (const k of ['bizName', 'bizPhone', 'bizEmail', 'custName', 'custAddr', 'estNo']) {
      assertEquals(EX_INV[lang][k], EX_EST[lang][k], `${lang} ${k}`);
      assertEquals(EX_INV[lang][k], EX_CO[lang][k], `${lang} ${k}`);
    }
    assert(/^\(555\) 010-01\d\d$/.test(EX_INV[lang].bizPhone) && EX_INV[lang].bizEmail.endsWith('@example.com'));
    assertEquals(EX_INV[lang].coNos, EX_CO[lang].coNo, 'change order #1');
    assert(EX_INV[lang].notes.includes('#1001'));
  }
  assertEquals([EX_INV.en.bizName, EX_INV.en.custName, EX_INV.es.bizName, EX_INV.es.custName], ['Example Home Repair LLC', 'Alex Johnson', 'Reparaciones Ejemplo LLC', 'Ana Torres']);
});

for (const pg of PAGES) {
  Deno.test(`${pg.file}: every dollar figure on the page is the example recomputed with estimate-math.js`, () => {
    const text = visible(read(pg.file));
    const figures = new Map<string, string>([
      ['estimate', usd(EST_SUB)], ['change order', usd(CO_CHANGE)], ['total', usd(T_EX.totalCents)], ['paid', usd(PAID)], ['balance', usd(BALANCE)],
    ]);
    assertEquals([...figures.values()], ['$854.40', '$335.60', '$1,190.00', '$250.00', '$940.00']);
    // Each estimate quantity line as the page states it ("4.5 hr × $62.00 = $279.00"), flat prices by amount.
    for (const l of EX.slice(0, 5)) {
      const total = usd(M.lineTotal(helper(l)).cents);
      if (l.qty === '') { assert(text.includes(total), `flat ${total}`); figures.set(`flat ${total}`, total); continue; }
      const stated = `${l.qty} ${l.unit[pg.lang]} × ${usd(l.priceCents)} = ${total}`;
      assert(text.includes(stated), `missing "${stated}"`);
      figures.set(`unit ${stated}`, usd(l.priceCents)); figures.set(`line ${stated}`, total);
    }
    // The two sums, written out.
    assert(text.includes(`${usd(EST_SUB)} + ${usd(CO_CHANGE)} = ${usd(T_EX.totalCents)}`), 'estimate + change order = total');
    assert(text.includes(`${usd(T_EX.totalCents)} − ${usd(PAID)} = ${usd(BALANCE)}`), 'total − payments = balance due');
    for (const [what, f] of figures) assert(text.includes(f), `${what}: ${f} not on the page`);
    // And nothing else: every $ amount on the page is one of those (or the empty $0.00 before anything is typed).
    const allowed = new Set([...figures.values(), '$0.00']);
    for (const m of text.matchAll(/\$\d[\d,]*(?:\.\d+)?/g)) assert(allowed.has(m[0]), `${m[0]} is not an example figure`);
    // The words match the data, and the prices are labelled as examples.
    for (const s of pg.lang === 'es'
      ? ['Las cinco líneas del estimado #1001', 'Tres llevan cantidad', 'Dos son precios fijos', 'La orden de cambio #1 fue de', 'El ejemplo no lleva impuesto sobre la venta', 'Cada precio es un ejemplo, no un precio de mercado']
      : ['The five lines of estimate #1001', 'Three use a quantity', 'Two are flat prices', 'Change order #1 came to', 'There’s no sales tax in the example', 'Every price is an example, not a market rate']) {
      assert(text.includes(s), s);
    }
  });
}

Deno.test('the social cards show the example: $854.40 + $335.60 − $250.00 = $940.00 (real minus signs)', () => {
  const og = read('scripts/brand/og.mjs');
  for (const lang of ['en', 'es']) {
    const card = og.split('\n').find((l) => l.includes(`['og-invoice-${lang}'`)) ?? '';
    assert(card, `og-invoice-${lang} is defined`);
    for (const v of [usd(EST_SUB), usd(CO_CHANGE), `${MINUS}${usd(PAID)}`, usd(BALANCE)]) assert(card.includes(`'${v}'`), `${lang} card shows ${v}`);
    assert(card.includes(lang === 'es' ? '5 líneas' : '5 lines'), `${lang}: the estimate's five lines`);
    assert(card.includes(lang === 'es' ? "['Saldo', '$940.00', 'total']" : "['Balance due', '$940.00', 'total']"));
    assert(!/-\$|'-/.test(card), `${lang}: no hyphen used as a minus sign`);
    for (const m of card.matchAll(/\$\d[\d,]*\.\d\d/g)) assert([usd(EST_SUB), usd(CO_CHANGE), usd(PAID), usd(BALANCE)].includes(m[0]), `${lang}: ${m[0]}`);
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

Deno.test('the script has the same words in both languages: form messages, the printout, the example', () => {
  const T = literal('const T = {', '\n}[LANG];');
  assertEquals(shape(T.en), shape(T.es));
  const DOC = literal('const DOC = {', '\n};');
  assertEquals(shape(DOC.en), shape(DOC.es));
  assertEquals([DOC.en.locale, DOC.es.locale], ['en-US', 'es-US']);
  assertEquals([DOC.en.title, DOC.es.title, DOC.en.bal, DOC.es.bal, DOC.en.paid, DOC.es.paid], ['Invoice', 'Factura', 'Balance due', 'Saldo', 'Payments received', 'Pagos recibidos']);
  const EXAMPLE = literal('const EXAMPLE = {', '\n}[LANG];');
  assertEquals(Object.keys(EXAMPLE.en).sort(), Object.keys(EXAMPLE.es).sort());
  for (const p of PAGES) for (const id of Object.keys(EXAMPLE.en)) assert(read(p.file).includes(`id="${id}"`), `${p.file}: #${id}`);
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
    for (const [hl, u] of [['en', '/tools/invoice-template'], ['es', '/es/herramientas/plantilla-de-factura'], ['x-default', '/tools/invoice-template']]) {
      assert(block.includes(`<xhtml:link rel="alternate" hreflang="${hl}" href="${SITE}${u}"/>`), `${hl}`);
    }
  });
}

Deno.test('both tool hubs: a live card and a CollectionPage entry for the invoice template, after the change order template', () => {
  for (const [f, href] of [['tools/index.html', '/tools/invoice-template'], ['es/herramientas/index.html', '/es/herramientas/plantilla-de-factura']]) {
    const h = read(f);
    assert(h.includes(`<a class="card" href="${href}" data-cta="tools_card_invoice_template">`), `${f}: card`);
    assert(h.includes(`"url": "${SITE}${href}" }`), `${f}: hasPart`);
    JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h)![1]);
    assert(h.indexOf(`<a class="card" href="${href}"`) > h.indexOf('data-cta="tools_card_change_order_template"'));
    assert(!/\$\d/.test(h.slice(h.indexOf(`<a class="card" href="${href}"`), h.indexOf('</a>', h.indexOf(`<a class="card" href="${href}"`)))), 'no figure on the card');
  }
});

Deno.test('internal links: estimate template <-> change order template <-> invoice template, both languages', () => {
  const T3 = {
    en: { est: '/tools/estimate-template', co: '/tools/change-order-template', inv: '/tools/invoice-template' },
    es: { est: '/es/herramientas/plantilla-de-estimado', co: '/es/herramientas/plantilla-orden-de-cambio', inv: '/es/herramientas/plantilla-de-factura' },
  };
  const FILES = {
    en: { est: 'tools/estimate-template.html', co: 'tools/change-order-template.html', inv: 'tools/invoice-template.html' },
    es: { est: 'es/herramientas/plantilla-de-estimado.html', co: 'es/herramientas/plantilla-orden-de-cambio.html', inv: 'es/herramientas/plantilla-de-factura.html' },
  };
  for (const lang of ['en', 'es'] as const) {
    for (const from of ['est', 'co', 'inv'] as const) {
      const h = read(FILES[lang][from]);
      for (const to of ['est', 'co', 'inv'] as const) {
        if (from === to) continue;
        assert(h.includes(`href="${T3[lang][to]}"`), `${FILES[lang][from]} -> ${T3[lang][to]}`);
        // A card in the related block at the end of the page, not only a link in the text.
        const related = h.slice(h.lastIndexOf('<div class="cards">'));
        assert(related.includes(`<a class="card" href="${T3[lang][to]}"`), `${FILES[lang][from]}: a related card for ${T3[lang][to]}`);
      }
    }
  }
  assert(read('tools/invoice-template.html').includes('href="/guides/how-to-write-an-estimate"'));
  assert(read('es/herramientas/plantilla-de-factura.html').includes('href="/es/guias/como-hacer-un-estimado"'));
  for (const pg of PAGES) {
    const h = read(pg.file);
    const twin = pg.lang === 'en' ? '/es/herramientas/plantilla-de-factura' : '/tools/invoice-template';
    assert(h.split('</nav>')[0].includes(`href="${twin}"`) && h.slice(h.indexOf('<footer')).includes(`href="${twin}"`), pg.file);
  }
});

// ── (f) inform, never instruct (legal and tax) ──────────────────────────────────────────────────────────────────────

Deno.test('legal and tax: no sentence states what a law requires; the approved "not legal advice" and tax wording are kept', () => {
  const law = /\blaws?\b|required by law|legally|\bstatut|\bregulation|\bley(es)?\b|por ley|legalmente|obligatori|\bexige|\brequiere|\bmust\b|have to charge|tienes que cobrar/i;
  for (const pg of PAGES) {
    const text = visible(read(pg.file));
    assert(!law.test(text), `${pg.file}: "${law.exec(text)?.[0]}" reads as a statement of law`);
    assert(!/\b(guarantee|guaranteed|protects you|enforceable|collect(ion)? agency|garantiza|te protege|exigible)\b/i.test(text), `${pg.file}: legal promise`);
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
  assert(!law.test(CODE.replace(/\$\{[^}]*\}/g, '')), 'the script states no law either');
});

Deno.test('late fees and interest: mentioned once, only as "if your contract has a late fee, write it here"; no rate, no rule', () => {
  for (const pg of PAGES) {
    const text = visible(read(pg.file));
    const allowed = pg.lang === 'es' ? 'Si tu contrato tiene un cargo por pago tardío, escríbelo aquí.' : 'If your contract has a late fee, write it here.';
    assert(text.includes(allowed));
    const fee = pg.lang === 'es' ? /cargo por pago tard[ií]o|recargo|\bmora\b|penalidad|multa/gi : /late (fee|charge|payment)|penalt/gi;
    assertEquals((text.match(fee) ?? []).length, 1, `${pg.file}: late fee mentioned once`);
    assert(!/\binterest\b|\bAPR\b|\binter[eé]s(es)?\b|finance charge|\d+(\.\d+)?\s?%\s?(a|per|each|al|por|cada)\s(month|mes|year|año)/i.test(text), `${pg.file}: no interest rate`);
  }
  assert(!/late fee|interest|pago tard|inter[eé]s|recargo/i.test(CODE), 'nothing in the script adds a fee or interest');
});

Deno.test('how to pay: the placeholder and the example name payment methods, never a payment service', () => {
  const EXAMPLE = literal('const EXAMPLE = {', '\n}[LANG];');
  const brands = /zelle|venmo|paypal|cash ?app|square|stripe|apple ?pay|google ?pay|ath m[oó]vil|western union|quickbooks/i;
  for (const pg of PAGES) {
    const h = read(pg.file);
    assertEquals(attr(h, 'payHow', 'placeholder'), pg.lang === 'es' ? 'ej. Cheque o efectivo' : 'e.g. Check or cash');
    assert(!brands.test(visible(h)) && !brands.test(h), `${pg.file}: no payment service named`);
  }
  for (const lang of ['en', 'es']) assert(!brands.test(EXAMPLE[lang].payHow), lang);
  assert(!brands.test(JS));
});

Deno.test('Spanish page: US Spanish the site already uses (factura, saldo, anticipo, orden de cambio, "tú"), no Mexico-only words', () => {
  const es = read('es/herramientas/plantilla-de-factura.html');
  assert(!/rec[aá]mara|\btroca|resan|zoclo|nom[aá]s\b|parchar|\busted\b/i.test(es));
  for (const w of ['factura', 'saldo', 'anticipo', 'orden de cambio', 'estimado', 'Escribe', 'tu cliente', 'Déjalo en blanco']) assert(es.includes(w), w);
  const T = literal('const T = {', '\n}[LANG];');
  const DOC = literal('const DOC = {', '\n};');
  const EXAMPLE = literal('const EXAMPLE = {', '\n}[LANG];');
  assert(!/\busted\b/i.test(JSON.stringify([T.es, DOC.es, EXAMPLE.es])));
});
