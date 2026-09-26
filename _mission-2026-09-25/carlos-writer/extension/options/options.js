/* Carlos Writer settings page. Everything is stored in chrome.storage.local (this profile only). */
(() => {
  'use strict';
  const P = self.CWPrompts;
  const $ = (id) => document.getElementById(id);
  const API_ORIGIN = 'https://api.anthropic.com/*';
  let settings = P.mergeSettings({});

  function flashSaved(text) {
    const s = $('saved');
    s.textContent = text || 'Saved';
    s.classList.add('show');
    clearTimeout(flashSaved.t);
    flashSaved.t = setTimeout(() => s.classList.remove('show'), 1400);
  }

  async function save(patch, note) {
    settings = P.mergeSettings(Object.assign({}, settings, patch));
    await chrome.storage.local.set({ settings });
    flashSaved(note);
    render();
  }

  function setResult(id, text, kind) {
    const n = $(id);
    n.textContent = text;
    n.className = 'result' + (kind ? ' ' + kind : '');
  }

  function guideMeta() {
    const t = $('styleGuide').value;
    const words = (t.trim().match(/\S+/g) || []).length;
    const tokens = P.estimateTokens(t);
    let note = words + ' words, about ' + tokens + ' tokens sent with each rewrite.';
    if (words > 1200) note += ' That is long: local models get slower with a long guide.';
    $('guide-meta').textContent = note;
  }

  function render() {
    const s = settings;
    $('provider-ollama').checked = !(s.provider === 'anthropic' && s.anthropicEnabled);
    $('provider-anthropic').checked = s.provider === 'anthropic' && s.anthropicEnabled;
    $('api-card').classList.toggle('off', !$('provider-anthropic').checked);
    $('ollamaUrl').value = s.ollamaUrl;
    if (document.activeElement !== $('ollamaModel')) $('ollamaModel').value = s.ollamaModel;
    if (document.activeElement !== $('anthropicModel')) $('anthropicModel').value = s.anthropicModel;
    for (const r of document.querySelectorAll('input[name="length"]')) r.checked = r.value === s.length;
    $('tone').value = String(s.tone);
    $('onlyErrors').checked = s.onlyErrors;
    $('language').value = s.language;
    $('spanishVariety').value = s.spanishVariety;
    if (document.activeElement !== $('styleGuide')) $('styleGuide').value = s.styleGuide;
    if (document.activeElement !== $('styleGuideName')) $('styleGuideName').value = s.styleGuideName || '';
    guideMeta();
  }

  async function renderKeyStatus() {
    const { anthropicKey } = await chrome.storage.local.get('anthropicKey');
    setResult('key-status', anthropicKey ? 'A key is saved in this browser profile.' : 'No key saved.', anthropicKey ? 'ok' : '');
  }

  async function renderShortcuts() {
    const cmds = await chrome.commands.getAll();
    const body = $('keys');
    body.textContent = '';
    for (const c of cmds) {
      if (!c.description) continue;
      const tr = document.createElement('tr');
      const a = document.createElement('td');
      a.textContent = c.description;
      const b = document.createElement('td');
      b.textContent = c.shortcut || 'Not set';
      if (!c.shortcut) b.className = 'unset';
      tr.append(a, b);
      body.append(tr);
    }
  }

  // ---- Model / provider
  $('provider-ollama').addEventListener('click', async () => {
    await save({ provider: 'ollama', anthropicEnabled: false }, 'Using the local model');
    try { await chrome.permissions.remove({ origins: [API_ORIGIN] }); } catch (_) { /* not granted */ }
  });

  $('provider-anthropic').addEventListener('click', async (e) => {
    // Permission requests must run inside the click.
    let granted = false;
    try { granted = await chrome.permissions.request({ origins: [API_ORIGIN] }); } catch (_) { granted = false; }
    if (!granted) {
      e.target.checked = false;
      $('provider-ollama').checked = true;
      flashSaved('API not enabled (permission not granted)');
      return;
    }
    await save({ provider: 'anthropic', anthropicEnabled: true }, 'Anthropic API on. Selected text will be sent to Anthropic.');
  });

  $('ollamaUrl').addEventListener('change', () => save({ ollamaUrl: $('ollamaUrl').value }));
  $('ollamaModel').addEventListener('change', () => save({ ollamaModel: $('ollamaModel').value.trim() }));
  $('anthropicModel').addEventListener('change', () => save({ anthropicModel: $('anthropicModel').value.trim() }));

  $('check').addEventListener('click', async () => {
    setResult('check-result', 'Checking…');
    let res;
    try { res = await chrome.runtime.sendMessage({ type: 'cw-check-ollama' }); } catch (_) { res = null; }
    if (!res) return setResult('check-result', 'No answer from the extension. Reload it and try again.', 'bad');
    if (!res.ok) return setResult('check-result', res.message, 'bad');
    const names = res.models.map((m) => m.name);
    const out = $('check-result');
    out.textContent = '';
    out.className = 'result ' + (res.modelInstalled ? 'ok' : 'bad');
    out.append('Ollama ' + (res.version || '') + ' is running. ');
    if (res.modelInstalled) out.append('“' + res.model + '” is installed. ');
    else out.append('“' + res.model + '” is not installed. In PowerShell: ollama pull ' + res.model + '. ');
    if (names.length) {
      out.append('Installed: ');
      names.forEach((n, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = n;
        b.className = 'small';
        b.addEventListener('click', () => save({ ollamaModel: n }, 'Model set to ' + n));
        out.append(b, i < names.length - 1 ? ' ' : '');
      });
    }
  });

  $('save-key').addEventListener('click', async () => {
    const v = $('anthropicKey').value.trim();
    if (!v) return setResult('key-status', 'Paste a key first.', 'bad');
    if (!/^sk-ant-[A-Za-z0-9_\-]{20,}$/.test(v)) return setResult('key-status', 'That does not look like an Anthropic API key (it should start with sk-ant-). Not saved.', 'bad');
    await chrome.storage.local.set({ anthropicKey: v });
    $('anthropicKey').value = '';
    renderKeyStatus();
    flashSaved('Key saved in this browser profile');
  });

  $('forget-key').addEventListener('click', async () => {
    await chrome.storage.local.remove('anthropicKey');
    $('anthropicKey').value = '';
    renderKeyStatus();
    flashSaved('Key removed');
  });

  // ---- Writing
  for (const r of document.querySelectorAll('input[name="length"]')) {
    r.addEventListener('change', () => save({ length: r.value }));
  }
  $('tone').addEventListener('change', () => save({ tone: Number($('tone').value) }));
  $('onlyErrors').addEventListener('change', () => save({ onlyErrors: $('onlyErrors').checked }));
  $('language').addEventListener('change', () => save({ language: $('language').value }));
  $('spanishVariety').addEventListener('change', () => save({ spanishVariety: $('spanishVariety').value }));

  // ---- Style guide
  let guideTimer = null;
  $('styleGuide').addEventListener('input', () => {
    guideMeta();
    clearTimeout(guideTimer);
    guideTimer = setTimeout(() => save({ styleGuide: $('styleGuide').value }), 500);
  });
  $('styleGuide').addEventListener('blur', () => { clearTimeout(guideTimer); save({ styleGuide: $('styleGuide').value }); });
  $('styleGuideName').addEventListener('change', () => save({ styleGuideName: $('styleGuideName').value.trim() || 'Custom' }));

  $('reset-guide').addEventListener('click', () => {
    save({ styleGuide: P.NEUTRAL_STYLE_GUIDE, styleGuideName: 'Neutral default' }, 'Neutral guide restored');
    setResult('guide-status', 'Neutral guide restored.', 'ok');
  });

  $('export').addEventListener('click', () => {
    const blob = new Blob([settings.styleGuide], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (settings.styleGuideName || 'style-guide').replace(/[^\w.-]+/g, '-') + '.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // Accepts .txt/.md (the guide itself) or .json {styleGuide, styleGuideName, settings:{length,tone,onlyErrors,language,spanishVariety}}.
  // A file can never change the provider, the endpoint or the key.
  $('import').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 200000) return setResult('guide-status', 'That file is larger than 200 KB. Not imported.', 'bad');
    const text = await f.text();
    const patch = {};
    if (/\.json$/i.test(f.name)) {
      let data;
      try { data = JSON.parse(text); } catch (_) { return setResult('guide-status', 'That JSON file could not be read. Not imported.', 'bad'); }
      if (typeof data.styleGuide !== 'string' || !data.styleGuide.trim()) return setResult('guide-status', 'That JSON file has no "styleGuide" text. Not imported.', 'bad');
      patch.styleGuide = data.styleGuide;
      patch.styleGuideName = typeof data.styleGuideName === 'string' ? data.styleGuideName : f.name;
      const allowed = ['length', 'tone', 'onlyErrors', 'language', 'spanishVariety'];
      if (data.settings && typeof data.settings === 'object') {
        for (const k of allowed) if (k in data.settings) patch[k] = data.settings[k];
      }
    } else {
      if (!text.trim()) return setResult('guide-status', 'That file is empty. Not imported.', 'bad');
      patch.styleGuide = text;
      patch.styleGuideName = f.name.replace(/\.(txt|md)$/i, '');
    }
    await save(patch, 'Style guide imported');
    setResult('guide-status', 'Imported “' + (patch.styleGuideName || f.name) + '”.', 'ok');
  });

  // ---- Shortcuts
  $('shortcuts').addEventListener('click', () => {
    const edge = /\bEdg\//.test(navigator.userAgent);
    chrome.tabs.create({ url: edge ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts' });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) { settings = P.mergeSettings(changes.settings.newValue); render(); }
    if (area === 'local' && changes.anthropicKey) renderKeyStatus();
  });

  (async () => {
    const { settings: stored } = await chrome.storage.local.get('settings');
    settings = P.mergeSettings(stored);
    // Keep the provider honest if the permission was removed outside this page.
    if (settings.provider === 'anthropic' && settings.anthropicEnabled) {
      const has = await chrome.permissions.contains({ origins: [API_ORIGIN] });
      if (!has) settings = P.mergeSettings(Object.assign({}, settings, { provider: 'ollama', anthropicEnabled: false }));
    }
    render();
    renderKeyStatus();
    renderShortcuts();
  })();
})();
