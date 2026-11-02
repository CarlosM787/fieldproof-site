// "Does it work with no signal?" must say only what the app was seen to do (local QA, 2026-11-01:
// fieldproof-release-evidence\2026-11-01-quality-baseline\D04_REPRO.md and the mid-edit backend cut).
// Seen: a walkthrough recorded with no signal stays on the phone, survives the app closing, and goes up
// after "Retry Uploads". Not true: the estimate list, new estimates and the editor need the backend.
// Run with:  npx deno test --allow-read scripts/tests/offline-claims.test.ts

import { assert } from 'jsr:@std/assert@1';

const read = (p: string) => Deno.readTextFileSync(new URL(`../../${p}`, import.meta.url));
const SKIP = new Set(['.git', 'node_modules', 'scripts', '.cf-dist', '.cf-staging', '.wrangler']);
function htmlPages(dir = ''): string[] {
  const out: string[] = [];
  for (const e of Deno.readDirSync(new URL(`../../${dir}`, import.meta.url))) {
    if (SKIP.has(e.name)) continue;
    const p = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory) out.push(...htmlPages(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const PAGES = htmlPages();

Deno.test('no page promises that drafts are on the phone or that a dead zone costs nothing', () => {
  for (const p of PAGES) {
    const text = read(p).replace(/<!--[\s\S]*?-->/g, '');
    for (const claim of [/drafts (are|stay) saved on your phone/i, /Drafts saved on your phone/i, /dead zone never/i,
      /borradores se (guardan|quedan guardados) en tu teléfono/i, /nunca te cuesta el trabajo/i]) {
      assert(!claim.test(text), `${p}: ${claim}`);
    }
  }
});

Deno.test('the no-signal answer says what works and what needs a signal (EN and ES)', () => {
  const en = read('index.html');
  assert(en.includes('<summary>Does it work with no signal?</summary><p>Partly.'));
  for (const s of ['the recording stays on your phone, even if the app closes', '“Retry Uploads.”',
    'Starting a new estimate, opening the ones you’ve saved, turning a walkthrough into an estimate and sending it all need a signal']) {
    assert(en.includes(s), s);
  }
  const es = read('es.html');
  assert(es.includes('<summary>¿Funciona sin señal?</summary><p>En parte.'));
  for (const s of ['la grabación se queda en tu teléfono, aunque se cierre la app', '“Reintentar Subidas.”',
    'Para empezar un estimado nuevo, abrir los que ya guardaste, convertir el recorrido en estimado y mandarlo sí se necesita señal']) {
    assert(es.includes(s), s);
  }
});
