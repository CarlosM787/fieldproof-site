'use strict';
/*
 * Compatibility check against the REAL Ollama server binary (no model installed:
 * model downloads are blocked here and there is no GPU). Proves the request path,
 * not model quality:
 *   1. "Check connection" reads the real /api/version and /api/tags.
 *   2. A rewrite request from the extension passes Ollama's Origin/CORS filter and
 *      gets Ollama's real "model not found" answer, shown as "ollama pull ...".
 *   3. With the extension's Origin rule removed, the same request gets HTTP 403,
 *      which is why the rule exists.
 * Start the server first:  OLLAMA_HOST=127.0.0.1:11434 ollama serve
 */
const path = require('path');
const fs = require('fs');
const H = require('../helpers/harness.js');

(async () => {
  const results = [];
  const env = await H.launch({ headed: false, mockPort: 11499 });
  const log = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, detail ? '— ' + detail : ''); };
  try {
    const version = await (await fetch('http://127.0.0.1:11434/api/version')).json();
    console.log('real server:', JSON.stringify(version));
    await env.swEval(async () => { await chrome.storage.local.set({ settings: { ollamaUrl: 'http://127.0.0.1:11434', ollamaModel: 'llama3.1:8b' } }); });

    const opt = await env.context.newPage();
    await opt.goto('chrome-extension://' + env.extId + '/options/options.html');
    await opt.click('#check');
    await opt.waitForFunction(() => /running|reach|HTTP/.test(document.querySelector('#check-result').textContent), null, { timeout: 10000 });
    const check = await opt.textContent('#check-result');
    log('settings "Check connection" talks to the real server', /Ollama 0\.34\.\d+ is running/.test(check) && /not installed/.test(check), check);
    await opt.close();

    const runPopup = async () => {
      const p = await env.context.newPage();
      await p.goto('chrome-extension://' + env.extId + '/popup/popup.html');
      await p.fill('#input', 'I recieve teh mail.');
      await p.click('text=Proofread');
      await p.waitForFunction(() => /pull|refused|reach|HTTP|Proofread ·/.test(document.querySelector('#status').textContent), null, { timeout: 15000 });
      const status = await p.textContent('#status');
      await p.close();
      return status;
    };
    const withRule = await runPopup();
    log('rewrite request passes Ollama\'s Origin filter (real "model not found" comes back)', /not installed\. In a terminal run: ollama pull llama3\.1:8b/.test(withRule), withRule);

    await env.swEval(() => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1] }));
    const withoutRule = await runPopup();
    log('without the Origin rule the real server answers 403', /HTTP 403/.test(withoutRule), withoutRule);
  } catch (e) {
    log('harness', false, String(e && e.stack || e));
  }
  fs.writeFileSync(path.join(H.ROOT, 'tests', 'results', 'real-ollama.json'), JSON.stringify({ when: new Date().toISOString(), results }, null, 2));
  await env.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
