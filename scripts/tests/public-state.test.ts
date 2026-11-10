// D03 (V5): ONE truthful public state on Home, Support and Account, EN + ES. This branch is option B, not released (strict).
// Wording = doc 32 §4 option B, exactly. Run with:  npx deno test --allow-read scripts/tests/public-state.test.ts
import { assert } from 'jsr:@std/assert@1';

const raw = (p: string) => Deno.readTextFileSync(new URL(`../../${p}`, import.meta.url)).replace(/\r\n/g, '\n');
const read = (p: string) => raw(p).replace(/\n\s*/g, ' ');

Deno.test('option B: Home says not released; Support says plans open at launch; Account shows the plan only (EN + ES)', () => {
  // Carlos 11/10 (MCR5, 08:56): "Not released yet — Android coming soon", the same on home, account and support, EN and ES.
  for (const p of ['index.html', 'support.html', 'account/index.html']) assert((read(p).match(/Not released yet — Android coming soon/g) ?? []).length >= 1, p);
  for (const p of ['es.html', 'support.html', 'es/cuenta/index.html']) assert((read(p).match(/Todavía no disponible — pronto en Android/g) ?? []).length >= 1, p);
  for (const p of ['index.html', 'es.html', 'support.html', 'account/index.html', 'es/cuenta/index.html']) {
    assert(!/early access|acceso anticipado|on Google Play|en Google Play|App Store/i.test(read(p)), `${p}: no early access or store release`);
  }
  const sup = read('support.html');
  assert(sup.includes("Plans open at launch. If you're testing TalkEstimate, your <a href=\"/account/\">account page</a> shows your plan"));
  assert(sup.includes('Los planes abren en el lanzamiento. Si estás probando TalkEstimate, tu <a href="/es/cuenta/">página de cuenta</a> muestra tu plan'));
  assert(!/to buy Starter|para comprar Starter/i.test(sup), 'no "buy Starter" on Support');
  const en = read('account/index.html'), es = read('es/cuenta/index.html');
  assert(en.includes('to see your plan or manage your subscription. Plans open at launch.') && !/start Starter/i.test(en));
  assert(es.includes('para ver tu plan o administrar tu suscripción. Los planes abren en el lanzamiento.') && !/empezar Starter/i.test(es));
});

Deno.test('option B: the account page never shows the Start Starter button while purchase is closed, and says why', () => {
  const js = raw('assets/account.js');
  assert(js.includes('var STARTER_PURCHASE_OPEN = false;'));
  assert(js.includes("var canBuy = STARTER_PURCHASE_OPEN && (p.source === 'free' || p.source === 'trial');"));
  assert(js.includes("if (!STARTER_PURCHASE_OPEN && (p.source === 'free' || p.source === 'trial')) setMsg('plan-msg', T.plansAtLaunch);"));
  assert(js.includes("plansAtLaunch: 'Plans open at launch. Your plan is shown above.'"));
  assert(js.includes("plansAtLaunch: 'Los planes abren en el lanzamiento. Tu plan aparece arriba.'"));
  // The manage button still works for anyone who already has billing (none today).
  assert(js.includes("show('manage', hasBilling && !p.paymentProblem);"));
});
