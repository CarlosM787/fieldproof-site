// V6 batch 10 (directive V6 §5 "Mistakes contractors make when quoting" + "Spanish-language guides serving real U.S.
// contractors"): /es/guias/errores-al-cotizar-mano-de-obra (written first) and its EN twin /guides/labor-quoting-mistakes.
// Growth's Search Console read of 11/14 (28 days to 11/12): the Spanish labor-pricing pages are the only cluster on or near
// Google's page 1, so this guide links into them and they link back.
//
// Every dollar figure and every percentage the two pages print is recomputed here with the same module the calculators use
// (tools/assets/estimate-math.js), from ONE running example: the labor guide's siding repair, quoted right at $1,616.88.
// Each mistake changes one input of that quote. A printed figure that this file does not derive fails the test, and the
// figures shared with the labor guide, the markup guide, the painting guide and the tool examples must match them.
// Honesty: no sentence about what a law requires, no percentage presented as an industry statistic, no release claim.
// Run with:  npx deno test --allow-read scripts/tests/quoting-mistakes.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import * as math from '../../tools/assets/estimate-math.js';
// deno-lint-ignore no-explicit-any
const M: any = math;

const root = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, root)).replace(/\r\n/g, '\n');
const usd = (c: number) => M.formatMoney(c, 'en');
const pct1 = (p: number) => `${M.pct1(p).toFixed(1)}%`;
const MINUS = '−';
const SITE = 'https://talkestimate.com';

const ES = { file: 'es/guias/errores-al-cotizar-mano-de-obra.html', url: '/es/guias/errores-al-cotizar-mano-de-obra', lang: 'es' };
const EN = { file: 'guides/labor-quoting-mistakes.html', url: '/guides/labor-quoting-mistakes', lang: 'en' };
const PAGES = [ES, EN];
const visible = (h: string) => h.slice(h.indexOf('<body')).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const moneyIn = (t: string) => new Set(t.match(/\$\d{1,3}(?:,\d{3})*(?:\.\d\d)?/g) ?? []);
const pctIn = (t: string) => new Set(t.match(/\d+(?:\.\d+)?%/g) ?? []);

// ── The running example: the labor guide's siding repair (guide-examples.test.ts pins it on the labor guide) ─────────
const LEAD = 4200, HELPER = 2400, WAGE = 2800; // cost per hour of the lead (the round $42 of $42.20), the helper; the lead's wage
const crew = (hours: number, leadRate = LEAD) => M.crewLabor([{ workers: 1, hours, rateCents: leadRate }, { workers: 1, hours, rateCents: HELPER }]);
const STEPS = { overhead: { mode: 'pct', pct: 15 }, priceOn: 'cost_plus_overhead', method: 'markup', pct: 30 };
const siding = (labCents: number, o: Record<string, unknown> = {}) => M.quoteJob({
  costs: [{ id: 'lab', cents: labCents }, { id: 'mat', cents: 31000 }, { id: 'trav', cents: 3600 }, { id: 'disp', cents: 5500 }],
  contingencyPct: 10, ...STEPS, ...o,
});
const rate = M.laborHourCost({ wageCents: WAGE, paidHours: 2080, billableHours: 1664, payrollTaxPct: 9, compPer100: 9, otherYearCents: 150000 });
const lab9 = crew(9);
const right = siding(lab9.cents);
// 1. The lead at the $28 wage.  2. 7 hours each (hoped for).  3. 8 hours each (one hour each off the wall forgotten).
// 4. No contingency.  5. No overhead share (markup on the job cost alone).  6. 30% meant as a margin.
// 7. Painting the new boards for free: 2 hours of the lead + one gallon at the painting guide's $42.50.  8. A handshake change: 2 crew hours.
const atWage = crew(9, WAGE), h7 = crew(7), h8 = crew(8), padded = crew(9.9);
const q1 = siding(atWage.cents), q2 = siding(h7.cents), q3 = siding(h8.cents);
const q4 = siding(lab9.cents, { contingencyPct: 0 });
const q5 = siding(lab9.cents, { overhead: { mode: 'none' }, priceOn: 'cost' });
const q6 = siding(lab9.cents, { method: 'margin' });
const PAINT_COST = 2 * LEAD + 4250;
const paintLine = M.quoteJob({ costs: [{ id: 'lab', cents: 2 * LEAD }, { id: 'paint', cents: 4250 }], contingencyPct: 10, ...STEPS });
const change = M.quoteJob({ costs: [{ id: 'lab', cents: LEAD + HELPER }], contingencyPct: 10, ...STEPS }); // one more hour each
const realLeft = (price: number) => price - right.jobCostCents - right.overheadCents; // what a price leaves after the real job cost and overhead share
const DISCOUNT = Math.round(right.priceCents * 10 / 100);

const SCENARIOS = [
  // [ES id, EN id, quote shown in the summary table, what it costs]
  ['sueldo', 'wage', q1.priceCents, right.priceCents - q1.priceCents],
  ['horas', 'hours', q2.priceCents, right.priceCents - q2.priceCents],
  ['pared', 'wall', q3.priceCents, right.priceCents - q3.priceCents],
  ['imprevistos', 'contingency', q4.priceCents, right.priceCents - q4.priceCents],
  ['gastos-generales', 'overhead', q5.priceCents, right.priceCents - q5.priceCents],
  ['markup-margen', 'markup-margin', right.priceCents, q6.priceCents - right.priceCents],
  ['no-incluye', 'not-included', right.priceCents, PAINT_COST],
  ['cambios', 'changes', right.priceCents, change.priceCents],
] as const;

Deno.test('the running example is the labor guide\'s quote, and each mistake recomputes from it', () => {
  assertEquals([lab9.cents, lab9.crewHours, right.directCents, right.contingencyCents, right.overheadCents, right.baseCents, right.priceCents],
    [59400, 18, 99500, 9950, 14925, 124375, 161688]);
  assertEquals([right.afterOverheadCents, pct1(right.afterOverheadPct), right.grossProfitCents, right.grossProfitIfUnusedCents], [37313, '23.1%', 52238, 62188]);
  assertEquals([rate.perHourCents, rate.totalCents, pct1(rate.aboveWagePct)], [4220, 7022320, '50.7%']);
  // 1. wage as cost
  assertEquals([atWage.lines[0].cents, atWage.cents, lab9.cents - atWage.cents, q1.priceCents, realLeft(q1.priceCents)], [25200, 46800, 12600, 141213, 16838]);
  assert(realLeft(q1.priceCents) * 2 < right.afterOverheadCents, '"less than half"');
  assertEquals([1664 * WAGE, rate.totalCents - 1664 * WAGE], [4659200, 2363120]);
  // 2. hoped-for hours
  assertEquals([h7.cents, q2.priceCents, lab9.cents - h7.cents, q2.contingencyCents, lab9.cents - h7.cents - q2.contingencyCents], [46200, 140238, 13200, 8630, 4570]);
  // 3. hours off the wall: the labor guide's own "2 crew hours = $66.00 of labor = $107.25 on the quote"
  assertEquals([h8.cents, q3.priceCents, right.priceCents - q3.priceCents, lab9.cents - h8.cents], [52800, 150963, 10725, 6600]);
  // 4. contingency
  assertEquals([q4.priceCents, q4.afterOverheadCents - right.contingencyCents, padded.cents - lab9.cents, padded.crewHours], [148753, 24378, 5940, 19.8]);
  // 5. overhead
  assertEquals([q5.baseCents, q5.priceCents, realLeft(q5.priceCents), pct1(realLeft(q5.priceCents) / q5.priceCents * 100)], [109450, 142285, 17910, '12.6%']);
  // 6. margin: $1,243.75 / (1 - 0.30), rounded up to the cent; the markup that reaches it
  assertEquals([q6.priceCents, q6.priceCents - right.priceCents, pct1(q6.afterOverheadPct), pct1(M.marginToMarkup(30))], [177679, 15991, '30.0%', '42.9%']);
  assertEquals(q6.priceCents, M.priceFromMargin(124375, 30).priceCents);
  // 7. not included
  assertEquals([PAINT_COST, right.afterOverheadCents - PAINT_COST, paintLine.priceCents], [12650, 24663, 20557]);
  assert(PAINT_COST * 3 > right.afterOverheadCents, '"more than a third"');
  // 8. a handshake change: the same 2 crew hours; the new total is the labor guide's $1,724.13
  assertEquals([change.priceCents, right.priceCents + change.priceCents, siding(lab9.cents + 6600).priceCents], [10725, 172413, 172413]);
  // FAQ: a 10% discount
  assertEquals([DISCOUNT, right.afterOverheadCents - DISCOUNT, pct1(DISCOUNT / right.afterOverheadCents * 100)], [16169, 21144, '43.3%']);
});

// Every dollar amount either page may print, each derived above (integers are inputs of the example or the cited guides).
const ALLOWED_MONEY = new Set([
  '$28', '$42', '$24', '$310', '$36', '$55', '$9', '$100', '$24,000', '$160,000', '$42.50',
  usd(rate.perHourCents), usd(lab9.cents), usd(right.directCents - lab9.cents), usd(right.directCents), usd(right.contingencyCents), usd(right.overheadCents),
  usd(right.baseCents), usd(right.priceCents - right.baseCents), usd(right.priceCents), usd(right.afterOverheadCents),
  ...SCENARIOS.flatMap(([, , q, c]) => [usd(q), usd(c)]),
  usd(lab9.lines[0].cents), usd(atWage.lines[0].cents), usd(lab9.cents - atWage.cents), usd(realLeft(q1.priceCents)),
  usd(1664 * WAGE), usd(rate.totalCents), usd(rate.totalCents - 1664 * WAGE),
  usd(h7.cents), usd(lab9.cents - h7.cents), usd(q2.contingencyCents), usd(lab9.cents - h7.cents - q2.contingencyCents),
  usd(h8.cents), usd(lab9.cents - h8.cents),
  usd(q4.afterOverheadCents - right.contingencyCents), usd(padded.cents - lab9.cents), usd(right.grossProfitCents), usd(right.grossProfitIfUnusedCents),
  usd(q5.baseCents), usd(realLeft(q5.priceCents)), usd(q6.priceCents),
  usd(2 * LEAD), usd(right.afterOverheadCents - PAINT_COST), usd(paintLine.priceCents),
  usd(right.priceCents + change.priceCents), usd(DISCOUNT), usd(right.afterOverheadCents - DISCOUNT),
]);
// Every percentage either page may print: the example's own inputs (10% contingency, 15% overhead, 30% markup, 9% payroll tax),
// the IRS figure the labor guide already cites (7.65%), and results computed above. Nothing else, so no industry statistic.
const ALLOWED_PCT = new Set(['10%', '15%', '30%', '9%', '7.65%', pct1(right.afterOverheadPct), pct1(rate.aboveWagePct),
  pct1(realLeft(q5.priceCents) / q5.priceCents * 100), pct1(M.marginToMarkup(30)), pct1(DISCOUNT / right.afterOverheadCents * 100)]);

for (const pg of PAGES) {
  const html = read(pg.file);
  const text = visible(html);

  Deno.test(`${pg.url}: every dollar figure and percentage on the page is one this file derives`, () => {
    for (const m of moneyIn(text)) assert(ALLOWED_MONEY.has(m), `${pg.url}: ${m} is not derived from the example`);
    for (const p of pctIn(text)) assert(ALLOWED_PCT.has(p), `${pg.url}: ${p} is not an example input or a computed result`);
    assert(!/-\$\d/.test(text), 'a minus sign is U+2212, never a hyphen');
  });

  Deno.test(`${pg.url}: the summary table shows each mistake's recomputed quote and cost, and links to its section`, () => {
    const rows = [...html.matchAll(/<tr><td><a href="#([a-z-]+)">(\d)\. [^<]*<\/a><\/td><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)];
    assertEquals(rows.length, 8);
    rows.forEach((r, i) => {
      const [esId, enId, quote, cost] = SCENARIOS[i];
      assertEquals([r[1], r[2], r[3], r[4]], [pg.lang === 'es' ? esId : enId, String(i + 1), usd(quote), usd(cost)], `row ${i + 1}`);
      assert(html.includes(`<h2 id="${r[1]}">${i + 1}. `), `section #${r[1]}`);
    });
    // The short answer quotes the range of the table.
    const costs = SCENARIOS.map(([, , , c]) => c);
    assert(html.includes(`<b>${usd(Math.min(...costs))} ${pg.lang === 'es' ? 'y' : 'and'} ${usd(Math.max(...costs))}</b>`), 'callout range');
  });

  Deno.test(`${pg.url}: each mistake's section prints its own figures`, () => {
    const section = (id: string) => { const s = html.indexOf(`<h2 id="${id}">`); return html.slice(s, html.indexOf('<h2', s + 5)); };
    const want: string[][] = [
      ['$28', usd(4220), '50.7%', '1,664', '2,080', usd(37800), usd(25200), usd(12600), usd(q1.priceCents), usd(20475), usd(59400), usd(16838), usd(37313), usd(4659200), usd(7022320), usd(2363120), '9%', '7.65%'],
      [usd(59400), usd(46200), usd(q2.priceCents), usd(21450), usd(13200), usd(8630), usd(4570)],
      [usd(52800), usd(q3.priceCents), usd(10725), usd(6600)],
      [usd(q4.priceCents), usd(12935), usd(9950), usd(24378), usd(37313), '9.9', usd(5940), usd(40100), usd(52238), usd(62188)],
      [usd(109450), usd(q5.priceCents), usd(19403), usd(14925), usd(17910), '12.6%', '23.1%', '$24,000', '$160,000', '15%'],
      [usd(124375), usd(161688), '23.1%', usd(q6.priceCents), usd(15991), '42.9%'],
      [usd(8400), '$42.50', usd(12650), usd(37313), usd(24663), usd(20557)],
      [usd(6600), usd(10725), usd(172413)],
    ];
    SCENARIOS.forEach(([esId, enId], i) => {
      const s = section(pg.lang === 'es' ? esId : enId);
      for (const f of want[i]) assert(s.includes(f), `${pg.url} mistake ${i + 1}: ${f}`);
    });
  });

  Deno.test(`${pg.url}: hreflang pair, canonical, lang, one H1, title <= 60 and description <= 155, Article + FAQ data`, () => {
    assert(html.includes(`<html lang="${pg.lang}">`));
    assertEquals((html.match(/<h1>/g) ?? []).length, 1);
    assert(html.includes(`<link rel="canonical" href="${SITE}${pg.url}" />`));
    assert(html.includes(`<link rel="alternate" hreflang="en" href="${SITE}${EN.url}" />`));
    assert(html.includes(`<link rel="alternate" hreflang="es" href="${SITE}${ES.url}" />`));
    assert(html.includes(`<link rel="alternate" hreflang="x-default" href="${SITE}${EN.url}" />`));
    const title = /<title>([^<]+)<\/title>/.exec(html)![1];
    const desc = /<meta name="description" content="([^"]+)"/.exec(html)![1];
    assert(title.endsWith(' | TalkEstimate') && [...title].length <= 60, title);
    assert(desc.length >= 110 && desc.length <= 155, `description ${desc.length}`);
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]);
    const art = ld['@graph'].find((x: { '@type': string }) => x['@type'] === 'Article');
    assertEquals(art.headline, /<h1>([^<]+)<\/h1>/.exec(html)![1]);
    assertEquals([art.inLanguage, art.mainEntityOfPage, art.datePublished], [pg.lang, SITE + pg.url, '2026-11-14']);
    // FAQPage: exactly the visible FAQ (scripts/faq-ld.mjs --check runs the same comparison).
    const faq = JSON.parse(/<script type="application\/ld\+json" id="faq-ld">([\s\S]*?)<\/script>/.exec(html)![1]);
    const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    const shown = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map(([, q, a]) => [plain(q), plain(a)]);
    assertEquals(faq.mainEntity.map((x: { name: string; acceptedAnswer: { text: string } }) => [x.name, x.acceptedAnswer.text]), shown);
    assertEquals([faq['@type'], faq.inLanguage, shown.length], ['FAQPage', pg.lang, 6]);
  });

  Deno.test(`${pg.url}: links out to the labor pages, the markup tool and guide, and the three templates (same language)`, () => {
    const p = pg.lang === 'es' ? '/es/herramientas/' : '/tools/';
    const want = pg.lang === 'es'
      ? ['/es/guias/como-cobrar-mano-de-obra', `${p}calculadora-costo-hora-mano-de-obra`, `${p}calculadora-mano-de-obra-cotizacion`, `${p}calculadora-markup-margen`,
        '/es/guias/markup-vs-margen', `${p}plantilla-de-estimado`, `${p}plantilla-orden-de-cambio`, `${p}plantilla-de-factura`, '/es/guias/como-estimar-pintura']
      : ['/guides/how-to-price-labor', `${p}labor-cost-per-hour-calculator`, `${p}labor-job-quote-calculator`, `${p}markup-margin-calculator`,
        '/guides/markup-vs-margin', `${p}estimate-template`, `${p}change-order-template`, `${p}invoice-template`, '/guides/how-to-estimate-a-paint-job'];
    const body = html.slice(html.indexOf('<div class="wrap prose">'), html.indexOf('<section class="block alt">'));
    for (const href of want) assert(new RegExp(`<a href="${href}" data-cta="mistakes_to_[a-z_]+">`).test(body), `${pg.url} -> ${href}`);
    // Other-language links are only the language switch and the footer, marked with hreflang.
    for (const m of html.matchAll(/<a [^>]*href="(\/[^"#]*)"[^>]*>/g)) {
      const other = pg.lang === 'es' ? /^\/(guides|tools)\// : /^\/es\//;
      if (other.test(m[1])) assert(/hreflang="(en|es)"/.test(m[0]), `${pg.url}: unmarked other-language link ${m[1]}`);
    }
    for (const m of html.matchAll(/href="#([a-z-]+)"/g)) assert(m[1] === 'main' || m[1] === 'join' || html.includes(`id="${m[1]}"`), `#${m[1]}`);
  });

  Deno.test(`${pg.url}: honest copy: example rates labelled, no law requirement, no statistic, no release claim`, () => {
    // Careful wording from the labor guide: example rates, state and trade, the IRS sources.
    assert(pg.lang === 'es' ? text.includes('son de ejemplo: cambian según el estado y el oficio') : text.includes('are examples: they vary by state and trade'));
    assert(pg.lang === 'es' ? text.includes('depende del código de clase y del estado') : text.includes('workers’ comp rates are set per class code and state'));
    assert(html.includes('href="https://www.irs.gov/taxtopics/tc751"') && html.includes('href="https://www.irs.gov/taxtopics/tc759"'));
    assert(pg.lang === 'es' ? text.includes('Cada costo y cada porcentaje es de ejemplo, no de mercado') || text.includes('es de ejemplo, no de mercado') : text.includes('is an example, not a market rate'));
    // No sentence says what a law requires; state rules are only pointed at, as the estimate guide does.
    for (const s of text.split(/[.;:!?]\s/)) {
      assert(!/\b(law|laws|ley|leyes|legally|illegal|ilegal|mandatory|obligatori[oa]s?|required|requires?|exigen?|requieren?|must)\b/i.test(s), `${pg.url}: "${s.trim()}"`);
    }
    assert(pg.lang === 'es' ? text.includes('Si tu estado tiene reglas para los contratos de mejoras del hogar, síguelas; esta guía no las reemplaza')
      : text.includes('If your state has rules for home improvement contracts, follow them; this guide doesn’t replace them'));
    assert(!/\b(most|many) (contractors|businesses|quotes|jobs)\b|\bon average\b|\bstud(y|ies)\b|\bsurveys?\b|\bresearch (shows|says)\b|la mayoría|muchos contratistas|en promedio|estudios?\b|encuestas?/i.test(text), 'no statistic');
    assert(!/<blockquote|testimonial|testimonio/i.test(html), 'no testimonial');
    // Public state B (the approved phrase), the labor guide's app line, and no release, store or plan price claim.
    assert(html.includes(pg.lang === 'es' ? 'Todavía no disponible — pronto en Android · construida y probada en un teléfono real' : 'Not released yet — Android coming soon · built and tested on a real phone'));
    assert(html.includes(pg.lang === 'es' ? 'La IA organiza lo que dijiste; nunca pone un precio.' : 'The AI organizes what you said; it never sets a price.'));
    assert(!/early access|acceso anticipado|Google Play|App Store|available now|ya disponible|download|descarga/i.test(text), 'no release claim');
    assert(!/\$\s?29\b|\$19\.99|\$49\.99|\/month|al mes|\/mes\b/.test(html), 'no plan price');
  });

  Deno.test(`${pg.url}: its own share image (1200 x 630), defined in og.mjs with the recomputed figures`, () => {
    const name = `og-quoting-mistakes-${pg.lang}`;
    assert(html.includes(`<meta property="og:image" content="${SITE}/assets/og/${name}.png" />`) && html.includes(`<meta name="twitter:image" content="${SITE}/assets/og/${name}.png" />`));
    const b = Deno.readFileSync(new URL(`assets/og/${name}.png`, root));
    assertEquals(String.fromCharCode(...b.slice(1, 4)), 'PNG');
    const v = new DataView(b.buffer, b.byteOffset);
    assertEquals([v.getUint32(16), v.getUint32(20)], [1200, 630]);
    const card = read('scripts/brand/og.mjs').split('\n').find((l) => l.includes(`['${name}'`)) ?? '';
    for (const c of [right.priceCents - q2.priceCents, right.priceCents - q1.priceCents, right.priceCents - q5.priceCents]) assert(card.includes(`'${MINUS}${usd(c)}'`), `${name}: ${usd(c)}`);
    assert(card.includes(`'${usd(right.priceCents)}', 'total'`) && !/'-|-\$/.test(card));
  });
}

Deno.test('EN and ES print the same figures and percentages (one example, two languages)', () => {
  const [es, en] = [visible(read(ES.file)), visible(read(EN.file))];
  assertEquals([...moneyIn(es)].sort(), [...moneyIn(en)].sort());
  assertEquals([...pctIn(es)].sort(), [...pctIn(en)].sort());
});

Deno.test('the ES page is Spanish for U.S. contractors: tú, the site\'s words, no usted', () => {
  const t = visible(read(ES.file));
  for (const w of ['mano de obra', 'cotización', 'estimado', 'orden de cambio', 'imprevistos', 'gastos generales', 'markup', 'margen', 'seguro de accidentes (workers’ comp)', 'impuestos de nómina']) {
    assert(t.includes(w), w);
  }
  assert(!/\busted(es)?\b/i.test(t), 'tú, not usted');
  assert(t.includes('cobras') && t.includes('te cuesta'), 'tú forms');
});

Deno.test('figures shared with the labor guide, the markup guide, the painting guide and the tool examples match them', () => {
  for (const f of ['guides/how-to-price-labor.html', 'es/guias/como-cobrar-mano-de-obra.html']) {
    const h = read(f);
    for (const n of [usd(right.priceCents), usd(right.afterOverheadCents), usd(right.grossProfitCents), usd(right.grossProfitIfUnusedCents), usd(59400), usd(99500),
      usd(9950), usd(14925), usd(124375), usd(6600), usd(10725), usd(172413), usd(4220), usd(7022320), '50.7%', '1,664', '2,080', '7.65%']) {
      assert(h.includes(n), `${f}: ${n}`);
    }
  }
  for (const f of ['guides/markup-vs-margin.html', 'es/guias/markup-vs-margen.html']) {
    const h = read(f);
    assert(h.includes('$24,000 ÷ $160,000 = <b>15%</b>') && h.includes('42.9%'), f);
  }
  for (const f of ['guides/how-to-estimate-a-paint-job.html', 'es/guias/como-estimar-pintura.html']) assert(read(f).includes('$42.50'), f);
  const og = read('scripts/brand/og.mjs');
  assert(og.includes("['Materials, travel, disposal', '$401.00']") && og.includes("['Materiales, traslado, escombro', '$401.00']"), 'the labor card\'s $401.00');
  // The quote tool's example button = this example (so "change one number at a time" starts from $1,616.88).
  const q = read('tools/assets/labor-quote.js');
  for (const s of ["['1', '9', '42']", "['1', '9', '24']", "$('mat').value = '310'", "$('trav').value = '36'", "$('disp').value = '55'", "$('cont').value = '10'", "$('ohVal').value = '15'", "$('pct').value = '30'"]) assert(q.includes(s), s);
  const r = read('tools/assets/labor-rate.js');
  for (const s of ["$('wage').value = '28'", "$('paid').value = '2080'", "$('billable').value = '1664'", "$('tax').value = '9'", "$('comp').value = '9'", "$('other').value = '1500'"]) assert(r.includes(s), s);
});

Deno.test('the labor cluster links to the guide: one sentence each, in the body, before any FAQ (EN + ES)', () => {
  const links: [string, string, string][] = [
    ['es/guias/como-cobrar-mano-de-obra.html', ES.url, 'labor_guide_to_mistakes'],
    ['es/herramientas/calculadora-costo-hora-mano-de-obra.html', ES.url, 'rate_tool_to_mistakes'],
    ['es/herramientas/calculadora-mano-de-obra-cotizacion.html', ES.url, 'quote_tool_to_mistakes'],
    ['guides/how-to-price-labor.html', EN.url, 'labor_guide_to_mistakes'],
    ['tools/labor-cost-per-hour-calculator.html', EN.url, 'rate_tool_to_mistakes'],
    ['tools/labor-job-quote-calculator.html', EN.url, 'quote_tool_to_mistakes'],
  ];
  for (const [page, href, cta] of links) {
    const h = read(page);
    assertEquals((h.match(new RegExp(`<a href="${href}" data-cta="${cta}">`, 'g')) ?? []).length, 1, `${page} -> ${href}`);
    const at = h.indexOf(`data-cta="${cta}"`), faq = h.indexOf('<details><summary>');
    assert(at > h.indexOf('<main') && at < h.indexOf('</main>') && (faq < 0 || at < faq), `${page}: in the body, before the FAQ`);
  }
  // The rate tools quote the wage-as-cost figure, so it must be the one this file computes.
  assert(read('es/herramientas/calculadora-costo-hora-mano-de-obra.html').includes(`la cotización sale ${usd(20475)} más baja`));
  assert(read('tools/labor-cost-per-hour-calculator.html').includes(`the quote comes out ${usd(20475)} low`));
});

Deno.test('both tool hubs list the guide as a live card and in their CollectionPage data', () => {
  for (const [hub, url] of [['es/herramientas/index.html', ES.url], ['tools/index.html', EN.url]]) {
    const h = read(hub);
    assert(h.includes(`<a class="card" href="${url}" data-cta="tools_card_guide_mistakes">`), hub);
    assert(h.includes(`"url": "${SITE}${url}" }`), `${hub}: hasPart`);
  }
});

Deno.test('route and sitemap: a 200 rewrite each, and a sitemap entry with the EN/ES/x-default triplet', () => {
  const rules = read('_redirects').split('\n').map((l) => l.trim().split(/\s+/));
  const sm = read('sitemap.xml');
  for (const pg of PAGES) {
    assert(rules.some(([f, t, c]) => f === pg.url && t === `${pg.url}.html` && c === '200'), pg.url);
    const block = sm.slice(sm.indexOf(`<loc>${SITE}${pg.url}</loc>`));
    const one = block.slice(0, block.indexOf('</url>'));
    assert(one.length > 0 && one.includes(`hreflang="en" href="${SITE}${EN.url}"`) && one.includes(`hreflang="es" href="${SITE}${ES.url}"`) && one.includes(`hreflang="x-default" href="${SITE}${EN.url}"`), pg.url);
  }
});
