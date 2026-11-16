// WO-20261116-11-D (public authority proposals T-3 and T-4, owner-built as a LOCAL review candidate).
// T-3: the ES home page links the ES labor quote calculator (Growth: position 12, 123 impressions); its title stays <= 60.
// T-4: the phone header shows the brand name wherever the nav has room (measured with headless Chromium, no page overflow):
//      EN from 375 px, ES from 480 px (its Join label is longer); icon only below that, as before.
// Run with:  npx deno test --allow-read scripts/tests/wo11-alive.test.ts
import { assert } from 'jsr:@std/assert@1';

const root = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, root)).replace(/\r\n/g, '\n');

Deno.test('T-3: /es.html links the labor quote calculator, whose title is 60 characters or fewer', () => {
  assert(read('es.html').includes('href="/es/herramientas/calculadora-mano-de-obra-cotizacion" data-cta="home_labor_calculator"'));
  const t = /<title>([^<]+)<\/title>/.exec(read('es/herramientas/calculadora-mano-de-obra-cotizacion.html'))?.[1] ?? '';
  assert(t.length > 0 && [...t].length <= 60, t);
});

Deno.test('T-4: the phone header shows the brand name from the measured width', () => {
  for (const [f, w] of [['index.html', 375], ['es.html', 480]] as const) {
    const h = read(f);
    assert(h.includes(`@media (min-width: ${w}px) and (max-width: 720px) { .logo-word { display: inline; font-size: 16px; }`), f);
    assert(h.includes('<span class="logo-word">Talk<em>Estimate</em></span>'), f);
  }
});

Deno.test('Advisor 21 B1: the ES header shows only logo, EN/ES and Join at tablet widths (721-860 px)', () => {
  assert(read('es.html').includes('@media (min-width: 721px) and (max-width: 860px) { .nav-links a:not(.btn):not(.lt) { display: none; } }'));
  assert(!read('index.html').includes('(min-width: 721px) and (max-width: 860px)'), 'EN header fits; unchanged');
});
