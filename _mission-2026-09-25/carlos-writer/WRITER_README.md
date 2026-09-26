# Carlos Writer

Select text in Chrome or Edge and press a key. A panel shows your original next to a suggestion, with each changed word marked. Nothing changes until you click **Replace**. By default the model runs on your own PC (Ollama), so the text never leaves it.

Status (2026-09-26): built and tested in a Linux container (66 automated tests pass, see `TEST_RESULTS.md`). **Not yet run on Windows, in Edge, or with a real model.** That is the next step, and it is Carlos's call (below).

## The one decision: local model or API

| | Local model (recommended) | Anthropic API (optional) |
|---|---|---|
| Setup | Install Ollama, download one model (`llama3.1:8b`, 4.9 GB) | An Anthropic API key with billing |
| Cost | $0 per word | About 1–2 cents per 1,000 words (estimate; Claude Haiku 4.5 is $1 / $5 per million input / output tokens, price checked 2026-09-26) |
| Privacy | Text stays on your PC | Text goes to Anthropic over the internet |
| Speed on an RTX 2070 Super | About 2 s for 50 words, 4–5 s for 150 words, 7–10 s for 300 words, once the model is loaded (estimates from published benchmarks, not measured) | Not measured |
| Quality in your voice and in Spanish | Unknown until you run the self-test | Probably better; not measured |

Suggested order: install Ollama and the model, run `scripts/selftest.ps1` (5 minutes), and read `outputs.md`. Turn on the API only if the local results aren't good enough. Nothing here installs anything for you.

## Install the extension (2 minutes)

1. Copy the `extension` folder somewhere permanent, for example `C:\Tools\carlos-writer\extension`.
2. **Chrome:** open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked**, and pick that folder.
   **Edge:** open `edge://extensions`, turn on **Developer mode** (left side), click **Load unpacked**, and pick that folder.
3. The Carlos Writer settings page opens. Pin the toolbar button if you like (puzzle-piece icon → pin).

To update later: replace the files, then click the reload arrow on the extension's card. To remove: click **Remove**. The browser deletes its settings and any saved key with it.

## Set up the local model (about 10 minutes, one time, your decision)

1. Install Ollama for Windows from ollama.com. It runs in the system tray.
2. In PowerShell: `ollama pull llama3.1:8b` (about 4.9 GB). To compare a newer model: `ollama pull qwen3.5:9b` (about 6.6 GB).
3. In Carlos Writer settings, click **Check connection**. It should say Ollama is running and the model is installed.

You do **not** need to change `OLLAMA_ORIGINS`. A default Ollama install rejects browser extensions (HTTP 403; tested against the real Ollama 0.34.4). Carlos Writer removes the browser's Origin header from its own requests to `localhost:11434`, and from nothing else.

## Use it

1. Select text in a text box, a comment field, an email editor, or on any page.
2. Press a shortcut, or right-click → **Carlos Writer** → pick an action:
   - **Alt+Shift+R**: Proofread (fixes errors only)
   - **Alt+Shift+V**: Sound like Carlos
   - **Alt+Shift+M**: menu with all six actions, then press 1–6: Proofread, Sound like Carlos, More casual, More professional, English → Spanish, Spanish → English
3. Read the panel. **Original** shows removed words struck through in red. **Suggestion** shows added words underlined in green. A yellow note lists any number, link, email or name from your text that the suggestion dropped.
4. Choose:
   - **Replace** puts the suggestion in place of your selection. Press **Ctrl+Z** in the text to undo.
   - **Copy** puts the suggestion on the clipboard and leaves the page alone.
   - **Cancel** (or **Esc**) changes nothing and puts your selection back.

Google Docs, Word and other apps: click the Carlos Writer toolbar button, paste the text, pick an action, then **Copy suggestion**. (Google Docs draws its text on a canvas, so the in-page panel can't see a selection there.)

If a shortcut shows **Not set** on the settings page, the browser already uses that key. Click **Change shortcuts** and choose another.

## Make it sound like you

The extension ships with a neutral style guide. Your personal guide is in `private/`:

1. Settings → **Style guide** → **Import file…** → pick `private/carlos-style-guide.json`.
2. It sets the guide text (18 rules, each drawn from your published writing) and sensible defaults. `private/STYLE_GUIDE_CARLOS.md` shows every rule with its source quote.
3. Edit the text box whenever a rule is wrong. Spanish rules are still open: you have no approved Spanish writing in the sources. Paste two or three Spanish paragraphs you've approved and the Spanish rules can be derived the same way.

## Settings

| Setting | Default | What it does |
|---|---|---|
| Model | This computer (Ollama), `llama3.1:8b` at `http://localhost:11434` | Where your text goes. The address must be `localhost` or `127.0.0.1` on port 11434. |
| Anthropic API | Off | Selecting it asks the browser for access to `api.anthropic.com` and shows the privacy and cost warning. The key is stored only in this browser profile, is never synced or shown to web pages, and is never logged. **Forget key** deletes it. |
| Length | Same | Shorter, Same or Longer, for the three rewrite actions |
| Tone | Keep as is | Casual ↔ Formal, for "Sound like Carlos" and the translations |
| Proofread: change only errors | On | Off lets Proofread also smooth awkward phrasing |
| Language of rewrites | Same as the text | Or force English or Spanish |
| Spanish | Neutral Latin American | Or Puerto Rican |
| Style guide | Neutral | Your voice rules, editable, importable, exportable |

## Privacy

- Carlos Writer reads a page only when you press one of its shortcuts or use its right-click menu, and then only the selected text. The toolbar box only sees what you paste into it.
- The text goes to one place: the model you picked. With the local model it never leaves your PC.
- It never reads password fields, one-time-code fields or card-number fields.
- It changes a page only when you click Replace. A page's own scripts can't click Replace for you.
- No analytics, no telemetry, no remote code. The extension's security policy blocks connections to anything except `localhost:11434` and, only if you turn it on, `api.anthropic.com`.

## Costs

- **Local model:** $0 per use. The one-time download is about 4.9 GB. Electricity was not measured.
- **API, if you turn it on:** about $0.008–$0.016 per 1,000 words, depending on how many separate selections you send (each one resends the style guide). About $0.20–$0.35 a month at 20,000 words. These are estimates from Anthropic's published prices (`scripts/estimate.js`).

## Speed

- **Measured, with a stand-in model:** the extension adds about 20 ms to open the panel and 30–150 ms to show a result. With a real keystroke the whole path took about half a second.
- **Estimated, real model on an RTX 2070 Super, model loaded:** about 1.4–2.2 s for 50 words, 3.8–5.3 s for 150 words, 7.4–9.9 s for 300 words. The inputs are published benchmarks: Llama 3.1 8B generates about 58 tokens/s on this GPU (LocalScore) and Llama 2 7B Q4_0 about 88 tokens/s (llama.cpp). The first call after Ollama unloads the model (5 idle minutes by default) also waits for the model to load.
- The self-test measures the real numbers on your PC.

## Self-test (5 minutes, after you install Ollama and a model)

In PowerShell, from the folder that holds `scripts`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\selftest.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\selftest.ps1 -Model qwen3.5:9b    # to compare
```

It checks that Ollama is running and the model is installed. It stops if either is missing, and it never downloads anything. Then it runs 5 published passages from carlosmoralesjr.com through every action and prints seconds, output tokens and tokens per second per call. It saves `outputs.md` (read this one), `results.csv` and the raw replies under `scripts\selftest-out\<time>\`. If `private\selftest-requests-carlos.json` is present it uses your style guide; otherwise the neutral one. `examples/REAL_EXAMPLES.md` shows the exact prompts it sends.

## Optional: a hotkey for every Windows app (not installed)

`ahk/CarlosWriter.ahk` does the same job outside the browser, through the clipboard. It needs AutoHotkey v2, which you would install yourself. Press **Ctrl+Alt+Shift+W** in any app, pick an action, then review, then Replace, Copy or Cancel. It restores your clipboard afterwards.

It skips admin windows, password boxes, terminals, password managers and remote desktop. Limits: it has **never been run** (it was written on Linux); there is no word-level highlighting; Replace pastes plain text, so bold or links inside the selection are lost; if the app drops your selection while the preview is open, the paste lands at the cursor (Ctrl+Z fixes it). Try it on throwaway text first. The browser extension stays the recommended route.

## Known gaps

- Not yet run on Windows, in Edge, or with a real model (no GPU here, and model downloads were blocked).
- Google Docs and other canvas editors: no in-page panel. Use the toolbar box or the AutoHotkey script.
- The extension can't run on browser pages (`chrome://`, `edge://`), the extension stores or the PDF viewer. The toolbar icon shows "!" when that happens.
- Text inside cross-origin iframes (some embedded editors) is not reachable.
- Complex editors (Gmail, Notion, LinkedIn, Outlook web) were not tested. Replace uses the same method as typing, which these editors usually accept. If one doesn't, use Copy.
- Selections over 12,000 characters (about 2,000 words) are refused. Run long text in parts.
- The fact check covers numbers, links, emails, @handles and capitalized names. It can't check meaning. Read before you replace.
- A very slow first model load might outlast the browser's patience with background workers. If that happens, run the action again.

## Files

| Path | What |
|---|---|
| `extension/` | The extension (Manifest V3, no build step, no dependencies) |
| `RESEARCH.md` | Routes, backends, published benchmarks, prices, sources |
| `TEST_RESULTS.md` | What was tested, how, and the results |
| `tests/` | Unit tests, browser tests, mock Ollama server, fixtures; `tests/run-all.sh` |
| `scripts/selftest.ps1` | The 5-minute self-test for your PC |
| `scripts/build-examples.js`, `examples/REAL_EXAMPLES.md` | The 5 real passages and the exact prompts |
| `scripts/estimate.js` | How the speed and cost estimates were computed |
| `ahk/` | Optional AutoHotkey v2 route (not run) |
| `private/` | Your style guide, its sources and the Carlos-guide prompts. Keep it out of public places. |
| `media/screenshots/` | Screenshots of the panel, settings and popup |

## For whoever maintains it

- The code is in `extension/lib/prompts.js` (prompts, settings, fact check), `extension/lib/diff.js` (word diff), `extension/lib/providers.js` (the only network code), `extension/background.js` (shortcuts, menu, injection) and `extension/content/content.js` (the panel).
- The optional Anthropic call uses the documented Messages API over `fetch` (`x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`, model `claude-haiku-4-5`) instead of the Anthropic JavaScript SDK. The SDK is about 0.9 MB across 194 files and needs a bundler, which this no-build, auditable extension avoids for one opt-in request.
- After changing prompts, run `node scripts/build-examples.js` and `node scripts/build-ahk-prompts.js` so the self-test and the AutoHotkey script send the same text.
