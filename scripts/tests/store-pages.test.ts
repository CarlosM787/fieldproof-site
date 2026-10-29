// Store-required pages: support (App Store / Play support URL) and delete-account (Google Play's
// account-deletion page). They must describe the app exactly as built on fieldproof
// feat/account-deletion (Settings → Delete account), in English and Spanish, and every link must resolve.
// Run with:  npx deno test --allow-read scripts/tests/store-pages.test.ts

import { assert, assertEquals } from 'jsr:@std/assert@1';

const read = (p: string) => Deno.readTextFileSync(new URL(`../../${p}`, import.meta.url));
const exists = (p: string) => { try { Deno.statSync(new URL(`../../${p}`, import.meta.url)); return true; } catch { return false; } };
const PAGES = ['support.html', 'delete-account.html'];

Deno.test('both pages exist with their canonical address and a Spanish section', () => {
  for (const p of PAGES) {
    const html = read(p);
    assert(html.includes(`<link rel="canonical" href="https://talkestimate.com/${p}" />`), p);
    assert(html.includes('<div id="es" lang="es">'), `${p} has Spanish`);
    assert(html.includes('href="#es"'), `${p} links to its Spanish section`);
  }
});

Deno.test('every internal link points at a file that exists', () => {
  for (const p of [...PAGES, 'privacy.html']) {
    for (const [, href] of read(p).matchAll(/href="\/([a-z0-9-]+\.html)(?:#[a-z]+)?"/g)) assert(exists(href), `${p} -> ${href}`);
  }
});

Deno.test('the in-app path uses the app\'s real labels (EN and ES)', () => {
  const del = read('delete-account.html');
  for (const label of ['<b>Settings</b>', '<b>Delete account</b>', '<b>Continue</b>', '<b>Delete my account</b>',
    '<b>Ajustes</b>', '<b>Eliminar cuenta</b>', '<b>Continuar</b>', '<b>Eliminar mi cuenta</b>']) {
    assert(del.includes(label), label);
  }
  const sup = read('support.html');
  assert(sup.includes('Settings → Subscription → Manage subscription'));
  assert(sup.includes('Ajustes → Suscripción → Administrar suscripción'));
});

Deno.test('Google Play content: what is deleted, what is kept and for how long, and the email path', () => {
  const del = read('delete-account.html');
  for (const s of ['What is deleted', 'What is kept, and for how long', 'Stripe', 'Supabase', 'OpenAI', 'within 30 days',
    'mailto:carlos@moraleslabs.com', 'Qué se borra', 'Qué se guarda y por cuánto tiempo']) {
    assert(del.includes(s), s);
  }
});

Deno.test('no unfilled placeholders or stale claims', () => {
  for (const p of [...PAGES, 'privacy.html']) {
    const text = read(p).replace(/<!--[\s\S]*?-->/g, '');
    assertEquals(/\[(OPERATOR|BACKUP_DAYS|STATE)\]/.test(text), false, p);
  }
  assertEquals(read('privacy.html').includes('There is no delete button in the app yet'), false);
  assert(read('privacy.html').includes('href="/delete-account.html"'));
});

Deno.test('the sitemap lists both pages', () => {
  const sm = read('sitemap.xml');
  for (const p of PAGES) assert(sm.includes(`<loc>https://talkestimate.com/${p}</loc>`), p);
});
