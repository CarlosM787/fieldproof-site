"""Start a new Clave Lab episode from the templates, and check an episode spec before rendering it.

  python new_episode.py new <slug>                    writes clave-lab/<slug>.mjs, episodes/<slug>/metadata.md,
                                                      episodes/<slug>/vo_script.json (edit every TODO)
  python new_episode.py check clave-lab/<slug>.mjs    the spec is valid and every caption fits the video
  py run.py pilot-a --episode <slug>.mjs              render it (then: py run.py captions / thumbs2 --episode ...)

The check loads the spec with Node (the same way the renderer does) and uses the renderer's own caption
fonts and wrap rules (clave-lab/compose_v2.py), so "fits" here means fits in the video.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "clave-lab"))
LANES = {"bell", "clave", "conga", "bass"}
KINDS = {"hook", "lesson", "aha", "feet", "count", "turn"}


def load(spec: Path) -> dict:
    spec = spec.resolve()
    r = subprocess.run(["node", "-e", f"import('./{spec.name}').then(m=>console.log(JSON.stringify(m.EPISODE)))"],
                       cwd=spec.parent, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"{spec} does not load: {r.stderr.strip()[-400:]}")
    return json.loads(r.stdout)


def check(spec: Path) -> list[str]:
    import compose_v2 as C
    from PIL import Image, ImageDraw
    ep = load(spec)
    problems = []
    bar = 8 * 60 / ep["bpm"]
    if abs(len(ep["measures"]) * bar - ep["seconds"]) > 1e-6:
        problems.append(f"seconds {ep['seconds']} != {len(ep['measures'])} measures x {bar} s")
    if spec.parent.resolve() != (HERE / "clave-lab").resolve():
        problems.append("the spec must live in clave-lab/ (the capture imports it from there)")
    if not re.fullmatch(r"[a-z0-9-]+", ep["id"]):
        problems.append(f"id {ep['id']!r}: use lowercase letters, digits and dashes")
    F = C.fonts(HERE / "fonts")
    d = ImageDraw.Draw(Image.new("RGB", (4, 4)))
    for i, m in enumerate(ep["measures"]):
        if m.get("kind") not in KINDS:
            problems.append(f"measure {i + 1}: kind {m.get('kind')!r}")
        if not set(m.get("mix", {})) <= LANES or not any(m.get("mix", {}).values()):
            problems.append(f"measure {i + 1}: mix must switch on some of {sorted(LANES)}")
        if m.get("lane") not in LANES | {None}:
            problems.append(f"measure {i + 1}: lane {m.get('lane')!r}")
        wrapped = {}
        for lang in ("en", "es"):
            t = m.get(lang, "")
            if not t.strip() or "TODO" in t:
                problems.append(f"measure {i + 1} {lang}: fill in the caption")
                continue
            try:
                wrapped[lang] = C.wrap_balanced(d, t, F[lang], C.SAFE_X1 - C.SAFE_X0)
            except ValueError as e:
                problems.append(f"measure {i + 1} {lang}: {e}")
        if len(wrapped) == 2 and C.CAP_Y0 + 66 * len(wrapped["en"]) + 8 + 52 * len(wrapped["es"]) > C.CAP_Y1:
            problems.append(f"measure {i + 1}: EN + ES captions overflow the caption block")
    for k in ("en", "es"):
        if "TODO" in ep["hook"][k]:
            problems.append(f"hook {k}: fill in the title")
    return problems


def new(slug: str) -> list[Path]:
    if not re.fullmatch(r"[a-z0-9-]+", slug):
        raise SystemExit("slug: lowercase letters, digits and dashes, e.g. ep02-bell-pattern")
    spec = HERE / "clave-lab" / f"{slug}.mjs"
    ep_dir = HERE / "episodes" / slug
    if spec.exists() or ep_dir.exists():
        raise SystemExit(f"{spec} or {ep_dir} already exists")
    ep_dir.mkdir(parents=True)
    spec.write_text((HERE / "templates" / "clave-episode.template.mjs").read_text().replace("clave-lab-TODO-slug", f"clave-lab-{slug}"))
    (ep_dir / "metadata.md").write_text((HERE / "templates" / "metadata.template.md").read_text().replace("{slug}", slug))
    (ep_dir / "vo_script.json").write_text((HERE / "templates" / "vo_script.template.json").read_text())
    return [spec, ep_dir / "metadata.md", ep_dir / "vo_script.json"]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("new").add_argument("slug")
    sub.add_parser("check").add_argument("spec")
    a = ap.parse_args(argv)
    if a.cmd == "new":
        for p in new(a.slug):
            print("wrote", p)
        print("next: replace every TODO, then python new_episode.py check clave-lab/" + a.slug + ".mjs")
        return 0
    problems = check(Path(a.spec))
    print(json.dumps({"spec": a.spec, "ok": not problems, "problems": problems}, indent=1, ensure_ascii=False))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
