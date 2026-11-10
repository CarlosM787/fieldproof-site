// D03 (V5): ONE truthful public state on Home, Support and Account, EN + ES. This branch is option B, not released (strict).
// Wording = doc 32 §4 option B, exactly. Run with:  npx deno test --allow-read scripts/tests/public-state.test.ts
import { assert } from 'jsr:@std/assert@1';

const raw = (p: string) => Deno.readTextFileSync(new URL(`../../${p}`, import.meta.url)).replace(/\r\n/g, '\n');
const read = (p: string) => raw(p).replace(/\n\s*/g, ' ');

Deno.test('option B: Home says not released; Support says plans open at launch; Account shows the plan only (EN + ES)', () => {
  assert(read('index.html').includes('not released yet'));
  assert(read('es.html').includes('todavía sin lanzar'));
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
