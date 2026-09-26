/*
 * Carlos Writer service worker.
 *
 * - Adds the right-click menu and the keyboard commands.
 * - Injects the content script only when you invoke it (activeTab), never on page load.
 * - Is the only place that sends text anywhere: to Ollama on this computer, or,
 *   only if you turned it on, to the Anthropic API.
 * - Logs nothing about your text, settings or key.
 */
importScripts('lib/prompts.js', 'lib/diff.js', 'lib/providers.js');

const P = self.CWPrompts;
const D = self.CWDiff;
const { ProviderError, ollamaVersion, runOllama, runAnthropic } = self.CWProviders;

const COMMAND_ACTIONS = { 'cw-menu': null, 'cw-proofread': 'proofread', 'cw-carlos': 'carlos' };
const DNR_RULE_ID = 1;
const ANTHROPIC_ORIGIN = 'https://api.anthropic.com/*';

// Keep the API key and settings away from content scripts (they run inside web pages).
const storageLocked = (async () => {
  try { await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }); } catch (_) { /* older browsers */ }
})();

// Ollama rejects requests whose Origin is a chrome-extension:// URL unless
// OLLAMA_ORIGINS is changed. Instead of asking you to change that setting, we
// drop the Origin header on this extension's own background requests to
// localhost:11434. The rule matches nothing else: not web pages, not other hosts.
async function ensureOriginRule() {
  const rule = {
    id: DNR_RULE_ID,
    priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] },
    condition: {
      regexFilter: '^http://(localhost|127\\.0\\.0\\.1):11434/',
      initiatorDomains: [chrome.runtime.id],
      tabIds: [chrome.tabs.TAB_ID_NONE],
      resourceTypes: ['xmlhttprequest', 'other'],
    },
  };
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [DNR_RULE_ID], addRules: [rule] });
}
const originRuleReady = ensureOriginRule().catch(() => false);

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'cw-root', title: 'Carlos Writer', contexts: ['selection'] });
    for (const a of P.ACTIONS) {
      chrome.contextMenus.create({ id: 'cw-' + a.id, parentId: 'cw-root', title: a.menu, contexts: ['selection'] });
    }
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  setupMenus();
  if (details && details.reason === 'install') {
    chrome.runtime.openOptionsPage().catch(() => {});
  }
});

async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return P.mergeSettings(settings);
}

function usesApi(s) {
  return s.provider === 'anthropic' && s.anthropicEnabled === true;
}

function providerLabel(s) {
  return usesApi(s)
    ? 'Anthropic API (internet) · ' + s.anthropicModel
    : 'This computer (Ollama) · ' + s.ollamaModel;
}

async function flagUnavailable(tabId) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#B23C1C' });
    await chrome.action.setBadgeText({ tabId, text: '!' });
    await chrome.action.setTitle({ tabId, title: 'Carlos Writer can\'t run on this page (browser pages, the extension store and PDF viewer are off-limits). Use the toolbar button: paste the text there.' });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
      chrome.action.setTitle({ tabId, title: 'Carlos Writer' }).catch(() => {});
    }, 5000);
  } catch (_) { /* tab closed */ }
}

/**
 * Entry point for the keyboard commands and the right-click menu.
 * action = null shows the action menu in the page.
 */
async function startFlow(tab, frameId, action) {
  if (!tab || typeof tab.id !== 'number' || tab.id < 0) return { ok: false, reason: 'no-tab' };
  const tabId = tab.id;
  let results = null;
  const hasFrame = typeof frameId === 'number' && frameId >= 0;
  try {
    results = await chrome.scripting.executeScript({
      target: hasFrame ? { tabId, frameIds: [frameId] } : { tabId, allFrames: true },
      files: ['content/content.js'],
    });
  } catch (e) {
    if (!hasFrame) {
      try {
        results = await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] });
      } catch (_) { /* fall through */ }
    }
  }
  const probes = (results || []).filter((r) => r && r.result && typeof r.result === 'object');
  if (!probes.length) {
    await flagUnavailable(tabId);
    return { ok: false, reason: 'cannot-inject' };
  }
  let pick = null;
  if (hasFrame) pick = probes.find((r) => r.frameId === frameId) || probes[0];
  if (!pick) {
    const inFocus = (r) => r.result.focused && !r.result.activeIsFrame;
    pick = probes.find((r) => r.result.hasSelection && inFocus(r))
      || probes.find((r) => r.result.refused && inFocus(r))
      || probes.find((r) => r.result.hasSelection)
      || probes.find((r) => r.frameId === 0)
      || probes[0];
  }
  const s = await loadSettings();
  await chrome.tabs.sendMessage(tabId, {
    type: 'cw-start',
    action: action && P.ACTION_IDS.includes(action) ? action : null,
    actions: P.ACTIONS.map((a) => ({ id: a.id, label: a.label })),
    providerLabel: providerLabel(s),
    online: usesApi(s),
  }, { frameId: pick.frameId });
  return { ok: true, frameId: pick.frameId };
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (!(command in COMMAND_ACTIONS)) return;
  const go = (t) => startFlow(t, null, COMMAND_ACTIONS[command]).catch(() => {});
  if (tab && typeof tab.id === 'number') go(tab);
  else chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => go(tabs[0]));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = String(info.menuItemId || '');
  if (!id.startsWith('cw-') || id === 'cw-root') return;
  const action = id.slice(3);
  if (!P.ACTION_IDS.includes(action)) return;
  startFlow(tab, typeof info.frameId === 'number' ? info.frameId : null, action).catch(() => {});
});

/** Run one action. Only this function reaches a model. */
async function runAction(action, text, signal, onProgress) {
  if (!P.ACTION_IDS.includes(action)) throw new ProviderError('bad-action', 'Unknown action.');
  const core = String(text || '');
  if (!core.trim()) throw new ProviderError('empty', 'Select some text first.');
  if (core.length > P.MAX_INPUT_CHARS) {
    throw new ProviderError('too-long', 'That selection is ' + core.length.toLocaleString('en-US') + ' characters. The limit is ' + P.MAX_INPUT_CHARS.toLocaleString('en-US') + ' (about 2,000 words). Select less and run it in parts.');
  }
  const s = await loadSettings();
  const prompt = P.buildPrompt(action, core, s);
  const api = usesApi(s);
  const t0 = Date.now();
  let out;
  if (api) {
    const granted = await chrome.permissions.contains({ origins: [ANTHROPIC_ORIGIN] });
    if (!granted) throw new ProviderError('no-permission', 'The Anthropic API is selected, but the browser permission for api.anthropic.com is off. Turn the API on again in Carlos Writer settings, or switch back to the local model.');
    const { anthropicKey } = await chrome.storage.local.get('anthropicKey');
    out = await runAnthropic(prompt, s, anthropicKey, signal);
  } else {
    await originRuleReady;
    out = await runOllama(prompt, s, signal, onProgress);
  }
  const suggestion = P.cleanOutput(out.text, core);
  if (!suggestion.trim()) throw new ProviderError('empty-output', 'The model returned an empty answer. Try again.');
  const ops = D.diffWords(core, suggestion);
  return {
    action,
    original: core,
    suggestion,
    ops,
    changes: D.countChanges(ops),
    missing: P.checkPreserved(core, suggestion, action),
    provider: api ? 'anthropic' : 'ollama',
    providerLabel: providerLabel(s),
    model: api ? s.anthropicModel : s.ollamaModel,
    ms: Date.now() - t0,
    stats: out.stats || null,
  };
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'cw-run') return;
  if (!port.sender || port.sender.id !== chrome.runtime.id) { port.disconnect(); return; }
  let ctrl = null;
  const post = (m) => { try { port.postMessage(m); } catch (_) { /* port closed */ } };
  port.onDisconnect.addListener(() => { if (ctrl) ctrl.abort(new ProviderError('cancelled', 'Cancelled.')); });
  port.onMessage.addListener(async (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ping') return; // keeps the worker awake during long answers
    if (msg.type === 'cancel') { if (ctrl) ctrl.abort(new ProviderError('cancelled', 'Cancelled.')); return; }
    if (msg.type !== 'run') return;
    if (ctrl) ctrl.abort(new ProviderError('cancelled', 'Cancelled.'));
    const mine = new AbortController();
    ctrl = mine;
    try {
      const result = await runAction(msg.action, msg.text, mine.signal, (p) => post({ type: 'progress', tokens: p.tokens }));
      if (!mine.signal.aborted) post(Object.assign({ type: 'result' }, result));
    } catch (e) {
      if (mine.signal.aborted && (!e || e.code === 'cancelled')) return;
      post({ type: 'error', code: (e && e.code) || 'error', message: e instanceof ProviderError ? e.message : 'Something went wrong while talking to the model.' });
    }
  });
});

// Messages from the settings page and the toolbar popup (extension pages only).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!sender || sender.id !== chrome.runtime.id) return false;
  const fromExtensionPage = typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''));
  if (!fromExtensionPage) return false;
  if (msg && msg.type === 'cw-check-ollama') {
    (async () => {
      try {
        await originRuleReady;
        const s = await loadSettings();
        const info = await ollamaVersion(s);
        const installed = info.models.some((m) => m.name === s.ollamaModel || m.name === s.ollamaModel + ':latest');
        sendResponse({ ok: true, version: info.version, models: info.models, modelInstalled: installed, model: s.ollamaModel });
      } catch (e) {
        sendResponse({ ok: false, message: e instanceof ProviderError ? e.message : 'Could not check Ollama.' });
      }
    })();
    return true;
  }
  if (msg && msg.type === 'cw-provider-label') {
    loadSettings().then((s) => sendResponse({ label: providerLabel(s), online: usesApi(s) }));
    return true;
  }
  return false;
});

// Exposed for the automated tests (they call the same entry points the
// keyboard command and the menu use). Not reachable from web pages.
self.cwTest = { startFlow, runAction, loadSettings, originRuleReady, storageLocked };
