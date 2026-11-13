/* TalkEstimate inline waitlist form (tool and guide pages, EN + ES). V6 batch 1, 2026-11-12.
 *
 * The SAME signup as the home page form (index.html / es.html #wl): same endpoint, same fields (email, trade,
 * the "company" bot trap), same attribution metadata, same consent line, same messages. Nothing new is collected.
 * It drives every <form data-waitlist> on the page.
 *
 * - The server (join-waitlist) decides everything: it stores a new lead, answers duplicates and bot-trap hits with the
 *   same {ok:true} (so nobody can learn who is on the list), rate-limits, and tags test addresses as tests.
 * - No "success" analytics event is sent from the browser, because the page cannot know whether a lead happened. The
 *   one real lead event comes from the server, for accepted new leads only (off until its GA4 secret exists).
 * - Events sent here: form_start (first focus), waitlist_submit_attempt (valid form submitted), form_submit_error.
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://api.talkestimate.com/functions/v1/join-waitlist';
  var ES = (document.documentElement.lang || 'en').slice(0, 2) === 'es';
  // Exactly the home page's words (index.html / es.html), so both forms answer the same way.
  var T = ES ? {
    ok: '✓ ¡Listo! Te escribimos personalmente para configurarte.',
    failed: 'Algo salió mal — inténtalo otra vez, o escríbenos a support@talkestimate.com',
    stopped: {
      rate_limited: 'Demasiados intentos desde esta conexión. Espera unos minutos e inténtalo de nuevo, o escríbenos a support@talkestimate.com',
      verification_failed: 'No pudimos verificar esta solicitud. Recarga la página e inténtalo de nuevo, o escríbenos a support@talkestimate.com'
    }
  } : {
    ok: "✓ You're in. We'll email you personally to get you set up.",
    failed: 'Something went wrong — try again, or email support@talkestimate.com',
    stopped: null // English shows the server's own (English) message, as the home form does
  };

  function track(evt, params) { if (window.teTrack) window.teTrack(evt, params); }
  function attribution() { try { return window.teAttribution ? window.teAttribution() : {}; } catch (e) { return {}; } }
  // The visitor's own analytics ids (only when analytics is running), so the SERVER can attach its confirmed "lead"
  // event to this visit. Nothing here is personal data; with analytics off this is just {}.
  function gaIds() { try { return window.teGaIds ? window.teGaIds() : Promise.resolve({}); } catch (e) { return Promise.resolve({}); } }

  function wire(form) {
    var btn = form.querySelector('button[type="submit"]');
    var msg = form.querySelector('.wl-msg');
    var email = form.querySelector('input[name="email"]');
    var trade = form.querySelector('select[name="trade"]');
    var trap = form.querySelector('input[name="te_hp_x"]');
    if (!btn || !msg || !email) return;
    var started = false;

    // form_start: once, on the first real interaction.
    form.addEventListener('focusin', function () {
      if (started) return;
      started = true;
      track('form_start', { form_name: 'waitlist_inline' });
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (btn.disabled) return; // one request at a time
      // An attempt (the button was pressed with a valid form), never "a lead".
      track('waitlist_submit_attempt', { form_name: 'waitlist_inline' });
      btn.disabled = true;
      msg.className = 'wl-msg';
      msg.textContent = '';
      var payload = Object.assign({
        email: email.value,
        trade: trade ? trade.value : '',
        company: trap ? trap.value : ''
      }, attribution(), await gaIds());
      // Only a message the SERVER sent is ever shown; a network failure (the browser's "Failed to fetch") or any
      // other error shows the plain fallback.
      var serverSaid = null;
      try {
        var res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        // A non-JSON answer (a gateway or rate-limit page) must not show a raw parse error, and only a clean
        // {ok:true} counts as received.
        var data = null;
        try { data = await res.json(); } catch (parseErr) { data = null; }
        if (!res.ok) {
          if (ES) serverSaid = (data && T.stopped[data.code]) || null;
          else serverSaid = (data && typeof data.error === 'string' && data.error) || null;
          throw new Error('failed');
        }
        if (!data || data.ok !== true) throw new Error('failed');
        msg.className = 'wl-msg ok';
        msg.textContent = T.ok;
        form.reset();
      } catch (err) {
        msg.className = 'wl-msg err';
        msg.textContent = serverSaid || T.failed;
        track('form_submit_error', { form_name: 'waitlist_inline' });
      } finally {
        btn.disabled = false;
      }
    });
  }

  var forms = document.querySelectorAll('form[data-waitlist]');
  for (var i = 0; i < forms.length; i++) wire(forms[i]);
})();
