# TalkEstimate — Website

Marketing + early-access site for **TalkEstimate**, live at
**https://talkestimate.com**.

## What this is

Static files served by **GitHub Pages**. No build step — the files here are the
files that ship. Pushing to `master` publishes to production in ~1 minute.

| File | Purpose |
|---|---|
| `index.html` | Home page (English) |
| `es.html` | Home page (Mexican Spanish) |
| `privacy.html`, `terms.html` | Legal pages |
| `404.html` | Branded not-found page |
| `analytics.js` | Visitor measurement + campaign attribution (**off until a GA4 ID is set** — see below) |
| `robots.txt`, `sitemap.xml` | Search-engine basics |
| `CNAME` | Binds the `talkestimate.com` custom domain |
| `og-image.png`, `favicon-32.png`, `apple-touch-icon.png`, `founder.jpg` | Images |

## The signup form

Both home pages have one early-access form. It posts to the Supabase
`join-waitlist` function, which stores the lead and emails the founder. The form
works with no login by design and is protected by CORS + a honeypot + strict
validation. Full details: **operational docs in the private `fieldproof/docs/`
repo** — `FORM-OPERATIONS.md`, `WEBSITE-ANALYTICS.md`, `DEPLOYMENT-CHECKLIST.md`.

## Turning on analytics

Analytics ships **dormant** — with no ID, the site sends zero tracking data.
To switch it on, set `GA_MEASUREMENT_ID` in `analytics.js` and update the
privacy policy. Step-by-step: `fieldproof/docs/WEBSITE-ANALYTICS.md`.

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
