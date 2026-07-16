# TalkEstimate — Website

Marketing + early-access site for **TalkEstimate**, live at
**https://talkestimate.com**.

## What this is

Static files served by **GitHub Pages**. No build step — the files here are the
files that ship. Pushing to `master` publishes to production in ~1 minute.

> ⚠️ **Product/marketing copy is FROZEN.** The app's newest features
> (invoices, paid receipts, money dashboard, 4 pricing methods) are built but
> **not yet verified on a real phone**, so the site must not advertise them
> yet. Infrastructure changes (SEO, analytics, form hardening, this README)
> are fine. Unfreeze only after the S25 pass in
> `fieldproof/docs/PHONE-TEST-MATRIX.md` — then add **real** screenshots, no
> mockups. Never claim users, traction, or features that don't exist.
> Current early-access copy is accurate and already fits the closed beta.

| File | Purpose |
|---|---|
| `index.html` | Home page (English) |
| `es.html` | Home page (Mexican Spanish) |
| `privacy.html`, `terms.html` | Legal pages |
| `404.html` | Branded not-found page |
| `analytics.js` | Visitor measurement + campaign attribution (**LIVE** — GA4 `G-23MSFMVK4B`) |
| `robots.txt`, `sitemap.xml` | Search-engine basics |
| `CNAME` | Binds the `talkestimate.com` custom domain |
| `og-image.png`, `favicon-32.png`, `apple-touch-icon.png`, `founder.jpg` | Images |

## The signup form

Both home pages have one early-access form. It posts to the Supabase
`join-waitlist` function, which stores the lead and emails the founder. The form
works with no login by design and is protected by CORS + a honeypot + strict
validation. Full details: **operational docs in the private `fieldproof/docs/`
repo** — `FORM-OPERATIONS.md`, `WEBSITE-ANALYTICS.md`, `DEPLOYMENT-CHECKLIST.md`.

## Analytics — LIVE

GA4 is **on** (`G-23MSFMVK4B`, set in `analytics.js`), the privacy policy
discloses it, and Search Console is verified. Only non-PII events are sent
(which button, which page, campaign source, language) — never a name, email,
or anything typed into the form.

To change or disable it, edit `GA_MEASUREMENT_ID` in `analytics.js` and push;
an empty ID returns the site to zero tracking. Details:
`fieldproof/docs/WEBSITE-ANALYTICS.md`.

## Deploy / preview / rollback

```sh
# preview locally (analytics stays off on localhost):
python -m http.server 8899      # then open http://127.0.0.1:8899

# publish:
git add -A && git commit -m "…" && git push

# undo the last change:
git revert HEAD --no-edit && git push
```

No secrets live in this repo. Do not add API keys or tokens here — it is public.
