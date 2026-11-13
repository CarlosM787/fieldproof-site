// Advisor pass 40 P3-3: the estimate template pages get their own social preview image (EN + ES) instead of the
// generic "free tools" card. Made by scripts/brand/og.mjs (cards og-template-en / og-template-es) from the
// template's own example: 3 of its 5 lines and the subtotal of all 5, $854.40.
// Run with:  npx deno test --allow-read scripts/tests/share-image-template.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';

const root = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, root)).replace(/\r\n/g, '\n');
const SITE = 'https://talkestimate.com';

function pngSize(p: string) {
  const b = Deno.readFileSync(new URL(p, root));
  assertEquals([...b.slice(1, 4)].map((c) => String.fromCharCode(c)).join(''), 'PNG', `${p} is a PNG`);
  const v = new DataView(b.buffer, b.byteOffset);
  return [v.getUint32(16), v.getUint32(20)];
}

for (const [page, lang] of [['tools/estimate-template.html', 'en'], ['es/herramientas/plantilla-de-estimado.html', 'es']]) {
  Deno.test(`${page}: its own share image, the same one for Open Graph and X`, () => {
    const h = read(page);
    const url = `${SITE}/assets/og/og-template-${lang}.png`;
    assert(h.includes(`<meta property="og:image" content="${url}" />`), 'og:image');
    assert(h.includes(`<meta name="twitter:image" content="${url}" />`), 'twitter:image');
    assert(!h.includes('og-tools-'), 'not the generic tools card');
    assertEquals(pngSize(`assets/og/og-template-${lang}.png`), [1200, 630]);
  });
}

Deno.test('the card figures are the template example: 285 + 4.5 × 62 + 64 × 2.25 + 86.40 + 60 = 854.40', () => {
  const og = read('scripts/brand/og.mjs');
  const js = read('tools/assets/estimate-template.js');
  for (const price of ["price: '285'", "qty: '4.5'", "price: '62'", "qty: '64'", "price: '2.25'", "price: '86.40'", "price: '60'"]) {
    assert(js.includes(price), `example still has ${price}`);
  }
  const cents = [28500, 450 * 62, 64 * 225, 8640, 6000];
  assertEquals(cents.reduce((a, b) => a + b, 0), 85440);
  for (const lang of ['en', 'es']) {
    const card = og.split('\n').find((l) => l.includes(`['og-template-${lang}'`)) ?? '';
    for (const v of ['$285.00', '$279.00', '$144.00', '$854.40']) assert(card.includes(`'${v}'`), `${lang} card shows ${v}`);
  }
});
