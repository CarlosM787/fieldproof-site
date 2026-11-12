/* TalkEstimate account page (/account/ and /es/cuenta/): sign in with the app's email code, see your plan,
 * buy Starter (Stripe Checkout) or manage it (Stripe Customer Portal). WO-20261106-03.
 *
 * - Same sign-in as the app: a 6-digit email code (signInWithOtp + verifyOtp type 'email'). Unlike the app,
 *   this page never CREATES an account (shouldCreateUser: false): the app creates the profile at onboarding,
 *   and the Stripe webhook can only activate a plan on an existing profile.
 * - The plan is read exactly like the app/server read it (resolvePlan in supabase/functions/_shared/plans.ts).
 * - Payment state is never decided here: create-checkout / create-portal / stripe-webhook are the truth.
 * - Pro is never offered (create-checkout refuses it until Pro launches).
 * - No analytics on this page. The session is kept in this browser's localStorage until you sign out.
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://api.talkestimate.com'; // api.talkestimate.com = te-api-gateway → the Supabase project (WO-20261106-09)
  // Public anon key (the same one the app ships); it only allows what row-level security allows.
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqZ2d1c21xZ3p2YmZ4d2J2bXN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNzU5MTMsImV4cCI6MjA5ODk1MTkxM30.GkfXnqU02-s9QyMb-bihsCV1grZTrraZCzIE1Sv43ZA'; // gitleaks:allow (public anon key, role anon; RLS-limited, same key the app ships)
  var FUNCTIONS = SUPABASE_URL + '/functions/v1/';

  var LANG = (document.documentElement.lang || 'en').slice(0, 2) === 'es' ? 'es' : 'en';
  var RETURN_PATH = LANG === 'es' ? '/es/cuenta/' : '/account/';

  // Plan facts, same numbers as plans.ts PLAN_LIMITS and billing-config.ts display prices.
  var STARTER_PRICE = '$20';
  // Public state B (Carlos's D03 pick, V5): no plan is sold until launch. Flip to true at launch; the server still
  // decides everything (create-checkout / webhook), this only hides the button.
  var STARTER_PURCHASE_OPEN = false;
  var AI = { free: 3, starter: 40, pro: 150 };

  var T = {
    en: {
      emailLabel: 'Email you use in the TalkEstimate app',
      sendCode: 'Send Login Code',
      codeLabel: 'Enter the 6-digit code we emailed to {email}',
      verify: 'Verify & Sign In',
      otherEmail: 'Use a different email',
      sending: 'Sending…',
      working: 'One moment…',
      sendFailed: 'Couldn’t send the code. Check the email address and your connection, then try again.',
      rateLimited: 'Too many codes were requested. Wait a minute, then try again.',
      noAccount: 'We couldn’t find a TalkEstimate account for that email. Create your account in the app first, then come back here.',
      codeBad: 'That code didn’t work. Check the 6 digits and try again.',
      codeExpired: 'That code expired. Send a new one and try again.',
      signedInAs: 'Signed in as {email}',
      signOut: 'Sign out',
      noProfile: 'Finish setting up your account in the TalkEstimate app first (your business name), then come back here to choose a plan.',
      loadFailed: 'Couldn’t load your plan. Check your connection and reload the page.',
      free: 'You’re on Free',
      freeBody: 'Your estimates, prices and records are all here. Manual work is free for good; the AI organizes {n} jobs a month.',
      preview: 'Free trial — {n} days left',
      previewOne: 'Free trial — {n} day left',
      previewBody: 'Everything is unlocked, including {ai} AI jobs this month. Then you move to Free on your own: no card, no charge.',
      subscribed: '{plan} — active',
      subscribedBody: 'Thanks for subscribing! It renews every month until you cancel.',
      subscribedTrial: 'You’re subscribed. Your free trial continues until {date}.',
      legacy: 'Your original plan — active',
      legacyBody: 'You’re on the plan you signed up for. Nothing changes for you.',
      pastDue: 'There’s a problem with your plan’s payment. Your work is safe and nothing is blocked yet. Update your card in Update payment.',
      founding: 'Owner account — no charge',
      starterTitle: 'Starter — {price}/month',
      starterAi: 'AI organizes {n} jobs a month',
      starterManual: 'Unlimited estimates you type or add yourself, My Prices, proposals, approvals, change orders and invoices',
      startStarter: 'Start Starter — {price}/month',
      plansAtLaunch: 'Plans open at launch. Your plan is shown above.',
      manage: 'Manage subscription',
      updatePayment: 'Update payment',
      checkoutFailed: 'Couldn’t open checkout. Check your connection and try again.',
      notAvailable: 'That plan isn’t available yet.',
      alreadySubscribed: 'You already have a plan. To change or cancel it, use Manage subscription.',
      portalFailed: 'Couldn’t open billing. Check your connection and try again.',
      noBilling: 'There’s no billing account yet: you haven’t subscribed from this account.',
      sessionEnded: 'Your sign-in ended. Sign in again.',
      success: 'Payment received — your plan updates in a moment.',
      successSlow: 'Payment received. Your plan can take a minute to update: reload this page shortly. If it still shows Free, email support@talkestimate.com.',
      canceled: 'Checkout was closed. Nothing was charged.',
      discloseTitle: 'Before you subscribe',
      disclose: [
        'Starter is {price} a month, billed monthly in advance through Stripe. It renews every month until you cancel.',
        'Cancel anytime in Manage subscription. You keep access through the end of the billing period you already paid for; then your account moves to Free and you are not charged for another renewal.',
        'If you subscribe during your free trial with more than 2 days left, you keep the rest of the trial and your first charge is on the day it ends ({date}). Cancel before then and you are not charged. With 2 days or fewer left, you are charged when you subscribe.',
        'Subscription payments are not prorated or refunded for unused portions of a billing month, except where required by law or under an applicable refund exception.',
        'Stripe handles the payment; TalkEstimate never sees your card number. For now Stripe’s checkout page and receipts show the merchant name AmplifyWebX LLC. TalkEstimate is operated by Morales Labs LLC.'
      ],
      discloseNoTrial: 'You are charged when you subscribe.',
      terms: 'Terms', privacy: 'Privacy Policy'
    },
    es: {
      emailLabel: 'Correo que usas en la app TalkEstimate',
      sendCode: 'Enviar Código de Acceso',
      codeLabel: 'Escribe el código de 6 dígitos que enviamos a {email}',
      verify: 'Verificar y Entrar',
      otherEmail: 'Usar otro correo',
      sending: 'Enviando…',
      working: 'Un momento…',
      sendFailed: 'No se pudo enviar el código. Revisa el correo y tu conexión, e inténtalo de nuevo.',
      rateLimited: 'Se pidieron demasiados códigos. Espera un minuto e inténtalo de nuevo.',
      noAccount: 'No encontramos una cuenta de TalkEstimate con ese correo. Primero crea tu cuenta en la app y luego vuelve aquí.',
      codeBad: 'Ese código no funcionó. Revisa los 6 dígitos e inténtalo de nuevo.',
      codeExpired: 'Ese código venció. Envía uno nuevo e inténtalo de nuevo.',
      signedInAs: 'Entraste como {email}',
      signOut: 'Salir',
      noProfile: 'Primero termina de configurar tu cuenta en la app TalkEstimate (el nombre de tu negocio) y luego vuelve aquí para elegir un plan.',
      loadFailed: 'No se pudo cargar tu plan. Revisa tu conexión y vuelve a cargar la página.',
      free: 'Estás en Gratis',
      freeBody: 'Tus estimados, precios y registros están aquí. El trabajo manual es gratis para siempre; la IA organiza {n} trabajos al mes.',
      preview: 'Prueba gratis — te quedan {n} días',
      previewOne: 'Prueba gratis — te queda {n} día',
      previewBody: 'Todo está abierto, incluidos {ai} trabajos con IA este mes. Después pasas a Gratis solo: sin tarjeta, sin cobro.',
      subscribed: '{plan} — activo',
      subscribedBody: '¡Gracias por suscribirte! Se renueva cada mes hasta que canceles.',
      subscribedTrial: 'Ya estás suscrito. Tu prueba gratis sigue hasta el {date}.',
      legacy: 'Tu plan original — activo',
      legacyBody: 'Estás en el plan con el que te suscribiste. Para ti no cambia nada.',
      pastDue: 'Hay un problema con el pago de tu plan. Tu trabajo está seguro y nada está bloqueado todavía. Actualiza tu tarjeta en Actualizar pago.',
      founding: 'Cuenta del dueño — sin cargo',
      starterTitle: 'Starter — {price} al mes',
      starterAi: 'La IA organiza {n} trabajos al mes',
      starterManual: 'Estimados ilimitados que escribes o agregas tú, Mis Precios, propuestas, aprobaciones, órdenes de cambio y facturas',
      startStarter: 'Empezar Starter — {price} al mes',
      plansAtLaunch: 'Los planes abren en el lanzamiento. Tu plan aparece arriba.',
      manage: 'Administrar suscripción',
      updatePayment: 'Actualizar pago',
      checkoutFailed: 'No se pudo abrir el pago. Revisa tu conexión e inténtalo de nuevo.',
      notAvailable: 'Ese plan todavía no está disponible.',
      alreadySubscribed: 'Ya tienes un plan. Para cambiarlo o cancelarlo, usa Administrar suscripción.',
      portalFailed: 'No se pudo abrir la facturación. Revisa tu conexión e inténtalo de nuevo.',
      noBilling: 'Todavía no hay cuenta de cobro: no te has suscrito desde esta cuenta.',
      sessionEnded: 'Tu sesión terminó. Vuelve a entrar.',
      success: 'Pago recibido — tu plan se actualiza en un momento.',
      successSlow: 'Pago recibido. Tu plan puede tardar un minuto en actualizarse: vuelve a cargar esta página en un rato. Si sigue en Gratis, escribe a support@talkestimate.com.',
      canceled: 'Cerraste el pago. No se cobró nada.',
      discloseTitle: 'Antes de suscribirte',
      disclose: [
        'Starter cuesta {price} al mes, cobrado por adelantado cada mes por Stripe. Se renueva cada mes hasta que canceles.',
        'Cancela cuando quieras en Administrar suscripción. Conservas el acceso hasta el final del periodo de facturación que ya pagaste; después tu cuenta pasa a Gratis y no se te cobra otra renovación.',
        'Si te suscribes durante tu prueba gratis con más de 2 días restantes, conservas el resto de la prueba y el primer cobro es el día en que termina ({date}). Si cancelas antes, no se te cobra. Con 2 días o menos, se te cobra al suscribirte.',
        'Los pagos de la suscripción no se prorratean ni se reembolsan por la parte no usada de un mes de facturación, salvo cuando la ley lo exija o aplique una excepción de reembolso.',
        'Stripe procesa el pago; TalkEstimate nunca ve el número de tu tarjeta. Por ahora la página de pago y los recibos de Stripe muestran el nombre del comerciante AmplifyWebX LLC. TalkEstimate es operado por Morales Labs LLC.'
      ],
      discloseNoTrial: 'Se te cobra al suscribirte.',
      terms: 'Términos', privacy: 'Política de privacidad'
    }
  }[LANG];

  function fmt(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] !== undefined ? String(vars[k]) : ''; });
  }
  function el(id) { return document.getElementById(id); }
  function show(id, on) { var e = el(id); if (e) e.hidden = !on; }
  function setMsg(id, text, kind) {
    var e = el(id); if (!e) return;
    e.textContent = text || '';
    e.className = 'msg' + (kind ? ' ' + kind : '');
    e.hidden = !text;
  }

  // ── plan reading: a copy of resolvePlan (plans.ts) ───────────────────────────
  var PAID = { active: 1, past_due: 1 };
  function trialDays(endsAt, nowMs) {
    if (typeof endsAt !== 'string' || !endsAt) return 0;
    var ends = Date.parse(endsAt);
    if (!isFinite(ends) || ends <= nowMs) return 0;
    return Math.ceil((ends - nowMs) / 86400000);
  }
  function resolvePlan(row, nowMs) {
    var r = row && typeof row === 'object' ? row : {};
    var status = typeof r.subscription_status === 'string' ? r.subscription_status : null;
    var tier = typeof r.subscription_tier === 'string' ? r.subscription_tier : null;
    var days = trialDays(r.trial_ends_at, nowMs);
    function make(plan, source, extra) {
      var p = { plan: plan, source: source, trialDaysLeft: 0, paymentProblem: false };
      for (var k in (extra || {})) p[k] = extra[k];
      return p;
    }
    if (status === 'founding') return make('pro', 'founding');
    if (status && PAID[status]) {
      var pp = { paymentProblem: status === 'past_due' };
      if (tier === 'starter') return make('starter', 'subscription', pp);
      if (tier === 'pro') return make('pro', 'subscription', pp);
      if (tier === 'solo_pro') return make('pro', 'legacy', pp);
      return make('starter', 'subscription', pp);
    }
    if (days > 0) return make('pro', 'trial', { trialDaysLeft: days });
    return make('free', 'free');
  }
  window.teResolvePlan = resolvePlan; // for the page's own tests

  // Mirrors checkoutTrialEnd (_shared/checkout-trial.ts): the trial is kept only with > 48 h 5 min left.
  var MIN_TRIAL_MS = (48 * 60 + 5) * 60 * 1000;
  function trialKeptUntil(endsAt, nowMs) {
    if (typeof endsAt !== 'string' || !endsAt) return null;
    var end = Date.parse(endsAt);
    return isFinite(end) && end - nowMs >= MIN_TRIAL_MS ? new Date(end) : null;
  }
  function longDate(d) {
    try { return d.toLocaleDateString(LANG === 'es' ? 'es-US' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
    catch (e) { return d.toISOString().slice(0, 10); }
  }

  // ── Supabase ─────────────────────────────────────────────────────────────────
  if (!window.supabase || !window.supabase.createClient) { setMsg('page-msg', T.loadFailed, 'err'); return; }
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storageKey: 'te-account-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  var email = '';
  var current = null; // { user, profile, plan }

  async function callFunction(name, body) {
    var s = (await sb.auth.getSession()).data.session;
    if (!s) return { status: 401, body: {} };
    try {
      var res = await fetch(FUNCTIONS + name, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + s.access_token, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      var data = {};
      try { data = await res.json(); } catch (e) { /* empty body */ }
      return { status: res.status, body: data || {} };
    } catch (e) {
      return { status: 0, body: {} };
    }
  }

  // ── sign-in steps ────────────────────────────────────────────────────────────
  function stage(name) {
    show('step-email', name === 'email');
    show('step-code', name === 'code');
    show('step-account', name === 'account');
  }

  async function sendCode(ev) {
    ev.preventDefault();
    email = String(el('email').value || '').trim().toLowerCase();
    if (!email) return;
    var btn = el('send'); btn.disabled = true; btn.textContent = T.sending;
    setMsg('email-msg', '');
    var r = await sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false } });
    btn.disabled = false; btn.textContent = T.sendCode;
    if (r.error) {
      var e = r.error, m = String(e.message || '');
      if (e.status === 429 || /rate limit|security purposes/i.test(m)) setMsg('email-msg', T.rateLimited, 'err');
      else if (e.code === 'otp_disabled' || /signups not allowed/i.test(m)) setMsg('email-msg', T.noAccount, 'err');
      else setMsg('email-msg', T.sendFailed, 'err');
      return;
    }
    el('code-label').textContent = fmt(T.codeLabel, { email: email });
    el('code').value = '';
    stage('code');
    el('code').focus();
  }

  async function verifyCode(ev) {
    ev.preventDefault();
    var token = String(el('code').value || '').replace(/\s+/g, '');
    if (!token) return;
    var btn = el('verify'); btn.disabled = true; btn.textContent = T.working;
    setMsg('code-msg', '');
    var r = await sb.auth.verifyOtp({ email: email, token: token, type: 'email' });
    btn.disabled = false; btn.textContent = T.verify;
    if (r.error) {
      setMsg('code-msg', /expired/i.test(String(r.error.message || '')) ? T.codeExpired : T.codeBad, 'err');
      return;
    }
    await loadAccount();
  }

  async function signOut() {
    try { await sb.auth.signOut(); } catch (e) { /* local sign-out still clears */ }
    current = null;
    stage('email');
  }

  // ── account view ─────────────────────────────────────────────────────────────
  async function readProfile(userId) {
    var q = await sb.from('profiles')
      .select('id, subscription_status, subscription_tier, trial_ends_at, stripe_customer_id')
      .eq('id', userId).maybeSingle();
    if (q.error) throw q.error;
    return q.data || null;
  }

  async function loadAccount() {
    var u = (await sb.auth.getUser()).data.user;
    if (!u) { stage('email'); return null; }
    stage('account');
    el('who').textContent = fmt(T.signedInAs, { email: u.email || '' });
    var profile;
    try { profile = await readProfile(u.id); }
    catch (e) { setMsg('plan-msg', T.loadFailed, 'err'); show('plan-box', false); return null; }
    if (!profile) {
      current = { user: u, profile: null, plan: null };
      show('plan-box', false); show('starter-box', false);
      setMsg('plan-msg', T.noProfile, 'warn');
      return current;
    }
    var plan = resolvePlan(profile, Date.now());
    current = { user: u, profile: profile, plan: plan };
    render();
    return current;
  }

  function render() {
    var p = current.plan, prof = current.profile, now = Date.now();
    setMsg('plan-msg', '');
    show('plan-box', true);
    var title = '', body = '';
    if (p.source === 'founding') { title = T.founding; }
    else if (p.source === 'legacy') { title = T.legacy; body = T.legacyBody; }
    else if (p.source === 'subscription') {
      title = fmt(T.subscribed, { plan: p.plan === 'pro' ? 'Pro' : 'Starter' });
      body = trialDays(prof.trial_ends_at, now) > 0 ? fmt(T.subscribedTrial, { date: longDate(new Date(Date.parse(prof.trial_ends_at))) }) : T.subscribedBody;
    }
    else if (p.source === 'trial') { title = fmt(p.trialDaysLeft === 1 ? T.previewOne : T.preview, { n: p.trialDaysLeft }); body = fmt(T.previewBody, { ai: AI.pro }); }
    else { title = T.free; body = fmt(T.freeBody, { n: AI.free }); }
    el('plan-title').textContent = title;
    el('plan-body').textContent = body;
    setMsg('pay-msg', p.paymentProblem ? T.pastDue : '', p.paymentProblem ? 'warn' : '');

    // Buttons: Starter only for Free / trial (never Pro); Manage for anyone with a billing account.
    var canBuy = STARTER_PURCHASE_OPEN && (p.source === 'free' || p.source === 'trial');
    if (!STARTER_PURCHASE_OPEN && (p.source === 'free' || p.source === 'trial')) setMsg('plan-msg', T.plansAtLaunch);
    show('starter-box', canBuy);
    if (canBuy) {
      el('starter-title').textContent = fmt(T.starterTitle, { price: STARTER_PRICE });
      el('starter-ai').textContent = fmt(T.starterAi, { n: AI.starter });
      el('starter-manual').textContent = T.starterManual;
      el('start').textContent = fmt(T.startStarter, { price: STARTER_PRICE });
      var kept2 = trialKeptUntil(prof.trial_ends_at, now);
      var list = el('disclose');
      list.innerHTML = '';
      T.disclose.forEach(function (line, i) {
        var li = document.createElement('li');
        // Line 3 (the trial rule) only while it applies; otherwise say plainly that the charge is today.
        li.textContent = i === 2 && !kept2 ? T.discloseNoTrial : fmt(line, { price: STARTER_PRICE, date: kept2 ? longDate(kept2) : '' });
        list.appendChild(li);
      });
    }
    var hasBilling = !!prof.stripe_customer_id && p.source !== 'founding';
    show('manage', hasBilling && !p.paymentProblem);
    show('update-payment', hasBilling && p.paymentProblem);
  }

  async function startStarter() {
    var btn = el('start'); if (btn.disabled) return;
    btn.disabled = true; var label = btn.textContent; btn.textContent = T.working;
    setMsg('action-msg', '');
    var r = await callFunction('create-checkout', { plan: 'starter', returnPath: RETURN_PATH });
    if (r.status === 200 && r.body && typeof r.body.url === 'string' && /^https:\/\/checkout\.stripe\.com\//.test(r.body.url)) {
      window.location.assign(r.body.url);
      return;
    }
    btn.disabled = false; btn.textContent = label;
    if (r.status === 401) { setMsg('action-msg', T.sessionEnded, 'err'); await signOut(); return; }
    if (r.status === 409 && r.body.code === 'already_subscribed') { setMsg('action-msg', T.alreadySubscribed, 'warn'); await loadAccount(); return; }
    if (r.status === 400 && r.body.code === 'plan_not_available') { setMsg('action-msg', T.notAvailable, 'err'); return; }
    setMsg('action-msg', T.checkoutFailed, 'err');
  }

  async function openPortal(ev) {
    var btn = ev.currentTarget; if (btn.disabled) return;
    btn.disabled = true;
    setMsg('action-msg', '');
    var r = await callFunction('create-portal', { returnPath: RETURN_PATH });
    if (r.status === 200 && r.body && typeof r.body.url === 'string' && /^https:\/\/billing\.stripe\.com\//.test(r.body.url)) {
      window.location.assign(r.body.url);
      return;
    }
    btn.disabled = false;
    if (r.status === 401) { setMsg('action-msg', T.sessionEnded, 'err'); await signOut(); return; }
    if (r.status === 404) { setMsg('action-msg', T.noBilling, 'warn'); return; }
    setMsg('action-msg', T.portalFailed, 'err');
  }

  // After Checkout: the webhook activates the plan a moment later; re-read it a few times.
  async function afterCheckout() {
    for (var i = 0; i < 8; i++) {
      await new Promise(function (r) { setTimeout(r, 2000); });
      var c = await loadAccount();
      if (c && c.plan && (c.plan.source === 'subscription' || c.plan.source === 'legacy')) { setMsg('status-msg', T.success, 'ok'); return; }
    }
    setMsg('status-msg', T.successSlow, 'warn');
  }

  // ── boot ─────────────────────────────────────────────────────────────────────
  el('email-label').textContent = T.emailLabel;
  el('send').textContent = T.sendCode;
  el('verify').textContent = T.verify;
  el('other-email').textContent = T.otherEmail;
  el('sign-out').textContent = T.signOut;
  el('manage').textContent = T.manage;
  el('update-payment').textContent = T.updatePayment;
  el('disclose-title').textContent = T.discloseTitle;
  el('form-email').addEventListener('submit', sendCode);
  el('form-code').addEventListener('submit', verifyCode);
  el('other-email').addEventListener('click', function () { stage('email'); el('email').focus(); });
  el('sign-out').addEventListener('click', signOut);
  el('start').addEventListener('click', startStarter);
  el('manage').addEventListener('click', openPortal);
  el('update-payment').addEventListener('click', openPortal);

  var status = new URLSearchParams(location.search).get('status');
  if (status) history.replaceState(null, '', location.pathname); // don't keep ?status in the address bar
  (async function () {
    var c = await loadAccount();
    if (!c) return;
    if (status === 'success') { setMsg('status-msg', T.success, 'ok'); await afterCheckout(); }
    else if (status === 'cancel') setMsg('status-msg', T.canceled, '');
  })();
})();
