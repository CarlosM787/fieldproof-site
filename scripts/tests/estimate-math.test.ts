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

Deno.test('painting: a wall line can carry a count ("2 walls of 12 x 8"), same result as listing them', () => {
  const counted = paintQuantities({ walls: [{ widthFt: 12, heightFt: 8, count: 2 }, { widthFt: 10, heightFt: 8, count: 2 }], openings: [{ widthFt: 3, heightFt: 7, count: 1 }, { widthFt: 3, heightFt: 4, count: 2 }], coats: 2, coverageSqFtPerGallon: 350, wastePct: 10 });
  const listed = paintQuantities({ walls: [{ widthFt: 12, heightFt: 8 }, { widthFt: 12, heightFt: 8 }, { widthFt: 10, heightFt: 8 }, { widthFt: 10, heightFt: 8 }], openings: [{ widthFt: 3, heightFt: 7, count: 1 }, { widthFt: 3, heightFt: 4, count: 2 }], coats: 2, coverageSqFtPerGallon: 350, wastePct: 10 });
  assertEquals(counted, listed);
  assertEquals(paintQuantities({ walls: [{ widthFt: 12, heightFt: 8, count: 1.5 }], coats: 1, coverageSqFtPerGallon: 350, wastePct: 0 }), { ok: false, reason: 'wall_invalid' });
  assertEquals(paintQuantities({ walls: [{ widthFt: 12, heightFt: 8, count: 0 }], coats: 1, coverageSqFtPerGallon: 350, wastePct: 0 }).grossSqFt, 0);
});

Deno.test('painting: gallons to buy never fall below the gallons needed, and only round up by less than one', () => {
  for (let area = 1; area <= 3000; area += 37) {
    for (const cov of [150, 275, 300, 333, 400]) {
      for (const waste of [0, 5, 10, 12.5]) {
        const r = paintQuantities({ areaSqFt: area, coats: 2, coverageSqFtPerGallon: cov, wastePct: waste });
        assert(r.ok);
        assert(r.gallonsToBuy >= r.gallonsExact - 1e-9 && r.gallonsToBuy - r.gallonsExact < 1, `${area}/${cov}/${waste}`);
        assert(Number.isInteger(r.gallonsToBuy));
      }
    }
  }
});

// ── Crew lines and a quote with contingency ──────────────────────────────────
Deno.test('crew lines: each line rounded once, then added; a bad line refuses the whole crew', () => {
  assertEquals(M.crewLabor([{ workers: 1, hours: 9, rateCents: 4200 }, { workers: 1, hours: 9, rateCents: 2400 }]),
    { ok: true, crewHours: 18, cents: 59400, lines: [{ ok: true, crewHours: 9, cents: 37800 }, { ok: true, crewHours: 9, cents: 21600 }] });
  assertEquals(M.crewLabor([{ workers: 3, hours: 2.25, rateCents: 1999 }]).cents, 13493); // 6.75 h x $19.99 = 134.9325
  assertEquals(M.crewLabor([]), { ok: true, crewHours: 0, cents: 0, lines: [] });
  assertEquals(M.crewLabor([{ workers: 1, hours: 8, rateCents: 3000 }, { workers: 2.5, hours: 8, rateCents: 3000 }]), { ok: false, reason: 'workers_invalid' });
});

Deno.test('contingency: its own line, a % of the direct costs, counted as spent in the gross profit', () => {
  const r = M.quoteJob({ costs: [{ id: 'lab', cents: 60000 }, { id: 'mat', cents: 40000 }], contingencyPct: 10, method: 'markup', pct: 25, overhead: { mode: 'none' }, priceOn: 'cost' });
  assert(r.ok);
  assertEquals(r.directCents, 100000);
  assertEquals(r.contingencyCents, 10000);
  assertEquals(r.jobCostCents, 110000);
  assertEquals(r.priceCents, 137500); // (1000 + 100) x 1.25
  assertEquals(r.grossProfitCents, 27500); // price - (direct + contingency)
  assertEquals(r.grossMarginPct, 20);
  assertEquals(r.grossProfitIfUnusedCents, 37500); // the contingency comes back if it isn't spent
  // contingency is figured on the direct costs, half-up once
  assertEquals(M.quoteJob({ costs: [{ id: 'x', cents: 333 }], contingencyPct: 10, method: 'markup', pct: 0 }).contingencyCents, 33);
  assertEquals(M.quoteJob({ costs: [{ id: 'x', cents: 335 }], contingencyPct: 10, method: 'markup', pct: 0 }).contingencyCents, 34);
});

Deno.test('contingency: refusals and warnings', () => {
  const base = { costs: [{ id: 'x', cents: 10000 }], method: 'markup', pct: 20 };
  assertEquals(M.quoteJob({ ...base, contingencyPct: -1 }), { ok: false, reason: 'contingency_invalid' });
  assertEquals(M.quoteJob({ ...base, contingencyPct: 101 }), { ok: false, reason: 'contingency_invalid' });
  assertEquals(M.quoteJob({ ...base, contingencyPct: NaN }), { ok: false, reason: 'contingency_invalid' });
  assertEquals(M.quoteJob({ ...base, contingencyPct: 60 }).warnings, ['contingency_very_high']);
  assertEquals(M.quoteJob({ ...base, contingencyPct: 50 }).warnings, []);
  assertEquals(M.quoteJob({ costs: [], method: 'markup', pct: 20 }).warnings, ['no_cost']);
  assertEquals(M.quoteJob({ ...base, method: 'margin', pct: 100 }), { ok: false, reason: 'margin_100' });
  const below = M.quoteJob({ ...base, pct: 5, overhead: { mode: 'flat', cents: 2000 }, priceOn: 'cost' });
  assertEquals(below.warnings, ['below_overhead', 'overhead_not_in_base']);
  assertThrows(() => M.quoteJob({ costs: [{ id: 'x', cents: 1.5 }], method: 'markup', pct: 0 }));
  assertEquals(M.quoteJob({ costs: [{ id: 'a', cents: MAX_CENTS }, { id: 'b', cents: 1 }], method: 'markup', pct: 0 }), { ok: false, reason: 'too_big' });
});

Deno.test('quoteJob with no contingency gives exactly what priceJob gives (same costs, overhead, method)', () => {
  for (let mat = 0; mat <= 200000; mat += 13777) {
    for (const lab of [0, 999, 52500]) {
      for (const oh of [{ mode: 'none' }, { mode: 'pct', pct: 12.5 }, { mode: 'flat', cents: 7300 }]) {
        for (const inBase of [false, true]) {
          for (const [method, pct] of [['markup', 0], ['markup', 22.5], ['margin', 30], ['margin', 66.67]] as const) {
            const a = priceJob({ materialsCents: mat, laborCents: lab, otherCents: 450, overhead: oh, priceOn: inBase ? 'direct_plus_overhead' : 'direct', method, pct });
            const b = M.quoteJob({ costs: [{ id: 'm', cents: mat }, { id: 'l', cents: lab }, { id: 'o', cents: 450 }], overhead: oh, priceOn: inBase ? 'cost_plus_overhead' : 'cost', method, pct });
            for (const k of ['directCents', 'overheadCents', 'baseCents', 'priceCents', 'grossProfitCents', 'grossMarginPct', 'afterOverheadCents', 'afterOverheadPct']) {
              assertEquals(b[k], a[k], `${k} mat ${mat} lab ${lab} ${JSON.stringify(oh)} ${inBase} ${method} ${pct}`);
            }
            assertEquals(b.warnings, a.warnings);
          }
        }
      }
    }
  }
});

Deno.test('target-margin quotes with contingency still never land under the margin asked for', () => {
  for (let cost = 1; cost <= 400000; cost += 9973) {
    for (const c of [0, 5, 10, 15]) {
      for (const m of [10, 25, 33.33, 40]) {
        const r = M.quoteJob({ costs: [{ id: 'x', cents: cost }], contingencyPct: c, method: 'margin', pct: m });
        assert(r.ok);
        assert(r.grossMarginPct >= m - 1e-9, `cost ${cost} cont ${c} margin ${m}`);
      }
    }
  }
});

Deno.test('price per unit (per sq ft, per crew hour): half-up to the cent, null with no units', () => {
  assertEquals(M.pricePerUnit(82059, 314), 261);
  assertEquals(M.pricePerUnit(161688, 18), 8983);
  assertEquals(M.pricePerUnit(1000, 0), null);
  assertEquals(M.pricePerUnit(1000, -2), null);
  assertEquals(M.pricePerUnit(250, 100), 3); // 2.5 cents -> 3
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
