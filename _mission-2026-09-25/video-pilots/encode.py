"""Which H.264 encoder a render uses: NVIDIA NVENC (GPU) when it works on this machine, else x264 (CPU).

  python encode.py            print the choice for this machine and why (runs the test encodes)
  python encode.py --json     the same as JSON (run.py stores it in run-report.json)

Choice order for --encoder auto (the default everywhere):
  1. h264_nvenc, high-quality settings (p7, hq tune, constant-quality VBR, spatial AQ, lookahead, B-frames)
  2. h264_nvenc, basic settings (for older drivers or GPUs that reject an option)
  3. libx264 (CPU), preset slow, CRF 16, tune animation: the phase-two setting
A candidate is used only if FFmpeg lists the encoder AND a half-second test encode succeeds, so a
PC without an NVIDIA GPU, with an old driver or with a CPU-only FFmpeg falls back by itself, and
the reason is recorded. --encoder nvenc makes NVENC mandatory (the render stops if it fails);
--encoder x264 skips the GPU.

Which FFmpeg: $FFMPEG if set, else imageio-ffmpeg's (which honours $IMAGEIO_FFMPEG_EXE). The Windows
FFmpeg that imageio-ffmpeg 0.6.0 ships (ffmpeg-win-x86_64-v7.1.exe) is built with --enable-nvenc;
the Linux build in this container is not (VERIFIED 2026-09-26 by reading both binaries' configuration).
Quality mapping: NVENC constant quality CQ = x264 CRF + 2 (INFERENCE; flat graphics, upload master).
"""
from __future__ import annotations

import functools
import json
import os
import subprocess
import sys
from dataclasses import asdict, dataclass, field

import imageio_ffmpeg

COLOR = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]


def ffmpeg_exe() -> str:
    return os.environ.get("FFMPEG") or imageio_ffmpeg.get_ffmpeg_exe()


def x264_args(crf: int) -> list[str]:
    return ["-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-tune", "animation"]


def nvenc_hq_args(crf: int) -> list[str]:
    return ["-c:v", "h264_nvenc", "-preset", "p7", "-tune", "hq", "-rc", "vbr", "-cq", str(crf + 2), "-b:v", "0",
            "-maxrate", "40M", "-bufsize", "80M", "-profile:v", "high", "-spatial-aq", "1", "-rc-lookahead", "32", "-bf", "3"]


def nvenc_basic_args(crf: int) -> list[str]:
    return ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", str(crf + 2), "-b:v", "0"]


CANDIDATES = [("nvenc-hq", "h264_nvenc", nvenc_hq_args), ("nvenc-basic", "h264_nvenc", nvenc_basic_args),
              ("x264", "libx264", x264_args)]


@dataclass
class Choice:
    name: str
    encoder: str
    args: list
    ffmpeg: str
    tried: list = field(default_factory=list)

    @property
    def gpu(self) -> bool:
        return self.encoder == "h264_nvenc"

    def describe(self) -> dict:
        d = asdict(self)
        d["gpu"] = self.gpu
        return d


def list_encoders(ff: str) -> set[str]:
    try:
        out = subprocess.run([ff, "-hide_banner", "-encoders"], capture_output=True, text=True, timeout=60).stdout
    except (OSError, subprocess.TimeoutExpired):
        return set()
    names = set()
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 2 and len(parts[0]) == 6 and parts[0][0] in "VAS":
            names.add(parts[1])
    return names


def test_encode(ff: str, args: list[str]) -> tuple[bool, str]:
    """Half a second of a test pattern through exactly these encoder settings (to nowhere)."""
    cmd = [ff, "-hide_banner", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-t", "0.5",
           "-vf", "format=yuv420p", *args, *COLOR, "-f", "null", "-"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.TimeoutExpired) as e:
        return False, str(e)
    return r.returncode == 0, (r.stderr.strip().splitlines() or [""])[-1][:300]


@functools.lru_cache(maxsize=None)
def choose(prefer: str = "auto", crf: int = 16, ff: str | None = None) -> Choice:
    ff = ff or ffmpeg_exe()
    have = list_encoders(ff)
    tried = []
    for name, enc, make in CANDIDATES:
        if prefer == "x264" and enc != "libx264":
            continue
        if prefer == "nvenc" and enc != "h264_nvenc":
            continue
        if enc not in have:
            tried.append({"candidate": name, "ok": False, "why": f"{enc} is not in this FFmpeg's encoder list"})
            continue
        args = make(crf)
        ok, why = test_encode(ff, args)
        tried.append({"candidate": name, "ok": ok, "why": "test encode passed" if ok else f"test encode failed: {why}"})
        if ok:
            return Choice(name, enc, args, ff, tried)
    if prefer == "nvenc":
        raise SystemExit("--encoder nvenc: NVENC is not usable here: " + json.dumps(tried))
    raise SystemExit("no working H.264 encoder: " + json.dumps(tried))


def pipe_cmd(choice: Choice, W: int, H: int, fps: int, wav, seconds: float, out, crf: int = 16) -> list[str]:
    """FFmpeg reading raw RGB frames on stdin plus a WAV, writing an upload-ready MP4 (BT.709, AAC 192k)."""
    return [choice.ffmpeg, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
            "-i", str(wav), "-map", "0:v", "-map", "1:a", "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
            *choice.args, *COLOR, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", f"{seconds:.3f}",
            "-movflags", "+faststart", str(out)]


def main():
    prefer = "auto"
    if "--encoder" in sys.argv:
        prefer = sys.argv[sys.argv.index("--encoder") + 1]
    c = choose(prefer)
    if "--json" in sys.argv:
        print(json.dumps(c.describe(), indent=1))
    else:
        print(f"FFmpeg: {c.ffmpeg}\nencoder: {c.name} ({c.encoder}, {'GPU' if c.gpu else 'CPU'})")
        for t in c.tried:
            print(f"  {t['candidate']:12s} {'ok ' if t['ok'] else 'no '} {t['why']}")


if __name__ == "__main__":
    main()
