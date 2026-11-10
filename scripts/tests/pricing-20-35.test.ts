// Approved prices (Carlos, directive V5, 2026-11-10): Starter $20/month, Pro $35/month and NOT purchasable until
// Pro launches. They replace $19.99 / $49.99 (2026-10-27); the archived $29 plan never comes back.
// This file pins: no old price on any public page (the Terms history note is the one allowed mention), every Pro
// price is marked as coming after launch, EN and ES say the same numbers, and the account page only ever sells
// Starter. Run with:  npx deno test --allow-read scripts/tests/pricing-20-35.test.ts

import { assert, assertEquals } from 'jsr:@std/assert@1';

const root = new URL('../../', import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, root));

function htmlPages(dir = ''): string[] {
  const out: string[] = [];
  for (const e of Deno.readDirSync(new URL(dir || '.', root))) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory) {
      if (['node_modules', '.git', 'scripts', '.wrangler', 'dist'].includes(e.name)) continue;
      out.push(...htmlPages(rel));
    } else if (e.name.endsWith('.html')) out.push(rel);
  }
  return out;
}

const OLD = /\$\s?(19[.,]99|49[.,]99|29(?![\d.,]))(?!\d)/;

Deno.test('no public page shows an old price ($19.99, $49.99 or $29), outside the Terms history note', () => {
  const pages = htmlPages();
  assert(pages.length > 20, `found ${pages.length} pages`);
  for (const p of pages) {
    let html = read(p);
    if (p === 'terms.html') html = html.replace(/<p class="updated">[\s\S]*?<\/p>/g, '');
    const m = html.match(OLD);
    assert(!m, `${p} still shows ${m?.[0]}`);
  }
  assert(!OLD.test(read('assets/account.js').replace(/var LEGACY_PRICE = '\$29';/, '')), 'account.js shows an old price');
});

Deno.test('home pages EN and ES show $20 Starter and $35 Pro in the strip, the plan cards and the closing line', () => {
  const en = read('index.html'), es = read('es.html');
  for (const s of ['<b>Starter</b> $20/mo', '<b>Pro</b> $35/mo <i>after launch</i>', '<div class="p-price">$20<small>/month</small>',
    '<div class="p-price">$35<small>/month</small>', 'Starter $20/month when it opens; Pro $35/month after launch.']) assert(en.includes(s), s);
  for (const s of ['<b>Starter</b> $20/mes', '<b>Pro</b> $35/mes <i>después del lanzamiento</i>', '<div class="p-price">$20<small>/mes</small>',
    '<div class="p-price">$35<small>/mes</small>', 'Starter a $20/mes cuando abra; Pro a $35/mes después del lanzamiento.']) assert(es.includes(s), s);
});

Deno.test('every $35 on a page sits next to an "after launch" marker (Pro is not for sale)', () => {
  for (const [p, marker] of [['index.html', /after launch|Coming after launch/i], ['es.html', /después del lanzamiento/i], ['terms.html', /after launch/i]] as const) {
    const html = read(p);
    let i = html.indexOf('$35');
    let n = 0;
    while (i >= 0) {
      n++;
      const near = html.slice(Math.max(0, i - 260), i + 120);
      assert(marker.test(near), `${p}: $35 at ${i} has no after-launch marker nearby`);
      i = html.indexOf('$35', i + 3);
    }
    assert(n >= 1, `${p} shows $35`);
  }
});

Deno.test('Terms: current plan bullet says $20 / $35, Pro cannot be bought until launch, and the update is dated', () => {
  const t = read('terms.html');
  assert(t.includes('a Starter plan at $20/month and,\n      after launch, a Pro plan at $35/month. Pro can\'t be bought until it\n      launches.') ||
    t.replace(/\r\n/g, '\n').includes('a Starter plan at $20/month and,\n      after launch, a Pro plan at $35/month. Pro can\'t be bought until it\n      launches.'));
  assert(/Updated 2026-11-10: new prices/.test(t));
});

Deno.test('account page sells Starter only and its display price is $20', () => {
  const js = read('assets/account.js');
  assertEquals((js.match(/callFunction\('create-checkout'/g) ?? []).length, 1);
  assert(js.includes("callFunction('create-checkout', { plan: 'starter'"));
  assert(!/plan:\s*'pro'/.test(js), 'account page never asks for Pro');
  assert(js.includes("var STARTER_PRICE = '$20';"));
});
