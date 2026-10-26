// The REAL inline form scripts of index.html (EN) and es.html (ES), run against a fake page and a fake server.
// Proves what the browser does with each kind of answer, and that it never reports "a lead" (it can't know:
// the server answers new lead / duplicate / bot-trap hit identically, on purpose).
// Run with:  npx deno test --allow-read scripts/tests/waitlist-flow.test.ts
// (scripts/ is excluded from the published site by scripts/cf-assets.mjs, so this file never ships.)

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';

const PAGES = [
  { name: 'EN', file: '../../index.html', ok: "✓ You're in. We'll email you personally to get you set up.", generic: 'Something went wrong — try again, or email support@talkestimate.com', tradeSuffix: '' },
  { name: 'ES', file: '../../es.html', ok: '✓ ¡Listo! Te escribimos personalmente para configurarte.', generic: 'Algo salió mal — inténtalo otra vez, o escríbenos a support@talkestimate.com', tradeSuffix: ' · español' },
];

function formScript(html: string): string {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const found = scripts.find((s) => s.includes("getElementById('wl')") && s.includes('join-waitlist'));
  if (!found) throw new Error('form script not found');
  return found;
}

interface FakeEl {
  id: string; value: string; disabled: boolean; className: string; textContent: string;
  listeners: Record<string, (e: unknown) => unknown>;
  resets: number;
  addEventListener(type: string, fn: (e: unknown) => unknown): void;
  reset(): void;
}

function run(pageFile: string, fetchImpl: (url: string, init: { body: string }) => Promise<unknown>) {
  const code = formScript(Deno.readTextFileSync(new URL(pageFile, import.meta.url)));
  const els: Record<string, FakeEl> = {};
  const el = (id: string): FakeEl => (els[id] ??= {
    id, value: '', disabled: false, className: '', textContent: '', listeners: {}, resets: 0,
    addEventListener(type, fn) { this.listeners[type] = fn; },
    reset() { this.resets++; },
  });
  const events: [string, Record<string, unknown>][] = [];
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const document = { getElementById: (id: string) => el(id) };
  const win = {
    teTrack: (e: string, p: Record<string, unknown>) => events.push([e, p]),
    teAttribution: () => ({ language: 'xx', utm_source: 'test' }),
  };
  const fakeFetch = (url: string, init: { body: string }) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return fetchImpl(url, init);
  };
  new Function('document', 'window', 'fetch', code)(document, win, fakeFetch);
  const form = el('wl');
  el('wl-email').value = 'person@gmail.com';
  el('wl-trade').value = 'Painting';
  el('wl-company').value = '';
  return {
    form, btn: el('wl-btn'), msg: el('wl-msg'), events, requests,
    submit: async () => { await form.listeners.submit({ preventDefault() {} }); },
    names: () => events.map(([e]) => e),
  };
}

const answer = (status: number, body: unknown, asJson = true) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  json: () => (asJson ? Promise.resolve(body) : Promise.reject(new SyntaxError('Unexpected token <'))),
});

for (const p of PAGES) {
  Deno.test(`${p.name}: a server "ok" shows the thank-you and fires waitlist_submit once (never form_submit_success)`, async () => {
    const t = run(p.file, () => answer(200, { ok: true }));
    await t.submit();
    assertEquals(t.msg.textContent, p.ok);
    assertEquals(t.msg.className, 'wl-msg ok');
    assertEquals(t.names(), ['waitlist_submit']);
    assertEquals(t.events[0][1], { form_name: 'waitlist' });
    assertEquals(t.form.resets, 1);
    assertFalse(t.btn.disabled);
  });

  Deno.test(`${p.name}: the page cannot tell a new lead from a duplicate or a bot-trap hit, so none of them changes what it does`, async () => {
    // Whatever extra the server might say, the browser behaves exactly the same on a 200.
    const outcomes = [{ ok: true }, { ok: true, new: false }, { ok: true, duplicate: true }, { ok: true, accepted: 'new_lead', honeypot: false }];
    const seen: string[] = [];
    for (const body of outcomes) {
      const t = run(p.file, () => answer(200, body));
      await t.submit();
      seen.push(JSON.stringify([t.msg.textContent, t.msg.className, t.names()]));
    }
    assertEquals(new Set(seen).size, 1);
    const src = formScript(Deno.readTextFileSync(new URL(p.file, import.meta.url)));
    assertFalse(/data\.(new|duplicate|isNew|existing|accepted|honeypot|lead)/.test(src), 'the script never reads an outcome flag');
  });

  Deno.test(`${p.name}: errors (400, 429, 500, network, unreadable body) never fire waitlist_submit; they fire form_submit_error once`, async () => {
    const failures: [string, () => Promise<unknown>][] = [
      ['400 with a message', () => answer(400, { error: 'Enter a valid email address.' })],
      ['429 rate limited (JSON)', () => answer(429, { error: 'rate limited' })],
      ['429 rate limited (HTML body)', () => answer(429, null, false)],
      ['500', () => answer(500, { error: 'Something went wrong — try again.' })],
      ['network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
      ['200 but unreadable body', () => answer(200, null, false)],
    ];
    for (const [label, f] of failures) {
      const t = run(p.file, f);
      await t.submit();
      assertEquals(t.names(), ['form_submit_error'], label);
      assertEquals(t.msg.className, 'wl-msg err', label);
      assertFalse(t.btn.disabled, `${label}: the button comes back so they can retry`);
      assertEquals(t.form.resets, 0, `${label}: what they typed is not lost`);
    }
  });

  Deno.test(`${p.name}: ${p.name === 'EN' ? 'the server message' : 'a Spanish message'} is what an error shows (no raw English on the Spanish page)`, async () => {
    const t = run(p.file, () => answer(500, { error: 'Something went wrong — try again.' }));
    await t.submit();
    if (p.name === 'ES') assertEquals(t.msg.textContent, p.generic);
    else assertEquals(t.msg.textContent, 'Something went wrong — try again.');
    const unreadable = run(p.file, () => answer(429, null, false));
    await unreadable.submit();
    assertEquals(unreadable.msg.textContent, p.generic);
  });

  Deno.test(`${p.name}: the request is a single POST with the honeypot, attribution and no analytics id; the button blocks double-submits`, async () => {
    let release: (v: unknown) => void = () => {};
    const held = new Promise((r) => (release = r));
    const t = run(p.file, () => held as Promise<unknown>);
    t.form.listeners.focusin({});
    const pending = t.submit();
    assert(t.btn.disabled, 'disabled while the request is in flight');
    assertEquals(t.requests.length, 1);
    release(await answer(200, { ok: true }));
    await pending;
    const sent = t.requests[0];
    assertEquals(sent.url, 'https://zjggusmqgzvbfxwbvmsu.supabase.co/functions/v1/join-waitlist');
    assertEquals(sent.body.email, 'person@gmail.com');
    assertEquals(sent.body.trade, 'Painting' + p.tradeSuffix);
    assertEquals(sent.body.company, '', 'the honeypot field is sent as the browser has it (empty for a person)');
    assertEquals(sent.body.utm_source, 'test');
    assertFalse(JSON.stringify(sent.body).includes('G-'), 'no analytics id in the request');
    assertEquals(t.names(), ['form_start', 'waitlist_submit']);
  });

  Deno.test(`${p.name}: form_start fires once, on first interaction`, () => {
    const t = run(p.file, () => answer(200, { ok: true }));
    t.form.listeners.focusin({});
    t.form.listeners.focusin({});
    assertEquals(t.names(), ['form_start']);
  });
}

Deno.test('neither page fires the old overstating event, and the meaning is written next to the new one', () => {
  for (const p of PAGES) {
    const html = Deno.readTextFileSync(new URL(p.file, import.meta.url));
    assertFalse(html.includes('form_submit_success'), p.name);
    assertEquals((html.match(/track\('waitlist_submit'/g) ?? []).length, 1, p.name);
    assert(/NOT "(a )?new lead"|NO "lead nuevo"/.test(html), `${p.name}: the comment explains it is not a lead count`);
  }
  const analytics = Deno.readTextFileSync(new URL('../../analytics.js', import.meta.url));
  assertFalse(analytics.includes('form_submit_success'));
  assert(analytics.includes('waitlist_submit'));
});

Deno.test('the public form text and the privacy line are untouched by this change', () => {
  const en = Deno.readTextFileSync(new URL('../../index.html', import.meta.url));
  assert(en.includes('By joining, you agree to our <a href="privacy.html">Privacy&nbsp;Policy</a>. No spam — we email you personally to get you set up.'));
  assert(en.includes('Get Early Access'));
});
