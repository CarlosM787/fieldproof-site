// analytics.js: the visitor's own GA4 ids for the waitlist form (window.teGaIds). The server uses them to send the one
// real "lead" event (only for an accepted new lead). Run against a fake browser; nothing is sent anywhere.
// Run with:  npx deno test --allow-read scripts/tests/ga-ids.test.ts

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';

const SRC = Deno.readTextFileSync(new URL('../../analytics.js', import.meta.url));

function boot(env: { host?: string; id?: string } = {}) {
  const code = SRC.replace("var GA_MEASUREMENT_ID = 'G-23MSFMVK4B';", `var GA_MEASUREMENT_ID = '${env.id ?? 'G-23MSFMVK4B'}';`);
  const loaded: string[] = [];
  const win: Record<string, unknown> = { addEventListener() {} };
  const document = {
    readyState: 'complete', referrer: '', documentElement: { lang: 'en' },
    head: { appendChild: (el: { src: string }) => loaded.push(el.src) },
    createElement: () => ({ src: '' }),
    querySelectorAll: () => [], addEventListener() {},
  };
  const localStorage = { getItem: () => null, setItem() {} };
  const location = { hostname: env.host ?? 'talkestimate.com', pathname: '/', search: '' };
  new Function('window', 'document', 'location', 'localStorage', code)(win, document, location, localStorage);
  const dl = () => (win.dataLayer as unknown[][] ?? []).map((a) => Array.from(a as ArrayLike<unknown>));
  const ids = win.teGaIds as () => Promise<Record<string, string>>;
  /** Answer gtag('get', ...) the way gtag.js does, once it has loaded. */
  const answerGets = (answers: Record<string, unknown>) => {
    for (const entry of dl()) {
      if (entry[0] === 'get') (entry[3] as (v: unknown) => void)(answers[entry[2] as string]);
    }
  };
  return { win, loaded, dl, ids, answerGets };
}

Deno.test('GA ids: on the production site they come from GA\'s own "get" command (client id and session id)', async () => {
  const b = boot();
  const p = b.ids();
  const gets = b.dl().filter((e) => e[0] === 'get');
  assertEquals(gets.map((g) => [g[1], g[2]]), [['G-23MSFMVK4B', 'client_id'], ['G-23MSFMVK4B', 'session_id']]);
  b.answerGets({ client_id: '1234567890.1700000000', session_id: 1700000123 });
  assertEquals(await p, { ga_client_id: '1234567890.1700000000', ga_session_id: '1700000123' });
});

Deno.test('GA ids: with analytics off they are an empty object and nothing is queued (the server then sends no lead event)', async () => {
  for (const env of [{ host: 'localhost' }, { host: 'preview.workers.dev' }, { id: '' }]) {
    const b = boot(env);
    assertEquals(await b.ids(), {}, JSON.stringify(env));
    assertEquals(b.dl().filter((e) => e[0] === 'get').length, 0);
    assertEquals(b.loaded.length, 0);
  }
});

Deno.test('GA ids: if Google\'s script never answers (blocked) the form is not held up for more than a moment', async () => {
  const b = boot();
  const started = Date.now();
  assertEquals(await b.ids(), {});
  assert(Date.now() - started < 1500);
});

Deno.test('GA ids: a partial answer is returned as is; an empty answer adds nothing', async () => {
  const half = boot();
  const p = half.ids();
  half.answerGets({ client_id: '111.222' });
  assertEquals(await p, { ga_client_id: '111.222' });
  const none = boot();
  const q = none.ids();
  none.answerGets({ client_id: '', session_id: null });
  assertEquals(await q, {});
});

Deno.test('GA ids: nothing personal - only the two analytics ids, never the measurement id, never page data', async () => {
  const b = boot();
  const p = b.ids();
  b.answerGets({ client_id: '1.2', session_id: '3' });
  const out = await p;
  assertEquals(Object.keys(out).sort(), ['ga_client_id', 'ga_session_id']);
  assertFalse(JSON.stringify(out).includes('G-'));
});
