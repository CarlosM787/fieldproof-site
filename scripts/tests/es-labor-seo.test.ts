// V6 batch 9 (demand, from Growth's Search Console read of 11/14, 28 days 10/16-11/12): the Spanish labor-pricing pages
// are the only TalkEstimate cluster on Google's page 1 / page-1 edge, with 0 clicks:
//   /es/herramientas/calculadora-costo-hora-mano-de-obra  pos 7.2  (22 impressions)
//   /es/guias/como-cobrar-mano-de-obra                    pos 9.6  (32)
//   /es/herramientas/calculadora-mano-de-obra-cotizacion  pos 11.2 (96, the site's only click; left as it is)
//   queries "mano de obra por" (9.0), "como cobrar la mano de obra de un trabajo" (11.0); "calculadora de markup" at 71.
// So: the two page-1 pages get titles and descriptions in the words of those searches (H1, og and JSON-LD unchanged),
// and the labor pages get internal links from the markup and painting tools (which had none) and to the markup tool.
// Run with:  npx deno test --allow-read scripts/tests/es-labor-seo.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';

const root = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, root)).replace(/\r\n/g, '\n');
const title = (h: string) => /<title>([^<]+)<\/title>/.exec(h)?.[1] ?? '';
const desc = (h: string) => /<meta name="description" content="([^"]+)" \/>/.exec(h)?.[1] ?? '';

const RATE = 'es/herramientas/calculadora-costo-hora-mano-de-obra.html';
const GUIDE = 'es/guias/como-cobrar-mano-de-obra.html';
const QUOTE = 'es/herramientas/calculadora-mano-de-obra-cotizacion.html';
const MARKUP = 'es/herramientas/calculadora-markup-margen.html';
const PAINT = 'es/herramientas/calculadora-estimado-pintura.html';

Deno.test('the two page-1 pages: titles and descriptions use the words people search', () => {
  const r = read(RATE), g = read(GUIDE);
  assertEquals(title(r), 'Costo de mano de obra por hora: calculadora | TalkEstimate');
  assertEquals(title(g), 'Cómo cobrar la mano de obra de un trabajo | TalkEstimate');
  assert(desc(r).startsWith('¿Cuánto te cuesta de verdad una hora de mano de obra?'));
  assert(desc(g).startsWith('Cómo cobrar la mano de obra de un trabajo:'));
  for (const h of [r, g]) {
    assert([...title(h)].length <= 60, title(h));
    assert(desc(h).length <= 155, `${desc(h).length}`);
  }
});

Deno.test('what the pages say did not change: H1, og:title and the guide headline stay', () => {
  const r = read(RATE), g = read(GUIDE);
  assert(r.includes('<h1>Calculadora de costo por hora de mano de obra para contratistas</h1>'));
  assert(r.includes('<meta property="og:title" content="Calculadora de costo por hora de mano de obra para contratistas" />'));
  assert(g.includes('<h1>Cómo cobrar la mano de obra en un trabajo y armar la cotización</h1>'));
  assert(g.includes('"headline": "Cómo cobrar la mano de obra en un trabajo y armar la cotización"'));
});

Deno.test('the quote tool, the only page with a click, keeps its title and description', () => {
  const q = read(QUOTE);
  assertEquals(title(q), 'Calculadora de mano de obra y cotización | TalkEstimate');
  assert(desc(q).startsWith('Calculadora gratis de mano de obra y cotización:'));
});

Deno.test('internal links into the labor cluster and to the markup tool, each with its own click name', () => {
  const links: [string, string, string][] = [
    [MARKUP, '/es/herramientas/calculadora-costo-hora-mano-de-obra', 'markup_to_rate_tool'],
    [MARKUP, '/es/herramientas/calculadora-mano-de-obra-cotizacion', 'markup_to_quote_tool'],
    [PAINT, '/es/herramientas/calculadora-costo-hora-mano-de-obra', 'painting_to_rate_tool'],
    [PAINT, '/es/guias/como-cobrar-mano-de-obra', 'painting_to_labor_guide'],
    [QUOTE, '/es/herramientas/calculadora-markup-margen', 'quote_tool_to_markup'],
  ];
  for (const [page, href, cta] of links) {
    const h = read(page);
    assertEquals((h.match(new RegExp(`<a href="${href}" data-cta="${cta}">`, 'g')) ?? []).length, 1, `${page} -> ${href}`);
  }
});

Deno.test('the new links sit in the page body, outside the FAQ', () => {
  for (const [page, cta] of [[MARKUP, 'markup_to_rate_tool'], [PAINT, 'painting_to_rate_tool'], [QUOTE, 'quote_tool_to_markup']]) {
    const h = read(page);
    const at = h.indexOf(`data-cta="${cta}"`);
    const faq = h.indexOf('<details><summary>');
    assert(at > 0 && (faq < 0 || at < faq), `${page}: link before the FAQ`);
  }
});
