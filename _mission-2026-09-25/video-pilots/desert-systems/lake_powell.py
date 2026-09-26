"""Pilot B: "Lake Powell, three years in 60 seconds of sound" (Desert Systems, Sonified).

Real data: USGS site 09379900 (Lake Powell at Glen Canyon Dam), daily lake elevation, 2023-09-25 to
2026-09-24 (the X bot's committed fixture). Every on-screen number and annotation is computed here.

Sound (all synthesized in numpy, no samples):
  pitch   = lake level, one soft mallet note per week on a minor pentatonic scale
  drone   = loudness follows the feet of water above the 3,490 ft minimum power pool
  bell    = New Year's Day
  python lake_powell.py <csv> <fonts dir> <out.mp4>
"""
import subprocess
import sys
import wave
from datetime import date
from pathlib import Path

import imageio_ffmpeg
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib import font_manager  # noqa: E402

CSV, FONTS, OUT = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
for f in FONTS.glob("*.ttf"):
    font_manager.fontManager.addfont(str(f))
SANS, MONO = "IBM Plex Sans Condensed", "IBM Plex Mono Medium"
BG, INK, MUTED, WATER, AMBER, LINE = "#0b1a24", "#eaf2f5", "#8fa6b2", "#62d2e8", "#f2a541", "#9fb3bf"
MIN_POOL, TARGET = 3490.0, 3525.0

def signed(x, fmt=",.1f"):
    """+29.2 / −55.8: a real minus sign, not a hyphen (both fonts carry U+2212)."""
    return ("+" if x >= 0 else "\u2212") + format(abs(x), fmt)


rows = [l.split(",") for l in CSV.read_text().splitlines() if l and not l.startswith("#") and not l.startswith("date")]
days = [date.fromisoformat(d) for d, _ in rows]
vals = np.array([float(v) for _, v in rows])
N = len(days)

FPS, T_TITLE, T_DRAW, T_END = 30, 4.5, 54.0, 7.0
TOTAL = T_TITLE + T_DRAW + T_END
SR = 48000


def idx_at(t):
    """Index of the day shown at time t (drawing runs from T_TITLE to T_TITLE+T_DRAW)."""
    u = (t - T_TITLE) / T_DRAW
    return int(np.clip(u, 0, 1) * (N - 1))


# ---- annotations, all computed: real seasonal swings (>= 4 ft), plus the record low ----
def extrema(win=45, min_swing=4.0, edge=20):
    found = []
    for i in range(edge, N - edge):
        lo, hi = max(0, i - win), min(N, i + win + 1)
        seg = vals[lo:hi]
        if vals[i] == seg.max() and vals[i] - min(vals[lo:i].min(), vals[i + 1:hi].min()) >= min_swing:
            kind = "high"
        elif vals[i] == seg.min() and max(vals[lo:i].max(), vals[i + 1:hi].max()) - vals[i] >= min_swing:
            kind = "low"
        else:
            continue
        if found and found[-1][1] == kind and i - found[-1][0] < 10:
            continue
        found.append((i, kind))
    return found


notes = []
for i, kind in extrema():
    if kind != "high":
        continue
    j0 = max(0, i - 120)
    j = j0 + int(np.argmin(vals[j0:i]))
    notes.append((i, f"{days[i].year} runoff: {signed(vals[i] - vals[j])} ft ({days[j]:%b %-d} → {days[i]:%b %-d})", "above"))
k = int(np.argmin(vals))
notes.append((k, f"Lowest in this record: {vals[k]:,.1f} ft ({days[k]:%b %-d, %Y})", "below"))
notes.sort()

# ---- audio ----
def audio():
    n = int(TOTAL * SR)
    out = np.zeros((n, 2))
    t_all = np.arange(n) / SR
    # drone, loudness follows water above the minimum power pool
    buf = np.interp(t_all, [T_TITLE + T_DRAW * i / (N - 1) for i in range(N)], vals - MIN_POOL, left=vals[0] - MIN_POOL, right=vals[-1] - MIN_POOL)
    amp = 0.05 + 0.13 * np.clip(buf / 90, 0, 1)
    fade = np.clip(t_all / 2.0, 0, 1) * np.clip((TOTAL - t_all) / 2.5, 0, 1)
    drone = (np.sin(2 * np.pi * 55 * t_all) + 0.6 * np.sin(2 * np.pi * 82.41 * t_all + 0.3) + 0.25 * np.sin(2 * np.pi * 110.3 * t_all)) * amp * fade
    out[:, 0] += drone
    out[:, 1] += drone * 0.96
    # weekly mallet notes: minor pentatonic (A C D E G) across three octaves
    scale = [110 * 2 ** (s / 12) for o in range(3) for s in (0 + 12 * o, 3 + 12 * o, 5 + 12 * o, 7 + 12 * o, 10 + 12 * o)]
    lo, hi = 3505.0, 3580.0
    for i in range(0, N, 7):
        k = int(np.clip((vals[i] - lo) / (hi - lo), 0, 0.999) * len(scale))
        f0 = scale[k]
        t0 = T_TITLE + T_DRAW * i / (N - 1)
        s0, L = int(t0 * SR), int(0.9 * SR)
        tt = np.arange(L) / SR
        tone = (np.sin(2 * np.pi * f0 * tt) + 0.3 * np.sin(2 * np.pi * 3 * f0 * tt) * np.exp(-tt * 18)) * np.exp(-tt * 4.2) * 0.22
        pan = 0.5 + 0.35 * np.sin(i / 60)
        e = min(n, s0 + L)
        out[s0:e, 0] += tone[: e - s0] * (1 - pan)
        out[s0:e, 1] += tone[: e - s0] * pan
    # New Year's bell
    for i, d in enumerate(days):
        if d.month == 1 and d.day == 1:
            t0 = T_TITLE + T_DRAW * i / (N - 1)
            s0, L = int(t0 * SR), int(1.6 * SR)
            tt = np.arange(L) / SR
            bell = (np.sin(2 * np.pi * 880 * tt) + 0.5 * np.sin(2 * np.pi * 1318.5 * tt)) * np.exp(-tt * 2.6) * 0.16
            e = min(n, s0 + L)
            out[s0:e] += bell[: e - s0, None]
    out /= max(1e-9, np.abs(out).max()) / 0.9
    wav = OUT.with_suffix(".wav")
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((out * 32767).astype("<i2").tobytes())
    return wav


# ---- video ----
def video(wav):
    fig = plt.figure(figsize=(19.2, 10.8), dpi=100, facecolor=BG)
    ax = fig.add_axes([0.08, 0.14, 0.82, 0.56], facecolor=BG)
    x = np.arange(N)
    ax.set_xlim(-10, N + 40)
    ax.set_ylim(3480, 3600)
    ax.axhline(MIN_POOL, color=AMBER, lw=2)
    ax.axhline(TARGET, color=LINE, lw=1.2, ls=(0, (1, 2.5)))
    ax.text(5, MIN_POOL + 1.2, "3,490 ft minimum power pool", color=AMBER, fontsize=15, family=SANS, va="bottom")
    ax.text(5, TARGET + 1.2, "3,525 ft protection target", color=LINE, fontsize=15, family=SANS, va="bottom")
    for i, d in enumerate(days):
        if d.month == 1 and d.day == 1:
            ax.axvline(i, color="#1b3a4c", lw=1)
            ax.text(i + 4, 3596, str(d.year), color=MUTED, fontsize=15, family=MONO, va="top")
    for s in ("top", "left", "right"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_visible(False)
    ax.set_xticks([])
    ax.yaxis.tick_right()
    ax.tick_params(colors=MUTED, labelsize=14, length=0)
    ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    for lbl in ax.get_yticklabels():
        lbl.set_family(MONO)
    ax.grid(axis="y", color="#13303f", lw=0.8)
    (line,) = ax.plot([], [], color=WATER, lw=3.2, solid_capstyle="round")
    dot = ax.scatter([], [], s=140, color=WATER, edgecolor=BG, linewidth=2.5, zorder=5)
    fill = [None]
    note_art = []
    for i, txt, pos in notes:
        a = ax.annotate(txt, (i, vals[i]), xytext=(0, 38 if pos == "above" else -44), textcoords="offset points",
                        color=INK, fontsize=15, family=SANS, ha="center", alpha=0,
                        arrowprops=dict(arrowstyle="-", color=MUTED, lw=1, alpha=0))
        note_art.append((i, a))
    tag = fig.text(0.08, 0.93, "DESERT SYSTEMS, SONIFIED", color=MUTED, fontsize=17, family=SANS, weight=600)
    big = fig.text(0.08, 0.80, "", color=INK, fontsize=64, family=SANS, weight=700)
    sub = fig.text(0.08, 0.755, "", color=MUTED, fontsize=19, family=SANS)
    legend = fig.text(0.90, 0.905, "Pitch = lake level   ·   Drone = water above the minimum power pool\nTono = nivel del lago   ·   Zumbido = agua sobre el nivel mínimo", color=MUTED, fontsize=15,
                      family=SANS, ha="right", va="top", linespacing=1.5)
    foot = fig.text(0.08, 0.05, "Data: USGS site 09379900, daily lake elevation (provisional), Sep 25 2023 to Sep 24 2026. Thresholds: Bureau of Reclamation. Chart and sound made in code. Pilot, not published.",
                    color=MUTED, fontsize=12.5, family=SANS)
    title = fig.text(0.5, 0.56, "", color=INK, fontsize=54, family=SANS, weight=700, ha="center", va="center")
    title2 = fig.text(0.5, 0.47, "", color=MUTED, fontsize=30, family=SANS, ha="center", va="center")
    endcard = fig.text(0.5, 0.52, "", color=INK, fontsize=40, family=SANS, weight=700, ha="center", va="center", linespacing=1.6)

    ff = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ff, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", "1920x1080", "-r", str(FPS), "-i", "-", "-i", str(wav),
           "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
           "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-shortest", "-movflags", "+faststart", str(OUT)]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    frames = int(TOTAL * FPS)
    stills = {int((T_TITLE + T_DRAW * 0.5) * FPS): "still-mid.jpg", frames - 10: "still-end.jpg"}
    for f in range(frames):
        t = f / FPS
        i = idx_at(t)
        in_title = t < T_TITLE
        in_end = t > T_TITLE + T_DRAW + 0.3
        a_title = 1.0 if in_title else max(0.0, 1 - (t - T_TITLE) / 0.6)
        title.set_text("Lake Powell: three years in 60 seconds of sound")
        title2.set_text("El lago Powell: tres años en 60 segundos de sonido")
        title.set_alpha(a_title)
        title2.set_alpha(a_title)
        show_chart = 0.0 if in_title else min(1.0, (t - T_TITLE) / 0.6)
        for art in (ax,):
            art.set_alpha(1)
        line.set_data(x[: i + 1], vals[: i + 1])
        line.set_alpha(show_chart)
        dot.set_offsets([[i, vals[i]]])
        dot.set_alpha(show_chart)
        if fill[0] is not None:
            fill[0].remove()
        fill[0] = ax.fill_between(x[: i + 1], MIN_POOL, vals[: i + 1], color=WATER, alpha=0.14 * show_chart, linewidth=0)
        for ni, a in note_art:
            k = 0.0 if in_title else float(np.clip((i - ni) / 25, 0, 1))
            a.set_alpha(k)
            a.arrow_patch.set_alpha(k * 0.8)
        big.set_text("" if in_title else f"{vals[i]:,.1f} ft")
        sub.set_text("" if in_title else f"Lake Powell · {days[i]:%b %-d, %Y}   ·   {vals[i] - MIN_POOL:,.1f} ft above the minimum power pool")
        legend.set_alpha(0 if in_title else 1)
        if in_end:
            k = min(1.0, (t - (T_TITLE + T_DRAW + 0.3)) / 0.8)
            drop = vals[-1] - vals[0]
            endcard.set_text(f"{days[0]:%b %-d, %Y}: {vals[0]:,.1f} ft   →   {days[-1]:%b %-d, %Y}: {vals[-1]:,.1f} ft\n"
                             f"{signed(drop)} ft in three years  ·  {vals[-1] - MIN_POOL:,.1f} ft above the minimum power pool\n"
                             f"{signed(drop)} pies en tres años  ·  {vals[-1] - MIN_POOL:,.1f} pies sobre el nivel mínimo")
            endcard.set_alpha(k)
            endcard.set_bbox(dict(facecolor=BG, edgecolor=LINE, boxstyle="round,pad=1.0", alpha=0.94 * k))
        else:
            endcard.set_text("")
        fig.canvas.draw()
        buf = np.asarray(fig.canvas.buffer_rgba())
        p.stdin.write(buf.tobytes())
        if f in stills:
            plt.imsave(OUT.with_name(stills[f]), buf[:, :, :3])
    p.stdin.close()
    p.wait()
    plt.close(fig)


if __name__ == "__main__":
    w = audio()
    video(w)
    print("wrote", OUT, "annotations:", [t for _, t, _ in notes])
