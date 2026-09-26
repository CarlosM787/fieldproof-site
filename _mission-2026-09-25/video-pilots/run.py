"""One command per pilot. Works on Windows (PowerShell: `py run.py pilot-a`), macOS and Linux.

  python run.py pilot-a [--out DIR] [--final] [--floor-dir DIR | --dancers]   Clave Lab v2 Short ("Where is the 1?")
  python run.py pilot-b [--out DIR] [--final] [--only long|short] Lake Powell v2 (16:9 story + 9:16 Short)
  python run.py thumbs  [--out DIR]                               the three 1280x720 thumbnails
  python run.py captions [--out DIR]                              SRT + WebVTT (EN, ES) from the scripts' timing
  python run.py thumbs2 [--out DIR]                               thumbnails from templates/thumbnails/*.json
  python run.py check   [--out DIR]                               re-run every measurement on what exists
  python run.py all     [--out DIR] [--encoder auto|nvenc|x264]   all of the above, in order

Rendered media is PRIVATE and never goes into git: it is written under --out (default ./out, which
.gitignore excludes; point it at a folder outside OneDrive/Dropbox on Windows). Nothing is uploaded.
--final drops the "PRIVATE PILOT" mark; use it only after Carlos approves a specific upload.
--floor-dir swaps Pilot A's dancer layer (see clave-lab/compose_v2.py for the contract); --dancers
captures the 3D SalsaCoach Dancers page (../salsacoach-dancers, built first) as that layer. The
Count Lab capture then only renders the audio.

Each step's wall time, the output sizes and the key measurements go to <out>/run-report.json.
Needs: Python 3.10+ with numpy, Pillow, imageio-ffmpeg and fonttools; for Pilot A also Node 18+
with Playwright and its Chromium (`npm i playwright && npx playwright install chromium`).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
MISSION = HERE.parent
CSV = MISSION / "xbot" / "sample" / "usgs_09379900_lake_elevation_ft.csv"
PLEX = MISSION / "xbot" / "fonts"
CLAVE_FONTS = HERE / "fonts"
PY = sys.executable
REPORT = {"steps": []}


def run(name, cmd, env=None, cwd=HERE, capture=False):
    t0 = time.perf_counter()
    print(f"\n== {name}\n   {' '.join(str(c) for c in cmd)}", flush=True)
    e = dict(os.environ, **(env or {}))
    r = subprocess.run([str(c) for c in cmd], cwd=cwd, env=e, text=True, capture_output=capture)
    dt = time.perf_counter() - t0
    REPORT["steps"].append({"step": name, "seconds": round(dt, 1), "ok": r.returncode == 0})
    if capture:
        print(r.stdout.strip()[-2000:])
        if r.stderr.strip():
            print(r.stderr.strip()[-2000:], file=sys.stderr)
    if r.returncode:
        raise SystemExit(f"step failed: {name} (exit {r.returncode})")
    print(f"   done in {dt:.1f} s", flush=True)
    return r.stdout if capture else ""


def size_mb(p):
    p = Path(p)
    if not p.exists():
        return 0.0
    if p.is_file():
        return round(p.stat().st_size / 1e6, 1)
    return round(sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) / 1e6, 1)


def pilot_a(out, a):
    if not (MISSION / "salsacoach-count-lab" / "dist" / "render.html").exists():
        raise SystemExit("Count Lab capture page missing: run `node build.mjs` in ../salsacoach-count-lab first")
    if not shutil.which("node"):
        raise SystemExit("Node is needed for Pilot A (it drives the Count Lab page for the synth and the floor)")
    d = out / "clave-lab"
    cap = d / "capture"
    floor = a.floor_dir
    env = {"OUT": str(cap), "EPISODE": a.episode, "STEMS": "1", "HEADROOM_DB": "6"}
    if floor or a.dancers:
        env["FRAMES"] = "0"                                   # the Count Lab still renders the audio
    run("A1 capture: Count Lab synth (mix + 4 stems)" + ("" if env.get("FRAMES") else " and floor frames"), ["node", "clave-lab/capture.mjs"], env=env)
    if a.dancers:
        dist = Path(a.dancers_dist)
        if not (dist / "index.html").exists():
            raise SystemExit(f"Dancers page not built at {dist}: run `npm i && node build.mjs` in ../salsacoach-dancers")
        floor = d / "floor-dancers"
        run("A1b floor: SalsaCoach Dancers (3D) on the episode clock", ["node", "clave-lab/capture_dancers.mjs"],
            env={"OUT": str(floor), "EPISODE": "episode_v2.mjs", "DANCERS": str(dist)})
    run("A2 mix: phone-safe bass, stereo, loop, -14 LUFS", [PY, "clave-lab/mix_v2.py", cap, d / "audio_v2.wav", "--episode", a.episode], capture=True)
    name = a_name(a)
    cmd = [PY, "clave-lab/compose_v2.py", "--capture", cap, "--audio", d / "audio_v2.wav", "--fonts", CLAVE_FONTS,
           "--out", d / f"{name}.mp4", "--stills", "--episode", a.episode, "--encoder", a.encoder]
    if floor:
        cmd += ["--floor-dir", floor]
    if a.final:
        cmd += ["--final"]
    run("A3 compose: 1080x1920 video", cmd)
    check_a(out, name, a)
    REPORT["pilot_a"] = {"mp4": f"{name}.mp4", "mp4_MB": size_mb(d / f"{name}.mp4"), "capture_MB": size_mb(cap),
                         "floor_frames_MB": size_mb(floor or cap / "floor")}


def a_name(a):
    base = "where-is-the-1-v2" if getattr(a, "episode", "episode_v2.mjs") == "episode_v2.mjs" else Path(a.episode).stem
    return base + "-dancers" if getattr(a, "dancers", False) else base


def check_a(out, name="where-is-the-1-v2", a=None):
    d = out / "clave-lab"
    if not (d / f"{name}.mp4").exists():
        return
    REPORT["pilot_a_checks"] = {
        "loudness": run("A4 loudness (EBU R128, after AAC)", [PY, "review/audio_check.py", "loudness", d / f"{name}.mp4"], capture=True).strip(),
        "audio_clock": run("A5 audio clock vs model", [PY, "sync_check.py", d / "audio_v2.wav", "--episode", getattr(a, "episode", "episode_v2.mjs")], cwd=HERE / "clave-lab", capture=True).strip(),
        "av_sync": run("A6 picture vs sound in the MP4", [PY, "review/av_sync.py", d / f"{name}.mp4", d / "audio_v2.wav",
                                                          d / f"{name}-layout.json", "clave-lab/" + getattr(a, "episode", "episode_v2.mjs")], capture=True).strip(),
    }


def pilot_b(out, a):
    d = out / "desert-systems"
    cmd = [PY, "desert-systems/lake_powell_v2.py", a.csv, PLEX, d, "--encoder", a.encoder]
    if a.only:
        cmd += ["--only", a.only]
    if a.final:
        cmd += ["--final"]
    run("B1 render: data story, sound, 16:9 and 9:16", cmd, capture=True)
    check_b(out, a)
    REPORT["pilot_b"] = {k: size_mb(d / k) for k in ("lake-powell-v2.mp4", "lake-powell-short-v2.mp4", "lake-powell-v2.wav", "lake-powell-short-v2.wav")}


def check_b(out, a):
    d = out / "desert-systems"
    mans = [p for p in (d / "lake-powell-v2.json", d / "lake-powell-short-v2.json") if p.exists()]
    if mans:
        REPORT["pilot_b_checks"] = run("B2 verify every number against the CSV", [PY, "review/verify_powell.py", a.csv, *mans], capture=True).strip()[-600:]
        REPORT["pilot_b_layout"] = run("B3 layout: every text box on every frame (overlaps, safe areas)",
                                       [PY, "review/overlap_check.py", *mans, "--json", d / "overlap-report.json"], capture=True).strip()[-900:]
        for m in mans:
            mp4 = m.with_suffix(".mp4")
            if mp4.exists():
                REPORT.setdefault("pilot_b_audio", {})[mp4.name] = json.loads(
                    run(f"B4 loudness and clipped samples: {mp4.name}", [PY, "review/audio_check.py", "clip", mp4, m.with_suffix(".wav")],
                        capture=True).strip().splitlines()[-1])


def thumbs(out, a):
    cap = out / "clave-lab" / "capture"
    if not (cap / "floor" / "f00648.jpg").exists():
        raise SystemExit("thumbnails need the Pilot A floor capture: run `python run.py pilot-a` first")
    run("T1 thumbnails 1280x720", [PY, "thumbnails_v2.py", cap, CLAVE_FONTS, CSV, PLEX, out / "thumbnails"], capture=True)


def captions_step(out, a):
    """SRT + WebVTT, EN + ES, from the episode spec (Pilot A) and the render manifests (Pilot B)."""
    d = out / "captions"
    res = {}
    if (out / "clave-lab" / f"{a_name(a)}.mp4").exists():
        res[a_name(a)] = run("C1 captions: Pilot A (episode timing)", [PY, "captions.py", "clave", "--episode", "clave-lab/" + a.episode,
                                                                          "--out", d, "--name", a_name(a)], capture=True).strip()
    for m in ("lake-powell-v2", "lake-powell-short-v2"):
        man = out / "desert-systems" / f"{m}.json"
        if man.exists():
            res[m] = run(f"C2 captions: {m} (render timing)", [PY, "captions.py", "powell", "--manifest", man, "--out", d], capture=True).strip()
    REPORT["captions"] = res


def thumbs2(out, a):
    """1280x720 thumbnails from templates/thumbnails/*.json (checked: margins, badge corner, overlaps, contrast, size)."""
    t = out / "thumbnails"
    res = {}
    still = out / "clave-lab" / "still-feet.jpg"
    if still.exists():
        res["clave"] = run("T2 thumbnail from template: Clave Lab", [PY, "thumbnail.py", "--spec", "templates/thumbnails/clave-lab.json",
                                                                     "--episode", "clave-lab/" + a.episode, "--var", f"still={still}",
                                                                     "--out", t / f"{a_name(a)}-thumbnail.jpg"], capture=True).strip()
    plate = out / "desert-systems" / "lake-powell-v2-plate.png"
    if plate.exists():
        res["powell"] = run("T3 thumbnail from template: Lake Powell", [PY, "thumbnail.py", "--spec", "templates/thumbnails/lake-powell.json",
                                                                        "--var", f"plate={plate}", "--facts", out / "desert-systems" / "lake-powell-v2-facts.json",
                                                                        "--out", t / "lake-powell-v2-thumbnail.jpg"], capture=True).strip()
    REPORT["thumbnails_from_templates"] = res


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("what", choices=["pilot-a", "pilot-b", "thumbs", "captions", "thumbs2", "check", "all"])
    ap.add_argument("--out", default=os.environ.get("PILOTS_OUT", str(HERE / "out")))
    ap.add_argument("--final", action="store_true")
    ap.add_argument("--floor-dir", help="Pilot A: use these floor frames (see the contract in clave-lab/compose_v2.py)")
    ap.add_argument("--dancers", action="store_true", help="Pilot A: capture the 3D SalsaCoach Dancers as the floor (writes ...-v2-dancers.mp4)")
    ap.add_argument("--dancers-dist", default=str(MISSION / "salsacoach-dancers" / "dist"), help="the built Dancers page (dist/)")
    ap.add_argument("--only", choices=["long", "short"])
    ap.add_argument("--episode", default="episode_v2.mjs", help="Pilot A: the episode spec in clave-lab/ (new episodes: see new_episode.py)")
    ap.add_argument("--csv", default=str(CSV), help="Pilot B: the lake-level CSV (default: the committed USGS copy; see "
                                                      "desert-systems/refresh_powell_csv.py to refresh it from USGS)")
    ap.add_argument("--encoder", choices=["auto", "nvenc", "x264"], default="auto",
                    help="auto: NVIDIA NVENC if it works on this PC, else x264 (see encode.py)")
    a = ap.parse_args()
    out = Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.perf_counter()
    if a.what in ("pilot-a", "all"):
        pilot_a(out, a)
    if a.what in ("pilot-b", "all"):
        pilot_b(out, a)
    if a.what in ("thumbs", "all"):
        thumbs(out, a)
    if a.what in ("captions", "all"):
        captions_step(out, a)
    if a.what in ("thumbs2", "all"):
        thumbs2(out, a)
    if a.what == "check":
        check_a(out, a_name(a), a)
        check_b(out, a)
    REPORT["total_seconds"] = round(time.perf_counter() - t0, 1)
    REPORT["machine"] = {"cpus": os.cpu_count(), "platform": sys.platform, "python": sys.version.split()[0]}
    try:
        import encode
        REPORT["encoder"] = encode.choose(a.encoder).describe()
    except SystemExit as e:
        REPORT["encoder"] = {"error": str(e)}
    (out / "run-report.json").write_text(json.dumps(REPORT, indent=1) + "\n")
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    (out / f"run-report-{a.what}-{stamp}.json").write_text(json.dumps(REPORT, indent=1) + "\n")   # kept per run
    print(f"\nwrote {out / 'run-report.json'} ({REPORT['total_seconds']} s)")


if __name__ == "__main__":
    main()
