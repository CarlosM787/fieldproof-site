// Option (a): Google Analytics only after the visitor taps "Allow". Fake browser; nothing is sent anywhere.
// Run with:  npx deno test --allow-read scripts/tests/ga-optin.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';

const SRC = Deno.readTextFileSync(new URL('../../analytics.js', import.meta.url));

type El = { tag: string; children: El[]; text: string; attrs: Record<string, string>; style: Record<string, string>; on: Record<string, () => void>; parentNode: El | null; src?: string; [k: string]: unknown };
function el(tag: string): El {
  const e: El = { tag, children: [], text: '', attrs: {}, style: { cssText: '' }, on: {}, parentNode: null };
  Object.assign(e, {
    appendChild(c: El) { c.parentNode = e; e.children.push(c); return c; },
    removeChild(c: El) { e.children = e.children.filter((x) => x !== c); c.parentNode = null; },
    setAttribute(k: string, v: string) { e.attrs[k] = v; },
    addEventListener(t: string, f: () => void) { e.on[t] = f; },
    querySelector: () => null, querySelectorAll: () => [],
  });
  Object.defineProperty(e, 'textContent', { get: () => e.text, set: (v: string) => { e.text = v; } });
  Object.defineProperty(e, 'innerHTML', { get: () => '', set: () => { e.children = []; } });
  return e;
}
const all = (e: El): El[] => [e, ...e.children.flatMap(all)];

function boot(stored: string | null, store = true) {
  const loaded: string[] = [];
  const mem: Record<string, string> = stored ? { 'te.consent.v1': JSON.stringify({ v: 1, analytics: stored }) } : {};
  const listeners: Record<string, (() => void)[]> = {};
  const win: Record<string, unknown> = { addEventListener(t: string, f: () => void) { (listeners[t] ??= []).push(f); }, removeEventListener() {} };
  const body = el('body'); const footer = el('footer');
  const document = {
    readyState: 'complete', referrer: '', documentElement: { lang: 'es' }, cookie: '', body,
    head: { appendChild: (e: { src: string }) => loaded.push(e.src) },
    createElement: (t: string) => el(t), createTextNode: (t: string) => ({ tag: '#text', text: t, children: [] }),
    querySelector: (q: string) => (q === 'footer' ? footer : null), querySelectorAll: () => [], addEventListener() {},
  };
  const localStorage = {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => { if (!store) throw new Error('blocked'); mem[k] = v; },
    removeItem: (k: string) => { delete mem[k]; },
  };
  const location = { hostname: 'talkestimate.com', pathname: '/', search: '' };
  new Function('window', 'document', 'location', 'localStorage', SRC)(win, document, location, localStorage);
  const touch = () => (listeners['pointerdown'] ?? []).forEach((f) => f());
  const bar = () => body.children.find((c) => c.attrs.role === 'region');
  const buttons = () => all(bar()!).filter((c) => c.tag === 'button');
  return { win, loaded, mem, touch, bar, buttons, footer, body };
}

Deno.test('first visit: a bar asks (in the page language), GA is not loaded, no cookie is set', () => {
  const b = boot(null);
  b.touch();
  assertEquals(b.loaded, []);
  assert(b.bar(), 'bar shown');
  assertEquals(b.buttons().map((x) => x.text), ['Permitir', 'No, gracias']);
  assert(b.footer.children.some((c) => c.text === 'Configurar analítica'), 'footer settings link');
});

Deno.test('"Allow" loads GA right away and is remembered', () => {
  const b = boot(null);
  b.buttons()[0].on.click();
  assertEquals(b.loaded.length, 1);
  assert(b.loaded[0].startsWith('https://www.googletagmanager.com/gtag/js?id='));
  assertEquals(JSON.parse(b.mem['te.consent.v1']).analytics, 'granted');
  assertEquals(b.bar(), undefined);
});

Deno.test('"No thanks" loads nothing, drops events and is remembered', async () => {
  const b = boot(null);
  b.buttons()[1].on.click();
  b.touch();
  (b.win.teTrack as (e: string) => void)('tool_view');
  assertEquals(b.loaded, []);
  assertEquals(JSON.parse(b.mem['te.consent.v1']).analytics, 'denied');
  assert(!((b.win.dataLayer as unknown[][]) ?? []).some((e) => Array.from(e as ArrayLike<unknown>)[1] === 'tool_view'));
  assertEquals(await (b.win.teGaIds as () => Promise<unknown>)(), {});
});

Deno.test('returning visitors: allowed → GA on first touch with no bar; refused → nothing and no bar', () => {
  const g = boot('granted'); assertEquals(g.bar(), undefined); g.touch(); assertEquals(g.loaded.length, 1);
  const d = boot('denied'); assertEquals(d.bar(), undefined); d.touch(); assertEquals(d.loaded, []);
});

Deno.test('if the choice cannot be stored, analytics stays off and no bar nags on every page', () => {
  const b = boot(null, false);
  b.touch();
  assertEquals(b.loaded, []);
  assertEquals(b.bar(), undefined);
});

Deno.test('privacy page explains the opt-in, EN + ES', () => {
  const html = Deno.readTextFileSync(new URL('../../privacy.html', import.meta.url));
  assert(html.includes('Google Analytics only runs after you tap "Allow"'));
  assert(html.includes('Google Analytics solo funciona después de que tocas "Permitir"'));
});
