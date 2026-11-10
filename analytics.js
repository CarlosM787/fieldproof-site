/* TalkEstimate — website analytics + campaign attribution
 * ---------------------------------------------------------------------------
 * ONE analytics install for the whole site (loaded by index.html, es.html,
 * privacy.html, terms.html). Two jobs:
 *
 *   1. Measurement  — page views + a small set of named events (CTA clicks,
 *      form start / submit / error, language change). Google Analytics 4.
 *      The browser sends NO "signup success" event: the server answers the same way for a new lead, a
 *      duplicate and a bot, on purpose, so the page cannot know a lead happened. The one real lead event
 *      (`generate_lead`) is sent by the server itself, only for an accepted new lead (see teGaIds below).
 *   2. Attribution  — remembers how a visitor first arrived (utm_* + referrer
 *      + landing page), first-party only, so a later signup can be credited
 *      to the campaign that produced it. Passed to the waitlist form.
 *
 * PRIVACY / SAFETY
 *   - DORMANT by default. With GA_MEASUREMENT_ID empty the site loads with
 *     ZERO tracking requests and every helper below is a safe no-op. Nothing
 *     breaks. Carlos turns analytics on by pasting one ID (see docs/ANALYTICS.md).
 *   - Only ever runs on the production host. localhost / preview / the raw
 *     github.io URL never send data, so testing can't pollute real numbers.
 *   - No PII, ever. Email, trade text, names, and messages are NEVER put into
 *     an event or a URL. Only coarse, non-identifying context (page path,
 *     form name, cta name, campaign source, language).
 *   - Google Ads signals + personalization are switched OFF.
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────────────────────
  // Paste your GA4 Measurement ID here to switch analytics on, e.g. 'G-XXXXXXX'.
  // Leave empty ('') and the site stays completely un-tracked.
  var GA_MEASUREMENT_ID = 'G-23MSFMVK4B';

  // Analytics only ever runs on the real site. Everywhere else it's inert.
  var PROD_HOST = 'talkestimate.com';
  var IS_PROD = (location.hostname === PROD_HOST || location.hostname === 'www.' + PROD_HOST);
  var ENABLED = !!GA_MEASUREMENT_ID && IS_PROD;

  // OPT-IN (option a): Google Analytics loads only after the visitor taps "Allow" on a small bar. Until then the
  // site sends nothing to Google and sets no cookie. The choice is kept on this device (localStorage) and can be
  // changed from the footer link "Analytics settings". If the choice can't be stored, analytics stays off.
  var CONSENT_KEY = 'te.consent.v1';
  var consent = null; // 'granted' | 'denied' | null (not chosen yet)
  try { var cv = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null'); if (cv && (cv.analytics === 'granted' || cv.analytics === 'denied')) consent = cv.analytics; } catch (e) { consent = null; }

  // ── CAMPAIGN ATTRIBUTION (first-party, first-touch) ────────────────────────
  var ATTR_KEY = 'te_attr';
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  function pageLanguage() {
    return (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
  }

  function readAttributionFromUrl() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return null; }
    var attr = {};
    var sawUtm = false;
    UTM_KEYS.forEach(function (k) {
      var v = q.get(k);
      if (v) { attr[k] = String(v).slice(0, 120); sawUtm = true; }
    });
    // Only record a fresh touch when there is real campaign intent in the URL,
    // otherwise a bare internal navigation would wipe the original source.
    if (!sawUtm) return null;
    attr.landing_page = (location.pathname || '/').slice(0, 200);
    attr.referrer_host = referrerHost();
    attr.first_seen = new Date().toISOString();
    return attr;
  }

  function referrerHost() {
    try {
      if (!document.referrer) return 'direct';
      var h = new URL(document.referrer).hostname;
      if (h === location.hostname) return 'internal';
      return h.slice(0, 120);
    } catch (e) { return 'direct'; }
  }

  // Store first-touch once; never overwrite with a later, weaker signal.
  function captureAttribution() {
    try {
      var existing = localStorage.getItem(ATTR_KEY);
      if (existing) return;
      var fresh = readAttributionFromUrl();
      if (fresh) localStorage.setItem(ATTR_KEY, JSON.stringify(fresh));
    } catch (e) { /* storage blocked — attribution simply stays empty */ }
  }

  // Public: the hidden metadata the waitlist form sends with a signup.
  // Always returns an object; safe to spread into a POST body.
  window.teAttribution = function () {
    var out = { language: pageLanguage(), landing_page: (location.pathname || '/').slice(0, 200), referrer_host: referrerHost() };
    try {
      var raw = localStorage.getItem(ATTR_KEY);
      if (raw) {
        var a = JSON.parse(raw);
        UTM_KEYS.forEach(function (k) { if (a[k]) out[k] = a[k]; });
        if (a.landing_page) out.landing_page = a.landing_page;
        if (a.referrer_host) out.referrer_host = a.referrer_host;
      }
    } catch (e) { /* fall through to defaults */ }
    return out;
  };

  // ── GA4 LOADER (only when enabled) ─────────────────────────────────────────
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  // Google's script (~180 KB) is fetched AFTER the page has painted: on the visitor's first touch, click, key or scroll,
  // or GA_DELAY_MS after the load event, whichever comes first. Nothing is lost: the page view and every event below
  // wait in dataLayer and are sent the moment the script arrives. Loading it during first paint made Google's own
  // Lighthouse put it on the headline's critical path (mobile LCP 4.3 s with it, 1.8 s without; WO-20261104-08).
  // 1000 ms is the shortest delay measured to stay off that path: loading right at the load event (even via
  // requestIdleCallback) still lands before Lighthouse's observed paint and puts LCP back at about 4 s.
  var GA_DELAY_MS = 1000;
  var gaRequested = false;
  var GA_TRIGGERS = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
  function loadGa() {
    if (gaRequested || !ENABLED || consent !== 'granted') return;
    gaRequested = true;
    GA_TRIGGERS.forEach(function (t) { window.removeEventListener(t, loadGa, true); });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_MEASUREMENT_ID);
    document.head.appendChild(s);
  }

  function armGa() {
    GA_TRIGGERS.forEach(function (t) { window.addEventListener(t, loadGa, { capture: true, passive: true }); });
    var gaLater = function () { setTimeout(loadGa, GA_DELAY_MS); };
    if (document.readyState === 'complete') gaLater(); else window.addEventListener('load', gaLater);
  }
  if (ENABLED) {
    if (consent === 'granted') armGa();
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
  }

  // Public: the visitor's own GA4 ids ({ga_client_id, ga_session_id}) for the waitlist form. The SERVER sends the one
  // real "lead" event (only for an accepted new lead) and ties it to this visit with these ids. Empty {} whenever
  // analytics is not running here (off, blocked, not the production host), and then the server sends nothing.
  window.teGaIds = function () {
    return new Promise(function (resolve) {
      if (!ENABLED || consent !== 'granted') { resolve({}); return; }
      loadGa(); // normally already loaded by the visitor typing in the form; this makes sure
      var out = {}, pending = 2, done = false;
      function finish() { if (done) return; done = true; resolve(out); }
      var timer = setTimeout(finish, 600);
      function got(key, v) {
        if (v !== undefined && v !== null && v !== '') out[key] = String(v);
        if (--pending === 0) { clearTimeout(timer); finish(); }
      }
      try { gtag('get', GA_MEASUREMENT_ID, 'client_id', function (v) { got('ga_client_id', v); }); } catch (e) { got('ga_client_id'); }
      try { gtag('get', GA_MEASUREMENT_ID, 'session_id', function (v) { got('ga_session_id', v); }); } catch (e) { got('ga_session_id'); }
    });
  };

  // ── EVENT HELPER ───────────────────────────────────────────────────────────
  // Call from anywhere: teTrack('cta_click', { cta_name: 'get_app' }).
  // No-op (and console-quiet) whenever analytics is dormant.
  window.teTrack = function (event, params) {
    if (!ENABLED || consent === 'denied') return;
    var safe = Object.assign({
      site_name: 'talkestimate',
      page_path: (location.pathname || '/'),
      language: pageLanguage()
    }, params || {});
    try { gtag('event', event, safe); } catch (e) { /* never break the page */ }
  };

  // ── AUTO-WIRED EVENTS ──────────────────────────────────────────────────────
  function wire() {
    // CTA clicks — any element carrying data-cta="name".
    document.querySelectorAll('[data-cta]').forEach(function (el) {
      el.addEventListener('click', function () {
        window.teTrack('cta_click', { cta_name: el.getAttribute('data-cta') });
      });
    });

    // Language toggle.
    document.querySelectorAll('.lang-toggle a.lt').forEach(function (el) {
      el.addEventListener('click', function () {
        window.teTrack('language_change', { to: (el.textContent || '').trim().toLowerCase() });
      });
    });

    // Outbound links (mailto: counts as contact intent).
    document.querySelectorAll('a[href^="http"], a[href^="mailto:"]').forEach(function (el) {
      var href = el.getAttribute('href') || '';
      var isExternal = href.indexOf('mailto:') === 0 ||
        (href.indexOf('http') === 0 && el.hostname && el.hostname !== location.hostname);
      if (!isExternal) return;
      el.addEventListener('click', function () {
        window.teTrack('external_link_click', {
          link_kind: href.indexOf('mailto:') === 0 ? 'email' : 'outbound',
          link_host: href.indexOf('mailto:') === 0 ? 'email' : (el.hostname || '')
        });
      });
    });
  }

  // ── BASIC ERROR VISIBILITY (through the same GA property, no new vendor) ────
  window.addEventListener('error', function (e) {
    if (!ENABLED) return;
    window.teTrack('js_error', {
      // message + file only — never user input.
      err_message: String((e && e.message) || 'error').slice(0, 120),
      err_source: String((e && e.filename) || '').slice(0, 120)
    });
  });

  // ── CONSENT BAR (option a) ───────────────────────────────────────────────────
  // An in-page band, NOT a floating overlay: it sits in the page flow above the menu, so it can never cover the main
  // button, a calculator field, the result or the waitlist button, at any screen size or scroll position (Cocoteo's
  // D3 lesson: a fixed bottom bar covered the Play buttons on phones). "No thanks" is the same size as "Allow".
  // Reopened from "Analytics settings", it appears right above that link.
  var TXT = {
    en: { q: 'Can we count this visit with Google Analytics? It uses cookies to see which pages and tools get used. No ads, and nothing you type.',
          allow: 'Allow', deny: 'No thanks', more: 'Privacy', label: 'Analytics choice', footer: 'Analytics settings',
          now: { granted: 'Now: allowed.', denied: 'Now: not allowed.' } },
    es: { q: '¿Podemos contar esta visita con Google Analytics? Usa cookies para ver qué páginas y herramientas se usan. Sin anuncios y nada de lo que escribes.',
          allow: 'Permitir', deny: 'No, gracias', more: 'Privacidad', label: 'Elección de analítica', footer: 'Configurar analítica',
          now: { granted: 'Ahora: permitido.', denied: 'Ahora: no permitido.' } }
  };
  var bar = null;
  function txt() { return TXT[pageLanguage() === 'es' ? 'es' : 'en']; }
  function choose(choice) {
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: 1, analytics: choice, ts: Date.now() })); } catch (e) { /* can't remember: stays off */ }
    var was = consent;
    consent = choice;
    showBar(false);
    if (choice === 'granted' && was !== 'granted') { armGa(); loadGa(); }
    if (choice === 'denied' && was === 'granted') {
      // Stop at once: the open page sends nothing more; Google's cookies are removed on this site.
      document.cookie.split(';').forEach(function (c) { var n = c.split('=')[0].trim(); if (/^_ga/.test(n)) { document.cookie = n + '=; Max-Age=0; path=/; domain=.' + PROD_HOST; document.cookie = n + '=; Max-Age=0; path=/'; } });
      window['ga-disable-' + GA_MEASUREMENT_ID] = true;
    }
  }
  function showBar(show, before) {
    if (!show) {
      // The buttons are only reachable while the band is on screen, so removing it never moves content the visitor is reading.
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      bar = null; return;
    }
    var t = txt();
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    bar = document.createElement('div');
    bar.className = 'te-consent';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', t.label);
    bar.style.cssText = 'position:static;background:#101828;color:#fff;font:14px/1.45 -apple-system,"Segoe UI",Roboto,Arial,sans-serif';
    var inner = document.createElement('div');
    inner.style.cssText = 'max-width:1100px;margin:0 auto;padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center';
    var p = document.createElement('p'); p.style.cssText = 'margin:0;flex:1 1 300px;color:#fff;font:inherit';
    p.appendChild(document.createTextNode(t.q + ' ' + (consent ? t.now[consent] + ' ' : '')));
    var a = document.createElement('a'); a.href = '/privacy.html'; a.textContent = t.more; a.style.cssText = 'color:#93C5FD;text-decoration:underline'; p.appendChild(a);
    var btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:8px;flex:0 0 auto';
    var b1 = document.createElement('button'), b2 = document.createElement('button');
    [b1, b2].forEach(function (b) { b.type = 'button'; b.style.cssText = 'min-height:44px;min-width:112px;padding:0 16px;border-radius:10px;font:700 15px/1 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;cursor:pointer;border:2px solid #fff'; });
    b1.textContent = t.allow; b1.style.background = '#fff'; b1.style.color = '#101828';
    b2.textContent = t.deny; b2.style.background = 'transparent'; b2.style.color = '#fff';
    b1.addEventListener('click', function () { choose('granted'); });
    b2.addEventListener('click', function () { choose('denied'); });
    btns.appendChild(b1); btns.appendChild(b2);
    inner.appendChild(p); inner.appendChild(btns); bar.appendChild(inner);
    if (before && before.parentNode) { before.parentNode.insertBefore(bar, before); b1.focus(); return; }
    // First visit: top of the page, after the "skip to content" link, before the menu.
    var skip = document.querySelector('a.skip');
    var anchor = skip ? skip.nextSibling : document.body.firstChild;
    document.body.insertBefore(bar, anchor || null);
  }
  function addFooterLink() {
    // Preferred: the footer's own link line (".foot" > last block), so it reads as one more footer link.
    var links = document.querySelector('footer .foot > div:last-child');
    var f = links || document.querySelector('footer') || document.querySelector('main') || document.body;
    if (!f || f.querySelector('.te-consent-link')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'te-consent-link'; b.textContent = txt().footer;
    b.style.cssText = 'background:none;border:0;padding:8px 0;min-height:44px;color:inherit;text-decoration:underline;font:inherit;cursor:pointer';
    var row = links ? links.parentNode : null; // reopened band goes above the footer row, full width
    b.addEventListener('click', function () { showBar(true, row || b); });
    if (links) { var sep = document.createElement('span'); sep.className = 'te-consent-sep'; sep.textContent = ' · '; links.appendChild(sep); }
    f.appendChild(b);
  }
  // Each page's inline head line reserves the band's height before first paint (html.te-ask, sized in brand.css). The band
  // takes that space in the same frame, so nothing below it moves even when this deferred script runs after first paint
  // (that race measured CLS 0.149 on the calculators, Growth 2026-11-10). Same band, same place, same choice logic.
  function clearReserve() { try { document.documentElement.classList.remove('te-ask'); } catch (e) { /* old browser */ } }
  function initConsent() {
    if (!ENABLED) { clearReserve(); return; }
    var canStore = false; try { localStorage.setItem('te.t', '1'); localStorage.removeItem('te.t'); canStore = true; } catch (e) { canStore = false; }
    if (!canStore) { clearReserve(); return; } // can't remember a choice: stay off rather than ask on every page
    try { var st = document.createElement('style'); st.textContent = '@media print{.te-consent,.te-consent-link,.te-consent-sep{display:none!important}}'; document.head.appendChild(st); } catch (e) { /* cosmetic */ }
    addFooterLink();
    if (consent === null) showBar(true);
    clearReserve();
  }

  // ── BOOT ───────────────────────────────────────────────────────────────────
  captureAttribution();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { wire(); initConsent(); });
  } else {
    wire();
    initConsent();
  }
})();
