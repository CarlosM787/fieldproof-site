// Small SEO pins from MCR5's 2026-11-04 tracking/SEO audit (WO-20261104-04):
//   S2  no internal link points at /index.html (the home page's canonical is /)
//   S4  the hubs and the markup calculator pages have titles that fit a search result (<= 65 characters),
//       and the Spanish calculator's title starts with "Calculadora de markup"
//   S3  privacy and terms carry an og:title for link previews
// Run with:  npx deno test --allow-read scripts/tests/seo-basics.test.ts

import { assert } from 'jsr:@std/assert@1';

const read = (p: string) => Deno.readTextFileSync(new URL(`../../${p}`, import.meta.url));
const title = (html: string) => /<title>([^<]+)<\/title>/.exec(html)![1];

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of Deno.readDirSync(new URL(`../../${dir}`, import.meta.url))) {
    const p = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory && !['scripts', 'node_modules', '.git', '.cf-dist'].includes(e.name) && !e.name.startsWith('.')) out.push(...htmlFiles(p));
    else if (e.isFile && e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

Deno.test('S2: no internal link points at index.html; the home page is linked as /', () => {
  const files = htmlFiles('');
  assert(files.length > 15, 'found the site pages');
  for (const f of files) {
    assert(!/href="(\/|\.\.\/)*index\.html/.test(read(f)), `${f} links to index.html`);
  }
  assert(read('es.html').includes('<a class="lt" href="/">EN</a>'));
});

Deno.test('S4: hub and markup calculator titles fit a search result; the Spanish one leads with "Calculadora de markup"', () => {
  for (const f of ['tools/index.html', 'es/herramientas/index.html', 'tools/markup-margin-calculator.html', 'es/herramientas/calculadora-markup-margen.html']) {
    const t = title(read(f));
    assert(t.length <= 65, `${f}: ${t.length} characters`);
    assert(t.endsWith('| TalkEstimate'), f);
  }
  assert(title(read('es/herramientas/calculadora-markup-margen.html')).startsWith('Calculadora de markup'));
});

Deno.test('S3: privacy and terms have an og:title', () => {
  for (const f of ['privacy.html', 'terms.html']) {
    assert(/<meta property="og:title" content="TalkEstimate — [^"]+" \/>/.test(read(f)), f);
  }
});
