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
  // App labels sub.manage / sub.title. Google Play builds have no Manage subscription (consumption-only,
  // fieldproof lib/store-billing.ts), so email comes first and the button is "where the app shows it".
  const sup = read('support.html');
  assert(/use <b>Manage subscription<\/b>\s+on the app's <b>Your Plan<\/b> screen where the app shows it/.test(sup));
  assert(/usar\s+<b>Administrar suscripción<\/b> en la pantalla <b>Tu Plan<\/b> de la app donde\s+aparezca/.test(sup));
  // The web account page is the buy/manage path that works for every build (Android included).
  assert(sup.includes('<a href="/account/">account page</a>') && sup.includes('<a href="/es/cuenta/">página de cuenta</a>'));
  assert(!sup.includes('open the app and go to'), 'no in-app path that Android builds do not have');
});

Deno.test('Google Play content: what is deleted, what is kept and for how long, and the email path', () => {
  const del = read('delete-account.html');
  for (const s of ['What is deleted', 'What is kept, and for how long', 'Stripe', 'Supabase', 'OpenAI',
    'mailto:carlos@moraleslabs.com', 'Qué se borra', 'Qué se guarda y por cuánto tiempo']) {
    assert(del.includes(s), s);
  }
  // Only deadlines and claims Carlos approved (MCR5 owner decisions 2026-10-28: no inaccurate policies).
  // Carlos 2026-10-29: "Yes: promise 30 days." Same promise as the privacy policy (live since 2026-07-06).
  assert(del.includes('delete it within 30 days') && del.includes('en un plazo de 30 días'), '30-day promise EN/ES');
  assert(read('privacy.html').includes('within 30'), 'privacy promises the same 30 days');
  assertEquals((del.match(/\b\d+\s+(days|días)\b/gi) ?? []).length, 2, 'no other deadline on the page');
  assert(!/law requires|leyes fiscales/i.test(del), 'no claim about what the law requires');
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

Deno.test('refund policy (Carlos 2026-11-08): no proration or refund for unused portions except law / exception; cancel anytime, keep access, no renewal; EN/ES', () => {
  const norm = (s: string) => s.replace(/\s+/g, ' ');
  const terms = norm(read('terms.html')), support = norm(read('support.html'));
  const flat = (s: string) => s.replace(/\s+/g, ' ');
  assert(flat(terms).includes('Subscription payments are not prorated or refunded for unused portions of a billing month, except where required by law or under an applicable refund exception. If you think you were charged by mistake, email us within 30 days and we will review it.'));
  assert(flat(terms).includes('you are not charged for another renewal'), 'terms: no further renewals');
  assert(flat(terms).includes('A paid plan stays active until the end of the billing period you already paid for, so you keep access until then'), 'terms: keep access');
  assert(flat(support).includes('You can cancel anytime. You keep access through the billing period you already paid for, and you are not charged for another renewal after you cancel.'));
  assert(flat(support).includes('Subscription payments are not prorated or refunded for unused portions of a billing month, except where required by law or under an applicable refund exception.'));
  assert(flat(support).includes('Puedes cancelar cuando quieras. Conservas el acceso durante el periodo de facturación que ya pagaste y no se te cobra otra renovación después de cancelar.'));
  assert(flat(support).includes('Los pagos de la suscripción no se prorratean ni se reembolsan por la parte no usada de un mes de facturación, salvo cuando la ley lo exija o aplique una excepción de reembolso.'));
  assert(!/not refunded for partial months|no se reembolsan por meses parciales/.test(flat(terms) + flat(support)), 'old wording gone');
  for (const page of [terms, support]) assert(!/full refund|money-back|reembolso completo|garant[ií]a de devoluci/i.test(page), 'no refund guarantee');
});
