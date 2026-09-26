/*
 * Carlos Writer content script. Injected only when you use the shortcut or the
 * right-click menu (activeTab). It reads the selection, shows the panel, and
 * changes the page only when you click Replace.
 *
 * The last expression returns a small probe object to the service worker so
 * it can pick the frame that holds your selection.
 */
(() => {
  'use strict';
  const G = globalThis;
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };
  if (G.__carlosWriter && G.__carlosWriter.alive()) return G.__carlosWriter.probe();
  if (G.__carlosWriter && G.__carlosWriter.teardown) { try { G.__carlosWriter.teardown(); } catch (_) { /* old copy */ } }

  const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'url', 'tel']);
  const SENSITIVE_AC = /(^|\s)(current-password|new-password|one-time-code|cc-number|cc-csc|cc-exp|cc-exp-month|cc-exp-year)(\s|$)/i;
  const MAX_CHARS = 12000;

  // ---------------------------------------------------------------- selection

  function deepActive() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  function sensitiveReason(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.tagName === 'INPUT') {
      const type = String(el.type || '').toLowerCase();
      if (type === 'password') return 'password';
      if (type === 'hidden') return 'hidden';
    }
    const ac = el.getAttribute && el.getAttribute('autocomplete');
    if (ac && SENSITIVE_AC.test(ac)) return 'sensitive';
    try {
      const st = getComputedStyle(el);
      const sec = st.getPropertyValue('-webkit-text-security');
      if (sec && sec.trim() && sec.trim() !== 'none') return 'password';
    } catch (_) { /* detached */ }
    return null;
  }

  function editingHost(node) {
    let el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el || !el.isContentEditable) return null;
    while (el.parentElement && el.parentElement.isContentEditable) el = el.parentElement;
    return el;
  }

  function selectionFor(el) {
    const root = el && el.getRootNode ? el.getRootNode() : document;
    if (root && root !== document && typeof root.getSelection === 'function') return root.getSelection();
    return document.getSelection();
  }

  function capture() {
    const active = deepActive();
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      const reason = sensitiveReason(active);
      if (reason) return { refused: reason };
      if (active.tagName === 'INPUT' && !TEXT_INPUT_TYPES.has(String(active.getAttribute('type') || '').toLowerCase())) {
        return { refused: 'unsupported-field' };
      }
      let start = null;
      let end = null;
      try { start = active.selectionStart; end = active.selectionEnd; } catch (_) { /* no selection API */ }
      if (start == null || end == null) return { refused: 'unsupported-field' };
      if (end > start) {
        return {
          kind: active.tagName === 'TEXTAREA' ? 'textarea' : 'input',
          el: active,
          start,
          end,
          text: active.value.slice(start, end),
          editable: !active.readOnly && !active.disabled,
          rect: active.getBoundingClientRect(),
        };
      }
      // Empty selection in the focused field: fall through to a page selection, if any.
    }
    const sel = selectionFor(active);
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return { empty: true };
    const text = sel.toString();
    if (!text.trim()) return { empty: true };
    const range = sel.getRangeAt(0).cloneRange();
    const a = editingHost(range.startContainer);
    const b = editingHost(range.endContainer);
    const host = a && a === b ? a : null;
    if (host) {
      const reason = sensitiveReason(host);
      if (reason) return { refused: reason };
    }
    let rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) rect = (host || document.body || document.documentElement).getBoundingClientRect();
    return { kind: host ? 'editable' : 'page', range, host, text, editable: !!host, rect, sel };
  }

  function probe() {
    let c = null;
    try { c = capture(); } catch (_) { /* ignore */ }
    const active = document.activeElement;
    return {
      hasSelection: !!(c && !c.empty && !c.refused),
      refused: (c && c.refused) || null,
      focused: document.hasFocus(),
      activeIsFrame: !!(active && /^(IFRAME|FRAME)$/.test(active.tagName)),
      top: window === window.top,
    };
  }

  function splitOuter(text) {
    const lead = (text.match(/^\s*/) || [''])[0];
    const rest = text.slice(lead.length);
    const trail = (rest.match(/\s*$/) || [''])[0];
    return { lead, core: rest.slice(0, rest.length - trail.length), trail };
  }

  // --------------------------------------------------------------------- panel

  const CSS = `
:host { all: initial; position: fixed; z-index: 2147483647; top: 16px; left: 16px; }
* { box-sizing: border-box; }
.panel {
  --bg: #FFFDF9; --ink: #1D1B18; --muted: #57524A; --line: #DDD5C8; --soft: #F3EEE5;
  --accent: #B23C1C; --accent-ink: #FFFFFF; --del-bg: rgba(178, 60, 28, 0.13); --del-ink: #8A2E14;
  --ins-bg: rgba(38, 120, 60, 0.16); --ins-ink: #1E5E2F; --warn-bg: #FFF4D6; --warn-ink: #5C4400;
  width: min(460px, calc(100vw - 24px)); max-height: min(78vh, 640px); overflow: auto;
  background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 12px;
  box-shadow: 0 12px 36px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.12);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; text-align: left;
  outline: none;
}
@media (prefers-color-scheme: dark) {
  .panel {
    --bg: #1B1917; --ink: #EFE9DF; --muted: #ABA396; --line: #3A3530; --soft: #262320;
    --accent: #F07A52; --accent-ink: #1B1917; --del-bg: rgba(240, 122, 82, 0.20); --del-ink: #FFB49B;
    --ins-bg: rgba(110, 200, 130, 0.20); --ins-ink: #A8E6B4; --warn-bg: #3A3016; --warn-ink: #F3DB9A;
  }
}
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px 6px; }
.brand { font-weight: 700; }
.title { color: var(--muted); }
.spacer { flex: 1; }
button { font: inherit; cursor: pointer; border-radius: 8px; border: 1px solid var(--line); background: var(--soft); color: var(--ink); padding: 6px 12px; }
button:hover { border-color: var(--muted); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button[disabled] { opacity: 0.45; cursor: not-allowed; }
.close { border: none; background: transparent; font-size: 18px; line-height: 1; padding: 2px 6px; color: var(--muted); }
.where { padding: 0 12px 8px; font-size: 12px; color: var(--muted); }
.where b { font-weight: 600; color: var(--ink); }
.where.online b { color: var(--accent); }
.choose { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 4px 12px 12px; }
.choose button { text-align: left; }
.choose kbd { font: 11px ui-monospace, Consolas, monospace; color: var(--muted); margin-right: 6px; }
.status { padding: 6px 12px 12px; color: var(--muted); display: flex; gap: 8px; align-items: center; }
.spin { width: 14px; height: 14px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
.msg { margin: 4px 12px 12px; padding: 10px 12px; border-radius: 8px; background: var(--soft); }
.msg.error { background: var(--del-bg); color: var(--ink); }
.label { display: flex; justify-content: space-between; padding: 4px 12px 2px; font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.box { margin: 0 12px 8px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; white-space: pre-wrap; word-wrap: break-word; max-height: 200px; overflow: auto; background: var(--bg); }
del { background: var(--del-bg); color: var(--del-ink); text-decoration: line-through; border-radius: 3px; }
ins { background: var(--ins-bg); color: var(--ins-ink); text-decoration: underline; text-decoration-thickness: 1px; border-radius: 3px; }
.warn { margin: 0 12px 8px; padding: 8px 10px; border-radius: 8px; background: var(--warn-bg); color: var(--warn-ink); font-size: 13px; }
.note { margin: 0 12px 8px; font-size: 12px; color: var(--muted); }
.foot { display: flex; gap: 8px; padding: 8px 12px 12px; border-top: 1px solid var(--line); }
.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 600; }
.primary:hover { filter: brightness(1.05); border-color: var(--accent); }
[hidden] { display: none !important; }
`;

  let ui = null;
  let state = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function trusted(handler) {
    return (e) => {
      if (!e.isTrusted) return; // page scripts can't click for you
      e.preventDefault();
      e.stopPropagation();
      handler(e);
    };
  }

  function button(label, cls, onClick) {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('mousedown', (e) => { if (e.isTrusted) e.preventDefault(); }); // keep the page selection
    b.addEventListener('click', trusted(onClick));
    return b;
  }

  function buildUI() {
    const host = document.createElement('carlos-writer-panel');
    const shadow = host.attachShadow({ mode: 'closed' });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      shadow.adoptedStyleSheets = [sheet];
    } catch (_) {
      const style = document.createElement('style');
      style.textContent = CSS;
      shadow.appendChild(style);
    }
    const panel = el('div', 'panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Carlos Writer');
    panel.tabIndex = -1;

    const head = el('div', 'head');
    const brand = el('span', 'brand', 'Carlos Writer');
    const title = el('span', 'title', '');
    const spacer = el('span', 'spacer');
    const close = button('×', 'close', () => cancel());
    close.setAttribute('aria-label', 'Close');
    close.title = 'Close (Esc)';
    head.append(brand, title, spacer, close);

    const where = el('div', 'where');
    const choose = el('div', 'choose');
    const status = el('div', 'status');
    const msg = el('div', 'msg');
    const result = el('div', 'result');
    const labelA = el('div', 'label');
    const labelAText = el('span', null, 'Original');
    const count = el('span', 'count', '');
    labelA.append(labelAText, count);
    const orig = el('div', 'box orig');
    const labelB = el('div', 'label');
    labelB.append(el('span', null, 'Suggestion'));
    const sugg = el('div', 'box sugg');
    const warn = el('div', 'warn');
    const note = el('div', 'note');
    result.append(labelA, orig, labelB, sugg, warn, note);

    const foot = el('div', 'foot');
    const replace = button('Replace', 'primary replace', () => doReplace());
    const copy = button('Copy', 'copy', () => doCopy());
    const cancelBtn = button('Cancel', 'cancel', () => cancel());
    foot.append(replace, copy, cancelBtn);

    panel.append(head, where, choose, status, msg, result, foot);
    shadow.append(panel);

    panel.addEventListener('keydown', (e) => {
      if (!e.isTrusted) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return; }
      if (state && state.mode === 'choose' && /^[1-6]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const a = state.actions[Number(e.key) - 1];
        if (a) { e.preventDefault(); e.stopPropagation(); run(a.id); }
      }
    });

    return { host, shadow, panel, title, where, choose, status, msg, result, count, orig, sugg, warn, note, foot, replace, copy, cancelBtn };
  }

  function onDocKeydown(e) {
    if (!e.isTrusted || !ui) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
  }

  function show(parts) {
    const all = ['choose', 'status', 'msg', 'result'];
    for (const p of all) ui[p].hidden = !parts.includes(p);
  }

  // Keep the panel next to the selection when it is on screen, and always fully inside the viewport.
  function place(rect) {
    const host = ui.host;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(460, vw - 24);
    const onScreen = rect && rect.bottom > 0 && rect.top < vh;
    const left = Math.max(12, Math.min(onScreen ? rect.left : 12, vw - w - 12));
    const first = onScreen ? rect.bottom + 8 : 16;
    host.style.setProperty('left', left + 'px');
    host.style.setProperty('top', Math.max(8, Math.min(first, vh - 220)) + 'px');
    requestAnimationFrame(() => {
      if (!ui) return;
      const h = ui.panel.getBoundingClientRect().height;
      let top = first;
      if (top + h > vh - 8) {
        const above = onScreen ? rect.top - 8 - h : -1;
        top = above >= 8 ? above : vh - h - 8;
      }
      top = Math.max(8, Math.min(top, vh - h - 8));
      host.style.setProperty('top', top + 'px');
    });
  }

  function openPanel(label) {
    if (!ui || !ui.host.isConnected) {
      ui = buildUI();
      (document.documentElement || document.body).appendChild(ui.host);
      document.addEventListener('keydown', onDocKeydown, true);
    }
    ui.title.textContent = label ? '· ' + label : '';
    ui.where.textContent = '';
    if (state && state.providerLabel) {
      ui.where.className = 'where' + (state.online ? ' online' : '');
      ui.where.append('Sends the selected text to: ');
      ui.where.append(el('b', null, state.providerLabel));
    }
    ui.warn.hidden = true;
    ui.note.hidden = true;
    place(state && state.cap && state.cap.rect);
    try { ui.panel.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
  }

  function closePanel(restore) {
    const s = state;
    stopTimer();
    if (s && s.port) { try { s.port.postMessage({ type: 'cancel' }); s.port.disconnect(); } catch (_) { /* gone */ } }
    if (s && s.ping) clearInterval(s.ping);
    if (ui) {
      document.removeEventListener('keydown', onDocKeydown, true);
      ui.host.remove();
      ui = null;
    }
    state = null;
    if (restore && s && s.cap && !s.cap.empty && !s.cap.refused) restoreSelection(s.cap);
  }

  function restoreSelection(cap) {
    try {
      if ((cap.kind === 'input' || cap.kind === 'textarea') && cap.el.isConnected) {
        cap.el.focus({ preventScroll: true });
        cap.el.setSelectionRange(cap.start, cap.end);
      } else if (cap.range) {
        if (cap.host && cap.host.isConnected) cap.host.focus({ preventScroll: true });
        const sel = cap.sel || document.getSelection();
        sel.removeAllRanges();
        sel.addRange(cap.range);
      }
    } catch (_) { /* page changed */ }
  }

  function cancel() { closePanel(true); }

  function message(text, isError) {
    ui.msg.textContent = text;
    ui.msg.className = 'msg' + (isError ? ' error' : '');
    show(['msg']);
    ui.replace.hidden = true;
    ui.copy.hidden = true;
    ui.cancelBtn.textContent = 'Close';
  }

  const REFUSALS = {
    password: 'This is a password field. Carlos Writer does not read passwords.',
    sensitive: 'This field looks like a password, a one-time code or a card number. Carlos Writer does not read it.',
    hidden: 'This field is hidden. Carlos Writer does not read it.',
    'unsupported-field': 'This kind of field (for example email or number) does not expose a text selection. Copy the text and use the Carlos Writer toolbar button instead.',
  };

  function start(msg) {
    closePanel(false);
    let cap;
    try { cap = capture(); } catch (_) { cap = { empty: true }; }
    state = { cap, actions: msg.actions || [], providerLabel: msg.providerLabel || '', online: !!msg.online, mode: 'start' };
    const label = msg.action ? (state.actions.find((a) => a.id === msg.action) || {}).label : '';
    openPanel(label);
    if (cap.refused) {
      ui.where.textContent = 'Nothing was sent anywhere.';
      message(REFUSALS[cap.refused] || REFUSALS.sensitive, false);
      return;
    }
    if (cap.empty) {
      ui.where.textContent = 'Nothing was sent anywhere.';
      message('Select some text first, then use the shortcut or the right-click menu again. (In Google Docs, copy the text and use the Carlos Writer toolbar button.)', false);
      return;
    }
    const parts = splitOuter(cap.text);
    state.parts = parts;
    if (parts.core.length > MAX_CHARS) {
      message('That selection is ' + parts.core.length.toLocaleString('en-US') + ' characters. The limit is ' + MAX_CHARS.toLocaleString('en-US') + ' (about 2,000 words). Select less and run it in parts.', false);
      return;
    }
    if (msg.action) run(msg.action);
    else showChooser();
  }

  function showChooser() {
    state.mode = 'choose';
    ui.choose.textContent = '';
    state.actions.forEach((a, i) => {
      const b = button('', 'act', () => run(a.id));
      b.append(el('kbd', null, String(i + 1)), a.label);
      b.dataset.action = a.id;
      ui.choose.append(b);
    });
    show(['choose']);
    ui.replace.hidden = true;
    ui.copy.hidden = true;
    ui.cancelBtn.hidden = false;
    ui.cancelBtn.textContent = 'Cancel';
  }

  let timer = null;
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  function run(action) {
    if (!state || !state.parts) return;
    const label = (state.actions.find((a) => a.id === action) || {}).label || action;
    state.mode = 'working';
    state.action = action;
    ui.title.textContent = '· ' + label;
    ui.status.textContent = '';
    const spin = el('span', 'spin');
    const txt = el('span', null, 'Working… 0.0 s');
    ui.status.append(spin, txt);
    show(['status']);
    ui.replace.hidden = true;
    ui.copy.hidden = true;
    ui.cancelBtn.hidden = false;
    ui.cancelBtn.textContent = 'Cancel';
    const t0 = performance.now();
    let tokens = 0;
    stopTimer();
    timer = setInterval(() => {
      const s = ((performance.now() - t0) / 1000).toFixed(1);
      txt.textContent = 'Working… ' + s + ' s' + (tokens ? ' · ' + tokens + ' tokens' : '');
    }, 100);
    let port;
    try {
      port = chrome.runtime.connect({ name: 'cw-run' });
    } catch (_) {
      stopTimer();
      message('Carlos Writer was updated or restarted. Reload this page and try again.', true);
      return;
    }
    state.port = port;
    state.ping = setInterval(() => { try { port.postMessage({ type: 'ping' }); } catch (_) { /* closed */ } }, 10000);
    port.onMessage.addListener((m) => {
      if (!state || state.port !== port) return;
      if (m.type === 'progress') { tokens = m.tokens || tokens; return; }
      stopTimer();
      clearInterval(state.ping);
      state.port = null;
      try { port.disconnect(); } catch (_) { /* gone */ }
      if (m.type === 'result') renderResult(m);
      else if (m.type === 'error') message(m.message || 'Something went wrong.', true);
    });
    port.onDisconnect.addListener(() => {
      if (!state || state.port !== port) return;
      stopTimer();
      clearInterval(state.ping);
      state.port = null;
      message('Lost the connection to Carlos Writer before the answer arrived. Try again.', true);
    });
    port.postMessage({ type: 'run', action, text: state.parts.core });
  }

  function renderOps(ops, side) {
    const frag = document.createDocumentFragment();
    for (const op of ops) {
      if (op.t === '=') frag.append(document.createTextNode(op.s));
      else if (op.t === '-' && side === 'before') frag.append(el('del', null, op.s));
      else if (op.t === '+' && side === 'after') frag.append(el('ins', null, op.s));
    }
    return frag;
  }

  function renderResult(r) {
    state.mode = 'result';
    state.result = r;
    ui.orig.textContent = '';
    ui.sugg.textContent = '';
    ui.orig.append(renderOps(r.ops, 'before'));
    ui.sugg.append(renderOps(r.ops, 'after'));
    ui.count.textContent = r.changes === 0 ? 'no changes' : r.changes === 1 ? '1 change' : r.changes + ' changes';
    const missing = Array.isArray(r.missing) ? r.missing : [];
    if (missing.length) {
      ui.warn.textContent = 'Check before you replace. Not found in the suggestion: ' + missing.map((m) => m.value).join(', ') + '.';
      ui.warn.hidden = false;
    } else {
      ui.warn.hidden = true;
    }
    const secs = r.ms < 1000 ? Math.round(r.ms) + ' ms' : (r.ms / 1000).toFixed(1) + ' s';
    const notes = [r.model + ' · ' + secs];
    if (!state.cap.editable) notes.push('This text is not editable here, so only Copy is available.');
    ui.note.textContent = notes.join(' ');
    ui.note.hidden = false;
    show(['result']);
    ui.replace.hidden = false;
    ui.copy.hidden = false;
    ui.replace.disabled = !state.cap.editable || r.changes === 0;
    ui.replace.title = !state.cap.editable ? 'This text is not editable here.' : r.changes === 0 ? 'No changes to apply.' : 'Replace the selection with the suggestion';
    ui.cancelBtn.textContent = 'Cancel';
    place(state.cap.rect);
  }

  function fail(text) {
    ui.warn.textContent = text;
    ui.warn.hidden = false;
  }

  function doReplace() {
    const s = state;
    if (!s || s.mode !== 'result' || !s.result || !s.cap.editable) return;
    const cap = s.cap;
    let body = s.result.suggestion;
    if (cap.kind === 'input') body = body.replace(/\s*[\r\n]+\s*/g, ' '); // single-line field
    const newText = s.parts.lead + body + s.parts.trail;
    let undoable = true;
    if (cap.kind === 'input' || cap.kind === 'textarea') {
      const f = cap.el;
      if (!f.isConnected) return fail('The field is gone. Nothing was changed.');
      if (f.value.slice(cap.start, cap.end) !== cap.text) return fail('The text changed since you selected it. Nothing was changed. Select it again and rerun.');
      f.focus({ preventScroll: true });
      f.setSelectionRange(cap.start, cap.end);
      let ok = false;
      try { ok = document.execCommand('insertText', false, newText); } catch (_) { ok = false; }
      if (!ok || f.value.slice(cap.start, cap.start + newText.length) !== newText) {
        if (f.value.slice(cap.start, cap.end) === cap.text) {
          f.setRangeText(newText, cap.start, cap.end, 'end');
          f.dispatchEvent(new Event('input', { bubbles: true }));
          undoable = false;
        } else if (f.value.slice(cap.start, cap.start + newText.length) !== newText) {
          return fail('This field did not accept the change. Use Copy instead.');
        }
      }
      const end = cap.start + newText.length;
      try { f.setSelectionRange(end, end); } catch (_) { /* ignore */ }
    } else if (cap.kind === 'editable') {
      const host = cap.host;
      if (!host || !host.isConnected) return fail('The editor is gone. Nothing was changed.');
      host.focus({ preventScroll: true });
      const sel = cap.sel || document.getSelection();
      sel.removeAllRanges();
      sel.addRange(cap.range);
      if (sel.toString() !== cap.text) return fail('The text changed since you selected it. Nothing was changed. Select it again and rerun.');
      let ok = false;
      try { ok = document.execCommand('insertText', false, newText); } catch (_) { ok = false; }
      if (!ok) {
        const r = sel.rangeCount ? sel.getRangeAt(0) : cap.range;
        r.deleteContents();
        r.insertNode(document.createTextNode(newText));
        host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
        undoable = false;
      }
    } else {
      return;
    }
    const done = undoable ? 'Replaced. Press Ctrl+Z in the text to undo.' : 'Replaced. This editor may not support undo for this change.';
    stopTimer();
    if (ui) {
      ui.note.textContent = done;
      ui.replace.disabled = true;
    }
    const closing = state;
    setTimeout(() => { if (state === closing) closePanel(false); }, 1200);
  }

  async function doCopy() {
    const s = state;
    if (!s || !s.result) return;
    const text = s.result.suggestion;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (_) { ok = false; }
    if (!ok && ui) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.setProperty('position', 'fixed');
      ta.style.setProperty('opacity', '0');
      ui.shadow.append(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      ta.remove();
      try { ui.panel.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    }
    if (ui) {
      ui.copy.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => { if (ui) ui.copy.textContent = 'Copy'; }, 1500);
    }
  }

  const onMessage = (msg, sender) => {
    if (!sender || sender.id !== chrome.runtime.id || !msg) return;
    if (msg.type === 'cw-start') start(msg);
  };
  chrome.runtime.onMessage.addListener(onMessage);

  G.__carlosWriter = {
    alive,
    probe,
    teardown() {
      closePanel(false);
      try { chrome.runtime.onMessage.removeListener(onMessage); } catch (_) { /* invalidated */ }
    },
  };
  return probe();
})();
