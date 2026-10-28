/* TalkEstimate free tools: the arithmetic every calculator on this site shares.
 * ---------------------------------------------------------------------------
 * Pure functions, no DOM, no network. Runs in the browser (ES module) and in
 * Deno (scripts/tests/estimate-math.test.ts). Nothing typed into a tool ever
 * leaves the visitor's browser.
 *
 * SAME RULES AS THE TALKESTIMATE APP (fieldproof lib/pricing-engine.ts + lib/amount-input.ts):
 *   - Money is whole cents internally. A typed amount becomes cents once (half-up).
 *   - Markup is applied to cost:      price = cost + cost x markup%   (half-up to the cent)
 *   - Margin is profit over price:    margin% = (price - cost) / price
 *   - A typed amount that can't be read with certainty ("1.250", "1 250", "-5") is
 *     INVALID, never guessed. parseAmount is a line-for-line port of parseAmountInput.
 *   - A fixed selling price the contractor typed is never changed by the math.
 *
 * ONE RULE THE APP DOESN'T NEED: a price built from a TARGET MARGIN is rounded UP to the
 * next cent, so the margin you get is never below the margin you asked for.
 *
 * Words matter here:
 *   - GROSS profit / GROSS margin = price minus the job's direct costs (materials, labor,
 *     other job costs). It is NOT net profit: overhead, taxes and owner pay come out later.
 *   - "Left after overhead" = gross profit minus the overhead share you entered. Still not
 *     net profit (income tax and anything you didn't enter are not in it).
 * ------------------------------------------------------------------------- */

const NON_ZERO_LEAD_GROUP = '[1-9]\\d{0,2}';

/** Typed text -> a non-negative number, or null when it can't be read with certainty.
 *  Accepted: 300 · 300.50 · .5 · $300 · 20% · 1,250 · 1,250.50 · 1.250,50 · 300,50 · 1.250.000
 *  Invalid:  1.250 (thousands or 1.25?) · 1 250 · -5 · 1e3 · 12,34,56 · abc · empty */
export function parseAmount(raw) {
  const s = String(raw ?? '').trim().replace(/^\$\s*/, '').replace(/\s*%$/, '').trim();
  if (s === '' || !/^[\d.,]+$/.test(s)) return null;
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  let canon;

  if (dots === 0 && commas === 0) {
    canon = s;
  } else if (commas === 0) {
    if (dots === 1) {
      const [int, frac] = s.split('.');
      if (frac.length === 3 && new RegExp(`^${NON_ZERO_LEAD_GROUP}$`).test(int)) return null;
      canon = s;
    } else if (new RegExp(`^${NON_ZERO_LEAD_GROUP}(\\.\\d{3})+$`).test(s)) {
      canon = s.replace(/\./g, '');
    } else {
      return null;
    }
  } else if (dots === 0) {
    if (new RegExp(`^${NON_ZERO_LEAD_GROUP}(,\\d{3})+$`).test(s)) {
      canon = s.replace(/,/g, '');
    } else if (commas === 1 && /^\d*,\d+$/.test(s)) {
      canon = s.replace(',', '.');
    } else {
      return null;
    }
  } else if (s.lastIndexOf('.') > s.lastIndexOf(',')) {
    if (!new RegExp(`^${NON_ZERO_LEAD_GROUP}(,\\d{3})+\\.\\d+$`).test(s)) return null;
    canon = s.replace(/,/g, '');
  } else {
    if (!new RegExp(`^${NON_ZERO_LEAD_GROUP}(\\.\\d{3})+,\\d+$`).test(s)) return null;
    canon = s.replace(/\./g, '').replace(',', '.');
  }

  const n = Number(canon);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Why typed text can't be used (null = fine, or nothing typed yet).
 *  { kind: 'unclear_thousands', thousands, decimal } for "1.250"; { kind: 'invalid' } otherwise. */
export function amountProblem(raw) {
  if (parseAmount(raw) !== null) return null;
  const s = String(raw ?? '').trim().replace(/^\$\s*/, '').replace(/\s*%$/, '').trim();
  if (s === '') return null;
  const m = new RegExp(`^(${NON_ZERO_LEAD_GROUP})\\.(\\d{3})$`).exec(s);
  if (m) return { kind: 'unclear_thousands', thousands: Number(m[1] + m[2]), decimal: Number(s) };
  return { kind: 'invalid' };
}

/** Dollars -> whole cents, half-up (same as the app's toCents). */
export function toCents(dollars) {
  return Math.round(dollars * 100);
}

/** Largest amount any tool accepts: $1,000,000,000 (keeps every cents product a safe integer). */
export const MAX_CENTS = 100000000000;

/** Percent with 1 decimal for display; null stays null. */
export function pct1(p) {
  return p === null || !Number.isFinite(p) ? null : Math.round(p * 10) / 10;
}

// ---------------------------------------------------------------------------
// Markup and margin
// ---------------------------------------------------------------------------

/** Selling price from a cost and a markup %. Half-up to the cent (as the app does). */
export function priceFromMarkup(costCents, markupPct) {
  assertCents(costCents);
  if (!(markupPct >= 0) || !Number.isFinite(markupPct)) return { ok: false, reason: 'markup_invalid' };
  const priceCents = costCents + Math.round((costCents * markupPct) / 100);
  return { ok: true, priceCents };
}

/** Selling price that reaches a target gross margin %: price = cost / (1 - margin).
 *  Rounded UP to the next cent so the margin reached is never below the target. */
export function priceFromMargin(costCents, marginPct) {
  assertCents(costCents);
  if (!Number.isFinite(marginPct) || marginPct < 0) return { ok: false, reason: 'margin_invalid' };
  if (marginPct >= 100) return { ok: false, reason: 'margin_100' };
  // Integer math in basis points of the margin (0.01%) avoids float drift: cents * 10000 / (10000 - bp).
  const bp = Math.round(marginPct * 100);
  const num = costCents * 10000;
  const den = 10000 - bp;
  const priceCents = Math.ceil(num / den - 1e-9);
  return { ok: true, priceCents };
}

/** Gross margin % of a price over a cost (null when the price is 0). */
export function marginOf(priceCents, costCents) {
  if (priceCents <= 0) return null;
  return ((priceCents - costCents) / priceCents) * 100;
}

/** Markup % of a price over a cost (null when the cost is 0). */
export function markupOf(priceCents, costCents) {
  if (costCents <= 0) return null;
  return ((priceCents - costCents) / costCents) * 100;
}

/** 25% markup is a 20% margin. Exact, unrounded. */
export function markupToMargin(markupPct) {
  if (!(markupPct >= 0)) return null;
  return (markupPct / (100 + markupPct)) * 100;
}

/** 20% margin needs a 25% markup. null at 100% or more (no markup reaches it). */
export function marginToMarkup(marginPct) {
  if (!(marginPct >= 0) || marginPct >= 100) return null;
  return (marginPct / (100 - marginPct)) * 100;
}

// ---------------------------------------------------------------------------
// A whole job: direct costs, optional overhead, markup or margin
// ---------------------------------------------------------------------------

/**
 * @param {object} job  all money in cents, percents as numbers
 *   materialsCents, laborCents, otherCents   direct job costs
 *   overhead: { mode: 'none' | 'flat' | 'pct', cents?, pct? }   pct = % of direct cost
 *   priceOn:  'direct' | 'direct_plus_overhead'   what the markup/margin is applied to
 *   method:   'markup' | 'margin';  pct: the markup % or target margin %
 */
export function priceJob(job) {
  const materials = job.materialsCents || 0;
  const labor = job.laborCents || 0;
  const other = job.otherCents || 0;
  [materials, labor, other].forEach(assertCents);
  const direct = materials + labor + other;

  let overhead = 0;
  const oh = job.overhead || { mode: 'none' };
  if (oh.mode === 'flat') { assertCents(oh.cents || 0); overhead = oh.cents || 0; }
  else if (oh.mode === 'pct') {
    if (!(oh.pct >= 0) || !Number.isFinite(oh.pct)) return { ok: false, reason: 'overhead_invalid' };
    overhead = Math.round((direct * oh.pct) / 100);
  }

  const base = job.priceOn === 'direct_plus_overhead' ? direct + overhead : direct;
  const priced = job.method === 'margin' ? priceFromMargin(base, job.pct) : priceFromMarkup(base, job.pct);
  if (!priced.ok) return priced;
  const price = priced.priceCents;

  const grossProfit = price - direct;
  const afterOverhead = grossProfit - overhead;
  const warnings = [];
  if (direct === 0 && overhead === 0) warnings.push('no_cost');
  if (overhead > 0 && afterOverhead < 0) warnings.push('below_overhead');
  if (job.method === 'margin' && job.pct >= 90) warnings.push('margin_very_high');
  if (job.method === 'markup' && job.pct > 300) warnings.push('markup_very_high');
  if (overhead > 0 && job.priceOn !== 'direct_plus_overhead') warnings.push('overhead_not_in_base');

  return {
    ok: true,
    directCents: direct,
    materialsCents: materials,
    laborCents: labor,
    otherCents: other,
    overheadCents: overhead,
    baseCents: base,
    priceCents: price,
    grossProfitCents: grossProfit,
    grossMarginPct: marginOf(price, direct),
    markupOnDirectPct: markupOf(price, direct),
    afterOverheadCents: afterOverhead,
    afterOverheadPct: price > 0 ? (afterOverhead / price) * 100 : null,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Labor
// ---------------------------------------------------------------------------

/** workers x hours x hourly cost, in cents. Hours keep 4 decimals like the app. */
export function laborCost({ workers, hours, rateCents }) {
  if (!Number.isInteger(workers) || workers < 0) return { ok: false, reason: 'workers_invalid' };
  if (!(hours >= 0) || !Number.isFinite(hours)) return { ok: false, reason: 'hours_invalid' };
  assertCents(rateCents);
  const crewHours = Math.round(workers * hours * 10000) / 10000;
  return { ok: true, crewHours, cents: Math.round(crewHours * rateCents) };
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/**
 * Paintable area and gallons. Lengths in feet, areas in square feet.
 *   walls: [{ widthFt, heightFt }]  or  areaSqFt (measured total)
 *   openings: [{ widthFt, heightFt, count }]  doors/windows you won't paint, subtracted from the area
 *   coats, coverageSqFtPerGallon, wastePct
 * Gallons to buy are rounded UP to whole gallons; the exact need is returned too.
 */
export function paintQuantities(p) {
  const coats = p.coats;
  if (!Number.isInteger(coats) || coats < 1 || coats > 10) return { ok: false, reason: 'coats_invalid' };
  if (!(p.coverageSqFtPerGallon > 0)) return { ok: false, reason: 'coverage_invalid' };
  if (!(p.wastePct >= 0) || p.wastePct > 100) return { ok: false, reason: 'waste_invalid' };

  let gross;
  if (Array.isArray(p.walls) && p.walls.length) {
    gross = 0;
    for (const w of p.walls) {
      if (!(w.widthFt >= 0) || !(w.heightFt >= 0)) return { ok: false, reason: 'wall_invalid' };
      gross += w.widthFt * w.heightFt;
    }
  } else if (p.areaSqFt >= 0) {
    gross = p.areaSqFt;
  } else {
    return { ok: false, reason: 'area_missing' };
  }

  let openings = 0;
  for (const o of p.openings || []) {
    const n = o.count ?? 1;
    if (!(o.widthFt >= 0) || !(o.heightFt >= 0) || !Number.isInteger(n) || n < 0) return { ok: false, reason: 'opening_invalid' };
    openings += o.widthFt * o.heightFt * n;
  }
  if (openings > gross) return { ok: false, reason: 'openings_exceed_area' };

  const area = round2(gross - openings);
  const coatArea = round2(area * coats);
  const gallonsExact = round2((coatArea / p.coverageSqFtPerGallon) * (1 + p.wastePct / 100));
  const gallonsToBuy = Math.ceil(gallonsExact - 1e-9);
  return { ok: true, grossSqFt: round2(gross), openingsSqFt: round2(openings), paintableSqFt: area, coatSqFt: coatArea, gallonsExact, gallonsToBuy };
}

// ---------------------------------------------------------------------------
// Estimate builder lines: a typed fixed price stays exactly what was typed
// ---------------------------------------------------------------------------

/** line: { qty, unitPriceCents } or { fixedPriceCents } (a flat job price; qty is ignored). */
export function lineTotal(line) {
  if (line.fixedPriceCents !== undefined && line.fixedPriceCents !== null) {
    assertCents(line.fixedPriceCents);
    return { ok: true, cents: line.fixedPriceCents };
  }
  if (!(line.qty >= 0) || !Number.isFinite(line.qty)) return { ok: false, reason: 'qty_invalid' };
  assertCents(line.unitPriceCents);
  return { ok: true, cents: Math.round(line.qty * line.unitPriceCents) };
}

/** Sum of lines plus optional tax %, half-up once on the tax. */
export function estimateTotals(lines, taxPct = 0) {
  if (!(taxPct >= 0) || taxPct > 100) return { ok: false, reason: 'tax_invalid' };
  let subtotal = 0;
  for (const l of lines) {
    const t = lineTotal(l);
    if (!t.ok) return t;
    subtotal += t.cents;
  }
  const tax = Math.round((subtotal * taxPct) / 100);
  return { ok: true, subtotalCents: subtotal, taxCents: tax, totalCents: subtotal + tax };
}

// ---------------------------------------------------------------------------

/** Cents -> "$1,234.56" (en-US) or "$1,234.56" with the same grouping for es (US contractors). */
export function formatMoney(cents, lang = 'en') {
  const v = (cents || 0) / 100;
  return new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD' }).format(v);
}

function round2(n) { return Math.round(n * 100) / 100; }

function assertCents(c) {
  if (!Number.isInteger(c) || c < 0 || c > MAX_CENTS) throw new RangeError('cents must be an integer from 0 to MAX_CENTS');
}
