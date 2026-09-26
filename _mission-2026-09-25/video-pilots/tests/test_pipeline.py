"""The Windows pipeline pieces: encoder choice and fallback, captions, template thumbnails, the
voice-over mix and the new-episode checker. No network; FFmpeg comes from imageio-ffmpeg; Node runs
the episode spec. The "voice" in these tests is a SYNTHETIC signal (modulated noise), not a voice.
"""
import json
import os
import stat
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "review"))
import captions  # noqa: E402
import encode  # noqa: E402
import new_episode  # noqa: E402
import thumbnail  # noqa: E402
import voice  # noqa: E402
from audio_check import FF, SR, ebur128, write_wav  # noqa: E402


def fake_ffmpeg(tmp: Path, nvenc: str) -> str:
    """An 'ffmpeg' that lists h264_nvenc; its NVENC test encode fails ('fail') or passes ('ok'); anything
    else goes to the real FFmpeg."""
    p = tmp / "ffmpeg"
    p.write_text(textwrap.dedent(f"""\
        #!{sys.executable}
        import subprocess, sys
        a = sys.argv[1:]
        if "-encoders" in a:
            print(" V....D libx264              libx264 H.264")
            print(" V....D h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)")
            sys.exit(0)
        if "h264_nvenc" in a:
            if {nvenc!r} == "ok":
                sys.exit(0)
            sys.stderr.write("Cannot load nvcuda.dll\\n")
            sys.exit(1)
        sys.exit(subprocess.run([{FF!r}] + a).returncode)
        """))
    p.chmod(p.stat().st_mode | stat.S_IEXEC)
    return str(p)


class Encoder(unittest.TestCase):
    def test_this_container_falls_back_to_x264_and_says_why(self):
        c = encode.choose("auto")
        self.assertEqual(c.encoder, "libx264")
        self.assertTrue(any("not in this FFmpeg's encoder list" in t["why"] for t in c.tried if t["candidate"].startswith("nvenc")))

    def test_listed_but_broken_nvenc_falls_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            c = encode.choose("auto", 16, fake_ffmpeg(Path(tmp), "fail"))
            self.assertEqual(c.name, "x264")
            self.assertIn("nvcuda", c.tried[0]["why"])
            with self.assertRaises(SystemExit):
                encode.choose("nvenc", 16, fake_ffmpeg(Path(tmp), "fail"))

    def test_working_nvenc_is_chosen_with_quality_settings(self):
        with tempfile.TemporaryDirectory() as tmp:
            c = encode.choose("auto", 16, fake_ffmpeg(Path(tmp), "ok"))
            self.assertEqual((c.name, c.gpu), ("nvenc-hq", True))
            self.assertIn("-cq", c.args)
            self.assertEqual(c.args[c.args.index("-cq") + 1], "18")          # CRF 16 + 2
            cmd = encode.pipe_cmd(c, 1080, 1920, 30, "a.wav", 43.2, "o.mp4")
            for flag in ("bt709", "aac", "+faststart", "h264_nvenc"):
                self.assertIn(flag, cmd)


class Captions(unittest.TestCase):
    def test_clave_captions_follow_the_measures(self):
        ep = captions.node_json("import('./episode_v2.mjs').then(m=>console.log(JSON.stringify(m.EPISODE)))", HERE / "clave-lab")
        tracks, dur = captions.clave_tracks(ep)
        with tempfile.TemporaryDirectory() as tmp:
            rep = captions.write(Path(tmp), "t", tracks, dur)
            self.assertEqual(sum(len(r["errors"]) for r in rep.values()), 0)
            srt = captions.parse((Path(tmp) / "t.en.srt").read_text())
            vtt_text = (Path(tmp) / "t.es.vtt").read_text()
            self.assertTrue(vtt_text.startswith("WEBVTT\n"))
            vtt = captions.parse(vtt_text)
        self.assertEqual((len(srt), len(vtt)), (10, 10))
        self.assertEqual((srt[0][0], srt[-1][1]), (0.0, 32.0))
        self.assertEqual(srt[1][:2], (3.2, 6.4))
        self.assertTrue(" ".join(srt[0][2]).startswith("Where is the 1? Half this band"))
        self.assertNotIn("*", " ".join(l for c in srt for l in c[2]))

    def test_checker_flags_overlap_short_cue_long_line_and_overrun(self):
        bad = "1\n00:00:00,000 --> 00:00:02,000\nok\n\n2\n00:00:01,500 --> 00:00:02,000\n" + "x" * 50 + "\n\n3\n00:00:02,000 --> 00:00:09,000\nlate\n"
        r = captions.check(bad, "en", 8.0)
        text = " ".join(r["errors"])
        for what in ("overlaps", "0.50 s", "50 characters", "after the video"):
            self.assertIn(what, text)

    def test_long_text_splits_into_two_timed_cues(self):
        cues = captions.split_long([captions.Cue(0, 6, "One two three four five six seven eight nine ten. " * 3)])
        self.assertGreaterEqual(len(cues), 2)
        self.assertEqual((cues[0].start, cues[-1].end), (0, 6))
        self.assertTrue(all(a.end == b.start for a, b in zip(cues, cues[1:])))
        self.assertTrue(all(len(c.lines()) <= 2 and max(map(len, c.lines())) <= 42 for c in cues))


class Thumbnails(unittest.TestCase):
    def spec(self, **over):
        s = json.loads((HERE / "templates" / "thumbnails" / "clave-lab.json").read_text())
        s.update(over)
        return s

    def test_template_renders_and_passes_its_checks(self):
        with tempfile.TemporaryDirectory() as tmp:
            bg = Path(tmp) / "bg.jpg"
            Image.linear_gradient("L").resize((1080, 1920)).convert("RGB").point(lambda v: v // 6).save(bg)
            v = {"still": str(bg), "hook_en": "WHERE IS THE 1?", "line1_en": "Half this band never plays it.",
                 "line1_es": "La mitad de esta banda nunca lo toca."}
            r = thumbnail.render(self.spec(), v, Path(tmp) / "t.jpg", base=HERE / "templates" / "thumbnails")
            self.assertEqual(r["problems"], [])
            self.assertEqual(Image.open(Path(tmp) / "t.jpg").size, (1280, 720))
            self.assertLess(r["bytes"], thumbnail.MAX_BYTES)
            title = [t["text"] for t in r["texts"]][1:3]
            self.assertEqual(" ".join(title), "WHERE IS THE 1?")                                 # two lines,
            self.assertGreater(len(title[-1].split()), 1)                                         # no lone last word
            s = self.spec()
            s["blocks"] = s["blocks"] + [{"text": "LOW", "font": "bold", "size": 40, "color": "#0a0f1e", "xy": [1150, 670], "max_w": 200}]
            r = thumbnail.render(s, v, Path(tmp) / "bad.jpg", base=HERE / "templates" / "thumbnails")
            joined = " ".join(r["problems"])
            for what in ("margin", "duration badge", "contrast"):
                self.assertIn(what, joined)


class VoiceOver(unittest.TestCase):
    def test_prep_and_mix_keep_the_video_and_hit_the_targets(self):
        with tempfile.TemporaryDirectory() as tmp:
            t = Path(tmp)
            vid = t / "v.mp4"
            subprocess.run([FF, "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30", "-f", "lavfi", "-i",
                            "sine=frequency=440:sample_rate=48000", "-t", "6", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                            "-af", "volume=-20dB", "-c:a", "aac", "-shortest", str(vid)], check=True)
            n = int(3.0 * SR)                                              # SYNTHETIC "speech": 4 Hz bursts of band-limited noise
            rng = np.random.default_rng(1)
            X = np.fft.rfft(rng.standard_normal(n))
            f = np.fft.rfftfreq(n, 1 / SR)
            X[(f < 100) | (f > 4000)] = 0                                  # speech band only (AAC keeps it whole)
            x = np.fft.irfft(X, n) * (0.5 + 0.5 * np.sin(2 * np.pi * 4 * np.arange(n) / SR)) ** 2 * 0.3
            raw = np.concatenate([np.zeros(int(0.8 * SR)), x, np.zeros(int(0.5 * SR))])
            write_wav(t / "raw.wav", np.stack([raw, raw], axis=1))
            rp = voice.prep(t / "raw.wav", t / "voice.wav")
            self.assertAlmostEqual(rp["loudness"]["I_LUFS"], -16.0, delta=0.5)
            self.assertLess(rp["trimmed_s"][0], 0.8)
            self.assertGreater(rp["trimmed_s"][0], 0.5)                       # leading silence trimmed to 0.15 s
            rm = voice.mix(vid, t / "voice.wav", t / "out.mp4", at=1.0)
            self.assertTrue(rm["video_stream_identical"])
            self.assertAlmostEqual(rm["loudness"]["I_LUFS"], -14.0, delta=0.5)
            self.assertLessEqual(rm["loudness"]["TP_dBTP"], -1.0)
            self.assertEqual(rm["clip"]["clipped_samples"], 0)
            self.assertAlmostEqual(rm["bed_gain_min_dB"], -8.0, delta=0.3)
            self.assertAlmostEqual(rm["duration_s"]["in"], rm["duration_s"]["out"], delta=0.05)
            with self.assertRaises(SystemExit):                              # a voice longer than the video is refused
                voice.mix(vid, t / "voice.wav", t / "late.mp4", at=5.0)


class NewEpisode(unittest.TestCase):
    def test_v2_spec_passes_and_the_template_lists_what_to_fill(self):
        self.assertEqual(new_episode.check(HERE / "clave-lab" / "episode_v2.mjs"), [])
        tmp = HERE / "clave-lab" / "_test_template.mjs"
        try:
            tmp.write_text((HERE / "templates" / "clave-episode.template.mjs").read_text())
            problems = new_episode.check(tmp)
        finally:
            tmp.unlink(missing_ok=True)
        self.assertTrue(any("fill in the caption" in p for p in problems))
        self.assertTrue(any("hook en" in p for p in problems))

    def test_a_caption_too_long_for_the_video_is_caught(self):
        tmp = HERE / "clave-lab" / "_test_long.mjs"
        try:
            src = (HERE / "clave-lab" / "episode_v2.mjs").read_text().replace("Half this band never plays it.", "word " * 40)
            tmp.write_text(src)
            problems = new_episode.check(tmp)
        finally:
            tmp.unlink(missing_ok=True)
        self.assertTrue(any("measure 1 en" in p and "two lines" in p for p in problems), problems)


if __name__ == "__main__":
    unittest.main()
