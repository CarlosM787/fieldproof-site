// SEO guides 2026-11 (Growth: TE_V5_SEO_PRICING_EVIDENCE_2026-11-10 §5 gaps EN #14 / ES #9 / ES #13). Draft for the Advisor.
// Truthful under public state B: no release, store or early-access claim; the app is described only by what it does.
import { assert, assertEquals } from 'jsr:@std/assert@1';

const ROOT = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, ROOT));
const SITE = 'https://talkestimate.com';
const EN_B = 'Not released yet — Android coming soon';
const ES_B = 'Todavía no disponible — pronto en Android';
const PAGES = [
  { file: 'guides/how-to-write-an-estimate.html', url: '/guides/how-to-write-an-estimate', lang: 'en', b: EN_B },
  { file: 'es/guias/como-hacer-un-estimado.html', url: '/es/guias/como-hacer-un-estimado', lang: 'es', b: ES_B },
  { file: 'es/guias/estimado-en-ingles.html', url: '/es/guias/estimado-en-ingles', lang: 'es', b: ES_B },
];
const visible = (h: string) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ');

for (const pg of PAGES) {
  Deno.test(`${pg.url}: public state B, no store/early-access/plan-price claims`, () => {
    const h = read(pg.file);
    assert(h.includes(pg.b), 'carries the approved B phrase');
    assert(!/early access|acceso anticipado|Google Play|App Store|available now|ya disponible|download|descarga/i.test(visible(h)), 'no release claim');
    assert(!/\$(20|35|19\.99|49\.99|29)\b/.test(visible(h).replace(/\$(120|180|215|560|645|860)\.00/g, '')), 'no plan price on a guide');
    assert(!/(the|la) (AI|IA) (sets|pone) (a |un )?price/i.test(visible(h)) || /never sets a price|nunca pone un precio/i.test(h));
  });
  Deno.test(`${pg.url}: route, sitemap, canonical and one H1`, () => {
    const h = read(pg.file);
    assert(read('_redirects').split(/\r?\n/).some((l) => l.trim().split(/\s+/)[0] === pg.url && l.includes(`${pg.url}.html`) && l.trim().endsWith('200')), 'route');
    assert(read('sitemap.xml').includes(`<loc>${SITE}${pg.url}</loc>`), 'sitemap');
    assert(h.includes(`<link rel="canonical" href="${SITE}${pg.url}" />`));
    assertEquals((h.match(/<h1>/g) ?? []).length, 1);
    assert(h.includes(`<html lang="${pg.lang}">`));
  });
}

Deno.test('the EN/ES "write an estimate" pair is reciprocal; the ES-only English-estimate guide points only at itself', () => {
  const en = read('guides/how-to-write-an-estimate.html'), es = read('es/guias/como-hacer-un-estimado.html'), w = read('es/guias/estimado-en-ingles.html');
  for (const h of [en, es]) {
    assert(h.includes(`hreflang="en" href="${SITE}/guides/how-to-write-an-estimate"`));
    assert(h.includes(`hreflang="es" href="${SITE}/es/guias/como-hacer-un-estimado"`));
    assert(h.includes(`hreflang="x-default" href="${SITE}/guides/how-to-write-an-estimate"`));
  }
  assert(w.includes(`hreflang="es" href="${SITE}/es/guias/estimado-en-ingles"`) && w.includes(`hreflang="x-default" href="${SITE}/es/guias/estimado-en-ingles"`));
  assert(!w.includes('hreflang="en" href='), 'no English twin is claimed');
  const sm = read('sitemap.xml');
  const block = sm.slice(sm.indexOf(`<loc>${SITE}/es/guias/estimado-en-ingles</loc>`));
  assert(!block.slice(0, block.indexOf('</url>')).includes('hreflang="en"'));
});

Deno.test('the worked example adds up (EN, ES and the English sample on the ES guide)', () => {
  const lines = [120, 560, 180];
  const total = lines.reduce((a, b) => a + b, 0);
  assertEquals(total, 860);
  assertEquals(total * 0.25, 215);
  assertEquals(total - 215, 645);
  for (const f of PAGES.map((p) => p.file)) {
    const h = read(f);
    for (const n of ['$120.00', '$560.00', '$180.00', '$860.00', '$215.00', '$645.00']) assert(h.includes(n), `${f}: ${n}`);
  }
});

Deno.test('the English-estimate guide: glossary, phrases and the US formats are there, and the app claim matches what the app does', () => {
  const w = read('es/guias/estimado-en-ingles.html');
  for (const [es, en] of [['Mano de obra', 'Labor'], ['Anticipo', 'Deposit'], ['Orden de cambio', 'Change order'], ['No incluye', 'Not included'], ['Pies cuadrados (pies²)', 'Square feet (sq ft)']]) {
    assert(w.includes(`<tr><td>${es}</td><td lang="en">${en}</td></tr>`), es);
  }
  assert(w.includes('This estimate is valid for 30 days.'));
  assert(w.includes('$1,250.50') && w.includes('November 10, 2026'));
  // The app picks the customer's document language; built-in labels/services follow it; typed text is NOT translated.
  assert(w.includes('eliges en qué idioma lo recibe tu cliente'));
  assert(w.includes('lo que tú escribas sale tal como lo escribiste'));
  assert(!/traduce (todo|automáticamente)|translates everything/i.test(w));
});

Deno.test('internal links on the new pages resolve to served pages', () => {
  const routes = new Set(read('_redirects').split(/\r?\n/).map((l) => l.trim().split(/\s+/)[0]).filter(Boolean));
  for (const pg of PAGES) {
    for (const m of read(pg.file).matchAll(/href="(\/[^"#?]*)/g)) {
      const href = m[1];
      if (/\.(css|png|svg|js|woff2|html)$/.test(href)) { try { Deno.statSync(new URL(href.slice(1), ROOT)); } catch { throw new Error(`${pg.file}: missing ${href}`); } continue; }
      assert(routes.has(href) || href === '/', `${pg.file}: no route for ${href}`);
    }
  }
});

Deno.test('the tools hubs list the new guides', () => {
  assert(read('tools/index.html').includes('<a class="card" href="/guides/how-to-write-an-estimate"'));
  const es = read('es/herramientas/index.html');
  assert(es.includes('<a class="card" href="/es/guias/como-hacer-un-estimado"') && es.includes('<a class="card" href="/es/guias/estimado-en-ingles"'));
});
