# Link graph: how the sites point at each other

![Link graph: now and after the handoffs](link-graph.svg)

`link-graph.svg` carries its own light and dark palette. Data: [`measurements/links-current.json`](measurements/links-current.json), produced by `tools/extract_links.py` from the built or source HTML of each property.

**Scope and labels.** Every current link below is **VERIFIED in source** on 2026-09-26 at the named commit: moraleslabs-site `c1f7a7d` (built here; the deployed `8da2449` rebuilt from the one-commit diff that the GitHub API confirmed), carlosmoralesjr-site `fc65513` (built here), fieldproof-site `master` `d4448a5` (talkestimate.com), salsacoach `web/authority-v1` `d77278d` `website/` (mysalsacoach.com), faro `main` `06ac31f` `website/` (faroquant.com). None of the live sites was reachable from here, so "live" is **REPORTED** at best. The Substack, LinkedIn and GitHub URLs are the ones in the sources; whether those pages link back is **OPEN**.

## 1. The graph now

Pages that carry at least one link from the row site to the column site (placement in brackets).

| From ↓ · To → | moraleslabs.com | carlosmoralesjr.com | talkestimate.com | mysalsacoach.com | faroquant.com | Carlos Builds | LinkedIn | GitHub |
|---|---|---|---|---|---|---|---|---|
| **moraleslabs.com, deployed 8da2449** (19 pages) | — | **0** | 1 (detail page) | 1 (detail) | 1 (detail) | 19 (nav, footer, home) | 19 (footer) | 19 (footer) |
| moraleslabs.com, source `c1f7a7d` (not deployed) | — | 19 (footer, About; `rel="me"`) | 1 | 1 | 1 | 19 | 19 | 19 |
| **carlosmoralesjr.com** (11 pages) | 11 (footer line, "Elsewhere", About; `rel="me"`) | — | 1 (/projects/) | 1 (/projects/) | 1 (/projects/) | 11 (`rel="me"`) | 11 (`rel="me"`) | 11 (`rel="me"`) |
| **talkestimate.com** (5 pages) | **0** | **0** | — | 0 | 0 | 0 | 0 | 0 |
| **mysalsacoach.com** (26 pages) | **0** | 16 (article bylines, `rel="author"`) | 0 | — | 0 | 0 | 0 | 0 |
| **faroquant.com** (3 pages) | **0** | 2 (methodology bylines, `rel="author"`) | 0 | 0 | — | 0 | 0 | 3 (nav, footer, body) |

Structured data (JSON-LD), VERIFIED in the same sources:

| Site | Person reference | Studio reference |
|---|---|---|
| moraleslabs.com 8da2449 | founder `name` + `url` moraleslabs.com/about/ (no shared `@id`) | `Organization` `https://moraleslabs.com/#organization` |
| moraleslabs.com c1f7a7d | founder `@id` `https://carlosmoralesjr.com/about/#person` | same |
| carlosmoralesjr.com | the `Person` node `https://carlosmoralesjr.com/about/#person` | names `https://moraleslabs.com/#organization` with that Person as founder |
| talkestimate.com | founder `name` only: **no `@id`, no `url`** | none |
| mysalsacoach.com | founder and creator `@id` = the Person | none |
| faroquant.com | author `@id` = the Person, `url` /about/ | none |

## 2. What is missing

1. **talkestimate.com is an island.** No link to Carlos, the studio, the other products or the writing, and its JSON-LD founder has no `@id`. It is a flagship.
2. **No product site links to moraleslabs.com.** The studio links out to each product only from one detail page each, and the deployed studio site does not link to carlosmoralesjr.com at all (`c1f7a7d` fixes that but is not deployed).
3. **The person link on mysalsacoach.com and faroquant.com lives only in article bylines.** Neither home page has a visible link to Carlos or the studio. The mysalsacoach.com footer names him in plain text ("Made by Carlos Morales Jr., …"); the faroquant.com footer does not name him.
4. **Carlos Builds, LinkedIn and GitHub:** whether they link to carlosmoralesjr.com is OPEN (unreachable here). The GitHub profile's website field could not be read.
5. **The flagships are not first.** The moraleslabs.com home leads with WhiskLedger and XPIRL; TalkEstimate and SalsaCoach sit in a "Pilots and prototypes" grid (VERIFIED `templates/pages.js` @`c1f7a7d`).

## 3. The target (PROPOSED)

- **One network bar on every site** (component: `prototype/components/`, CSS `shared/mlx-components.css`, about 2 KB): "Built by Carlos Morales Jr." then Morales Labs · TalkEstimate · SalsaCoach · FaroQuant · Carlos Builds. The current site shows as plain text with `aria-current="page"`, never as a link to itself. Label: "Sites by Carlos Morales Jr." — the brand rules ban "ecosystem", "suite" and "family of tools" in public copy (BRAND_ARCHITECTURE.md §4, VERIFIED).
  - **Hubs** (moraleslabs.com, carlosmoralesjr.com): the bar sits above the header. Their existing footers stay.
  - **Product sites** (talkestimate.com, mysalsacoach.com, faroquant.com): the bar is the last element of the footer, so the product's own brand leads (the endorsement model in BRAND_ARCHITECTURE.md §2–3).
- **The person connection.** Product sites add "Built by Carlos Morales Jr." linking to `https://carlosmoralesjr.com/about/` with `rel="author"`, the same target and `rel` their article bylines already use. The two hubs keep `rel="me"` between each other, as both sources already do.
- **The studio connection.** Each product footer adds "A Morales Labs product" linking to its studio page (`https://moraleslabs.com/projects/<slug>/`). That is the governed endorsement wording (BRAND_ARCHITECTURE.md §3.4). It endorses; it does not claim ownership.
- **moraleslabs.com** shows TalkEstimate and SalsaCoach first, each with its status and one link to its own site (patch in `handoff/`).
- **Carlos, by hand** (no chat has access): add `https://carlosmoralesjr.com/` to the Substack publication's about page and profile, the LinkedIn contact info or Featured section, and the GitHub profile website field.

Every exact snippet is in [`handoff/HANDOFF_PUBLIC_AUTHORITY_LINKS.md`](handoff/HANDOFF_PUBLIC_AUTHORITY_LINKS.md) (product sites and carlosmoralesjr.com) and [`handoff/HANDOFF_MORALESLABS.md`](handoff/HANDOFF_MORALESLABS.md) (moraleslabs.com).

## 4. Canonical and identity rules (PROPOSED; most already hold)

1. **Each page is canonical on its own host.** No cross-domain canonicals. The studio's product pages summarise and link out; the product site is canonical for product detail.
2. **Writing:** the four pieces published on Carlos Builds stay canonical on Substack; carlosmoralesjr.com carries summary pages that link out (its existing rule, VERIFIED `content/writing.mjs`). Held drafts are never linked from anywhere.
3. **One Person identity:** `https://carlosmoralesjr.com/about/#person` in every site's JSON-LD (`author`, `founder` or `creator`). Only talkestimate.com lacks it today; the public-authority lane's entity patch adds it, and this lane's talkestimate patch stacks on top of that one.
4. **One studio identity:** `https://moraleslabs.com/#organization`, used only by moraleslabs.com and carlosmoralesjr.com. Product sites do not declare `parentOrganization`, `brand` or `owns` relations to Morales Labs, and nothing gives Morales Labs a `legalName`. Legal lines stay as they are (the legal operator, where each site already names it). Morales Labs is a studio brand.
5. **URL form:** `https://`, apex host, trailing slash on home pages (`https://moraleslabs.com/`, `https://talkestimate.com/`, `https://mysalsacoach.com/`, `https://faroquant.com/`, `https://carlosmoralesjr.com/`), exactly as the sources already write them.
6. **Tracking:** only carlosmoralesjr.com adds UTM tags (its existing `tagged()` rule, VERIFIED `src/lib.mjs`). Other sites link clean.
7. **Status text** anywhere on the network uses the governed labels in [`PRODUCT_MAP.md`](PRODUCT_MAP.md) and links to the studio page when it shows a status.
8. **Link rule:** each owner adds a link only after the destination answers 200 (carlosmoralesjr.com's `check.mjs --live` already enforces this). LinkedIn and Substack URLs are REPORTED; they cannot be checked from this container.

## 5. URLs used (all taken from the sources)

`https://moraleslabs.com/` · `https://carlosmoralesjr.com/` and `/about/` · `https://talkestimate.com/` · `https://mysalsacoach.com/` and `/trainer` · `https://faroquant.com/` and `/methodology/` · `https://carlosbuilds.substack.com/` · `https://www.linkedin.com/in/carlos-morales-jr/` (REPORTED; unreachable here) · `https://github.com/CarlosM787` · `https://github.com/CarlosM787/faro`.
