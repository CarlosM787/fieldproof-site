"""Caption files (SRT and WebVTT, English and Spanish) from each pilot's own timing. No speech
recognition, no guessing: the times come from the episode spec or the render manifest.

  python captions.py clave  --episode clave-lab/episode_v2.mjs --out DIR [--name where-is-the-1-v2]
  python captions.py powell --manifest OUT/desert-systems/lake-powell-v2.json --out DIR
  python captions.py script --script vo.json --out DIR --name NAME [--duration S]   (a voice-over script)
  python captions.py check  FILE.srt|FILE.vtt [--duration S]

clave   one cue per 8-count measure (3.2 s at 150 BPM): the caption the video draws, accent marks removed;
        the hook measure also carries the title ("Where is the 1?").
powell  the cold open, the rules card, one cue per story beat (its on-screen span, read from the
        manifest the render wrote) and the end card.
script  a list of {"start": s, "end": s, "en": "...", "es": "..."}: Carlos's voice-over lines, so the
        captions match what he says (templates/vo_script.template.json).
Writes NAME.en.srt, NAME.es.srt, NAME.en.vtt, NAME.es.vtt and NAME.captions.json (the check report).
Rules (errors): <= 42 characters per line, <= 2 lines per cue, >= 1.0 s per cue, no overlaps, inside the
video. Reading speed above 20 characters/s (EN) or 17 (ES) is reported as a warning: a caption that
mirrors on-screen text can only be as slow as the picture.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
MAX_CHARS, MAX_LINES, MIN_DUR = 42, 2, 1.0
CPS = {"en": 20.0, "es": 17.0}


@dataclass
class Cue:
    start: float
    end: float
    text: str

    def lines(self) -> list[str]:
        return wrap(self.text)


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("*", "").replace(" ", " ")).strip()


def wrap(text: str, width: int = MAX_CHARS) -> list[str]:
    """One line if it fits, else the most even two-line split; >2 lines only if unavoidable."""
    text = clean(text)
    if len(text) <= width:
        return [text]
    words = text.split(" ")
    best = None
    for k in range(1, len(words)):
        a, b = " ".join(words[:k]), " ".join(words[k:])
        if len(a) <= width and len(b) <= width:
            score = abs(len(a) - len(b)) - (6 if a[-1] in ".,:;?" else 0)
            if best is None or score < best[0]:
                best = (score, [a, b])
    if best:
        return best[1]
    out, line = [], ""
    for w in words:                                     # fallback: greedy (the checker will flag it)
        if line and len(line) + 1 + len(w) > width:
            out.append(line)
            line = w
        else:
            line = (line + " " + w).strip()
    return out + [line]


def split_long(cues: list[Cue]) -> list[Cue]:
    """A cue whose text needs more than two lines becomes two cues sharing its time span."""
    out = []
    for c in cues:
        if len(wrap(c.text)) <= MAX_LINES:
            out.append(c)
            continue
        words = clean(c.text).split(" ")
        # split at the sentence break nearest the middle, else at the middle word
        mid = len(words) // 2
        cands = [i for i in range(1, len(words)) if words[i - 1][-1] in ".?!:;"] or [mid]
        k = min(cands, key=lambda i: abs(i - mid))
        t = c.start + (c.end - c.start) * len(" ".join(words[:k])) / max(1, len(" ".join(words)))
        out += split_long([Cue(c.start, round(t, 3), " ".join(words[:k])), Cue(round(t, 3), c.end, " ".join(words[k:]))])
    return out


def ts(t: float, vtt: bool) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{'.' if vtt else ','}{ms:03d}"


def to_srt(cues: list[Cue]) -> str:
    return "\n".join(f"{i}\n{ts(c.start, False)} --> {ts(c.end, False)}\n" + "\n".join(c.lines()) + "\n" for i, c in enumerate(cues, 1))


def to_vtt(cues: list[Cue]) -> str:
    return "WEBVTT\n\n" + "\n".join(f"{ts(c.start, True)} --> {ts(c.end, True)}\n" + "\n".join(c.lines()) + "\n" for c in cues)


TIME = re.compile(r"(\d+):(\d\d):(\d\d)[,.](\d{3}) --> (\d+):(\d\d):(\d\d)[,.](\d{3})")


def parse(text: str) -> list[tuple[float, float, list[str]]]:
    """Reads SRT or WebVTT back (the check runs on the files, not on our objects)."""
    cues, cur = [], None
    for line in text.splitlines():
        m = TIME.search(line)
        if m:
            g = [int(x) for x in m.groups()]
            cur = (g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000, g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000, [])
            cues.append(cur)
        elif cur is not None and line.strip() and not line.strip().isdigit():
            cur[2].append(line.strip())
        elif not line.strip():
            cur = None
    return cues


def check(text: str, lang: str, duration: float | None) -> dict:
    cues = parse(text)
    errors, warnings = [], []
    if not cues:
        errors.append("no cues")
    prev_end = 0.0
    for i, (a, b, lines) in enumerate(cues, 1):
        if b - a < MIN_DUR - 1e-6:
            errors.append(f"cue {i}: {b - a:.2f} s (minimum {MIN_DUR})")
        if a < prev_end - 1e-6:
            errors.append(f"cue {i} overlaps the previous one")
        if duration is not None and b > duration + 1e-6:
            errors.append(f"cue {i} ends at {b:.2f} s, after the video ({duration:.2f} s)")
        if len(lines) > MAX_LINES:
            errors.append(f"cue {i}: {len(lines)} lines")
        for ln in lines:
            if len(ln) > MAX_CHARS:
                errors.append(f"cue {i}: line of {len(ln)} characters")
        cps = sum(len(l) for l in lines) / max(b - a, 1e-6)
        if cps > CPS[lang]:
            warnings.append(f"cue {i}: {cps:.1f} characters/s (guide {CPS[lang]:.0f})")
        prev_end = b
    return {"cues": len(cues), "errors": errors, "warnings": warnings,
            "first": ts(cues[0][0], True) if cues else None, "last": ts(cues[-1][1], True) if cues else None}


def write(out: Path, name: str, tracks: dict, duration: float | None) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    report = {}
    for lang, cues in tracks.items():
        cues = split_long(cues)
        for ext, fn in (("srt", to_srt), ("vtt", to_vtt)):
            p = out / f"{name}.{lang}.{ext}"
            p.write_text(fn(cues), encoding="utf-8")
            report[p.name] = check(p.read_text(encoding="utf-8"), lang, duration)
    (out / f"{name}.captions.json").write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")
    return report


# ---------------------------------------------------------------- sources of timing
def node_json(expr: str, cwd: Path):
    return json.loads(subprocess.run(["node", "-e", expr], cwd=cwd, capture_output=True, text=True, check=True).stdout)


def sentence_case(s: str) -> str:
    s = s.lower()
    i = next((k for k, ch in enumerate(s) if ch.isalpha()), 0)
    return s[:i] + s[i:i + 1].upper() + s[i + 1:]


def clave_tracks(ep: dict) -> tuple[dict, float]:
    bar = 8 * 60 / ep["bpm"]
    tracks = {"en": [], "es": []}
    for m, meas in enumerate(ep["measures"]):
        a, b = round(m * bar, 3), round((m + 1) * bar, 3)
        for lang in ("en", "es"):
            txt = meas[lang]
            if meas["kind"] == "hook":
                txt = sentence_case(ep["hook"][lang]) + " " + txt
            tracks[lang].append(Cue(a, b, txt))
    return tracks, float(ep["seconds"])


def powell_tracks(man: dict) -> tuple[dict, float]:
    tl, total = man["timeline"], man["seconds"]
    hook_s, draw0 = tl["hook_s"], tl["hook_s"] + tl["legend_s"]
    draw_end = draw0 + tl["draw_s"]
    hook = next(f for f in man["frames"] if "hook" in f)["hook"]
    end = next(f for f in reversed(man["frames"]) if "end" in f)["end"]
    tracks = {"en": [Cue(0, hook_s, f"{hook} of water left above the level Glen Canyon Dam needs to make power."),
                     Cue(hook_s, draw0, "How did it get here? One note per week. Higher note, higher lake.")],
              "es": [Cue(0, hook_s, f"{hook.replace(' ft', ' pies')} de agua sobre el nivel que Glen Canyon necesita para generar energía."),
                     Cue(hook_s, draw0, "¿Cómo llegó aquí? Una nota por semana. Nota más alta, lago más alto.")]}
    beats = man["beats"]
    for k, b in enumerate(beats):
        a = draw0 if k == 0 else b["on_screen_s"][0]
        z = beats[k + 1]["on_screen_s"][0] if k + 1 < len(beats) else draw_end + 0.2
        tracks["en"].append(Cue(round(a, 3), round(z, 3), f"{b['en']} ({b['final_counter']})."))
        tracks["es"].append(Cue(round(a, 3), round(z, 3), f"{b['es']} ({b['final_counter'].replace(' ft', ' pies')})."))
    tracks["en"].append(Cue(round(draw_end + 0.2, 3), total, f"{end[0]} {end[1]}. {end[2]}."))
    tracks["es"].append(Cue(round(draw_end + 0.2, 3), total, end[3]))
    return tracks, total


def script_tracks(items: list[dict]) -> dict:
    return {lang: [Cue(float(i["start"]), float(i["end"]), i[lang]) for i in items if i.get(lang)] for lang in ("en", "es")}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("what", choices=["clave", "powell", "script", "check"])
    ap.add_argument("files", nargs="*")
    ap.add_argument("--episode", default="clave-lab/episode_v2.mjs")
    ap.add_argument("--manifest")
    ap.add_argument("--script")
    ap.add_argument("--out", default=".")
    ap.add_argument("--name")
    ap.add_argument("--duration", type=float)
    a = ap.parse_args(argv)
    if a.what == "check":
        bad = 0
        for f in a.files:
            lang = "es" if ".es." in f else "en"
            r = check(Path(f).read_text(encoding="utf-8"), lang, a.duration)
            bad += len(r["errors"])
            print(f, json.dumps(r, ensure_ascii=False))
        return 1 if bad else 0
    if a.what == "clave":
        ep_path = HERE / a.episode
        ep = node_json(f"import('./{ep_path.name}').then(m=>console.log(JSON.stringify(m.EPISODE)))", ep_path.parent)
        tracks, dur = clave_tracks(ep)
        name = a.name or ("where-is-the-1-v2" if ep_path.name == "episode_v2.mjs" else ep_path.stem)
    elif a.what == "powell":
        man = json.loads(Path(a.manifest).read_text(encoding="utf-8"))
        tracks, dur = powell_tracks(man)
        name = a.name or Path(a.manifest).stem
    else:
        tracks, dur, name = script_tracks(json.loads(Path(a.script).read_text(encoding="utf-8"))), a.duration, a.name or Path(a.script).stem
    rep = write(Path(a.out), name, tracks, dur if a.duration is None else a.duration)
    errors = sum(len(r["errors"]) for r in rep.values())
    print(json.dumps({"name": name, "files": {k: {"cues": v["cues"], "errors": len(v["errors"]), "warnings": len(v["warnings"])}
                                              for k, v in rep.items()}}, ensure_ascii=False))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
