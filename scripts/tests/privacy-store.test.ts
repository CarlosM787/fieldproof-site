// Privacy policy for the store launch (WO-20261106-03 + MCR5 add-on): EN and ES, every claim checked against
// the app code in fieldproof (lib/analytics.ts, lib/crash-reporting.ts, app/(app)/feedback.tsx,
// estimate/send.tsx rateEase, estimate/customer.tsx pickFromContacts, settings/import-prices.tsx).
// Run with:  npx deno test --allow-read scripts/tests/privacy-store.test.ts

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';

const html = Deno.readTextFileSync(new URL('../../privacy.html', import.meta.url));
const flat = html.replace(/\s+/g, ' ');
const es = flat.slice(flat.indexOf('<div id="es" lang="es">'));
const en = flat.slice(0, flat.indexOf('<div id="es" lang="es">'));

Deno.test('EN and ES both present, linked, with the same sections', () => {
  assert(es.length > 2000 && en.includes('<a href="#es">Español</a>'));
  assertEquals((en.match(/<h2>/g) ?? []).length, (es.match(/<h2>/g) ?? []).length, 'same number of sections');
});

Deno.test('no stale "no delete button" sentence; email path is unconditional, in-app path marked deploy-dependent', () => {
  assertFalse(/no delete button/i.test(flat));
  for (const part of [en, es]) {
    assert(part.includes('<!-- DEPENDS:delete-account-deploy'), 'in-app deletion marked');
    const marker = part.indexOf('<!-- DEPENDS:delete-account-deploy');
    assert(part.indexOf('mailto:carlos@moraleslabs.com') < marker, 'email path comes first, outside the marker');
  }
  assert(en.includes('<b>Settings → Delete account</b> deletes your whole account') && es.includes('<b>Ajustes → Eliminar cuenta</b> borra toda tu cuenta'));
});

Deno.test('Stripe named as the payment processor; card numbers never seen', () => {
  assert(en.includes('paid plans are handled by Stripe, our payment processor') && en.includes('we never see or store your card number'));
  assert(es.includes('los procesa Stripe, nuestro procesador de pagos') && es.includes('nunca vemos ni guardamos el número de tu tarjeta'));
});

Deno.test('in-app usage events, error reports, feedback, one picked contact, price files on the device', () => {
  for (const s of ['linked to your account ID', 'Error reports keep a shortened error message', 'no third-party analytics, advertising or crash-reporting service',
    'the app reads only the one contact you pick', 'Your other contacts are never read or uploaded', 'is read on your phone and never uploaded',
    'Only the prices you confirm in the preview are saved to My Prices', 'one-tap rating after you send an estimate']) assert(en.includes(s), s);
  for (const s of ['ligados al ID de tu cuenta', 'Los reportes de errores guardan un mensaje de error recortado', 'no usa ningún servicio externo de analítica',
    'la app lee solo el contacto que eliges', 'Tus otros contactos nunca se leen ni se suben', 'se lee en tu teléfono y nunca se sube',
    'Solo los precios que confirmas en la vista previa se guardan en Mis Precios', 'la calificación de un toque']) assert(es.includes(s), s);
});

Deno.test('the GA4 server-event sentence (8dcc2ef, M8) is NOT in this branch', () => {
  assertFalse(/our server also tells Google Analytics|anonymous Analytics ID/i.test(flat));
});
