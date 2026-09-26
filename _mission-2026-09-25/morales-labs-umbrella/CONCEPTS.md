# Four directions for the umbrella home, scored

Each concept is a real HTML/CSS page generated from [`product-map.json`](product-map.json) by `tools/gen-concepts.mjs`. It uses real product data, the Acento M lockup (from `02_SELECTED_LOGO/SVG_PUBLIC_SANITIZED/`), the existing colour tokens from `main.css` / `04_COLOR_AND_TYPOGRAPHY`, and self-hosted subsets of the brand's own fonts (Archivo, Inter and IBM Plex Mono, 42 KB in total, SIL OFL; `shared/fonts/OFL.txt`). Nothing is lorem, and there are no metrics beyond the real tallies. All four share the network bar and the status badge (`shared/mlx-components.css`).

Screenshots: `concepts/<n>-<name>/desktop.png` (1440 px wide) and `phone.png` (390 px wide), full page, rendered by Playwright (Chromium 141).

## The four

1. **Ledger** (`concepts/1-ledger/`). The truth table is the page. Every product is a row: status, then Website / Use today / Buy as ✓ or —, then the next step. A "Where things stand" tally sits beside the headline: 5 in development, 2 live, 2 coming soon, 2 research; 4 of 11 usable today, 2 of 11 for sale. The flagship rows are larger.
2. **Clave** (`concepts/2-clave/`). The page keeps time. A 3-2 clave ruler strikes once on load (138 ms beats; static under reduced motion). Then come "3 products with their own sites" (the flagships and FaroQuant), then "2 for sale today", then "the rest of the band".
3. **Nameplates** (`concepts/3-nameplates/`). An ink studio where every product wears its own identity plate in its own site's colours (TalkEstimate blue and hard-hat yellow, SalsaCoach gold and coral on plum, faroquant navy and beam amber), with a serial number and a spec table for the flagships.
4. **Map** (`concepts/4-map/`). The network drawn as lines and stations. The studio hub has four lines (own sites, shop, Workbench, studio pages). A person line on top links carlosmoralesjr.com, Carlos Builds, GitHub and LinkedIn. Each station's marker shape is its status group. The two flagship cards follow, with "for", the benefit, three facts, proof and one call to action.

## Scores (1–5; speed is measured, lab, local build, Lighthouse mobile, 3-run medians)

| Concept | Clarity | Speed (measured) | Accessibility | Distinctiveness | Fit with product brands | **Total /25** |
|---|---|---|---|---|---|---|
| 1 · Ledger | 4: the most honest page, but a long table on phones (5,660 px) and the flagships barely stand out | 5: 49.6 KB · LCP 1.05 s · CLS 0.002 · TBT 0 | 5: axe 0 (after moving a nested `aside`) | 3: reads like a spec sheet | 2: products reduced to a colour bar | **19** |
| 2 · Clave | 3: "3" and "2" only make sense if you know clave; grouping is clear once read | 5: 49.5 KB · 1.06 s · CLS 0.013 (the ruler) · TBT 0 | 5: axe 0; the ruler is `aria-hidden` and static under reduced motion | 4: rhythm is the brand's own idea | 3: a colour rule per card | **20** |
| 3 · Nameplates | 4: clear, but 11 heavy plates of equal weight flatten the hierarchy below the flagships | 5: 49.7 KB · 1.05 s · CLS 0 · TBT 0 | 4: axe 0, but it forces a dark page on light-mode visitors | 3: dark product grids are common | 5: every product's own identity leads (parent brand fit lower: governance wants warm paper as the parent field) | **21** |
| 4 · **Map** | 5: answers "how do these fit together, and what is real?" in one screen; person, studio, products and shop all visible | 5: 49.5 KB · 1.05 s · CLS 0 · TBT 0 | 5: axe 0; stations are real lists with headings; the status shape and its label always go together | 5: a status-coded network map is specific to this brief, not a template | 4: station markers carry each product's colour; flagship cards give room for identity | **24** |

Accessibility for all four: axe-core 4.10.3, WCAG 2.0/2.1/2.2 A and AA plus best practice, 390 and 1440 px, light and dark: 0 violations on the final versions (`measurements/axe-summary.json`).

## Choice: 4 · Map, with two borrowings

**Chosen: Map.** The brief is "make Carlos's network make sense". The Map is the only direction that shows the whole network (person, studio, product sites, shop, kits) *and* each thing's real state on the first screen, without inflating anything. The prototype (`prototype/`) builds on it and borrows:
- **from Nameplates**, the product identity plates on the two flagship cards, so TalkEstimate and SalsaCoach keep their own look (brand architecture: "products keep their own colour");
- **from Ledger**, the three reality facts (Website / Use today / Buy) on every card, and a "what the labels mean" table on the products page.

What each concept deliberately avoids: a cream + serif + terracotta template (the warm paper and coral are the governed Acento M tokens, set in Archivo wide rather than a serif, with coral held to accents); purple gradients; a giant empty hero (every hero is three lines and the products start in the first viewport on desktop); 3D or video downloads (the prototype ships no JavaScript at all); motion without meaning (only Clave's ruler moves, and it stops under reduced motion).
