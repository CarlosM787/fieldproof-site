// Operator of TalkEstimate (Carlos, 2026-10-28 in MCR5: "ITs Morales Labs llc"): Morales Labs LLC, an Arizona
// limited liability company, is named on every legal and store page (EN, and ES where the page has Spanish), in
// every footer and in the Organization JSON-LD. No address is published (undecided). The terms describe live billing.
// Run with:  npx deno test --allow-read scripts/tests/operator.test.ts

import { assert, assertEquals } from 'jsr:@std/assert@1';

const ROOT = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, ROOT));

function htmlFiles(dir = ''): string[] {
  const out: string[] = [];
  for (const e of Deno.readDirSync(new URL(dir || '.', ROOT))) {
    const p = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'scripts') continue;
      out.push(...htmlFiles(p));
    } else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const EN = 'TalkEstimate is operated by <b>Morales Labs LLC</b>, an Arizona limited liability company';
const ES = 'TalkEstimate es operado por <b>Morales Labs LLC</b>, una compañía de responsabilidad limitada de Arizona';

Deno.test('every legal and store page names the operator (EN, plus ES where the page has Spanish)', () => {
  for (const p of ['terms.html', 'privacy.html', 'support.html', 'delete-account.html']) {
    const html = read(p);
    assert(html.includes(EN), `${p} EN`);
    if (html.includes('lang="es"')) assert(html.includes(ES), `${p} ES`);
  }
  assert(read('terms.html').includes('("we", "us")'), 'terms say who "we" are');
  assert(read('privacy.html').includes('"we" means Morales Labs LLC'), 'privacy says who "we" are');
});

Deno.test('every footer credits Morales Labs LLC; no page still credits only the brand; no old operator', () => {
  const files = htmlFiles();
  assert(files.length > 10, 'found the site pages');
  for (const f of files) {
    const html = read(f);
    assert(!html.includes('© 2026 TalkEstimate'), `${f} footer`);
    // AmplifyWebX LLC appears only as the current Stripe merchant, in the terms' billing section.
    if (f !== 'terms.html') assert(!/amplifywebx/i.test(html), `${f} names no old operator`);
  }
  for (const f of ['index.html', 'es.html']) {
    assert(read(f).includes('© 2026 Morales Labs LLC'), `${f} footer`);
    assert(read(f).includes('"legalName": "Morales Labs LLC"'), `${f} JSON-LD`);
  }
});

Deno.test('terms: AmplifyWebX LLC only as the payment merchant, never as operator', () => {
  const t = read('terms.html');
  assertEquals((t.match(/AmplifyWebX/g) ?? []).length, 1);
  assert(t.includes('the merchant for TalkEstimate payments is <b>AmplifyWebX LLC</b>'));
});

Deno.test('no street address is published (undecided for safety)', () => {
  for (const p of ['terms.html', 'privacy.html', 'support.html', 'delete-account.html', 'index.html', 'es.html']) {
    const text = read(p).replace(/<[^>]+>/g, ' ');
    assert(!/\b\d{2,6}\s+[A-Z][a-z]+\s+(St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Ln|Way)\b/.test(text), `${p} has no street address`);
    assert(!/"address"\s*:/.test(read(p)), `${p} JSON-LD has no address`);
  }
});

Deno.test('terms describe billing as it is live (since 2026-10-27), with no refund promise', () => {
  const t = read('terms.html');
  assert(!/not live\s+yet|no one is charged until/i.test(t), 'stale "billing not live" sentence is gone');
  assert(t.includes('billed monthly, in advance, through Stripe'));
  assert(t.includes('A paid plan stays active until'), 'cancel at period end (Stripe portal setting)');
  assert(t.includes('cancels your\n      subscription right away') || t.includes('cancels your\r\n      subscription right away'), 'account deletion cancels now');
  assert(!/refund/i.test(t), 'no refund statement until Carlos approves one (09_ draft)');
  assertEquals((t.match(/Last updated: October 28, 2026/g) ?? []).length, 1);
});
