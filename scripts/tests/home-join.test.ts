// V6 batch 5 (Carlos 11/12, §10 priority 1 "prominent EN/ES conversion buttons"): on the home pages every
// "Join the waitlist" button (nav, hero, closing band) used to jump to #pricing, the "Simple pricing" heading, and the
// form sat below the three plan cards (about three phone screens further down). They now jump straight to the
// waitlist card (#join), which clears the 64 px sticky nav. Nothing else changes: same form, same fields, same
// endpoint, same consent line, same CTA names for click counts. "See plans" and the nav "Pricing" link still go to
// the pricing section.
// Run with:  npx deno test --allow-read scripts/tests/home-join.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';

const read = (p: string) => Deno.readTextFileSync(new URL(`../../${p}`, import.meta.url)).replace(/\r\n/g, '\n');

for (const page of ['index.html', 'es.html']) {
  const html = read(page);

  Deno.test(`${page}: every waitlist button jumps straight to the form`, () => {
    for (const cta of ['nav_get_app', 'hero_get_app', 'footer_get_access']) {
      assertEquals((html.match(new RegExp(`<a class="btn[^"]*" href="#join" data-cta="${cta}">`, 'g')) ?? []).length, 1, cta);
    }
    assert(!/href="#pricing" data-cta="(nav_get_app|hero_get_app|footer_get_access)"/.test(html), 'no waitlist button stops at the pricing heading');
  });

  Deno.test(`${page}: #join is the one waitlist card, and it holds the form`, () => {
    assertEquals((html.match(/id="join"/g) ?? []).length, 1);
    const a = html.indexOf('<div class="price-card" id="join">');
    assert(a >= 0, 'the card carries the anchor');
    const card = html.slice(a, html.indexOf('</section>', a));
    assert(card.includes('<form class="wl-form" id="wl">'), 'the form is inside the card');
    assert(card.includes('<input type="email" id="wl-email" name="email"'), 'email field');
    assert(card.includes('<button type="submit" id="wl-btn">'), 'submit button');
    assert(card.includes('<p class="wl-consent">'), 'consent line unchanged');
    const p0 = html.indexOf('<section id="pricing"');
    assert(p0 >= 0 && p0 < a, 'the pricing section opens before the card');
    const pricing = html.slice(p0, html.indexOf('</section>', p0));
    assert(pricing.includes('id="join"'), 'the card stays in the pricing section, after the plans');
  });

  Deno.test(`${page}: the jump clears the sticky nav`, () => {
    assert(/nav \{ position: sticky;/.test(html), 'the nav is sticky');
    assert(/\.nav-inner \{[^}]*height: 64px;/.test(html), 'nav height 64 px');
    assert(html.includes('#join { scroll-margin-top: 84px; }'), '64 px nav + 20 px gap');
    assert(/#join:target \{ box-shadow:[^}]+\}/.test(html), 'the card is outlined when it is the jump target');
  });

  Deno.test(`${page}: "See plans" and the nav "Pricing" link still go to the pricing section`, () => {
    assertEquals((html.match(/<a href="#pricing" data-cta="hero_see_plans">/g) ?? []).length, 1);
    assertEquals((html.match(/<a href="#pricing">(Pricing|Precio)<\/a>/g) ?? []).length, 1);
    assertEquals((html.match(/id="pricing"/g) ?? []).length, 1);
  });
}
