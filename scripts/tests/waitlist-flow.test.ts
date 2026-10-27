// The REAL inline form scripts of index.html (EN) and es.html (ES), run against a fake page and a fake server.
// Proves what the browser does with each kind of answer, that it never reports "a lead" (it can't know: the
// server answers new lead / duplicate / bot-trap hit identically, on purpose), that the optional human check is
// completely dormant until a site key is pasted, and that it behaves safely when it is on.
// Run with:  npx deno test --allow-read scripts/tests/waitlist-flow.test.ts scripts/tests/ga-ids.test.ts
// (scripts/ is excluded from the published site by scripts/cf-assets.mjs, so this file never ships.)

import { assert, assertEquals, assertFalse, assertNotEquals } from 'jsr:@std/assert@1';

const PAGES = [
  {
    name: 'EN', file: '../../index.html', ok: "✓ You're in. We'll email you personally to get you set up.",
    generic: 'Something went wrong — try again, or email support@talkestimate.com', tradeSuffix: '', lang: 'en',
    rateLimited: 'Too many attempts from this connection. Please wait a few minutes and try again, or email support@talkestimate.com.',
    notVerified: "We couldn't verify this request. Reload the page and try again, or email support@talkestimate.com.",
  },
  {
    name: 'ES', file: '../../es.html', ok: '✓ ¡Listo! Te escribimos personalmente para configurarte.',
    generic: 'Algo salió mal — inténtalo otra vez, o escríbenos a support@talkestimate.com', tradeSuffix: ' · español', lang: 'es',
    rateLimited: 'Demasiados intentos desde esta conexión. Espera unos minutos e inténtalo de nuevo, o escríbenos a support@talkestimate.com',
    notVerified: 'No pudimos verificar esta solicitud. Recarga la página e inténtalo de nuevo, o escríbenos a support@talkestimate.com',
  },
];

// Cloudflare's documented DUMMY site key (always passes). It is public test data, not a real key.
const CF_TEST_SITE_KEY = '1x00000000000000000000AA';

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

interface RunOptions {
  /** Paste the (dummy) Turnstile site key into the page, i.e. switch the human check on. */
  siteKey?: string;
  /** What the human-check script does: 'works' (hands out tokens), 'blocked' (fails to load), 'silent' (loads but never answers). */
  check?: 'works' | 'blocked' | 'silent';
  /** What window.teGaIds() resolves to. */
  ga?: Record<string, string>;
  lang?: string;
}

function run(pageFile: string, fetchImpl: (url: string, init: { body: string }) => Promise<unknown>, opts: RunOptions = {}) {
  let code = formScript(Deno.readTextFileSync(new URL(pageFile, import.meta.url)));
  if (opts.siteKey) {
    assert(code.includes("var TURNSTILE_SITE_KEY = '';"), 'the shipped page has the key empty');
    code = code.replace("var TURNSTILE_SITE_KEY = '';", `var TURNSTILE_SITE_KEY = '${opts.siteKey}';`).replace('waitForToken(8000)', 'waitForToken(40)');
  }
  const els: Record<string, FakeEl> = {};
  const el = (id: string): FakeEl => (els[id] ??= {
    id, value: '', disabled: false, className: '', textContent: '', listeners: {}, resets: 0,
    addEventListener(type, fn) { this.listeners[type] = fn; },
    reset() { this.resets++; },
  });
  const events: [string, Record<string, unknown>][] = [];
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const scriptsAdded: string[] = [];
  const renders: { selector: string; options: Record<string, unknown> }[] = [];
  const resetsOfWidget: number[] = [];
  let issued = 0;
  const win: Record<string, unknown> = {
    teTrack: (e: string, p: Record<string, unknown>) => events.push([e, p]),
    teAttribution: () => ({ language: 'xx', utm_source: 'test' }),
  };
  if (opts.ga) win.teGaIds = () => Promise.resolve(opts.ga);
  const document = {
    getElementById: (id: string) => el(id),
    documentElement: { lang: opts.lang ?? 'en' },
    createElement: (_tag: string) => ({ src: '', async: false, onload: null as null | (() => void), onerror: null as null | (() => void) }),
    head: {
      appendChild(s: { src: string; onload: null | (() => void); onerror: null | (() => void) }) {
        scriptsAdded.push(s.src);
        queueMicrotask(() => {
          if (opts.check === 'blocked') return s.onerror?.();
          win.turnstile = {
            render(selector: string, o: Record<string, unknown>) {
              renders.push({ selector, options: o });
              if (opts.check !== 'silent') queueMicrotask(() => (o.callback as (t: string) => void)(`token-${++issued}`));
              return 'widget-1';
            },
            reset(id: string) {
              resetsOfWidget.push(Number(id === 'widget-1'));
              if (opts.check !== 'silent') queueMicrotask(() => (renders[0].options.callback as (t: string) => void)(`token-${++issued}`));
            },
          };
          s.onload?.();
        });
      },
    },
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
    form, btn: el('wl-btn'), msg: el('wl-msg'), events, requests, scriptsAdded, renders, resetsOfWidget, win,
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
  Deno.test(`${p.name}: a server "ok" shows the thank-you and sends NO browser success event (the server alone knows if it was a lead)`, async () => {
    const t = run(p.file, () => answer(200, { ok: true }));
    await t.submit();
    assertEquals(t.msg.textContent, p.ok);
    assertEquals(t.msg.className, 'wl-msg ok');
    assertEquals(t.names(), [], 'no waitlist_submit, no form_submit_success, nothing');
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

  Deno.test(`${p.name}: errors (400, 403, 429, 500, network, unreadable body) fire form_submit_error once and never a success`, async () => {
    const failures: [string, () => Promise<unknown>][] = [
      ['400 with a message', () => answer(400, { error: 'Enter a valid email address.' })],
      ['403 not verified', () => answer(403, { error: 'x', code: 'verification_failed' })],
      ['429 rate limited (JSON)', () => answer(429, { error: 'rate limited', code: 'rate_limited' })],
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

  Deno.test(`${p.name}: "too many attempts" and "could not verify" each show a clear message in this page's language`, async () => {
    const limited = run(p.file, () => answer(429, { error: p.rateLimited, error_es: 'x', code: 'rate_limited' }));
    await limited.submit();
    assertEquals(limited.msg.textContent, p.rateLimited);
    const notVerified = run(p.file, () => answer(403, { error: p.notVerified, error_es: 'x', code: 'verification_failed' }));
    await notVerified.submit();
    assertEquals(notVerified.msg.textContent, p.notVerified);
    // an older/other server answer without a code still gets this page's own generic text (ES) or the server's text (EN)
    const unknown = run(p.file, () => answer(500, { error: 'Something went wrong — try again.' }));
    await unknown.submit();
    assertEquals(unknown.msg.textContent, p.name === 'ES' ? p.generic : 'Something went wrong — try again.');
    const unreadable = run(p.file, () => answer(429, null, false));
    await unreadable.submit();
    assertEquals(unreadable.msg.textContent, p.generic);
  });

  Deno.test(`${p.name}: the request is a single POST with the honeypot, attribution and the visitor's own analytics ids, and no analytics measurement id; the button blocks double-submits`, async () => {
    let release: (v: unknown) => void = () => {};
    const held = new Promise((r) => (release = r));
    const t = run(p.file, () => held as Promise<unknown>, { ga: { ga_client_id: '1234567890.1700000000', ga_session_id: '1700000123' } });
    t.form.listeners.focusin({});
    const pending = t.submit();
    await Promise.resolve();
    await Promise.resolve();
    assert(t.btn.disabled, 'disabled while the request is in flight');
    await new Promise((r) => setTimeout(r, 5));
    assertEquals(t.requests.length, 1);
    release(await answer(200, { ok: true }));
    await pending;
    const sent = t.requests[0];
    assertEquals(sent.url, 'https://zjggusmqgzvbfxwbvmsu.supabase.co/functions/v1/join-waitlist');
    assertEquals(sent.body.email, 'person@gmail.com');
    assertEquals(sent.body.trade, 'Painting' + p.tradeSuffix);
    assertEquals(sent.body.company, '', 'the honeypot field is sent as the browser has it (empty for a person)');
    assertEquals(sent.body.utm_source, 'test');
    assertEquals(sent.body.ga_client_id, '1234567890.1700000000');
    assertEquals(sent.body.ga_session_id, '1700000123');
    assertFalse(JSON.stringify(sent.body).includes('G-'), 'the measurement id (G-...) is never in the request');
    assertFalse('turnstile_token' in sent.body, 'no human-check token while the check is dormant');
    assertEquals(t.names(), ['form_start']);
  });

  Deno.test(`${p.name}: no analytics ids when analytics is not running (nothing is added to the request)`, async () => {
    for (const ga of [undefined, {}]) {
      const t = run(p.file, () => answer(200, { ok: true }), ga ? { ga } : {});
      await t.submit();
      assertFalse('ga_client_id' in t.requests[0].body);
      assertFalse('ga_session_id' in t.requests[0].body);
    }
  });

  Deno.test(`${p.name}: form_start fires once, on first interaction`, () => {
    const t = run(p.file, () => answer(200, { ok: true }));
    t.form.listeners.focusin({});
    t.form.listeners.focusin({});
    assertEquals(t.names(), ['form_start']);
  });

  // ---------------------------------------------------------------- the human check
  Deno.test(`${p.name}: HUMAN CHECK DORMANT (the shipped state): nothing is loaded from Cloudflare, nothing extra is sent`, async () => {
    const t = run(p.file, () => answer(200, { ok: true }));
    t.form.listeners.focusin({});
    await t.submit();
    assertEquals(t.scriptsAdded, []);
    assertEquals(t.renders, []);
    assertFalse('turnstile_token' in t.requests[0].body);
    assert(formScript(Deno.readTextFileSync(new URL(p.file, import.meta.url))).includes("var TURNSTILE_SITE_KEY = '';"));
  });

  Deno.test(`${p.name}: HUMAN CHECK ON: loads only when the visitor first touches the form, runs as action "waitlist", sends the token, asks for a fresh one after every attempt`, async () => {
    const t = run(p.file, () => answer(200, { ok: true }), { siteKey: CF_TEST_SITE_KEY, check: 'works', lang: p.lang });
    assertEquals(t.scriptsAdded, [], 'a visitor who never touches the form never contacts Cloudflare');
    t.form.listeners.focusin({});
    await new Promise((r) => setTimeout(r, 5));
    assertEquals(t.scriptsAdded, ['https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit']);
    assertEquals(t.renders.length, 1);
    assertEquals(t.renders[0].selector, '#wl-ts');
    assertEquals(t.renders[0].options.sitekey, CF_TEST_SITE_KEY);
    assertEquals(t.renders[0].options.action, 'waitlist');
    assertEquals(t.renders[0].options.appearance, 'interaction-only', 'invisible unless Cloudflare needs the visitor to do something');
    assertEquals(t.renders[0].options.language, p.lang);
    await t.submit();
    assertEquals(t.requests[0].body.turnstile_token, 'token-1');
    assertEquals(t.resetsOfWidget.length, 1, 'the used token is replaced');
    await new Promise((r) => setTimeout(r, 5));
    await t.submit();
    assertEquals(t.requests[1].body.turnstile_token, 'token-2', 'a second try never reuses the first token');
    assertEquals(t.scriptsAdded.length, 1, 'the script is loaded once');
    assertEquals(t.names(), ['form_start']);
  });

  Deno.test(`${p.name}: HUMAN CHECK ON but blocked or silent: the visitor is NOT stopped by the page - the form goes without a token and the server decides`, async () => {
    for (const check of ['blocked', 'silent'] as const) {
      const t = run(p.file, () => answer(200, { ok: true }), { siteKey: CF_TEST_SITE_KEY, check });
      t.form.listeners.focusin({});
      await t.submit();
      assertEquals(t.requests.length, 1, check);
      assertFalse('turnstile_token' in t.requests[0].body, check);
      assertEquals(t.msg.className, 'wl-msg ok', check);
    }
  });

  Deno.test(`${p.name}: HUMAN CHECK ON: a refusal asks for a fresh token and keeps what the visitor typed`, async () => {
    const t = run(p.file, () => answer(403, { error: p.notVerified, code: 'verification_failed' }), { siteKey: CF_TEST_SITE_KEY, check: 'works' });
    t.form.listeners.focusin({});
    await t.submit();
    assertEquals(t.msg.textContent, p.notVerified);
    assertEquals(t.resetsOfWidget.length, 1);
    assertEquals(t.form.resets, 0);
    assertFalse(t.btn.disabled);
  });
}

Deno.test('neither page fires any old or new browser success event; the meaning is written next to where it used to be', () => {
  for (const p of PAGES) {
    const html = Deno.readTextFileSync(new URL(p.file, import.meta.url));
    assertFalse(html.includes('form_submit_success'), p.name);
    assertFalse(html.includes('waitlist_submit'), `${p.name}: the browser reports no success any more`);
    assertFalse(/track\('[a-z_]*(success|submit)'/.test(html.replace(/form_submit_error/g, '')), p.name);
    assert(/No "success" event is sent from the browser/.test(html), `${p.name}: the comment explains why`);
  }
  const analytics = Deno.readTextFileSync(new URL('../../analytics.js', import.meta.url));
  assertFalse(analytics.includes('form_submit_success'));
  assertFalse(analytics.includes('waitlist_submit'));
});

Deno.test('the public form text, the privacy line and the visible layout are untouched; the check container is empty and takes no room until used', () => {
  const en = Deno.readTextFileSync(new URL('../../index.html', import.meta.url));
  assert(en.includes('By joining, you agree to our <a href="privacy.html">Privacy&nbsp;Policy</a>. No spam — we email you personally to get you set up.'));
  assert(en.includes('Get Early Access'));
  for (const p of PAGES) {
    const html = Deno.readTextFileSync(new URL(p.file, import.meta.url));
    assertEquals((html.match(/<div id="wl-ts"><\/div>/g) ?? []).length, 1, p.name);
    assert(html.includes('#wl-ts:empty { display: none; }'), p.name);
    assertNotEquals(html.indexOf('id="wl-company"'), -1);
  }
  const es = Deno.readTextFileSync(new URL('../../es.html', import.meta.url));
  assert(es.includes('Al unirte, aceptas nuestra <a href="privacy.html">Política de Privacidad</a>. Sin spam — te escribimos personalmente para configurarte.'));
});

Deno.test('the page needs no change to Cloudflare headers: there is no Content-Security-Policy to extend, and Turnstile is not preloaded', () => {
  const headers = Deno.readTextFileSync(new URL('../../_headers', import.meta.url));
  assertFalse(/content-security-policy/i.test(headers));
  for (const p of PAGES) {
    const html = Deno.readTextFileSync(new URL(p.file, import.meta.url));
    assertFalse(/<script[^>]+challenges\.cloudflare\.com/.test(html), `${p.name}: no static <script> tag for Turnstile`);
  }
});
