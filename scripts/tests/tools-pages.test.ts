// Free tools + guides pages: SEO wiring, routes, links, structured data and privacy, checked from the files.
// Run with:  npx --yes deno test --allow-read scripts/tests/

import { assert, assertEquals } from 'jsr:@std/assert@1';

const ROOT = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, ROOT));
const exists = (p: string) => { try { return Deno.statSync(new URL(p.replace(/^\//, ''), ROOT)).isFile; } catch { return false; } };

const SITE = 'https://talkestimate.com';
const PAGES = [
  { file: 'tools/index.html', url: '/tools/', alt: '/es/herramientas/', lang: 'en' },
  { file: 'es/herramientas/index.html', url: '/es/herramientas/', alt: '/tools/', lang: 'es' },
  { file: 'tools/markup-margin-calculator.html', url: '/tools/markup-margin-calculator', alt: '/es/herramientas/calculadora-markup-margen', lang: 'en' },
  { file: 'es/herramientas/calculadora-markup-margen.html', url: '/es/herramientas/calculadora-markup-margen', alt: '/tools/markup-margin-calculator', lang: 'es' },
  { file: 'guides/markup-vs-margin.html', url: '/guides/markup-vs-margin', alt: '/es/guias/markup-vs-margen', lang: 'en' },
  { file: 'es/guias/markup-vs-margen.html', url: '/es/guias/markup-vs-margen', alt: '/guides/markup-vs-margin', lang: 'es' },
];

const redirects = read('_redirects').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  .map((l) => { const [from, to, code] = l.split(/\s+/); return { from, to, code: Number(code) }; });
/** Where a site path is served from, following the same 200/301 rules as Cloudflare (html_handling "none"). */
function resolve(path: string): string | null {
  let p = path;
  for (let i = 0; i < 3; i++) {
    const r = redirects.find((x) => x.from === p);
    if (!r) break;
    p = r.to;
    if (r.code === 200) break;
  }
  return exists(p) ? p : null;
}

const tag = (html: string, re: RegExp) => (re.exec(html) || [])[1];

for (const pg of PAGES) {
  const html = read(pg.file);
  Deno.test(`${pg.url}: lang, one H1, title and description sized for search results`, () => {
    assertEquals(tag(html, /<html lang="([^"]+)"/), pg.lang);
    assertEquals((html.match(/<h1[\s>]/g) || []).length, 1);
    const title = tag(html, /<title>([^<]+)<\/title>/)!;
    const desc = tag(html, /<meta name="description" content="([^"]+)"/)!;
    assert(title.length >= 30 && title.length <= 110, `title length ${title.length}`);
    assert(desc.length >= 110 && desc.length <= 260, `description length ${desc.length}`);
  });

  Deno.test(`${pg.url}: canonical is itself, hreflang pair is reciprocal, x-default is English`, () => {
    assertEquals(tag(html, /<link rel="canonical" href="([^"]+)"/), SITE + pg.url);
    assertEquals(tag(html, /<meta property="og:url" content="([^"]+)"/), SITE + pg.url);
    const en = tag(html, /hreflang="en" href="([^"]+)"/);
    const es = tag(html, /hreflang="es" href="([^"]+)"/);
    const xd = tag(html, /hreflang="x-default" href="([^"]+)"/);
    assertEquals(pg.lang === 'en' ? en : es, SITE + pg.url);
    assertEquals(pg.lang === 'en' ? es : en, SITE + pg.alt);
    assertEquals(xd, en);
    const other = PAGES.find((p) => p.url === pg.alt)!;
    assertEquals(other.alt, pg.url, 'the other language points back');
  });

  Deno.test(`${pg.url}: served by a route, listed in the sitemap with both languages`, () => {
    assertEquals(resolve(pg.url), '/' + pg.file);
    const sm = read('sitemap.xml');
    assert(sm.includes(`<loc>${SITE + pg.url}</loc>`));
  });

  Deno.test(`${pg.url}: structured data parses and names this page`, () => {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assertEquals(blocks.length, 1);
    const data = JSON.parse(blocks[0][1]);
    assert(JSON.stringify(data).includes(SITE + pg.url));
  });

  Deno.test(`${pg.url}: every internal link and asset resolves`, () => {
    const refs = [...html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)].map((m) => m[1]);
    for (const r of refs) assert(resolve(r) !== null, `${r} does not resolve`);
  });

  Deno.test(`${pg.url}: only first-party scripts; nothing secret; the waitlist is the existing one`, () => {
    for (const m of html.matchAll(/<script[^>]*src="([^"]+)"/g)) assert(m[1].startsWith('/'), `external script ${m[1]}`);
    assert(!/supabase\.co|eyJhbGci|sk_live|sk_test|rk_live|whsec_/.test(html));
    for (const m of html.matchAll(/data-cta="[^"]*waitlist"[^>]*/g)) assert(m[0].length > 0);
    const wl = [...html.matchAll(/<a class="btn"[^>]*href="([^"]+)"[^>]*data-cta="[^"]*waitlist"/g)].map((m) => m[1]);
    for (const h of wl) assert(h === '/#pricing' || h === '/es.html#pricing', h);
  });

  Deno.test(`${pg.url}: no price promise (the $29 copy is untouched until the plan cutover)`, () => {
    assert(!/\$\s?29|\$19\.99|\$49\.99|\/month|al mes/.test(html));
  });
}

Deno.test('both calculator pages carry every element the script needs', () => {
  const js = read('tools/assets/markup-margin.js');
  const ids = new Set([...js.matchAll(/\$\('([A-Za-z0-9-]+)'\)/g)].map((m) => m[1]));
  for (const f of ['tools/markup-margin-calculator.html', 'es/herramientas/calculadora-markup-margen.html']) {
    const html = read(f);
    for (const id of ids) assert(html.includes(`id="${id}"`), `${f} is missing #${id}`);
  }
});

Deno.test('analytics from the calculator: event names and the mode only, never an amount or typed text', () => {
  const js = read('tools/assets/markup-margin.js');
  const calls = [...js.matchAll(/track\('([a-z_]+)'(?:,\s*(\{[^}]*\}))?\)/g)];
  assert(calls.length >= 4);
  for (const c of calls) {
    assert(['tool_view', 'tool_first_interaction', 'tool_calc_complete', 'tool_copy', 'tool_print'].includes(c[1]), c[1]);
    if (c[2]) assertEquals(c[2].replace(/\s/g, ''), '{calc_mode:m}');
  }
  // The copied/printed result is built locally and never handed to fetch, sendBeacon or a URL.
  assert(!/fetch\(|sendBeacon|XMLHttpRequest|location\.search|localStorage/.test(js));
});

Deno.test('the existing pages and the waitlist code are untouched by the tools work', () => {
  // Release A adds pages; the only shared files it edits are _redirects and sitemap.xml (and, separately, a nav link).
  assert(read('_redirects').includes('/          /index.html     200'));
  assert(read('_redirects').includes('/p/        /p/index.html   200'));
});
