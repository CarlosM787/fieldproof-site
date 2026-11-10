// Digest G website audit (WO-20261106-10, directive V5 §10): pins for the W-01..W-22 fixes on site/g-batch-2026-11.
// One block per theme. No price amount is pinned here (prices ship with the Stripe cutover, pricing-20-35.test.ts).
// Run with:  npx deno test --allow-read scripts/tests/g-batch.test.ts

import { assert, assertEquals } from 'jsr:@std/assert@1';

const root = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, root)).replace(/\r\n/g, '\n');
const HOME = ['index.html', 'es.html'];

// ── Claims and copy (W-02, W-03, W-04, W-05, W-06, W-07) ─────────────────────────────────────────────────────────────

Deno.test('W-03/W-07: no quote-marked composite complaint, no "most common" superlative, no empty quote slot (EN+ES)', () => {
  for (const p of HOME) {
    const html = read(p);
    assert(!/most common complaint|most common complaints|office suite with a learning curve|quejas m[aá]s comunes|queja m[aá]s com[uú]n|nom[aá]s quiero/i.test(html), `${p}: composite complaint`);
    assert(!/Your quote goes here|Aqu[ií] va tu frase|pain-card/.test(html), `${p}: placeholder quote card`);
  }
  // The section keeps its anchor and the founder card, and says what the product is without quoting anyone.
  assert(read('index.html').includes('<h2>One flow, not an office suite</h2>'));
  assert(read('es.html').includes('<h2>Un solo flujo, no un sistema de oficina</h2>'));
  for (const p of HOME) assert(/<section id="why-switch">[\s\S]*?class="founder"/.test(read(p)), `${p}: founder card kept`);
});

Deno.test('W-05: the demo is "an example walkthrough", never "real" or "exactly as spoken" (EN+ES)', () => {
  assert(read('index.html').includes('<p class="lead">An example walkthrough:</p>'));
  assert(read('es.html').includes('<p class="lead">Un recorrido de ejemplo:</p>'));
  for (const p of HOME) assert(!/exactly as spoken|real walkthrough|tal como se habl[oó]|recorrido real/i.test(read(p)), p);
});

Deno.test('W-06: no untested glove/sunlight claim and no "I never agreed to that is over" promise (EN+ES)', () => {
  for (const p of HOME) {
    const html = read(p);
    assert(!/glove|sunlight|never agreed|guantes|para el sol|nunca acept[eé]/i.test(html), p);
    assert(!html.includes('🧤'), `${p}: glove icon gone with the glove claim`);
  }
  assert(read('index.html').includes('Big buttons, high-contrast screens, and a recording made with no signal'));
  assert(read('es.html').includes('Botones grandes, pantallas de alto contraste, y si grabas sin señal'));
});

Deno.test('W-04: the Spanish FAQ makes no "perfectly" accuracy claim and claims no more than the English page', () => {
  const es = read('es.html');
  assert(!/perfectamente/i.test(es));
  assert(!/facturas y recibos/i.test(es), 'receipts are not claimed in English either');
  assert(es.includes('Si algo no se oye bien, lo corriges en la pantalla de revisión antes de enviar.'));
});

Deno.test('W-02: support says the app is not public yet before it points app users at the account page (EN+ES)', () => {
  const s = read('support.html').replace(/\s+/g, ' ');
  const en = s.indexOf('TalkEstimate is not released to the public yet.');
  const es = s.indexOf('TalkEstimate todavía no está disponible al público.');
  assert(en > 0 && en < s.indexOf('<a href="/account/">account page</a>'), 'EN status before the account link');
  assert(es > 0 && es < s.indexOf('<a href="/es/cuenta/">página de cuenta</a>'), 'ES status before the account link');
  assert(s.includes('If you already use the app, sign in on your <a href="/account/">account page</a>'));
  assert(s.includes('Si ya usas la app, entra a tu <a href="/es/cuenta/">página de cuenta</a>'));
  assert(!/To buy Starter|Para comprar Starter/.test(s), 'no unconditional "buy Starter" instruction');
  assertEquals((s.match(/Last updated: November 10, 2026/g) ?? []).length, 1);
});

// ── Style (W-19) ──────────────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('W-19: the home pages use few em dashes in visible text (was 32 each); the rest sit on price-coordinated lines', () => {
  for (const p of HOME) {
    const html = read(p);
    const text = html.slice(html.indexOf('<body')).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
    const n = (text.match(/—/g) ?? []).length;
    assert(n <= 8, `${p}: ${n} em dashes in visible text`);
  }
});
