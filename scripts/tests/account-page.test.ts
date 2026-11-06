// The web account page (/account/, /es/cuenta/): sign in with the app's email code, see the plan, buy Starter
// through create-checkout, manage through create-portal. WO-20261106-03. Local tests only.
// Run with:  npx deno test --allow-read scripts/tests/account-page.test.ts

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';

const read = (p: string) => Deno.readTextFileSync(new URL(`../../${p}`, import.meta.url));
const EN = read('account/index.html');
const ES = read('es/cuenta/index.html');
const JS = read('assets/account.js');
const HEADERS = read('_headers');
const REDIRECTS = read('_redirects');
const SUPA = 'https://zjggusmqgzvbfxwbvmsu.supabase.co';

Deno.test('paths are exactly the ones create-checkout / create-portal allow-list (billing-web.ts)', () => {
  // fieldproof supabase/functions/_shared/billing-web.ts: BILLING_RETURN_PATHS = {'/account/', '/es/cuenta/'}
  assert(JS.includes("var RETURN_PATH = LANG === 'es' ? '/es/cuenta/' : '/account/';"));
  assert(/^\/account\/\s+\/account\/index\.html\s+200$/m.test(REDIRECTS));
  assert(/^\/es\/cuenta\/\s+\/es\/cuenta\/index\.html\s+200$/m.test(REDIRECTS));
  assert(/^\/account\s+\/account\/\s+301$/m.test(REDIRECTS) && /^\/es\/cuenta\s+\/es\/cuenta\/\s+301$/m.test(REDIRECTS));
  assertEquals(EN.match(/<html lang="(\w+)"/)?.[1], 'en');
  assertEquals(ES.match(/<html lang="(\w+)"/)?.[1], 'es');
});

Deno.test('CSP covers the Supabase origin and nothing third-party; header and meta agree', () => {
  for (const p of ['/account/', '/account/index.html', '/es/cuenta/', '/es/cuenta/index.html']) {
    const block = HEADERS.split(/\n(?=\S)/).find((b) => b.trim().startsWith(p + '\n'));
    assert(block, `${p} has a headers block`);
    assert(block.includes(`connect-src 'self' ${SUPA};`), `${p} connect-src`);
    assert(block.includes("script-src 'self';"), `${p} script-src self only (supabase-js is vendored)`);
    assert(block.includes('X-Robots-Tag: noindex, nofollow') && block.includes('Cache-Control: no-store'), `${p} noindex + no-store`);
  }
  for (const html of [EN, ES]) {
    const meta = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
    assert(meta.includes(`connect-src 'self' ${SUPA};`) && meta.includes("script-src 'self';"));
    assertFalse(/<script[^>]+src="https?:/.test(html), 'no third-party script');
    assertFalse(/analytics\.js|googletagmanager/.test(html), 'no analytics on the account page');
  }
  assert(JS.includes(`var SUPABASE_URL = '${SUPA}';`));
});

Deno.test('noindex on both pages, and the account page is not in the sitemap', () => {
  for (const html of [EN, ES]) assert(html.includes('<meta name="robots" content="noindex, nofollow" />'));
  assertFalse(/\/account\/|\/es\/cuenta\//.test(read('sitemap.xml')));
});

Deno.test('the vendored supabase-js is the pinned file, with its license', () => {
  for (const html of [EN, ES]) assert(html.includes('<script src="/assets/vendor/supabase-js-2.109.0.js"></script>'));
  assert(read('assets/vendor/supabase-js-2.109.0.js').startsWith('var supabase=(function(e){'));
  assert(read('assets/vendor/supabase-js-LICENSE.txt').includes('MIT License'));
});

Deno.test('the public key is the anon role of this project, never the service role', () => {
  const key = JS.match(/var SUPABASE_ANON_KEY = '([^']+)';/)?.[1] ?? '';
  assert(key.startsWith('eyJ'), 'a JWT anon key');
  const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  assertEquals(payload.role, 'anon');
  assertEquals(payload.ref, 'zjggusmqgzvbfxwbvmsu');
  assertFalse(/service_role/.test(JS));
});

Deno.test('same sign-in as the app (6-digit email code), but the web never creates an account', () => {
  assert(JS.includes("sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false } })"));
  assert(JS.includes("sb.auth.verifyOtp({ email: email, token: token, type: 'email' })"));
  assert(JS.includes('noProfile'), 'no profile row (onboarding not done) -> no purchase, sent back to the app');
});

Deno.test('Starter only: no Pro button, Pro never requested', () => {
  assert(JS.includes("callFunction('create-checkout', { plan: 'starter', returnPath: RETURN_PATH })"));
  assertFalse(/plan:\s*'pro'/.test(JS), 'never asks for Pro');
  for (const html of [EN, ES]) assertFalse(/\bPro\b/.test(html.replace(/<[^>]+>/g, ' ')), 'no Pro on the page');
  assert(JS.includes("var canBuy = p.source === 'free' || p.source === 'trial';"), 'paid/founding accounts get no buy button');
});

Deno.test('every server answer is handled: 409 already_subscribed, plan_not_available, 401, 404 portal, network', () => {
  assert(JS.includes("r.status === 409 && r.body.code === 'already_subscribed'"));
  assert(JS.includes("r.status === 400 && r.body.code === 'plan_not_available'"));
  assert(JS.includes('r.status === 401'));
  assert(JS.includes('r.status === 404'));
  assert(JS.includes('return { status: 0, body: {} };'), 'network error path');
  // The app's own words (fieldproof lib/i18n.ts plans.alreadySubscribed, EN and ES).
  assert(JS.includes("alreadySubscribed: 'You already have a plan. To change or cancel it, use Manage subscription.'"));
  assert(JS.includes("alreadySubscribed: 'Ya tienes un plan. Para cambiarlo o cancelarlo, usa Administrar suscripción.'"));
  // Only Stripe's own hosts are followed.
  assert(JS.includes('/^https:\\/\\/checkout\\.stripe\\.com\\//') && JS.includes('/^https:\\/\\/billing\\.stripe\\.com\\//'));
});

Deno.test('disclosure: price, monthly renewal, cancel at period end, trial rule (48 h like the server), merchant', () => {
  for (const s of [
    'Starter is {price} a month, billed monthly in advance through Stripe. It renews every month until you cancel.',
    'Cancel any time in Manage subscription. Your plan stays active until the end of the month you already paid for; then your account moves to Free and you are not charged again.',
    'If you subscribe during your free trial with more than 2 days left, you keep the rest of the trial and your first charge is on the day it ends ({date}).',
    'Stripe’s checkout page and receipts show the merchant name AmplifyWebX LLC. TalkEstimate is operated by Morales Labs LLC.',
    'Starter cuesta {price} al mes, cobrado por adelantado cada mes por Stripe. Se renueva cada mes hasta que canceles.',
    'Cancela cuando quieras en Administrar suscripción. Tu plan sigue activo hasta el final del mes que ya pagaste; después tu cuenta pasa a Gratis y no se te vuelve a cobrar.',
    'Si te suscribes durante tu prueba gratis con más de 2 días restantes, conservas el resto de la prueba y el primer cobro es el día en que termina ({date}).',
    'los recibos de Stripe muestran el nombre del comerciante AmplifyWebX LLC. TalkEstimate es operado por Morales Labs LLC.',
  ]) assert(JS.includes(s), s);
  // Same numbers as the server and the live pricing strip.
  assert(JS.includes("var STARTER_PRICE = '$19.99';") && read('index.html').includes('<b>Starter</b> $19.99/mo'));
  assert(JS.includes('var MIN_TRIAL_MS = (48 * 60 + 5) * 60 * 1000;'), 'checkout-trial.ts: 48 h + 5 min');
  assert(JS.includes('var AI = { free: 3, starter: 40, pro: 150 };'), 'plans.ts PLAN_LIMITS');
  // Same billing facts as the terms.
  const terms = read('terms.html');
  assert(terms.includes('billed monthly, in advance, through Stripe') && terms.includes('A paid plan stays active until'));
  assert(terms.includes('your first charge is on the') && terms.includes('AmplifyWebX LLC'));
  assertFalse(/refund/i.test(JS), 'no refund promise');
});

Deno.test('resolvePlan in the page matches the server rules', async () => {
  // Load account.js's resolvePlan without a browser: stub just enough DOM to reach the export.
  const g = globalThis as any;
  const elStub = () => ({ textContent: '', className: '', hidden: true, value: '', disabled: false, addEventListener() {}, appendChild() {}, focus() {}, innerHTML: '' });
  g.window = g; g.document = { documentElement: { lang: 'en' }, getElementById: elStub };
  g.supabase = undefined; // createClient missing -> the script stops right after defining resolvePlan
  g.location = { search: '', pathname: '/account/' }; g.history = { replaceState() {} };
  new Function(JS)();
  const rp = g.teResolvePlan as (r: unknown, now: number) => { plan: string; source: string; paymentProblem: boolean; trialDaysLeft: number };
  const now = Date.parse('2026-11-06T12:00:00Z');
  assertEquals(rp({ subscription_status: 'founding' }, now).source, 'founding');
  assertEquals(rp({ subscription_status: 'active', subscription_tier: 'starter' }, now).plan, 'starter');
  assertEquals(rp({ subscription_status: 'past_due', subscription_tier: 'starter' }, now).paymentProblem, true);
  assertEquals(rp({ subscription_status: 'active', subscription_tier: 'solo_pro' }, now).source, 'legacy');
  assertEquals(rp({ subscription_status: 'active', subscription_tier: null }, now).plan, 'starter');
  assertEquals(rp({ subscription_status: 'canceled', trial_ends_at: '2026-11-10T12:00:00Z' }, now), { plan: 'pro', source: 'trial', trialDaysLeft: 4, paymentProblem: false });
  assertEquals(rp({ subscription_status: 'unpaid' }, now).source, 'free');
  assertEquals(rp(null, now).source, 'free');
});
