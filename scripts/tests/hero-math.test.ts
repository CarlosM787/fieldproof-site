// The hero phone mock ("Step 4 of 7 · Pricing") must add up the way the app does (fieldproof
// lib/pricing-engine.ts): each line shows its price AFTER markup, the first totals row is the sum
// BEFORE markup, markup = that sum × the stated %, and the lines add up to the Total.
// W-1 (2026-11-01): the row was called "Subtotal", so a reader adding the lines got the Total instead.
// Run with:  npx deno test --allow-read scripts/tests/hero-math.test.ts

import { assert, assertEquals } from 'jsr:@std/assert@1';

const read = (p: string) => Deno.readTextFileSync(new URL(`../../${p}`, import.meta.url));
const cents = (s: string) => Math.round(Number(s.replace(/[$,]/g, '')) * 100);

function mock(html: string) {
  const start = html.indexOf('<div class="phone"');
  const block = html.slice(start, html.indexOf('<div class="marg">', start) + 200);
  const lines = [...block.matchAll(/<div class="amt">(\$[\d,.]+)<\/div>/g)].map((m) => cents(m[1]));
  const rows = [...block.matchAll(/<div class="row(?: grand)?"><span>([^<]+)<\/span><span>(\$[\d,.]+)<\/span><\/div>/g)]
    .map((m) => ({ label: m[1], value: cents(m[2]) }));
  const margin = Number(/(\d+(?:\.\d+)?)%/.exec(block.slice(block.indexOf('class="marg"')))![1]);
  return { lines, rows, margin };
}

for (const [page, labels] of [
  ['index.html', ['Before markup', 'Markup', 'Total']],
  ['es.html', ['Antes del aumento', 'Aumento', 'Total']],
] as const) {
  Deno.test(`${page}: hero mock math matches the app`, () => {
    const { lines, rows, margin } = mock(read(page));
    assertEquals(rows.map((r) => r.label), [...labels], 'row labels');
    const [before, markup, total] = rows.map((r) => r.value);
    assertEquals(lines.reduce((a, b) => a + b, 0), total, 'the line prices add up to the Total');
    assertEquals(before + markup, total, 'before markup + markup = total');
    assertEquals(markup, Math.round(before * 0.2), 'markup is 20% of the cost (the page says 20%)');
    // A whole-cent cost × 1.2 is a whole number of cents divisible by 6 (price × 5 = cost × 6).
    for (const l of lines) assertEquals(l % 6, 0, `line ${l} cents is a whole-cent cost × 1.2`);
    assertEquals(Number(((markup / total) * 100).toFixed(1)), margin, 'margin = markup / total');
    assert(!rows.some((r) => r.label === 'Subtotal'), 'no "Subtotal" row that the lines do not add up to');
  });
}

Deno.test('es.html calls markup "aumento", never "ganancia" or the English word', () => {
  const es = read('es.html').replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  assert(!/ganancia/i.test(es), 'no "ganancia"');
  assert(!/\bmarkup\b/i.test(es), 'no English "markup" in the Spanish page');
  assert(es.includes('20% de aumento sobre el costo'));
});
