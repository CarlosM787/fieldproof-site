# Mission workspace, 2026-09-25 (branch only)

Work from Carlos's master mission run on 2026-09-25/26 (Arizona time), kept on branch
`claude/carlos-master-mission-10mcvm`. **Never merge this folder into `master`**: `master`
is talkestimate.com production. (Jekyll also skips folders that start with `_`, so a merge would not
publish these files, but the repository itself is public.)

Nothing here is deployed or posted. Private material (money, records, drafts in Carlos's voice)
is not in this repository; it lives in Carlos's private Drive.

| Folder | What | State |
|---|---|---|
| [`salsacoach-count-lab/`](salsacoach-count-lab/) | Partner-floor footwork + Find-the-1 trainer on the audio clock | prototype, 15/15 QA, Lighthouse mobile 98 |
| [`salsacoach-dancers/`](salsacoach-dancers/) | Two textured 3D dancers on the Count Lab clock. Phase three adds a five-step practice mode, teaching overlays and a light homepage banner | private prototype, 73/73 QA with axe; generated motion, not motion capture |
| [`xbot/`](xbot/) | Daily data-visual X pipeline: fetch → validate → render → fact-check → queue → log. Phase three adds Arizona Grid Daily and a weekly river post | dry run, 56 tests; no account exists |
| [`video-pilots/`](video-pilots/) | Two faceless video pilots with code-drawn visuals and synthesized audio. Phase three adds the Lake Powell overlap check, captions, thumbnails and a Windows pipeline guide | private renders, 21 tests; nothing uploaded |
| [`carlos-writer/`](carlos-writer/) | Browser extension: select text → proofread, "sound like Carlos", tone, EN ↔ ES, with a word diff; local model by default | prototype, 66 tests against a stand-in model; the private style guide is not in git |
| [`morales-labs-umbrella/`](morales-labs-umbrella/) | Four visual directions for moraleslabs.com and the chosen "Map" prototype, the shared network bar, and two public site patches | prototype, lab LCP 1.05 s, 0 axe violations; noindex; not deployed |
