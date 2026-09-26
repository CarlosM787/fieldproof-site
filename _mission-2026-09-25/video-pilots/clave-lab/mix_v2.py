"""Pilot A v2 mix: post-processes the Count Lab page's own renders (the page is not modified).

  python mix_v2.py <capture dir> <out.wav> [--episode episode_v2.mjs] [--target -14] [--bell-db 5] ...

Input: a capture made with `STEMS=1 HEADROOM_DB=6` (capture.mjs): audio.wav is the page's full mix
(its own voices, levels and bus compressor, exported 6 dB lower so it cannot clip) and
stems/<lane>.wav are the same synth and clock with one lane on. Every layer below is computed from
those files, sample-aligned, so the page's clock and model stay the source of truth.

1. Trim the page's 0.1 s render lead (count 1 lands at t = 0) and, for a looping Short, add the audio
   past the end back onto the start (the tail of bar 10 rings into bar 1, as in a groove).
2. Level trims through the stems: mix + (g - 1) * stem (the stem matches the lane inside the mix to
   within -31 dB, measured). Defaults: bell +5 dB, bass -3 dB (v1: bell 22 dB under the rest, bass
   16 dB over it, on headphones).
3. Phone-safe layers. Phone speakers roll off below ~300 Hz, which removes the bass fundamentals
   (73-110 Hz) and most of the conga open tones (206-262 Hz). A soft asymmetric saturator applied to
   each stem makes a harmonic series of the same notes (2f, 3f, 4f ...); a causal high-pass keeps
   only the part above ~180 Hz (bass) / ~400 Hz (conga), so headphones hear the same notes with a
   little more edge and a phone hears the harmonics, from which the ear infers the missing
   fundamental. The conga layer is gated to the open tones, whose times come from the model.
4. Stereo for headphones: side = sum(pan_k * stem_k); L = mix + side, R = mix - side. The mono sum
   is exactly the mono mix, so phones (mono) and mono fold-downs are unaffected by construction.
5. Loudness: gain to the target (EBU R128 integrated, ffmpeg ebur128) and a look-ahead limiter on
   4x-oversampled peaks, so the true peak stays under the ceiling. Writes <out>.json with the numbers.
"""
import argparse
import json
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "review"))
from audio_check import MODELS, ebur128, master, phone_table, read_audio, shortterm, speaker, stereo  # noqa: E402

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000


def node_json(expr, cwd=HERE):
    return json.loads(subprocess.run(["node", "-e", expr], cwd=cwd, capture_output=True, text=True, check=True).stdout)


def iir(x, chain):
    """Causal IIR filtering through ffmpeg's biquads (no pre-ringing, so no early energy)."""
    out = subprocess.run([FF, "-v", "error", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-i", "-", "-af", chain, "-f", "f32le", "-"],
                         input=x.astype("<f4").tobytes(), capture_output=True, check=True).stdout
    y = np.frombuffer(out, dtype="<f4").astype(np.float64)
    return np.pad(y, (0, max(0, len(x) - len(y))))[: len(x)]


def saturate(x, drive=3.0, bias=0.35):
    """Soft asymmetric saturation: odd and even harmonics of whatever note is playing."""
    peak = np.abs(x).max() or 1.0
    u = x / peak
    return (np.tanh(drive * u + bias) - np.tanh(bias)) * peak / drive


def write_wav(path, x):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1 - 1 / 32768) * 32767).round().astype("<i2").tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("capture")
    ap.add_argument("out")
    ap.add_argument("--episode", default="episode_v2.mjs")
    ap.add_argument("--target", type=float, default=-14.0, help="integrated loudness, LUFS")
    ap.add_argument("--ceiling", type=float, default=-1.6, help="true-peak ceiling before AAC, dBTP")
    ap.add_argument("--bell-db", type=float, default=5.0)
    ap.add_argument("--bass-db", type=float, default=-3.0)
    ap.add_argument("--bass-layer-db", type=float, default=3.0, help="bass harmonic layer vs the bass stem's peak level")
    ap.add_argument("--conga-layer-db", type=float, default=0.0)
    ap.add_argument("--section-gap", type=float, default=7.0, help="quiet bars are raised to within this many LU of the loudest bar")
    ap.add_argument("--max-boost", type=float, default=8.0, help="cap, so the true-peak limiter never takes more than ~2 dB")
    ap.add_argument("--pan", default="bell:0.35,clave:-0.30,conga:-0.12,bass:0")
    ap.add_argument("--no-layers", action="store_true", help="skip the phone layers (for A/B)")
    a = ap.parse_args()

    cap = Path(a.capture)
    ep = node_json(f"import('./{a.episode}').then(m=>console.log(JSON.stringify(m.EPISODE)))")
    band = node_json("import('../../salsacoach-count-lab/src/model.js').then(m=>console.log(JSON.stringify(m.BAND)))")
    lead = int(round(ep.get("pageLead", 0.1) * SR))
    mono = lambda p: read_audio(p)[:, 0]
    mix = mono(cap / "audio.wav")[lead:]
    stems = {k: mono(cap / "stems" / f"{k}.wav")[lead:] for k in ("bell", "clave", "conga", "bass")}
    n = len(mix)

    gains = {"bell": 10 ** (a.bell_db / 20), "clave": 1.0, "conga": 1.0, "bass": 10 ** (a.bass_db / 20)}
    out = mix + sum((gains[k] - 1) * s for k, s in stems.items())
    parts = {k: gains[k] * s for k, s in stems.items()}          # what each lane is now, for the report

    # Section leveller: a bar with few instruments (the bell alone) is far quieter than the full band.
    # Raise only the lanes playing in that bar, from its downbeat (20 ms ramp just before it), so
    # notes ringing over from the previous bar are not pumped. Gains come from measured loudness.
    # Bar loudness = EBU short-term loudness (3 s, ungated) at the end of each 3.2 s bar: gated
    # integrated loudness would skip the silences between bell strokes and overrate a sparse bar.
    bar = int(round(8 * 60 / ep["bpm"] * SR))
    bars = len(ep["measures"])
    with tempfile.TemporaryDirectory() as td:
        write_wav(Path(td) / "pre.wav", out[:, None].repeat(2, axis=1) / max(1.0, np.abs(out).max()))
        series = shortterm(Path(td) / "pre.wav")
    at = lambda t: min(series, key=lambda p: abs(p[0] - t))[1]
    loud = [at((m + 1) * bar / SR - 0.05) for m in range(bars)]
    ref = max(loud)
    boost = [min(a.max_boost, max(0.0, ref - a.section_gap - L)) for L in loud]
    ramp = int(0.02 * SR)
    for k in stems:
        env = np.ones(n)
        for m, meas in enumerate(ep["measures"]):
            if boost[m] > 0 and meas["mix"].get(k):
                env[max(0, m * bar - ramp):(m + 1) * bar - ramp] = 10 ** (boost[m] / 20)
        # smooth the steps into 20 ms ramps that end on the downbeats
        env = np.convolve(np.pad(env, (ramp, 0), mode="edge"), np.ones(ramp) / ramp, mode="valid")[:n]
        out = out + (env - 1) * parts[k]
        parts[k] = parts[k] * env

    layers = {}
    if not a.no_layers:
        b = stems["bass"]
        lb = iir(saturate(b), "highpass=f=180:p=2,highpass=f=180:p=2,lowpass=f=1800:p=2")
        lb *= gains["bass"] * 10 ** (a.bass_layer_db / 20) * np.abs(b).max() / (np.abs(lb).max() or 1)
        layers["bass"] = lb
        # conga: gate to the open tones (slots from the model, times from the clock)
        slot_s = 30 / ep["bpm"]
        gate = np.zeros(n)
        ramp = int(0.004 * SR)
        for m, meas in enumerate(ep["measures"]):
            if not meas["mix"].get("conga"):
                continue
            for s, kind in band["conga"].items():
                if kind != "open":
                    continue
                t0 = ep["audioOffset"] + (m * 16 + int(s)) * slot_s
                i0, i1 = int(t0 * SR) - ramp, int((t0 + 0.19) * SR)
                if i0 < 0 or i1 > n:
                    continue
                gate[i0:i1] = 1.0
                gate[i1 - ramp:i1] *= np.linspace(1, 0, ramp)
                gate[i0:i0 + ramp] *= np.linspace(0, 1, ramp)
        c = stems["conga"] * gate
        lc = iir(saturate(c, drive=2.5, bias=0.25), "highpass=f=400:p=2,highpass=f=400:p=2,lowpass=f=2500:p=2")
        lc *= 10 ** (a.conga_layer_db / 20) * np.abs(c).max() / (np.abs(lc).max() or 1)
        layers["conga"] = lc
        for k, l in layers.items():
            out = out + l
            parts[k] = parts[k] + l

    pans = {k: float(v) for k, v in (p.split(":") for p in a.pan.split(","))}
    side = sum(pans.get(k, 0) * p for k, p in parts.items())
    st = np.stack([out + side, out - side], axis=1)

    seconds = ep["seconds"]
    N = int(round(seconds * SR))
    def wrap(v):
        w = v[:N].copy()
        if ep.get("loop"):
            tail = v[N:2 * N]
            w[: len(tail)] += tail
        return w

    st = wrap(st)
    parts = {k: wrap(p) for k, p in parts.items()}

    # loudness: gain to the target, look-ahead limiter on 4x-oversampled peaks, re-measure (converges)
    y, gain_db, lim = master(st, a.target, a.ceiling)
    lim_db = float(20 * np.log10(lim.min()))
    lim_bars = [round(float(20 * np.log10(lim[m * bar:(m + 1) * bar].min())), 1) for m in range(bars)]
    write_wav(a.out, y)
    final = ebur128(a.out)

    g = 10 ** (gain_db / 20)
    report = {
        "method": "Python post-process of the Count Lab page's own renders (full mix + per-lane stems, HEADROOM_DB=6); page not modified",
        "trim_s": lead / SR, "loop_wrap": bool(ep.get("loop")), "seconds": N / SR,
        "bar_shortterm_before_leveller_LUFS": [round(x, 1) for x in loud], "bar_boost_dB": [round(x, 1) for x in boost],
        "gains_dB": {"bell": a.bell_db, "bass": a.bass_db, "bass_layer": None if a.no_layers else a.bass_layer_db,
                     "conga_layer": None if a.no_layers else a.conga_layer_db, "normalize": round(gain_db, 2),
                     "limiter_max_reduction": round(lim_db, 2), "limiter_max_reduction_per_bar": lim_bars},
        "pan": pans, "final": final, "stereo": stereo(read_audio(a.out)),
        "phone": {m: ebur128(speaker(read_audio(a.out), m)) for m in MODELS},
        "per_lane": phone_table(read_audio(a.out), {k: np.stack([p * g, p * g], axis=1) for k, p in parts.items()}),
    }
    Path(a.out).with_suffix(".json").write_text(json.dumps(report, indent=1) + "\n")
    print(json.dumps({k: report[k] for k in ("final", "gains_dB", "phone")}, indent=1))


if __name__ == "__main__":
    main()
