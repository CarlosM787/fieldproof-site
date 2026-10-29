// Terms describe billing as it is live since the 2026-10-27 Stripe cutover, name the operator (Carlos,
// 2026-10-28: Morales Labs LLC), and make no refund promise and no claim about features not yet released.
// Run with:  npx deno test --allow-read scripts/tests/terms-billing.test.ts

import { assert } from 'jsr:@std/assert@1';

const t = Deno.readTextFileSync(new URL('../../terms.html', import.meta.url));

Deno.test('terms: live billing, operator named, no refund promise, no unreleased deletion feature', () => {
  assert(!/not live\s+yet|no one is charged until/i.test(t), 'the stale sentence is gone');
  assert(t.includes('billed monthly, in advance, through Stripe'));
  assert(t.includes('A paid plan stays active until'));
  assert(t.includes('operated by <b>Morales Labs LLC</b>, an Arizona limited liability company'));
  assert(!/refund/i.test(t));
  assert(!t.includes('Delete account'), 'in-app deletion is not released yet');
});

Deno.test('terms name the current payment merchant (Stripe seller) next to the operator', () => {
  assert(t.includes('the merchant for TalkEstimate payments is <b>AmplifyWebX LLC</b>'));
  assert(t.includes('is operated by Morales Labs LLC.'));
});
