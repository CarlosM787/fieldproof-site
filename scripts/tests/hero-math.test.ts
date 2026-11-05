// The hero proof card (U3, 2026-11-04): a real spoken walkthrough and the priced lines it became. It replaced the
// decorative phone mock. The prices are the example rate ($50/hour, 20% markup on cost), so every priced line is a
// whole-cent cost x 1.2, the priced lines add up to the "so far" total, and the line that needs the contractor's
// hours shows no price (nothing is guessed). The second walkthrough in #demo is held to the same rules.
// Also pinned here: the hero pricing strip says exactly what the pricing section says, and every waitlist
// call to action on the home pages uses one name.
// Run with:  npx deno test --allow-read scripts/tests/hero-math.test.ts

import { assert, assertEquals } from 'jsr:@std/assert@1';

const read = (p: string) => Deno.readTextFileSync(new URL(`../../${p}`, import.meta.url));
const cents = (s: string) => Math.round(Number(s.replace(/[$,]/g, '')) * 100);

function block(html: string, open: string, close: string) {
  const a = html.indexOf(open);
  assert(a >= 0, `${open} not found`);
  return html.slice(a, html.indexOf(close, a));
}

function priced(card: string, li: string, total: string) {
  const rows = [...card.matchAll(new RegExp(`<div class="${li}"><span>([\\s\\S]*?)</span><b>([^<]+)</b></div>`, 'g'))]
    .map((m) => ({ label: m[1], price: m[2] }));
  const t = new RegExp(`<div class="${total}"><span>[^<]+</span><(?:b|span)>(\\$[\\d,.]+)</(?:b|span)></div>`).exec(card);
  assert(t, 'total row');
  return { rows, total: cents(t![1]) };
}

for (const [page, quote, unpriced, cta, strip] of [
  ['index.html', 'Master bedroom, twelve by fourteen', 'needs your hours', 'Join the waitlist',
    ['<b>Free</b> $0', '<b>Starter</b> $19.99/mo', '<b>Pro</b> $49.99/mo <i>after launch</i>', '14-day free trial when it opens, no card']],
  ['es.html', 'La recámara principal, doce por catorce', 'faltan tus horas', 'Únete a la lista de espera',
    ['<b>Gratis</b> $0', '<b>Starter</b> $19.99/mes', '<b>Pro</b> $49.99/mes <i>después del lanzamiento</i>', 'Prueba gratis de 14 días cuando abra, sin tarjeta']],
] as const) {
  Deno.test(`${page}: the hero proof card is real text (not hidden), comes with its spoken words, and its math holds`, () => {
    const html = read(page);
    const hero = block(html, '<header class="hero">', '</header>');
    const card = block(hero, '<figure class="proof">', '</figure>');
    assert(!/aria-hidden="true">[^<]{8,}/.test(card), 'the proof is readable by screen readers');
    assert(!hero.includes('class="phone"'), 'the decorative phone mock is gone from the hero');
    assert(card.includes(quote), 'the spoken walkthrough is shown');
    const { rows, total } = priced(card, 'proof-li', 'proof-total');
    const prices = rows.filter((r) => r.price !== '—').map((r) => cents(r.price));
    assertEquals(prices.length, 3);
    assertEquals(prices.reduce((a, b) => a + b, 0), total, 'priced lines add up to the total so far');
    for (const c of prices) assertEquals(c % 6, 0, `${c} cents is a whole-cent cost x 1.2`);
    const open = rows.filter((r) => r.price === '—');
    assertEquals(open.length, 1);
    assert(open[0].label.includes(unpriced), 'the unknown line asks for hours instead of guessing');
    assert(card.includes('$50/'), 'the example rate is stated next to the prices');
  });

  Deno.test(`${page}: the second walkthrough in #demo still adds up, and the first one is not repeated there`, () => {
    const html = read(page);
    const demo = block(html, '<section class="alt" id="demo">', '</section>');
    assert(!demo.includes(quote), 'the hero walkthrough is not shown twice');
    const { rows, total } = priced(demo, 'demo-li', 'demo-total');
    const prices = rows.map((r) => cents(r.price));
    assertEquals(prices.reduce((a, b) => a + b, 0), total);
    for (const c of prices) assertEquals(c % 6, 0);
  });

  Deno.test(`${page}: the hero pricing strip says exactly what the pricing section says`, () => {
    const html = read(page);
    const s = block(html, '<div class="price-strip"', '</div>');
    for (const part of strip) assert(s.includes(part), part);
    const pricing = block(html, '<section id="pricing"', '</section>');
    for (const amount of ['$0', '$19.99', '$49.99']) assert(pricing.includes(`<div class="p-price">${amount}`), amount);
    assert(/14 d(ays|ías)/.test(pricing), 'the 14-day trial is in the pricing section too');
    assert(s.includes('href="#pricing"'));
  });

  Deno.test(`${page}: every waitlist call to action uses one name`, () => {
    const html = read(page);
    const labels = [...html.matchAll(/data-cta="(?:nav_get_app|hero_get_app|footer_get_access)"[^>]*>([^<]+)</g)].map((m) => m[1]);
    labels.push(/<button type="submit" id="wl-btn">([^<]+)</.exec(html)![1]);
    assertEquals(labels.length, 4);
    assertEquals(new Set(labels).size, 1, labels.join(' | '));
    assertEquals(labels[0], cta);
    assert(!/Early Access|Acceso Anticipado/i.test(html), 'the old name is gone');
  });

  Deno.test(`${page}: the home page links straight to the markup and margin calculator in its own language`, () => {
    const html = read(page);
    const href = page === 'es.html' ? '/es/herramientas/calculadora-markup-margen' : '/tools/markup-margin-calculator';
    assert(html.includes(`<a href="${href}" data-cta="home_markup_calculator">`), href);
  });
}

Deno.test('es.html calls markup "aumento", never "ganancia" or the English word', () => {
  // link addresses are not prose: the Spanish calculator's own URL is /es/herramientas/calculadora-markup-margen
  const es = read('es.html').replace(/ href="[^"]*"/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  assert(!/ganancia/i.test(es), 'no "ganancia"');
  assert(!/\bmarkup\b/i.test(es), 'no English "markup" in the Spanish page');
  assert(es.includes('20% de aumento sobre el costo'));
});
