// V6 batch 2 (Carlos 11/12, §4): the nav signup button no longer disappears on phones. At <= 480 px it shows a compact
// "Join" / "Únete" (the rest of the label is visually hidden, so screen readers still hear the full label), and it
// jumps to the inline form (#join). Plus Growth's SEO note: the how-to-price-labor title carries "labor cost per hour".
// Run with:  npx deno test --allow-read scripts/tests/v6-batch2.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';

const root = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, root)).replace(/\r\n/g, '\n');
const list = (dir: string) => [...Deno.readDirSync(new URL(dir, root))].filter((e) => e.isFile && e.name.endsWith('.html')).map((e) => dir + e.name);
const PAGES = [...list('tools/'), ...list('guides/'), ...list('es/herramientas/'), ...list('es/guias/')].sort();
const CSS = read('tools/assets/tools.css');

Deno.test('every tool/guide nav button: compact on phones, full label kept for screen readers', () => {
  assertEquals(PAGES.length, 19);
  for (const p of PAGES) {
    const nav = read(p).split('</nav>')[0];
    const want = p.startsWith('es/')
      ? /<a class="btn" href="#join" data-cta="[a-z0-9_]+">Únete<span class="nav-more"> a la lista de espera<\/span><\/a>/
      : /<a class="btn" href="#join" data-cta="[a-z0-9_]+">Join<span class="nav-more"> the waitlist<\/span><\/a>/;
    assert(want.test(nav), p);
  }
});

Deno.test('tools.css: the phone rule shows the button (no display:none) and comes after the 760 px rule', () => {
  assert(!CSS.includes('@media (max-width: 480px) { .nav-links a.btn { display: none; } }'), 'the old "hide on phones" rule is gone');
  const phone = CSS.indexOf('@media (max-width: 480px) { .nav-links a.btn { padding: 8px 12px;');
  const tablet = CSS.indexOf('@media (max-width: 760px) { .nav-links a.hide-sm');
  assert(phone > tablet && tablet > 0, 'order: the later rule wins at the same specificity');
  assert(CSS.includes('.nav-links .nav-more { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0);'), 'visually hidden, not display:none');
});

Deno.test('how-to-price-labor: the title carries "labor cost per hour" and stays <= 65 characters', () => {
  const t = read('guides/how-to-price-labor.html').match(/<title>([^<]+)<\/title>/)![1];
  assertEquals(t, 'How to Price Labor: Your Labor Cost per Hour | TalkEstimate');
  assert(/labor cost per hour/i.test(t) && t.length <= 65);
});

Deno.test('Advisor pass 37 P2-1: a jump to #join lands below the 65 px sticky nav; the phone button is 44 px tall', () => {
  assert(CSS.includes('#join { scroll-margin-top: 84px; }'));
  assert(CSS.includes('nav.top { position: sticky; top: 0;'), 'the nav this offsets');
  assert(CSS.includes('.nav-links a.btn { padding: 8px 12px; font-size: 14px; white-space: nowrap; min-height: 44px;'));
});

Deno.test('Advisor pass 36 P3 guard: the inline form has no human-check (Turnstile) path, so the home site key must stay empty', () => {
  // waitlist.js sends no turnstile_token. If anyone pastes a Turnstile site key into the home form, this test fails
  // until waitlist.js gets the same token path (otherwise the server, once told to enforce, would refuse inline signups).
  const js = read('assets/waitlist.js');
  assert(!js.includes('turnstile_token'));
  for (const p of ['index.html', 'es.html']) assert(read(p).includes("var TURNSTILE_SITE_KEY = '';"), p);
});
