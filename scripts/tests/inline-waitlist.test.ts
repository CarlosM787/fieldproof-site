// V6 batch 1 (Carlos 11/12, §4 "prominent signup CTAs throughout the website", EN + ES): every tool and guide page
// carries the home page's waitlist form inline (#join), driven by /assets/waitlist.js. Nothing new is collected: same
// endpoint, same fields (email, trade, the "company" bot trap), same attribution, same consent line, same messages.
// Run with:  npx deno test --allow-read scripts/tests/inline-waitlist.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';

const root = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, root)).replace(/\r\n/g, '\n');
const list = (dir: string) => [...Deno.readDirSync(new URL(dir, root))].filter((e) => e.isFile && e.name.endsWith('.html')).map((e) => dir + e.name);
const PAGES = [...list('tools/'), ...list('guides/'), ...list('es/herramientas/'), ...list('es/guias/')].sort();
const JS = read('assets/waitlist.js');
const HOME_EN = read('index.html');
const HOME_ES = read('es.html');

Deno.test('all 21 tool and guide pages are covered', () => {
  assertEquals(PAGES.length, 21); // V6 batch 3: + the estimate template (EN + ES)
});

for (const p of PAGES) {
  const html = read(p);
  const es = p.startsWith('es/');
  Deno.test(`${p}: one inline waitlist form, the home form's fields and consent, reachable from the nav`, () => {
    assertEquals((html.match(/<form class="wl-inline" id="join" data-waitlist>/g) ?? []).length, 1);
    const form = html.slice(html.indexOf('<form class="wl-inline"'), html.indexOf('</form>', html.indexOf('<form class="wl-inline"')));
    assert(form.includes('<input type="email" id="join-email" name="email"') && form.includes(' required />'), 'email, required');
    assert(form.includes('<select id="join-trade" name="trade"'), 'trade');
    assert(form.includes('<input class="hp" type="text" name="te_hp_x" tabindex="-1" autocomplete="off" aria-hidden="true" />'), 'bot trap');
    assert(form.includes('<label for="join-email" class="sr-only">') && form.includes('<label for="join-trade" class="sr-only">'), 'labels');
    assert(form.includes('<div class="wl-msg" role="status" aria-live="polite"></div>'), 'announced message');
    assert(/<button type="submit" data-cta="[a-z0-9_]+_waitlist">/.test(form), 'submit keeps its CTA name');
    // No field beyond the home form's (no new data collection).
    assertEquals([...form.matchAll(/ name="([a-z_]+)"/g)].map((m) => m[1]).sort(), ['email', 'te_hp_x', 'trade']);
    if (es) {
      assert(form.includes('>Únete a la lista de espera</button>'));
      assert(form.includes('Al unirte, aceptas nuestra <a href="/privacy.html">Política de Privacidad</a>. Sin spam — te escribimos personalmente para configurarte.'));
      assert(form.includes('<option>Pintura</option>') && form.includes('<option>General / Remodelación</option>'));
    } else {
      assert(form.includes('>Join the waitlist</button>'));
      assert(form.includes('By joining, you agree to our <a href="/privacy.html">Privacy&nbsp;Policy</a>. No spam — we email you personally to get you set up.'));
      assert(form.includes('<option>Painting</option>') && form.includes('<option>General / Remodel</option>'));
    }
    assert(!/href="\/(es\.html)?#pricing"/.test(html), 'no more trips to the home page to sign up');
    assert(/<a class="btn" href="#join" data-cta="[a-z0-9_]+">/.test(html.slice(0, html.indexOf('</nav>'))), 'nav button -> #join');
    // waitlist.js after analytics.js (both deferred, so attribution and GA ids exist when it runs)
    const a = html.indexOf('<script src="/analytics.js" defer></script>'), w = html.indexOf('<script src="/assets/waitlist.js" defer></script>');
    assert(a > 0 && w > a, 'script order');
  });
}

Deno.test('the consent line and trade options are word for word the home form\'s', () => {
  assert(HOME_EN.includes('By joining, you agree to our <a href="privacy.html">Privacy&nbsp;Policy</a>. No spam — we email you personally to get you set up.'));
  assert(HOME_ES.includes('Al unirte, aceptas nuestra <a href="privacy.html">Política de Privacidad</a>. Sin spam — te escribimos personalmente para configurarte.'));
  for (const o of ['Handyman', 'Painting', 'Drywall', 'General / Remodel', 'Other']) assert(HOME_EN.includes(`<option>${o}</option>`), o);
  for (const o of ['Handyman', 'Pintura', 'Drywall', 'General / Remodelación', 'Otro']) assert(HOME_ES.includes(`<option>${o}</option>`), o);
});

Deno.test('waitlist.js = the home form\'s request: same endpoint, same payload, same answers', () => {
  const endpoint = "'https://api.talkestimate.com/functions/v1/join-waitlist'";
  assert(JS.includes(`var ENDPOINT = ${endpoint};`));
  assert(HOME_EN.includes("fetch('https://api.talkestimate.com/functions/v1/join-waitlist'"));
  assert(JS.includes("email: email.value,") && JS.includes("trade: trade ? trade.value : '',") && JS.includes("company: trap ? trap.value : ''"));
  assert(JS.includes('}, attribution(), await gaIds());'), 'attribution + GA ids, as on the home form');
  assert(JS.includes('if (!data || data.ok !== true) throw new Error(\'failed\');'), 'only a clean {ok:true} counts');
  // Messages: exactly the home page's words.
  for (const s of ["✓ You're in. We'll email you personally to get you set up.", 'Something went wrong — try again, or email support@talkestimate.com']) {
    assert(JS.includes(s) && HOME_EN.includes(s), s);
  }
  for (const s of ['✓ ¡Listo! Te escribimos personalmente para configurarte.', 'Algo salió mal — inténtalo otra vez, o escríbenos a support@talkestimate.com',
    'Demasiados intentos desde esta conexión. Espera unos minutos e inténtalo de nuevo, o escríbenos a support@talkestimate.com']) {
    assert(JS.includes(s) && HOME_ES.includes(s), s);
  }
});

Deno.test('waitlist.js never claims a lead from the browser and never shows a raw network error', () => {
  const events = [...JS.matchAll(/track\('([a-z_]+)'/g)].map((m) => m[1]).sort();
  assertEquals(events, ['form_start', 'form_submit_error', 'waitlist_submit_attempt']);
  assert(!/generate_lead|sign_up|'lead'/.test(JS));
  assert(JS.includes('msg.textContent = serverSaid || T.failed;'), 'only a server message, else the fallback');
  assert(JS.includes('if (btn.disabled) return;') && JS.includes('btn.disabled = true;') && JS.includes('btn.disabled = false;'), 'one request at a time');
  assert(!/innerHTML/.test(JS), 'messages are text only');
  // The EN home form: a network TypeError no longer shows "Failed to fetch".
  assert(HOME_EN.includes("msg.textContent = (err && err.message && err.message !== 'failed' && !(err instanceof TypeError))"));
});
