// tools/assets/estimate-math.js: the arithmetic behind every free tool on the site.
// Run with:  npx --yes deno test --allow-read scripts/tests/
// The "app parity" tests also read the TalkEstimate app's own files when C:\dev\fieldproof (or FIELDPROOF_DIR)
// is on this machine, and prove the site and the app give the same answers. They skip cleanly elsewhere.

import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1';
import * as math from '../../tools/assets/estimate-math.js';
// The module is plain JS (it ships to browsers as-is); its result unions are checked by these tests, not by tsc.
// deno-lint-ignore no-explicit-any
const M: any = math;
const {
  amountProblem, estimateTotals, laborCost, lineTotal, marginOf, marginToMarkup, markupOf, markupToMargin,
  MAX_CENTS, paintQuantities, parseAmount, pct1, priceFromMargin, priceFromMarkup, priceJob, toCents,
} = M;

// ── The two examples in Carlos's order, and the core definitions ─────────────
Deno.test('$100 cost + 20% markup = $120', () => {
  assertEquals(priceFromMarkup(10000, 20), { ok: true, priceCents: 12000 });
});

Deno.test('$100 cost at a 20% target gross margin = $125', () => {
  assertEquals(priceFromMargin(10000, 20), { ok: true, priceCents: 12500 });
});

Deno.test('markup and margin convert both ways (25% markup = 20% margin)', () => {
  assertEquals(markupToMargin(25), 20);
  assertEquals(marginToMarkup(20), 25);
  assertEquals(pct1(markupToMargin(20)), 16.7);
  assertEquals(pct1(marginToMarkup(50)), 100);
  assertEquals(marginToMarkup(100), null);
  assertEquals(markupToMargin(0), 0);
});

Deno.test('margin and markup of a finished price', () => {
  assertEquals(marginOf(12500, 10000), 20);
  assertEquals(markupOf(12500, 10000), 25);
  assertEquals(marginOf(0, 0), null);
  assertEquals(markupOf(5000, 0), null);
});

// ── Impossible and adversarial inputs never produce a number ─────────────────
Deno.test('a 100% (or higher) margin is impossible, not Infinity', () => {
  assertEquals(priceFromMargin(10000, 100), { ok: false, reason: 'margin_100' });
  assertEquals(priceFromMargin(10000, 150), { ok: false, reason: 'margin_100' });
  assertEquals(priceFromMargin(10000, -1), { ok: false, reason: 'margin_invalid' });
  assertEquals(priceFromMargin(10000, NaN), { ok: false, reason: 'margin_invalid' });
  assertEquals(priceFromMarkup(10000, -5), { ok: false, reason: 'markup_invalid' });
  assertEquals(priceFromMarkup(10000, Infinity), { ok: false, reason: 'markup_invalid' });
});

Deno.test('99.99% margin stays a finite, exact integer price', () => {
  const r = priceFromMargin(10000, 99.99);
  assert(r.ok);
  assertEquals(r.priceCents, 100000000); // $100 / 0.0001 = $1,000,000
});

Deno.test('amounts must be whole, non-negative cents within the cap', () => {
  assertThrows(() => priceFromMarkup(10.5, 10));
  assertThrows(() => priceFromMarkup(-1, 10));
  assertThrows(() => priceFromMargin(MAX_CENTS + 1, 10));
  assert(priceFromMargin(MAX_CENTS, 99.99).ok);
  assert(Number.isSafeInteger((priceFromMargin(MAX_CENTS, 99.99) as { priceCents: number }).priceCents));
});

Deno.test('target-margin prices round UP: the margin reached is never below the target', () => {
  for (let cost = 1; cost <= 5000; cost += 7) {
    for (const m of [1, 5, 12.5, 15, 20, 22.22, 25, 30, 33, 33.33, 35, 40, 45, 50, 60, 66.67, 75, 90]) {
      const r = priceFromMargin(cost, m);
      assert(r.ok);
      const reached = marginOf(r.priceCents, cost)!;
      assert(reached >= m - 1e-9, `cost ${cost} margin ${m}: reached ${reached}`);
      // ...and by no more than one cent: one cent less would fall below the target.
      const oneLess = marginOf(r.priceCents - 1, cost)!;
      assert(oneLess < m + 1e-9, `cost ${cost} margin ${m}: not the smallest price`);
    }
  }
});

Deno.test('markup prices round half-up once, like the app', () => {
  assertEquals(priceFromMarkup(333, 10).priceCents, 366); // 33.3 cents -> 33
  assertEquals(priceFromMarkup(335, 10).priceCents, 369); // 33.5 cents -> 34
  assertEquals(priceFromMarkup(0, 50).priceCents, 0);
});

// ── Typed amounts: never guessed ─────────────────────────────────────────────
Deno.test('parseAmount reads what is certain and refuses the rest', () => {
  const ok: [string, number][] = [
    ['300', 300], ['300.50', 300.5], ['.5', 0.5], ['$300', 300], ['20%', 20], ['1,250', 1250],
    ['1,250.50', 1250.5], ['1.250,50', 1250.5], ['300,50', 300.5], ['1.250.000', 1250000], [' 42 ', 42], ['0', 0],
  ];
  for (const [s, n] of ok) assertEquals(parseAmount(s), n, s);
  for (const s of ['1.250', '1 250', '-5', '1e3', '12,34,56', 'abc', '', '   ', '$', '%', '1..2', 'Infinity', 'NaN']) {
    assertEquals(parseAmount(s), null, s);
  }
});

Deno.test('amountProblem explains "1.250" with both readings', () => {
  assertEquals(amountProblem('1.250'), { kind: 'unclear_thousands', thousands: 1250, decimal: 1.25 });
  assertEquals(amountProblem('abc'), { kind: 'invalid' });
  assertEquals(amountProblem(''), null);
  assertEquals(amountProblem('125'), null);
});

Deno.test('toCents is half-up on the cent, exactly like the app', () => {
  assertEquals(toCents(19.99), 1999);
  assertEquals(toCents(0.125), 13);
  assertEquals(toCents(1.005), 100); // floating point: 1.005 is 1.00499999...; the app gives 100 too
});

// ── A whole job ──────────────────────────────────────────────────────────────
Deno.test('job priced on direct costs: gross profit and gross margin', () => {
  const r = priceJob({ materialsCents: 40000, laborCents: 50000, otherCents: 10000, method: 'markup', pct: 25, overhead: { mode: 'none' }, priceOn: 'direct' });
  assert(r.ok);
  assertEquals(r.directCents, 100000);
  assertEquals(r.priceCents, 125000);
  assertEquals(r.grossProfitCents, 25000);
  assertEquals(r.grossMarginPct, 20);
  assertEquals(r.warnings, []);
});

Deno.test('overhead is shown separately: gross profit is NOT what is left after overhead', () => {
  const r = priceJob({ materialsCents: 40000, laborCents: 60000, method: 'margin', pct: 30, overhead: { mode: 'pct', pct: 10 }, priceOn: 'direct_plus_overhead' });
  assert(r.ok);
  assertEquals(r.overheadCents, 10000);
  assertEquals(r.baseCents, 110000);
  assertEquals(r.priceCents, 157143); // 1100 / 0.70 = 1571.428... -> up to 1571.43
  assertEquals(r.grossProfitCents, 57143);
  assertEquals(r.afterOverheadCents, 47143);
  assert(r.grossMarginPct! > r.afterOverheadPct!);
});

Deno.test('warnings: price below overhead, overhead not in the base, empty job, extreme percents', () => {
  const below = priceJob({ materialsCents: 100000, method: 'markup', pct: 5, overhead: { mode: 'flat', cents: 20000 }, priceOn: 'direct' });
  assert(below.ok);
  assertEquals(below.warnings, ['below_overhead', 'overhead_not_in_base']);
  const empty = priceJob({ method: 'markup', pct: 20, overhead: { mode: 'none' }, priceOn: 'direct' });
  assert(empty.ok);
  assertEquals(empty.warnings, ['no_cost']);
  const hi = priceJob({ materialsCents: 100, method: 'margin', pct: 95, overhead: { mode: 'none' }, priceOn: 'direct' });
  assert(hi.ok);
  assertEquals(hi.warnings, ['margin_very_high']);
  const bad = priceJob({ materialsCents: 100, method: 'margin', pct: 100, overhead: { mode: 'none' }, priceOn: 'direct' });
  assertEquals(bad, { ok: false, reason: 'margin_100' });
});

// ── Labor ────────────────────────────────────────────────────────────────────
Deno.test('labor = workers x hours x hourly cost', () => {
  assertEquals(laborCost({ workers: 2, hours: 7.5, rateCents: 3500 }), { ok: true, crewHours: 15, cents: 52500 });
  assertEquals(laborCost({ workers: 1.5, hours: 2, rateCents: 100 }), { ok: false, reason: 'workers_invalid' });
  assertEquals(laborCost({ workers: 2, hours: -1, rateCents: 100 }), { ok: false, reason: 'hours_invalid' });
  assertEquals(laborCost({ workers: 0, hours: 8, rateCents: 4000 }).cents, 0);
});

// ── Painting ─────────────────────────────────────────────────────────────────
Deno.test('painting: 12x10 room, 8 ft walls, 1 door + 2 windows, 2 coats, 350 sq ft/gal, 10% waste', () => {
  const r = paintQuantities({
    walls: [{ widthFt: 12, heightFt: 8 }, { widthFt: 12, heightFt: 8 }, { widthFt: 10, heightFt: 8 }, { widthFt: 10, heightFt: 8 }],
    openings: [{ widthFt: 3, heightFt: 7, count: 1 }, { widthFt: 3, heightFt: 4, count: 2 }],
    coats: 2, coverageSqFtPerGallon: 350, wastePct: 10,
  });
  assert(r.ok);
  assertEquals(r.grossSqFt, 352);
  assertEquals(r.openingsSqFt, 45);
  assertEquals(r.paintableSqFt, 307);
  assertEquals(r.coatSqFt, 614);
  assertEquals(r.gallonsExact, 1.93); // 614 / 350 x 1.10 = 1.9297
  assertEquals(r.gallonsToBuy, 2);
});

Deno.test('painting: measured area path and refusals', () => {
  const r = paintQuantities({ areaSqFt: 700, coats: 1, coverageSqFtPerGallon: 350, wastePct: 0 });
  assert(r.ok);
  assertEquals(r.gallonsExact, 2);
  assertEquals(r.gallonsToBuy, 2); // exactly 2, not rounded up to 3
  assertEquals(paintQuantities({ areaSqFt: 100, coats: 0, coverageSqFtPerGallon: 350, wastePct: 0 }), { ok: false, reason: 'coats_invalid' });
  assertEquals(paintQuantities({ areaSqFt: 100, coats: 1, coverageSqFtPerGallon: 0, wastePct: 0 }), { ok: false, reason: 'coverage_invalid' });
  assertEquals(paintQuantities({ areaSqFt: 10, openings: [{ widthFt: 3, heightFt: 7 }], coats: 1, coverageSqFtPerGallon: 350, wastePct: 0 }), { ok: false, reason: 'openings_exceed_area' });
  assertEquals(paintQuantities({ coats: 1, coverageSqFtPerGallon: 350, wastePct: 0 }), { ok: false, reason: 'area_missing' });
});

// ── Estimate builder: the $300 invariant ─────────────────────────────────────
Deno.test('a typed $300 fixed price stays $300, whatever the quantity says', () => {
  assertEquals(lineTotal({ fixedPriceCents: 30000, qty: 7 }), { ok: true, cents: 30000 });
  assertEquals(lineTotal({ qty: 3, unitPriceCents: 4550 }), { ok: true, cents: 13650 });
  assertEquals(lineTotal({ qty: -1, unitPriceCents: 100 }), { ok: false, reason: 'qty_invalid' });
  const t = estimateTotals([{ fixedPriceCents: 30000 }, { qty: 2.5, unitPriceCents: 4000 }], 8.7);
  assertEquals(t, { ok: true, subtotalCents: 40000, taxCents: 3480, totalCents: 43480 });
  assertEquals(estimateTotals([{ fixedPriceCents: 30000 }]).totalCents, 30000);
});

// ── App parity: same inputs through the app's own code ───────────────────────
const APP = Deno.env.get('FIELDPROOF_DIR') ?? 'C:/dev/fieldproof';
let appAvailable = false;
try { Deno.statSync(`${APP}/lib/amount-input.ts`); appAvailable = true; } catch { /* not on this machine */ }

Deno.test({
  name: 'app parity: parseAmount === the app parseAmountInput on 4,000+ generated strings',
  ignore: !appAvailable,
  async fn() {
    const app = await import(`file:///${APP.replace(/\\/g, '/')}/lib/amount-input.ts`);
    const parts = ['', '0', '1', '12', '125', '1250', '.', ',', '$', '%', ' ', '-', '5', '00', '999', 'e'];
    let n = 0;
    for (const a of parts) for (const b of parts) for (const c of parts) {
      const s = a + b + c;
      assertEquals(parseAmount(s), app.parseAmountInput(s), JSON.stringify(s));
      n++;
    }
    for (const s of ['1.250', '1,250.50', '1.250,50', '1.250.000', '300,50', '12,34,56', '$ 300', '20 %']) {
      assertEquals(parseAmount(s), app.parseAmountInput(s), s);
      assertEquals(amountProblem(s), app.amountProblem(s), s);
    }
    assert(n >= 4000);
  },
});

Deno.test({
  name: 'app parity: markup price === the app line math (calculateLine) for materials-only lines',
  ignore: !appAvailable,
  async fn() {
    const app = await import(`file:///${APP.replace(/\\/g, '/')}/lib/pricing-engine.ts`);
    for (let cost = 0; cost <= 3000; cost += 13) {
      for (const m of [0, 5, 10, 12.5, 15, 20, 25, 33, 35, 50, 100]) {
        const line = app.calculateLine({ quantity: 1, material_cost_per_unit: cost / 100, labor_hours_per_unit: 0, hourly_rate: 0, markup_pct: m });
        const appCents = Math.round(line.line_total * 100);
        assertEquals(priceFromMarkup(cost, m).priceCents, appCents, `cost ${cost} markup ${m}`);
        assertEquals(toCents(cost / 100), app.toCents(cost / 100));
      }
    }
  },
});
