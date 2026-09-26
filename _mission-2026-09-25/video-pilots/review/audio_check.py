"""Audio review and mastering tools for the pilots: loudness, stereo/mono, a phone-speaker
simulation, and the shared true-peak limiter / loudness mastering (master()) used by both pilots.

  python audio_check.py loudness <file>...            EBU R128 (ffmpeg ebur128): I, LRA, true peak
  python audio_check.py stereo <file>                 L/R correlation, side level, mono fold-down
  python audio_check.py phone <mix.wav> <stem.wav>... energy each stem keeps through a phone speaker
  python audio_check.py report <mix> [stems...] --json out.json   all of the above in one JSON

Loudness and true peak come from ffmpeg's ebur128 filter (peak=true oversamples 4x), so they are the
standard BS.1770 numbers. The phone speaker is a MODEL (INFERENCE, not a measured device):
  phone      mono sum, 4th-order Butterworth high-pass at 280 Hz, 2nd-order low-pass at 10 kHz
  phone-400  the same with the high-pass at 400 Hz (small or budget speakers)
Filters are applied as zero-phase magnitude responses in the FFT domain; for energy ratios that is
exact, and it keeps the tool dependency-free (numpy only).
"""
import json
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
MODELS = {"phone": (280.0, 4, 10000.0, 2), "phone-400": (400.0, 4, 10000.0, 2)}


def read_audio(path, sr=SR):
    """Any file ffmpeg can decode -> float64 array (n, 2) at sr. MP4 edit lists are honoured."""
    path = str(path)
    if path.endswith(".wav"):
        try:
            with wave.open(path) as w:
                if w.getsampwidth() == 2 and w.getframerate() == sr:
                    x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").reshape(-1, w.getnchannels())
                    x = x.astype(np.float64) / 32768.0
                    return x if x.shape[1] == 2 else np.repeat(x, 2, axis=1)
        except wave.Error:
            pass  # float WAV: let ffmpeg decode it
    raw = subprocess.run([FF, "-v", "error", "-i", path, "-vn", "-f", "f32le", "-ac", "2", "-ar", str(sr), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype="<f4").reshape(-1, 2).astype(np.float64)


def write_wav(path, x, sr=SR, float32=False):
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    if float32:
        # IEEE float WAV via ffmpeg (keeps levels above 0 dBFS for analysis)
        subprocess.run([FF, "-y", "-v", "error", "-f", "f32le", "-ac", "2", "-ar", str(sr), "-i", "-", "-c:a", "pcm_f32le", str(path)],
                       input=x.astype("<f4").tobytes(), check=True)
        return path
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(x, -1, 1 - 1 / 32768) * 32767).round().astype("<i2").tobytes())
    return path


def ebur128(path_or_array, sr=SR):
    """Integrated loudness (LUFS), loudness range (LU), true peak (dBTP) and sample peak (dBFS)."""
    tmp = None
    if not isinstance(path_or_array, (str, Path)):
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp.close()
        write_wav(tmp.name, path_or_array, sr, float32=True)
        path = tmp.name
    else:
        path = str(path_or_array)
    err = subprocess.run([FF, "-hide_banner", "-nostats", "-i", path, "-vn", "-af", "ebur128=peak=true+sample:framelog=quiet", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    if tmp:
        Path(tmp.name).unlink()
    summ = err[err.rfind("Summary:"):]
    get = lambda pat: float(re.search(pat, summ, re.S).group(1))
    return {"I_LUFS": get(r"I:\s+(-?[\d.]+) LUFS"), "LRA_LU": get(r"LRA:\s+(-?[\d.]+) LU"),
            "TP_dBTP": get(r"True peak:\s+Peak:\s+(-?[\d.inf]+) dBFS"), "SP_dBFS": get(r"Sample peak:\s+Peak:\s+(-?[\d.inf]+) dBFS")}


def shortterm(path):
    """Short-term (3 s) loudness every 100 ms from ebur128's frame log: [(t, S_LUFS)]."""
    err = subprocess.run([FF, "-hide_banner", "-nostats", "-v", "verbose", "-i", str(path), "-vn", "-af", "ebur128=framelog=verbose", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    out = []
    for m in re.finditer(r"t:\s*([\d.]+)\s+TARGET:.*?S:\s*(-?[\d.]+)", err):
        out.append((float(m.group(1)), float(m.group(2))))
    return out


def response(freqs, model):
    hp, hn, lp, ln = MODELS[model]
    f = np.maximum(freqs, 1e-3)
    return 1 / np.sqrt(1 + (hp / f) ** (2 * hn)) / np.sqrt(1 + (f / lp) ** (2 * ln))


def speaker(x, model="phone", sr=SR):
    """Mono sum through the phone-speaker model (zero phase)."""
    m = x.mean(axis=1) if x.ndim == 2 else x
    n = 1 << int(np.ceil(np.log2(len(m) + 1)))
    X = np.fft.rfft(m, n)
    X *= response(np.fft.rfftfreq(n, 1 / sr), model)
    return np.fft.irfft(X, n)[: len(m)]


def band(x, lo, hi, sr=SR):
    """Brick-wall band-pass (zero phase) of the mono sum, for band-energy measurements."""
    m = x.mean(axis=1) if x.ndim == 2 else x
    n = 1 << int(np.ceil(np.log2(len(m) + 1)))
    X = np.fft.rfft(m, n)
    f = np.fft.rfftfreq(n, 1 / sr)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, n)[: len(m)]


def db(e):
    return float(10 * np.log10(max(e, 1e-20)))


def stereo(x):
    L, R = x[:, 0], x[:, 1]
    mid, side = (L + R) / 2, (L - R) / 2
    em, es = float((mid ** 2).sum()), float((side ** 2).sum())
    corr = float(np.dot(L, R) / np.sqrt(max(np.dot(L, L) * np.dot(R, R), 1e-20)))
    # short windows: how often is the image wide or out of phase?
    w = SR // 10
    k = len(L) // w
    Lw, Rw = L[: k * w].reshape(k, w), R[: k * w].reshape(k, w)
    num = (Lw * Rw).sum(1)
    den = np.sqrt((Lw ** 2).sum(1) * (Rw ** 2).sum(1))
    ok = den > 1e-9 * w
    cw = num[ok] / den[ok]
    mono = np.stack([mid, mid], axis=1)
    return {"correlation": round(corr, 4), "corr_100ms_min": round(float(cw.min()), 4) if cw.size else None,
            "side_to_mid_dB": round(db(es) - db(em), 1) if es > 0 else "-inf (L = R)",
            "balance_L_minus_R_dB": round(db(float((L ** 2).sum())) - db(float((R ** 2).sum())), 2),
            "identical_channels": bool(np.array_equal(L, R)),
            "mono_foldown_loudness_change_LU": round(ebur128(mono)["I_LUFS"] - ebur128(x)["I_LUFS"], 2)}


def phone_table(mix, stems, active_floor_db=-30):
    """For each stem: energy kept through each speaker model, and its level against the rest of
    the mix through the same speaker while the stem is sounding."""
    rows = {}
    ph_mix = {m: speaker(mix, m) for m in MODELS}
    mono_mix = mix.mean(axis=1)
    w = SR // 20
    for name, s in stems.items():
        full = s.mean(axis=1)
        e_full = float((full ** 2).sum())
        row = {"full_band_share_of_mix_dB": round(db(e_full) - db(float((mono_mix ** 2).sum())), 1),
               "full_LUFS": ebur128(s)["I_LUFS"]}
        # windows where the stem is actually sounding (full band, 50 ms)
        k = len(full) // w
        ew = (full[: k * w].reshape(k, w) ** 2).mean(1)
        act = ew > ew.max() * 10 ** (active_floor_db / 10)
        seg = lambda v: (v[: k * w].reshape(k, w) ** 2).mean(1)[act].sum()
        row["full_vs_rest_while_playing_dB"] = round(db(seg(full)) - db(seg(mono_mix - full)), 1)
        for m in MODELS:
            ps = speaker(s, m)
            row[f"{m}_kept_dB"] = round(db(float((ps ** 2).sum())) - db(e_full), 1)
            row[f"{m}_LUFS"] = ebur128(ps)["I_LUFS"]
            row[f"{m}_vs_rest_while_playing_dB"] = round(db(seg(ps)) - db(seg(ph_mix[m] - ps)), 1)
        rows[name] = row
    return rows


def spectrum_bands(x, edges=(20, 60, 120, 250, 500, 1000, 2000, 4000, 8000, 16000)):
    """Share of energy per octave-ish band (dB relative to total), mono sum."""
    m = x.mean(axis=1)
    X = np.abs(np.fft.rfft(m)) ** 2
    f = np.fft.rfftfreq(len(m), 1 / SR)
    tot = X.sum()
    return {f"{lo}-{hi}Hz": round(db(X[(f >= lo) & (f < hi)].sum()) - db(tot), 1) for lo, hi in zip(edges[:-1], edges[1:])}


def true_peak_limit(x, ceiling_db, look_ms=3.0):
    """Offline look-ahead limiter on 4x-oversampled peaks. Gain = moving average (half-width W/2) of a
    moving minimum (half-width W) of the required gain, so it never exceeds what any peak needs."""
    n = len(x)
    m = 1 << int(np.ceil(np.log2(n)))
    over = []
    for c in range(x.shape[1]):
        X = np.fft.rfft(x[:, c], m)
        up = np.fft.irfft(np.concatenate([X, np.zeros(3 * m // 2)]), 4 * m)[: 4 * n] * 4
        over.append(np.abs(up).reshape(n, 4).max(1))
    pk = np.maximum.reduce(over)
    ceil = 10 ** (ceiling_db / 20)
    need = np.minimum(1.0, ceil / np.maximum(pk, 1e-12))
    W = max(2, int(SR * look_ms / 1000))
    padded = np.pad(need, W, constant_values=1.0)
    win = np.lib.stride_tricks.sliding_window_view(padded, 2 * W + 1).min(axis=1)
    k = np.ones(W + 1) / (W + 1)
    g = np.convolve(np.pad(win, W // 2, mode="edge"), k, mode="valid")[:n]
    return x * g[:, None], g


def master(x, target_lufs, ceiling_dbtp, passes=4):
    """Gain to an integrated-loudness target plus the true-peak limiter; repeats until the measured
    loudness converges (the limiter lowers it a little). Returns (y, gain_dB, limiter gain curve)."""
    gain_db, y, g = 0.0, x, np.ones(len(x))
    for _ in range(passes):
        gain_db += target_lufs - ebur128(y)["I_LUFS"]
        y, g = true_peak_limit(x * 10 ** (gain_db / 20), ceiling_dbtp)
    return y, gain_db, g


def main():
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "loudness":
        for p in args:
            print(p, json.dumps(ebur128(p)))
    elif cmd == "stereo":
        print(json.dumps(stereo(read_audio(args[0])), indent=1))
    elif cmd == "phone":
        mix = read_audio(args[0])
        stems = {Path(p).stem: read_audio(p) for p in args[1:]}
        print(json.dumps(phone_table(mix, stems), indent=1))
    elif cmd == "report":
        out = None
        if "--json" in args:
            i = args.index("--json")
            out = args[i + 1]
            args = args[:i] + args[i + 2:]
        mix_path, stem_paths = args[0], args[1:]
        mix = read_audio(mix_path)
        rep = {"file": mix_path, "loudness": ebur128(mix_path), "stereo": stereo(mix), "bands_full": spectrum_bands(mix)}
        rep["phone"] = {m: ebur128(speaker(mix, m)) for m in MODELS}
        if stem_paths:
            rep["stems"] = phone_table(mix, {Path(p).stem: read_audio(p) for p in stem_paths})
        s = json.dumps(rep, indent=1)
        print(s)
        if out:
            Path(out).write_text(s + "\n")


if __name__ == "__main__":
    main()
