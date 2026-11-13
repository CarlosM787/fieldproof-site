// V6 batch 7 (Carlos 11/12, §10 priority 3 "genuine app screenshots"): the home pages show four REAL screens of the
// Android store candidate vc6 925f3ca (LISTINGS/TALKESTIMATE/2026-11-13_BUILD_TRUTH_vc6: raw adb screencaps on a
// local backend with fictional accounts; nothing edited or mocked). Here they are only cropped (status bar and
// gesture-bar strip off) and resized to 480 px WebP. The dashboard shot is left out on purpose: it shows NEW-31 (the
// floating button over "+ Change") and REC-02 ("Approved" on a paid job).
// Run with:  npx deno test --allow-read scripts/tests/home-screens.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';

const root = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, root)).replace(/\r\n/g, '\n');
const SHOTS = ['1-price', '2-preview', '3-change', '4-invoice'];

function webpSize(p: string): [number, number] {
  const b = Deno.readFileSync(new URL(p, root));
  const tag = (o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));
  assertEquals(tag(0, 4), 'RIFF', p);
  assertEquals(tag(8, 4), 'WEBP', p);
  const kind = tag(12, 4);
  if (kind === 'VP8 ') return [((b[27] << 8) | b[26]) & 0x3fff, ((b[29] << 8) | b[28]) & 0x3fff];
  if (kind === 'VP8X') return [1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16))];
  if (kind === 'VP8L') {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  throw new Error(`${p}: unknown WebP chunk ${kind}`);
}

for (const [page, lang] of [['index.html', 'en'], ['es.html', 'es']]) {
  const html = read(page);
  const sec = html.slice(html.indexOf('<section id="screens">'), html.indexOf('</section>', html.indexOf('<section id="screens">')));

  Deno.test(`${page}: one real-screens section, after the demo and before the hidden video`, () => {
    assertEquals((html.match(/<section id="screens">/g) ?? []).length, 1);
    const at = html.indexOf('<section id="screens">');
    assert(at > html.indexOf('<section class="alt" id="demo">') && at < html.indexOf('<section id="video" hidden>'));
  });

  Deno.test(`${page}: four screens in this page's language, lazy, sized, with real alt text`, () => {
    const imgs = [...sec.matchAll(/<img src="\/assets\/screens\/([a-z]{2})-([0-9a-z-]+)\.webp" width="(\d+)" height="(\d+)" loading="lazy" decoding="async" alt="([^"]{40,})">/g)];
    assertEquals(imgs.length, 4);
    assertEquals(imgs.map((m) => m[2]), SHOTS);
    for (const m of imgs) {
      assertEquals(m[1], lang, 'the Spanish page shows the Spanish app');
      assertEquals(webpSize(`assets/screens/${m[1]}-${m[2]}.webp`), [Number(m[3]), Number(m[4])], 'width/height match the file (no layout shift)');
    }
    assertEquals((sec.match(/<figcaption><b>/g) ?? []).length, 4);
  });

  Deno.test(`${page}: the screens are labeled as a test build with made-up data, not released`, () => {
    const note = /<p class="shots-note">([^<]+)<\/p>/.exec(sec)?.[1] ?? '';
    if (lang === 'en') {
      assert(note.includes('Real screenshots of the Android test build') && note.includes('are made up') && note.includes('Not released yet'), note);
    } else {
      assert(note.includes('Capturas reales de la versión de prueba para Android') && note.includes('son inventadas') && note.includes('Todavía no está disponible'), note);
    }
  });

  Deno.test(`${page}: the phone strip scrolls by keyboard and the page never scrolls sideways`, () => {
    assert(sec.includes('<div class="shots" tabindex="0" role="region" aria-label="'), 'focusable named region');
    assert(html.includes('#screens .shots:focus-visible'), 'visible focus');
    assert(/@media \(max-width: 900px\) \{ #screens \.shots \{ display: flex; overflow-x: auto;/.test(html), 'scrolls inside its own box');
  });
}

Deno.test('the eight screen files: 480 px wide WebP, under 40 KB each, and only these', () => {
  const files = [...Deno.readDirSync(new URL('assets/screens/', root))].map((e) => e.name).sort();
  assertEquals(files, ['en', 'es'].flatMap((l) => SHOTS.map((s) => `${l}-${s}.webp`)).sort());
  for (const f of files) {
    const [w] = webpSize(`assets/screens/${f}`);
    assertEquals(w, 480, f);
    assert(Deno.statSync(new URL(`assets/screens/${f}`, root)).size < 40_000, f);
  }
});

Deno.test('captions claim only what the shots show', () => {
  const en = read('index.html');
  for (const s of ['Every line shows its price and where it came from.', 'What your customer will see, in English or Spanish.',
    'Extra work priced from your list, sent for approval.', 'The invoice includes the change order. Mark it paid.']) assert(en.includes(s), s);
  for (const bad of ['AI', 'automatic', 'instantly']) {
    const sec = en.slice(en.indexOf('<section id="screens">'), en.indexOf('</section>', en.indexOf('<section id="screens">')));
    assert(!new RegExp(`\\b${bad}\\b`).test(sec), `no "${bad}" claim in the screens section`);
  }
});
