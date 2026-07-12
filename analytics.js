/* TalkEstimate — website analytics + campaign attribution
 * ---------------------------------------------------------------------------
 * ONE analytics install for the whole site (loaded by index.html, es.html,
 * privacy.html, terms.html). Two jobs:
 *
 *   1. Measurement  — page views + a small set of named events (CTA clicks,
 *      form start / success / error, language change). Google Analytics 4.
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
  var GA_MEASUREMENT_ID = '';

  // Analytics only ever runs on the real site. Everywhere else it's inert.
  var PROD_HOST = 'talkestimate.com';
  var IS_PROD = (location.hostname === PROD_HOST || location.hostname === 'www.' + PROD_HOST);
  var ENABLED = !!GA_MEASUREMENT_ID && IS_PROD;

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

  if (ENABLED) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_MEASUREMENT_ID);
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
  }

  // ── EVENT HELPER ───────────────────────────────────────────────────────────
  // Call from anywhere: teTrack('cta_click', { cta_name: 'get_app' }).
  // No-op (and console-quiet) whenever analytics is dormant.
  window.teTrack = function (event, params) {
    if (!ENABLED) return;
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

  // ── BOOT ───────────────────────────────────────────────────────────────────
  captureAttribution();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
