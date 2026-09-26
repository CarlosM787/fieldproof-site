# Morales Labs umbrella: the "Map" prototype (phase three, 2026-09-26)

The idea: moraleslabs.com is the studio, TalkEstimate and SalsaCoach are its flagships, and carlosmoralesjr.com is the person. This folder holds the public-safe part of that work:
- four visual directions;
- the chosen one, "Map", built as a lean prototype;
- the shared network bar and status badge;
- two site patches for public repositories.

**Nothing here is deployed.** Every page carries `noindex`. Each site owner applies their own patch, gated on that site's next approved deploy.

| Path | What |
|---|---|
| `prototype/` | Home, products, the TalkEstimate detail page, the shared components and a 404. Static HTML and CSS, no JavaScript. Links are root-relative, so serve this folder as the web root. |
| `concepts/1-ledger`, `2-clave`, `3-nameplates`, `4-map` | The four directions, each with desktop (1440 px) and phone (390 px) screenshots |
| `shared/` | The network bar and status badge CSS (`mlx-components.css`), font subsets (SIL OFL) and portrait images |
| `CONCEPTS.md` | How the directions were scored, and why Map won |
| `PROTOTYPE_QA.md` | Lab performance, accessibility, keyboard and layout-shift results |
| `LINK_GRAPH.md`, `link-graph.svg` | Who links to whom today, and the target |
| `handoff/talkestimate-site.patch` | The network bar for talkestimate.com (this repository's `master`). Apply it after the structured-data patch in the public-authority packet. |
| `handoff/faroquant-site.patch` | The network bar and studio link for faroquant.com (`CarlosM787/faro`), after the claims patches |

**Measured:**
- Setup: lab, local build, Lighthouse 13.5.0 mobile, 3-run medians. VERIFIED 2026-09-26.
- LCP: home 1.05 s, products 1.05 s, TalkEstimate 1.21 s.
- CLS 0; first load 49.8–58.7 KB.
- 0 axe violations across 20 scans (5 pages × 2 widths × 2 themes).

**Kept out of this public copy.** These travel to each owner privately:
- the patches for moraleslabs.com, carlosmoralesjr.com and mysalsacoach.com, because those repositories are private;
- the site audit, the product-map data and the owner handoffs, because they quote private sources;
- the generator scripts, which read that data.

**Two lines differ from the owners' copies:**
- The footer's legal line reads "Morales Labs". The owners' copies keep each site's existing legal line.
- The TalkEstimate page says only that the app is "not ready for a pilot" and that the open fixes come first. How much more to say publicly is Carlos's call.

`PROTOTYPE_QA.md` and `LINK_GRAPH.md` mention `tools/`, `measurements/` and the owner handoffs; those stay with the private lane files.

**To view:** `python -m http.server 8830 --directory prototype`, then open http://127.0.0.1:8830/.
