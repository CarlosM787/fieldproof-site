// The worked examples in the Release B guides, recomputed with the same shared module the calculators use.
// Every number a guide prints for its example is asserted here, and each printed figure must appear on both the
// English and the Spanish page. Change a guide's example and this file must change with it.
// Run with:  npx --yes deno test --allow-read scripts/tests/

import { assert, assertEquals } from 'jsr:@std/assert@1';
import * as math from '../../tools/assets/estimate-math.js';
// deno-lint-ignore no-explicit-any
const M: any = math;

const read = (p: string) => Deno.readTextFileSync(new URL(`../../${p}`, import.meta.url));
const usd = (c: number) => M.formatMoney(c, 'en');
const pct1 = (p: number) => M.pct1(p).toFixed(1);

/** Assert that each figure appears on every listed page (same digits in EN and ES: both use $1,234.56). */
function onPages(pages: string[], figures: string[]) {
  for (const p of pages) {
    const html = read(p);
    for (const f of figures) assert(html.includes(f), `${p} is missing "${f}"`);
  }
}

// ── How to estimate a paint job: a 12 x 11 ft bedroom ────────────────────────
const PAINT_PAGES = ['guides/how-to-estimate-a-paint-job.html', 'es/guias/como-estimar-pintura.html'];

Deno.test('paint guide: area, coats, gallons needed and gallons to buy', () => {
  const q = M.paintQuantities({
    walls: [{ widthFt: 12, heightFt: 8, count: 2 }, { widthFt: 11, heightFt: 8, count: 2 }],
    openings: [{ widthFt: 3, heightFt: 7, count: 2 }, { widthFt: 3, heightFt: 4, count: 1 }],
    coats: 2, coverageSqFtPerGallon: 300, wastePct: 10,
  });
  assertEquals(q, { ok: true, grossSqFt: 368, openingsSqFt: 54, paintableSqFt: 314, coatSqFt: 628, gallonsExact: 2.3, gallonsToBuy: 3 });
  assertEquals(12 * 8 * 2, 192); assertEquals(11 * 8 * 2, 176); assertEquals(3 * 7 * 2, 42); assertEquals(3 * 4, 12);
  onPages(PAINT_PAGES, ['192', '176', '368', '− 42', '− 12', '314', '628', '2.30', '0.70']);
});

Deno.test('paint guide: paint priced on the gallons bought, the job cost, overhead and the target-margin price', () => {
  const paint = M.lineTotal({ qty: 3, unitPriceCents: 4250 });
  const fraction = M.lineTotal({ qty: 2.3, unitPriceCents: 4250 });
  const lab = M.laborCost({ workers: 2, hours: 6, rateCents: 3200 });
  assertEquals([paint.cents, fraction.cents, lab.cents], [12750, 9775, 38400]);
  const costs = [{ id: 'paint', cents: paint.cents }, { id: 'mat', cents: 3800 }, { id: 'lab', cents: lab.cents }];
  const r = M.quoteJob({ costs, overhead: { mode: 'pct', pct: 12 }, priceOn: 'cost_plus_overhead', method: 'margin', pct: 25 });
  assert(r.ok);
  assertEquals(r.directCents, 54950);
  assertEquals(r.overheadCents, 6594);
  assertEquals(r.baseCents, 61544);
  assertEquals(r.priceCents, 82059);
  assertEquals(r.grossProfitCents, 27109);
  assertEquals(pct1(r.grossMarginPct), '33.0');
  assertEquals(r.afterOverheadCents, 20515);
  assertEquals(pct1(r.afterOverheadPct), '25.0');
  assertEquals(M.pricePerUnit(r.priceCents, 314), 261);
  // Mistake 4: the same 25% used as a markup on the same base.
  const mk = M.quoteJob({ costs, overhead: { mode: 'pct', pct: 12 }, priceOn: 'cost_plus_overhead', method: 'markup', pct: 25 });
  assertEquals(mk.priceCents, 76930);
  assertEquals(pct1(mk.afterOverheadPct), '20.0');
  onPages(PAINT_PAGES, [
    usd(4250), usd(12750), usd(9775), usd(3800), usd(38400), usd(54950), usd(6594), usd(61544), usd(82059),
    `${usd(27109)} · 33.0%`, `${usd(20515)} · 25.0%`, usd(261), usd(76930), '12%', '25%', '20%',
  ]);
});

Deno.test('paint guide: the calculator example button uses the same inputs as the guide', () => {
  const js = read('tools/assets/painting-estimate.js');
  for (const s of ["['12', '8', '2']", "['11', '8', '2']", "['3', '7', '2']", "['3', '4', '1']", "$('cov').value = '300'", "$('waste').value = '10'", "$('ppg').value = '42.50'", "$('mat').value = '38'", "$('crew').value = '2'", "$('hours').value = '6'", "$('rate').value = '32'", "$('ohVal').value = '12'", "value=margin", "$('pct').value = '25'"]) {
    assert(js.includes(s), `example is missing ${s}`);
  }
});

// ── How to price labor: a siding repair ──────────────────────────────────────
const LABOR_PAGES = ['guides/how-to-price-labor.html', 'es/guias/como-cobrar-mano-de-obra.html'];
const SIDING = [{ workers: 1, hours: 9, rateCents: 4200 }, { workers: 1, hours: 9, rateCents: 2400 }];
const siding = (labCents: number) => M.quoteJob({
  costs: [{ id: 'lab', cents: labCents }, { id: 'mat', cents: 31000 }, { id: 'trav', cents: 3600 }, { id: 'disp', cents: 5500 }],
  contingencyPct: 10, overhead: { mode: 'pct', pct: 15 }, priceOn: 'cost_plus_overhead', method: 'markup', pct: 30,
});

Deno.test('labor guide: crew lines, direct cost, contingency, overhead, price and what it leaves', () => {
  const crew = M.crewLabor(SIDING);
  assertEquals([crew.lines[0].cents, crew.lines[1].cents, crew.cents, crew.crewHours], [37800, 21600, 59400, 18]);
  const r = siding(crew.cents);
  assert(r.ok);
  assertEquals(r.directCents, 99500);
  assertEquals(r.contingencyCents, 9950);
  assertEquals(r.jobCostCents, 109450);
  assertEquals(r.overheadCents, 14925);
  assertEquals(r.baseCents, 124375);
  assertEquals(r.priceCents, 161688);
  assertEquals(r.priceCents - r.baseCents, 37313); // the markup line
  assertEquals(r.grossProfitCents, 52238);
  assertEquals(pct1(r.grossMarginPct), '32.3');
  assertEquals(r.afterOverheadCents, 37313);
  assertEquals(pct1(r.afterOverheadPct), '23.1');
  assertEquals(r.grossProfitIfUnusedCents, 62188);
  assertEquals(M.pricePerUnit(r.priceCents, crew.crewHours), 8983);
  onPages(LABOR_PAGES, [
    usd(37800), usd(21600), usd(59400), usd(31000), usd(3600), usd(5500), usd(99500), usd(9950), usd(109450), usd(14925),
    usd(124375), usd(161688), usd(37313), `${usd(52238)} · 32.3%`, `${usd(37313)} · 23.1%`, usd(62188), usd(8983), '18',
  ]);
});

Deno.test('labor guide: the two forgotten crew hours and the $100 discount', () => {
  const extra = 1 * 4200 + 1 * 2400; // one more hour each for the lead and the helper
  assertEquals(extra, 6600);
  const base = siding(59400);
  const more = siding(59400 + extra);
  assertEquals(more.priceCents, 172413);
  assertEquals(more.priceCents - base.priceCents, 10725);
  // A $100 discount comes straight off "left after overhead": more than a quarter of it.
  assertEquals(base.afterOverheadCents - 10000, 27313);
  assert(10000 / base.afterOverheadCents > 0.25);
  onPages(LABOR_PAGES, [usd(6600), usd(172413), usd(10725), usd(27313), '$100']);
});

Deno.test('labor guide: the calculator example button uses the same inputs as the guide', () => {
  const js = read('tools/assets/labor-quote.js');
  for (const s of ["['1', '9', '42']", "['1', '9', '24']", "$('mat').value = '310'", "$('trav').value = '36'", "$('disp').value = '55'", "$('cont').value = '10'", "$('ohVal').value = '15'", "value=markup", "$('pct').value = '30'"]) {
    assert(js.includes(s), `example is missing ${s}`);
  }
});
