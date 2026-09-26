/* Carlos Writer toolbar popup: paste text, pick an action, copy the result. */
(() => {
  'use strict';
  const P = self.CWPrompts;
  const $ = (id) => document.getElementById(id);
  let port = null;
  let last = null;

  function el(tag, text) { const n = document.createElement(tag); if (text != null) n.textContent = text; return n; }

  function renderOps(ops, side) {
    const frag = document.createDocumentFragment();
    for (const op of ops) {
      if (op.t === '=') frag.append(document.createTextNode(op.s));
      else if (op.t === '-' && side === 'before') frag.append(el('del', op.s));
      else if (op.t === '+' && side === 'after') frag.append(el('ins', op.s));
    }
    return frag;
  }

  function setBusy(busy) {
    for (const b of document.querySelectorAll('.acts button')) b.disabled = busy;
  }

  function run(action) {
    const text = $('input').value;
    const parts = P.splitOuterWhitespace(text);
    if (!parts.core.trim()) { $('status').textContent = 'Paste some text first.'; return; }
    if (port) { try { port.disconnect(); } catch (_) {} }
    $('out').hidden = true;
    setBusy(true);
    const t0 = performance.now();
    const label = (P.ACTIONS.find((a) => a.id === action) || {}).label;
    const tick = setInterval(() => { $('status').textContent = label + ': working… ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s'; }, 100);
    port = chrome.runtime.connect({ name: 'cw-run' });
    const mine = port;
    const ping = setInterval(() => { try { mine.postMessage({ type: 'ping' }); } catch (_) {} }, 10000);
    const finish = () => { clearInterval(tick); clearInterval(ping); setBusy(false); };
    mine.onMessage.addListener((m) => {
      if (m.type === 'progress') return;
      finish();
      try { mine.disconnect(); } catch (_) {}
      if (m.type === 'error') { $('status').textContent = m.message; return; }
      last = m;
      $('orig').textContent = '';
      $('sugg').textContent = '';
      $('orig').append(renderOps(m.ops, 'before'));
      $('sugg').append(renderOps(m.ops, 'after'));
      $('count').textContent = m.changes === 0 ? 'no changes' : m.changes === 1 ? '1 change' : m.changes + ' changes';
      const miss = m.missing || [];
      $('warn').hidden = !miss.length;
      $('warn').textContent = miss.length ? 'Check before you use it. Not found in the suggestion: ' + miss.map((x) => x.value).join(', ') + '.' : '';
      $('status').textContent = label + ' · ' + m.model + ' · ' + (m.ms < 1000 ? Math.round(m.ms) + ' ms' : (m.ms / 1000).toFixed(1) + ' s');
      $('out').hidden = false;
    });
    mine.onDisconnect.addListener(() => finish());
    mine.postMessage({ type: 'run', action, text: parts.core });
  }

  for (const [i, a] of P.ACTIONS.entries()) {
    const b = el('button', a.label);
    b.type = 'button';
    b.title = 'Shortcut inside this box: Alt+' + (i + 1);
    b.addEventListener('click', () => run(a.id));
    $('acts').append(b);
  }
  $('input').addEventListener('keydown', (e) => {
    if (e.altKey && /^[1-6]$/.test(e.key)) { e.preventDefault(); run(P.ACTIONS[Number(e.key) - 1].id); }
  });
  $('copy').addEventListener('click', async () => {
    if (!last) return;
    try { await navigator.clipboard.writeText(last.suggestion); $('copy').textContent = 'Copied'; }
    catch (_) { $('copy').textContent = 'Copy failed'; }
    setTimeout(() => { $('copy').textContent = 'Copy suggestion'; }, 1500);
  });
  $('clear').addEventListener('click', () => { $('input').value = ''; $('out').hidden = true; $('status').textContent = ''; $('input').focus(); });
  $('settings').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
  chrome.runtime.sendMessage({ type: 'cw-provider-label' }).then((r) => {
    if (r && r.label) $('where').textContent = 'Sends the text to: ' + r.label;
  }).catch(() => {});
  $('input').focus();
})();
