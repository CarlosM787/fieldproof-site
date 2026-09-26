# Carlos Writer: test results

Last full run: **2026-09-26 10:03–10:04 UTC**, `tests/run-all.sh`, exit code 0. VERIFIED unless a line says otherwise.

Environment: Linux container. Chromium 141.0.7390.37 (the Playwright 1.56.1 build), Node 22.22.2, Xvfb, python-xlib 0.33, PowerShell 7.5.3 for Linux, and the Ollama 0.34.4 Linux binary with no model installed. There was no GPU, no Windows and no Edge. Model downloads are blocked here, so **no real model produced any text in these tests**. A deterministic mock of the Ollama API stood in for the model.

## Summary

| Suite | What it runs | Result |
|---|---|---|
| Unit (`tests/unit/*.test.js`, `node --test`) | Prompt building, settings validation, output cleanup, fact checker, word diff, the Ollama client against the mock, and the Anthropic request shape against a stub | **27 / 27 pass** |
| Browser, headless (`tests/e2e/run-e2e.js`) | The unpacked extension in headless Chromium. Each test calls the same `startFlow()` the shortcuts and the menu call. | **29 / 29 pass** |
| Browser, real keyboard (`tests/e2e/run-keyboard.js`) | Headed Chromium under Xvfb, with keys sent through the X server (XTEST) like a physical keyboard, on a site the extension has no host access to | **7 / 7 pass** |
| Real Ollama server (`tests/e2e/run-real-ollama.js`) | The extension against the real Ollama 0.34.4 binary (no model) | **3 / 3 pass** |
| Self-test script (`scripts/selftest.ps1`) | PowerShell 7.5.3 against the mock: 1 warm-up + 30 calls, a style-guide swap, the Spanish round trip, and both failure paths | Works (details below) |
| Style-guide citations (`private/build-style-guide.js`) | Each quote is 25 words or fewer and appears word for word in its source | **41 / 41 quotes verified** |

That is 66 automated tests, all passing, plus the 41 citation checks.

## What the browser tests prove

The panel lives in a closed shadow root, so page scripts cannot read it and Playwright selectors cannot reach it. The tests read it through the DevTools protocol and click with real (trusted) mouse events.

### Headless suite, 29 / 29

| Test | Result | ms |
|---|---|---|
| manifest: minimal permissions, localhost-only host access, API optional, CSP connect-src | PASS | 15 |
| defaults: local Ollama, API off, neutral guide | PASS | 3 |
| textarea: proofread shows a word diff, Replace updates the text, Ctrl+Z restores it | PASS | 2066 |
| text input: Replace and undo | PASS | 1391 |
| contenteditable: partial selection, Replace keeps the rest, undo restores | PASS | 1391 |
| Copy puts the suggestion on the clipboard and leaves the text alone | PASS | 177 |
| Cancel closes the panel and leaves the text unchanged | PASS | 182 |
| Escape also cancels | PASS | 81 |
| password field is refused and nothing is sent | PASS | 586 |
| one-time-code field is refused | PASS | 61 |
| English → Spanish keeps names, numbers and the link | PASS | 430 |
| Spanish → English keeps names, numbers and the email | PASS | 1404 |
| a dropped number is flagged before you replace | PASS | 284 |
| menu command: chooser shows 6 actions, a number key runs one | PASS | 330 |
| prompt sent to the model: style guide injected, think off, fixed context | PASS | 265 |
| read-only page text: Replace is disabled, Copy works | PASS | 183 |
| multi-line textarea keeps line breaks | PASS | 1335 |
| multi-paragraph contenteditable: replaced, undo restores | PASS | 1384 |
| empty selection explains what to do and sends nothing | PASS | 40 |
| email-type field (no selection API) is refused politely | PASS | 26 |
| the page cannot press Replace for you (untrusted clicks ignored) | PASS | 464 |
| errors: model not installed → "ollama pull"; Ollama down → clear message | PASS | 420 |
| API selected without the browser permission: refused, nothing leaves the machine | PASS | 69 |
| content scripts cannot read extension storage (API key stays in trusted contexts) | PASS | 19 |
| strict-CSP page: panel renders styled and works | PASS | 541 |
| same-origin iframe: the frame with the selection gets the panel | PASS | 417 |
| network: the extension talks only to 127.0.0.1:11434; nothing else is reachable | PASS | 501 |
| settings page: check connection, import guide (cannot change provider/endpoint), key stays hidden | PASS | 1130 |
| toolbar popup (paste box for Google Docs and other apps): proofread and copy | PASS | 416 |

The longer times (about 1.3 s) come from tests that wait for the panel to close after Replace, before they press Ctrl+Z.

Notes on method:
- **Trigger path.** Headless Chromium does not deliver extension shortcuts. That was checked: DevTools key events never reach browser shortcuts, headless or headed. The headless tests therefore call the service worker's `startFlow()`, the function the shortcut and the menu call. Their test pages are served from `127.0.0.1:11434`, which the extension's host permission covers. That stands in for the activeTab grant a real shortcut gives. The keyboard suite below covers the real path.
- **Undo** was tested with Ctrl+Z after Replace in a textarea, a text input, a contenteditable div and a two-paragraph contenteditable. Each returned to the original text or HTML.
- **Framework pages:** a React-style listener on the textarea saw the `input` event from Replace and updated its copy of the value.

### Real keyboard suite, 7 / 7 (headed, Xvfb, XTEST keys)

| Test | Result | ms |
|---|---|---|
| shortcuts are assigned: Alt+Shift+M menu, Alt+Shift+R proofread, Alt+Shift+V Carlos | PASS | 7 |
| without a shortcut or click, the extension cannot touch this site (no broad host access) | PASS | 7 |
| real keystroke Alt+Shift+R: panel, Replace, then a real Ctrl+Z undoes it | PASS | 2444 |
| real keystroke Alt+Shift+M then "3": menu runs "More casual"; Cancel leaves the text | PASS | 953 |
| real keystroke Alt+Shift+V: "Sound like Carlos" | PASS | 873 |
| real keystroke on a password field: refused, nothing sent | PASS | 817 |
| no request left the machine during the keyboard run | PASS | 1 |

The test page came from `127.0.0.1:8765`, which is **not** in the extension's host permissions. Before any shortcut, injecting into it failed ("refused"). After a real Alt+Shift+R, the panel appeared and Replace worked. So the shortcut's activeTab grant does its job, and the extension has no standing access to websites.

Shortcut assignment (Linux Chromium 141, 09:20–09:24): Chrome did not assign Alt+Shift+P, W, C, Z or X, because the browser already uses them. M, R and V were assigned. **OPEN:** the same check on Windows Chrome and Edge.

### Real Ollama server, 3 / 3

The Ollama 0.34.4 Linux binary was run with no model (`OLLAMA_HOST=127.0.0.1:11434`, empty model folder), 09:50–10:04:

| Check | Result |
|---|---|
| Settings → Check connection | "Ollama 0.34.4 is running. “llama3.1:8b” is not installed. In PowerShell: ollama pull llama3.1:8b." |
| A rewrite from the extension | Got past Ollama's Origin filter and came back with Ollama's real 404, shown as: "The model "llama3.1:8b" is not installed. In a terminal run: ollama pull llama3.1:8b" |
| Same request with the extension's Origin rule removed | "Ollama refused the request (HTTP 403)." |

The same was checked with curl (09:50). `Origin: chrome-extension://…` gets 403. `Origin: https://evil.example` gets 403. No Origin gets through to the handler, which answers `{"error":"model 'llama3.1:8b' not found"}` with 404. A default Ollama install therefore blocks browser extensions, and the extension's narrow Origin rule is what makes it work without changing `OLLAMA_ORIGINS`.

## Network: nothing leaves the machine

All from the 10:03 headless run (`tests/results/e2e-headless.json`):

1. **Service-worker fetch log.** The test wrapped `fetch` inside the extension's service worker. During the functional tests every call went to `http://127.0.0.1:11434` (`/api/chat`, `/api/tags`, `/api/version`). The log also holds two deliberate probes that the next check makes: `127.0.0.1:8765` and `example.com`.
2. **The extension's own CSP blocks everything else.** A fetch to a live local server on port 8765 failed, and the server never received it. A fetch to `https://example.com/` failed too. The model endpoint returned 200.
3. **Static check.** The content script, the popup, the settings page, `prompts.js` and `diff.js` contain no network code (`fetch`, XHR, WebSocket, beacon, EventSource). Only the service worker's provider file does.
4. **Origin rule scope.** A web page's own request to `127.0.0.1:11434` kept its `Origin: http://127.0.0.1:8765`. The rule removes the header only from the extension's own background requests.
5. **Trap proxy.** Chromium ran with every non-local destination routed to a recording proxy. It recorded 17 connection attempts, all to Chromium's own background services: `accounts.google.com`, `android.clients.google.com`, `content-autofill.googleapis.com`, `clients2.google.com/time`, `redirector.gvt1.com` and `www.google.com`. A plain Chromium with **no extension**, visiting the same pages, contacted the same six hosts (`tests/e2e/baseline-browser-noise.js` → `tests/results/baseline-browser-noise.json`). Nothing went to `api.anthropic.com`, and nothing was left unexplained.
6. **API path without permission.** With the API selected in storage but the browser permission not granted, the panel refused and the trap saw nothing new.

## Self-test script (`scripts/selftest.ps1`)

Run with PowerShell 7.5.3 for Linux against the mock (10:00):
- 1 warm-up call and 30 action calls (5 passages × 5 actions, plus Spanish → English on each Spanish result). 0 errors. `outputs.md`, `results.csv` and `raw/*.json` were written.
- `-StyleGuideFile private/carlos-style-guide.txt` replaced the guide inside `<style_guide>` (checked in the mock's request log). The round trip sent the English → Spanish output as the passage. `’` survived as UTF-8.
- `-Model qwen3.5:9b` (not installed) stopped with "This script does not download anything. If you decide to install it, run: ollama pull qwen3.5:9b". With Ollama stopped it printed "Ollama is not answering at http://localhost:11434".
- The mock reports fake timing numbers, so the tokens-per-second column from this run is meaningless. **OPEN:** Windows PowerShell 5.1 (Windows 11's built-in shell). The script avoids 7-only syntax but was not run on 5.1.

## Latency

- **Measured, mock model (this is the extension's own overhead, not model time):** headless, from trigger to panel open, median 20 ms. From trigger to diff shown, median 114 ms (min 28, max 152, n = 16) in the 10:03 run, and 33–63 ms in earlier runs. With a real keystroke under Xvfb, the whole path took 503 ms, including the key-sending helper starting up and the service worker waking.
- **Estimated, real model on an RTX 2070 Super** (from published benchmarks, see `RESEARCH.md`): about 1.4–2.2 s for 50 words, 3.8–5.3 s for 150 words and 7.4–9.9 s for 300 words, model already loaded. The first call after the model unloads adds its load time (OPEN). `scripts/selftest.ps1` measures the real numbers on Carlos's PC.

## Screenshots

In `media/screenshots/`. The mission session keeps `media/` out of git; each file is 16–300 KB.

| File | Shows |
|---|---|
| `panel-result-light.png`, `panel-result-dark.png` | Proofread result with word-level diff, light and dark |
| `panel-chooser.png` | The Alt+Shift+M menu with the six actions |
| `panel-en2es-light.png` | English → Spanish with names, numbers and link kept |
| `panel-missing-number.png` | The "Not found in the suggestion: 5." warning |
| `panel-refused-password.png` | Password refusal ("Nothing was sent anywhere.") |
| `panel-error-model-missing.png` | Missing-model message with the `ollama pull` command |
| `panel-strict-csp.png` | Panel on a page with a strict Content-Security-Policy |
| `keyboard-headed-panel.png` | Headed Chromium after a real Alt+Shift+R keystroke |
| `options-light.png`, `options-dark.png` | Settings page |
| `popup-light.png`, `popup-dark.png` | Toolbar paste box |

## Not tested (OPEN)

- Windows 11, Chrome for Windows and Edge. Chromium on Linux was the only browser.
- Real model output quality and speed. No GPU, and model downloads are blocked. `scripts/selftest.ps1` is the check for Carlos's PC.
- The browser's permission prompt when Carlos turns on the API (it needs a human click), and any live Anthropic call (paid calls are not allowed here).
- Service-worker shutdown during a slow first model load. DevTools keeps workers alive, so tests cannot show it. Mitigations: streaming, and a 10-second ping from the page.
- Big real-world editors: Gmail, Outlook web, Notion, Google Docs, LinkedIn, and editor frameworks such as Draft.js, Lexical, ProseMirror and Slate. Cross-origin iframes.
- `ahk/CarlosWriter.ahk` was never executed. There is no AutoHotkey on Linux. It passed a bracket and string balance check, and its prompt-file parser was checked in Python.

## Rerun

```bash
pip install --target _work/pylib python-xlib        # once, for the keyboard suite
OLLAMA_BIN=/path/to/ollama ./tests/run-all.sh      # OLLAMA_BIN optional
```
