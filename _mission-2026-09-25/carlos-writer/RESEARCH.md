# Carlos Writer: research

Writer lane, phase three, 2026-09-26. The question: what is the narrowest way for Carlos to select text, press one key or click once, and get a proofread or a rewrite in his own voice, on Windows 11 with an RTX 2070 Super (8 GB VRAM), 32 GB RAM, Chrome and Edge?

Labels: **VERIFIED** (checked in this session, with the evidence and UTC time) · **REPORTED** (from a record or a search result, named) · **PROPOSED** (recommendation) · **OPEN** (unknown). All times are UTC on 2026-09-26.

## Bottom line

- **PROPOSED:** Use the browser extension with a local model. It is built and tested: `extension/`, 66 automated checks, including real keystrokes and a run against the real Ollama 0.34.4 server (`TEST_RESULTS.md`).
- **PROPOSED:** Keep the global hotkey (`ahk/`) optional. It reaches desktop apps and Google Docs. It also has more ways to go wrong, and it has not been run (no Windows here).
- **PROPOSED:** Leave the Anthropic API off. It is cheap, about 1 to 2 cents per 1,000 words (estimate below), but it sends the text off the PC. Turn it on only if the local model's output fails Carlos's own review in the self-test. Nobody can know that before he runs `scripts/selftest.ps1`.

## 1. Routes

| | (a) Browser extension (MV3), built | (b1) AutoHotkey v2, clipboard route, built, not run | (b2) PowerToys Advanced Paste, not built |
|---|---|---|---|
| Where it works | Web pages in Chrome and Edge: textarea, text input, contenteditable (Gmail-style editors), and read-only page text (Copy only) | Most Windows apps, including Google Docs in the browser (Ctrl+C and Ctrl+V work there) | Any app, through the clipboard |
| Trigger | Alt+Shift+R (proofread), Alt+Shift+V (Carlos), Alt+Shift+M (menu), or right-click → Carlos Writer | Ctrl+Alt+Shift+W, then pick an action | Win+Shift+V, then a custom action (REPORTED) |
| Review before change | Panel with Original and Suggestion, word-level diff, missing-fact warning | Window with Original and Suggestion, missing-number warning, no highlighting | REPORTED: the dialog previews the clipboard input; OPEN whether the output is previewed before it pastes |
| Change | Only on the Replace click; `execCommand('insertText')` keeps Ctrl+Z; refuses if the text changed meanwhile | Only on Replace; pastes with Ctrl+V; formatting inside the selection becomes plain text | Pastes the result |
| Password fields | Refused in code: `type=password`, `autocomplete` one-time-code and card fields, masked text. VERIFIED by tests | Skipped: Win32 `ES_PASSWORD` and UI Automation `IsPassword`. Not run | OPEN |
| Admin (elevated) apps | Not applicable (browser only) | Skipped when the window runs as admin: Windows blocks a normal script from sending keys to it (UIPI) | OPEN |
| Google Docs | Not in the page: Docs draws text on a canvas, so extensions get no DOM selection. Use the toolbar popup (paste, then Copy) | Works through the clipboard | Works through the clipboard |
| Permissions and install | Load unpacked, 5 permissions, host access only to `localhost:11434`; no "read all websites" permission | AutoHotkey v2 installed by Carlos | PowerToys installed by Carlos |
| Main risks | Canvas editors, cross-origin iframes, browser pages (chrome://, the Web Store, PDF viewer) | Selection lost when the preview window takes focus; clipboard races; terminals (Ctrl+C means stop); remote desktop | 100-second timeout on local providers (REPORTED, PowerToys issue #50410); the style guide must be pasted into each custom action |

Details behind the table:

- **Google Docs** switched to canvas rendering in 2021, which Google said could break extensions that read the document's HTML (REPORTED: Google Workspace Updates, "Google Docs will now use canvas based rendering: this may impact some Chrome extensions"). Grammarly-style extensions use an allowlisted "annotated canvas" mode with no public documentation (REPORTED: chromium-extensions group thread "Google Docs canvas"). **OPEN:** whether the extension's shortcut sees a selection in Docs at all. The popup and the AutoHotkey route both work through copy and paste.
- **Admin windows:** a script that is not elevated cannot send keys to an elevated window. The AutoHotkey FAQ recommends "Run with UI access" (REPORTED: AutoHotkey v2 FAQ). The script does not try to get around this. It skips those windows.
- **Keyboard shortcuts:** VERIFIED on Linux Chromium 141 (09:20–09:24): Chrome does not assign a suggested extension shortcut the browser already uses. Alt+Shift+P, W, C, Z and X stayed "Not set". M, R and V were assigned. **OPEN:** the same check on Windows Chrome and Edge. The settings page lists each shortcut and says "Not set" when the browser kept one.
- **Service-worker lifetime:** Chrome stops an extension service worker when "a fetch() response takes more than 30 seconds to arrive" (REPORTED: Chrome for Developers, "The extension service worker lifecycle"). The extension streams Ollama's answer, and the page pings the worker every 10 seconds while it waits. **OPEN:** a slow first load on Carlos's PC. DevTools keeps workers alive, so the tests cannot show this.
- **Ollama and browser extensions:** VERIFIED in `ollama/ollama` main (`envconfig/config.go`, read 09:10) and against the Ollama 0.34.4 Linux binary (09:50). The default allowed origins do not include `chrome-extension://`, so a request from an extension gets HTTP 403. The extension removes the Origin header from its own background requests to `localhost:11434`, with a declarativeNetRequest session rule limited to this extension and to non-tab requests. With the rule the real server answers normally. Without it, 403. Carlos does not have to change `OLLAMA_ORIGINS`.
- **PowerToys Advanced Paste:** REPORTED only (Microsoft Learn is blocked here). Version 0.96 added local providers, Ollama and Foundry Local, plus custom actions (Windows Forum and Neowin, from search results). It needs no code. There is no diff. OPEN: whether it shows the output before pasting.

**Judgment (PROPOSED):** the global route is useful and less reliable. The browser extension stays the recommended route. For Google Docs and desktop apps, the toolbar popup covers most cases now with no install beyond the extension. AutoHotkey is for when copy and paste gets tedious.

## 2. Backends

### Local model on the RTX 2070 Super (8 GB)

What fits: 7–9B models at 4-bit (Q4_K_M, about 4.7–6.6 GB) fit with the extension's fixed 8K context. Larger models spill into system RAM and slow down a lot.

Published speed on this GPU:

| Source | Model | Prompt speed | Generation speed | Label |
|---|---|---|---|---|
| LocalScore, accelerator "NVIDIA GeForce RTX 2070 SUPER" | Llama 3.1 8B Instruct Q4_K_M | 1,444 tokens/s | 57.6 tokens/s (TTFT 884 ms) | REPORTED (search summary of localscore.ai/accelerator/101; the site is blocked here) |
| same | Llama 3.2 1B Q4_K_M | 5,377 tokens/s | 151 tokens/s | REPORTED (same) |
| llama.cpp "Performance of llama.cpp on Nvidia CUDA" (#15013), user phstudy | Llama 2 7B Q4_0 | 2,088 tokens/s (pp512) | 88 tokens/s (tg128) | REPORTED (page read with WebFetch at 09:14) |

Estimated latency per call. **These are ESTIMATES, not measurements.** Inputs: the LocalScore Llama 3.1 8B speeds above, about 0.75 English words per token, Spanish output assumed 30% longer in tokens, and the Carlos style guide included. Model already loaded. `scripts/estimate.js` reproduces the table.

| Selection | Proofread | Sound like Carlos | English → Spanish |
|---|---|---|---|
| 50 words | ~1.4 s | ~1.8 s | ~2.2 s |
| 150 words | ~3.8 s | ~4.2 s | ~5.3 s |
| 300 words | ~7.4 s | ~7.8 s | ~9.9 s |

Add the model load time for the first call after Ollama unloads the model. It unloads after 5 minutes idle by default. **OPEN:** that load time depends on his disk. The self-test prints it.

Models for English and Spanish (PROPOSED shortlist; Carlos decides after the self-test):

| Model (Ollama tag) | Size | Spanish evidence | Notes |
|---|---|---|---|
| `llama3.1:8b` (default in the extension) | 4.9 GB (REPORTED, Ollama library) | VERIFIED: the Llama 3.1 model card lists Spanish among its 8 supported languages (GitHub raw, 10:05). REPORTED: La Leaderboard (arXiv 2507.00999) names Llama-3.1-8B-IT among the top models for Spanish and the languages of Spain and Latin America (search summary; arXiv is blocked) | It is the only candidate with a published speed on his GPU class. No thinking mode to turn off. |
| `qwen3.5:9b` | 6.6 GB Q4_K_M (REPORTED, Ollama tags page via search) | VERIFIED: the Qwen3.5 README says "201 languages and dialects"; the 9B model came out 2026-03-02 (GitHub raw, 10:05) | Newer. Fits 8 GB with less room to spare. Thinks by default: the extension always sends `"think": false`, which Ollama accepts for every model (VERIFIED in `server/routes.go`: only `think: true` errors on a non-thinking model). No published 2070 Super speed found. |
| `gemma4:e4b` | 9.6 GB download (REPORTED) | REPORTED: 140+ languages, Apache 2.0, released 2026-04-02 | Probably does not fit fully in 8 GB. OPEN. |

LM Studio would also work as a local server (OpenAI-compatible API on port 1234). The extension supports only Ollama, the narrowest option. LM Studio would add a second provider and a second host permission. Not built (PROPOSED: only if Carlos prefers LM Studio's interface).

### API: Anthropic Claude Haiku 4.5 (opt-in only)

- **Price, VERIFIED** (official pricing page, platform.claude.com/docs/en/about-claude/pricing, fetched 09:17): Claude Haiku 4.5 costs $1 per million input tokens and $5 per million output tokens. Batch is $0.50/$2.50, not useful for interactive editing. Model ID `claude-haiku-4-5`. The same page gives "1 token is approximately 4 characters or 0.75 words in English".
- **Cost per 1,000 words, ESTIMATE** (`scripts/estimate.js`; each call resends the system prompt and style guide):

| How the 1,000 words are sent | Input tokens | Output tokens | Cost |
|---|---|---|---|
| Proofread, one call | ~1,650 | ~1,330 | ~$0.008 |
| Sound like Carlos, one call | ~2,180 | ~1,330 | ~$0.009 |
| Sound like Carlos, 5 selections of 200 words | ~5,560 | ~1,330 | ~$0.012 |
| English → Spanish, 5 selections | ~5,690 | ~1,730 | ~$0.014 |
| Sound like Carlos, 10 selections of 100 words | ~9,780 | ~1,330 | ~$0.016 |

  About 1 to 2 cents per 1,000 words. At 20,000 words a month, about $0.20 to $0.35 (ESTIMATE). The local model costs $0 per word. Electricity is not measured.
- **Privacy:** with the API on, the selected text goes over the internet to Anthropic. The key sits in the browser profile's extension storage. Content scripts cannot read that storage (VERIFIED by test), but anyone who can open Carlos's Windows profile could.
- **Speed and quality:** not measured. Paid calls are not allowed in this mission. **OPEN.**

**Does the API clearly win? (PROPOSED answer: not yet.)** It will likely write better English and Spanish than an 8B local model. Nobody has measured that for Carlos's voice. The cost is small, so the real trade is privacy against quality. The self-test settles the quality half on his own passages.

## 3. What the extension does about privacy, permissions and reliability

- **Permissions:** `contextMenus`, `storage`, `activeTab`, `scripting`, `declarativeNetRequestWithHostAccess`, and host access to `http://localhost:11434/*` and `http://127.0.0.1:11434/*` only. `https://api.anthropic.com/*` is optional and requested only when Carlos picks the API. There is no content script on page load. The script is injected only when he uses a shortcut or the right-click menu (activeTab). The toolbar button opens a paste box and does not read the page. The declarativeNetRequest permission is there only to remove the Origin header on the extension's own requests to Ollama. Chrome shows no install warning for `declarativeNetRequestWithHostAccess`, and it acts only on hosts the extension already has (REPORTED: Chrome permissions reference).
- **Network:** the extension's Content-Security-Policy allows connections only to `localhost:11434`, `127.0.0.1:11434` and `api.anthropic.com`. VERIFIED: a live server on another local port was unreachable from the extension.
- **No telemetry, no analytics, no remote code.** VERIFIED by a static check: only the service worker contains network code.
- **Reliability details handled in code:** a closed shadow root and trusted-click checks, so a page cannot press Replace. The panel refuses to replace if the text changed after selection. The spaces around the selection are kept. Single-line inputs get single-line text. There is a 12,000-character limit. Error messages name the fix ("ollama pull …").

## Sources

- Chrome permissions reference (declarativeNetRequestWithHostAccess): https://developer.chrome.com/docs/extensions/reference/permissions-list and https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest (REPORTED via search result)
- Chrome extension service worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle (REPORTED via search result)
- Google Docs canvas rendering: https://workspaceupdates.googleblog.com/2021/05/Google-Docs-Canvas-Based-Rendering-Update.html and https://groups.google.com/a/chromium.org/g/chromium-extensions/c/dLnxATEOcqg (REPORTED)
- AutoHotkey v2 FAQ, UI access and admin windows: https://www.autohotkey.com/docs/v2/FAQ.htm (REPORTED)
- PowerToys Advanced Paste: https://learn.microsoft.com/en-us/windows/powertoys/advanced-paste; https://windowsforum.com/threads/powertoys-0-96-advanced-paste-adds-on-device-ai-and-multi-provider-cloud.390575/; timeout issue https://github.com/microsoft/PowerToys/issues/50410 (REPORTED)
- Ollama source: https://github.com/ollama/ollama (`envconfig/config.go`, `server/routes.go`, read 09:10); gin-contrib/cors `config.go` (read 09:11); Ollama v0.34.4 Linux binary run locally (09:50) (VERIFIED)
- llama.cpp CUDA benchmarks: https://github.com/ggml-org/llama.cpp/discussions/15013 (REPORTED, read 09:14)
- LocalScore RTX 2070 SUPER: https://www.localscore.ai/accelerator/101 (REPORTED, via search; blocked here)
- Llama 3.1 model card: https://github.com/meta-llama/llama-models/blob/main/models/llama3_1/MODEL_CARD.md (VERIFIED 10:05)
- Qwen3.5 README: https://github.com/QwenLM/Qwen3.5 (VERIFIED 10:05); Ollama tags https://ollama.com/library/qwen3.5/tags (REPORTED)
- Gemma 4: https://ai.google.dev/gemma/docs/core/model_card_4 (REPORTED, via search)
- La Leaderboard: https://arxiv.org/abs/2507.00999 (REPORTED, via search; blocked here)
- Anthropic pricing: https://platform.claude.com/docs/en/about-claude/pricing (VERIFIED 09:17); third-party confirmations https://www.finout.io/blog/anthropic-api-pricing and https://benchlm.ai/anthropic/api-pricing (REPORTED)
