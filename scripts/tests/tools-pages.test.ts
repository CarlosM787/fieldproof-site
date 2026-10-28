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
  // Release B
  { file: 'tools/painting-estimate-calculator.html', url: '/tools/painting-estimate-calculator', alt: '/es/herramientas/calculadora-estimado-pintura', lang: 'en' },
  { file: 'es/herramientas/calculadora-estimado-pintura.html', url: '/es/herramientas/calculadora-estimado-pintura', alt: '/tools/painting-estimate-calculator', lang: 'es' },
  { file: 'tools/labor-job-quote-calculator.html', url: '/tools/labor-job-quote-calculator', alt: '/es/herramientas/calculadora-mano-de-obra-cotizacion', lang: 'en' },
  { file: 'es/herramientas/calculadora-mano-de-obra-cotizacion.html', url: '/es/herramientas/calculadora-mano-de-obra-cotizacion', alt: '/tools/labor-job-quote-calculator', lang: 'es' },
  { file: 'guides/how-to-estimate-a-paint-job.html', url: '/guides/how-to-estimate-a-paint-job', alt: '/es/guias/como-estimar-pintura', lang: 'en' },
  { file: 'es/guias/como-estimar-pintura.html', url: '/es/guias/como-estimar-pintura', alt: '/guides/how-to-estimate-a-paint-job', lang: 'es' },
  { file: 'guides/how-to-price-labor.html', url: '/guides/how-to-price-labor', alt: '/es/guias/como-cobrar-mano-de-obra', lang: 'en' },
  { file: 'es/guias/como-cobrar-mano-de-obra.html', url: '/es/guias/como-cobrar-mano-de-obra', alt: '/guides/how-to-price-labor', lang: 'es' },
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

// Release B calculators: the same checks as Release A, per script and per page pair.
const RELEASE_B = [
  { js: 'tools/assets/painting-estimate.js', tool: 'painting_estimate', pages: ['tools/painting-estimate-calculator.html', 'es/herramientas/calculadora-estimado-pintura.html'] },
  { js: 'tools/assets/labor-quote.js', tool: 'labor_quote', pages: ['tools/labor-job-quote-calculator.html', 'es/herramientas/calculadora-mano-de-obra-cotizacion.html'] },
];
for (const t of RELEASE_B) {
  Deno.test(`${t.tool}: both pages carry every element the script needs, and load that script`, () => {
    const js = read(t.js);
    const ids = new Set([...js.matchAll(/\$\('([A-Za-z0-9-]+)'\)/g)].map((m) => m[1]));
    assert(ids.size > 10);
    for (const f of t.pages) {
      const html = read(f);
      for (const id of ids) assert(html.includes(`id="${id}"`), `${f} is missing #${id}`);
      assert(html.includes(`<script type="module" src="/${t.js}"></script>`), `${f} does not load ${t.js}`);
      assert(html.includes('class="tool-page tool-b"'), `${f}: print layout class`);
    }
  });

  Deno.test(`${t.tool}: analytics carry the tool name and the mode only, never an amount or typed text`, () => {
    const js = read(t.js);
    assert(js.includes(`makeTracker('${t.tool}')`));
    const calls = [...js.matchAll(/track\('([a-z_]+)'(?:,\s*(\{[^}]*\}))?\)/g)];
    assert(calls.length >= 5);
    for (const c of calls) {
      assert(['tool_view', 'tool_first_interaction', 'tool_calc_complete', 'tool_copy', 'tool_print'].includes(c[1]), c[1]);
      if (c[2]) assertEquals(c[2].replace(/\s/g, ''), '{calc_mode:m}');
    }
    // Every other call into teTrack goes through makeTracker; nothing typed reaches a request, a URL or storage.
    assertEquals((js.match(/teTrack/g) || []).length, 0);
    assert(!/fetch\(|sendBeacon|XMLHttpRequest|location\.search|localStorage|sessionStorage/.test(js));
  });
}

Deno.test('tool-ui.js: the only analytics path adds the tool name to the caller params, and sends nothing itself', () => {
  const js = read('tools/assets/tool-ui.js');
  assertEquals((js.match(/teTrack\(/g) || []).length, 1);
  assert(js.includes("window.teTrack(event, Object.assign({ tool_name: toolName }, params || {}))"));
  assert(!/fetch\(|sendBeacon|XMLHttpRequest|localStorage|sessionStorage/.test(js));
});

Deno.test('painting pages: no coverage or paint price is pre-filled or claimed as typical', () => {
  for (const f of ['tools/painting-estimate-calculator.html', 'es/herramientas/calculadora-estimado-pintura.html']) {
    const html = read(f);
    for (const id of ['cov', 'ppg']) {
      const input = new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)![0];
      assert(!/\svalue=/.test(input), `${f} #${id} has a value`);
      assert(!/placeholder="[1-9]/.test(input), `${f} #${id} has a numeric placeholder`);
    }
    // No coverage figure or range anywhere on the page ("350-400 sq ft per gallon", "rinde 400 pies²").
    assert(!/\d[\d,.]*\s*(?:–|-|to|a)?\s*\d*\s*(?:sq\.? ?ft|square feet|pies²|pies cuadrados)\s*(?:per|\/|por)\s*gal/i.test(html), `${f}: a coverage figure`);
  }
});

Deno.test('directories: the two Release B tools are live cards; the estimate template stays "coming next"', () => {
  for (const [f, links, soon] of [
    ['tools/index.html', ['/tools/painting-estimate-calculator', '/tools/labor-job-quote-calculator', '/guides/how-to-estimate-a-paint-job', '/guides/how-to-price-labor'], 'Free estimate template'],
    ['es/herramientas/index.html', ['/es/herramientas/calculadora-estimado-pintura', '/es/herramientas/calculadora-mano-de-obra-cotizacion', '/es/guias/como-estimar-pintura', '/es/guias/como-cobrar-mano-de-obra'], 'Plantilla de estimado gratis'],
  ] as const) {
    const html = read(f);
    for (const l of links) assert(html.includes(`<a class="card" href="${l}"`), `${f}: no live card for ${l}`);
    const soonCards = html.split(/\r?\n/).filter((line) => line.includes('class="card soon"'));
    assertEquals(soonCards.length, 1, `${f}: one coming-next card`);
    assert(soonCards[0].includes(soon));
  }
});

Deno.test('the existing pages and the waitlist code are untouched by the tools work', () => {
  // Release A adds pages; the only shared files it edits are _redirects and sitemap.xml (and, separately, a nav link).
  assert(read('_redirects').includes('/          /index.html     200'));
  assert(read('_redirects').includes('/p/        /p/index.html   200'));
});
