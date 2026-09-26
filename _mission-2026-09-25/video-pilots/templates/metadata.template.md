# {slug}: upload sheet (draft; nothing is uploaded by any script)

## Title (100 characters or fewer)
- EN: TODO
- ES: TODO

## Description
- **EN:** TODO. Every sound is made in code, with no recordings; the band's patterns are traditional. mysalsacoach.com
- **ES:** TODO. Todo el sonido está hecho con código, sin grabaciones; los patrones de la banda son tradicionales. mysalsacoach.com

## Link and tracking
- Shorts descriptions are not clickable (REPORTED). The clickable paths are the channel's profile links and the
  Short's "related video" link. Use this link where a link is clickable:
  `https://mysalsacoach.com/?utm_source=youtube&utm_medium=short&utm_campaign=clave_lab&utm_content={slug}`
- The call to action must match what mysalsacoach.com offers on upload day (check the live page first).

## Gates (all must be ticked; Carlos decides)
- [ ] Carlos picked the channel and this episode.
- [ ] `python new_episode.py check clave-lab/{slug}.mjs` passes; `py run.py pilot-a --episode {slug}.mjs` exit 0
      (loudness, audio clock, A/V sync all printed in run-report.json).
- [ ] Carlos's ear check on his phone speaker and on headphones.
- [ ] An instructor checked the feet (On1 only until an instructor rules on On2).
- [ ] Captions: `py run.py captions` wrote .en/.es .srt/.vtt with 0 errors; uploaded both.
- [ ] Thumbnail from `templates/thumbnails/clave-lab.json`, 0 problems.
- [ ] Rendered with `--final` (no PRIVATE PILOT mark) for the approved upload only.
- [ ] First upload **Unlisted**, watched on Carlos's phone (Shorts UI zones), then public.
- [ ] YouTube "altered or synthetic content": **No** (animation, and the voice, if any, is Carlos's own).
- [ ] No commercial music; do not register this audio with Content ID.
