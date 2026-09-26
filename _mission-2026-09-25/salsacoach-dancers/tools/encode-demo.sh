#!/bin/bash
# Encodes the practice-flow demo: frames (30 fps, 780x1560) + the offline-rendered band/voice track
# -> media/practice-demo.mp4 (540x1080, H.264 + AAC) and a poster, and records the facts in demo.json.
set -e
FF=/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2
M=${1:-../media}
$FF -y -loglevel error -framerate 30 -i $M/frames-demo/f%04d.jpg -i $M/frames-demo/audio.wav \
  -vf scale=540:1080:flags=lanczos -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -profile:v high \
  -movflags +faststart -c:a aac -b:a 128k -shortest $M/practice-demo.mp4
$FF -y -loglevel error -i $M/frames-demo/f0285.jpg -vf scale=540:1080:flags=lanczos -q:v 4 $M/practice-demo.jpg
python3 - "$M" <<'PY'
import json, os, re, subprocess, sys
M = sys.argv[1]
FF = '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2'
info = subprocess.run([FF, '-hide_banner', '-i', M + '/practice-demo.mp4'], capture_output=True, text=True).stderr
d = re.search(r'Duration: (\d+):(\d+):([\d.]+)', info)
meta = json.load(open(M + '/frames-demo/meta.json'))
out = {'file': 'practice-demo.mp4', 'seconds': int(d[1]) * 3600 + int(d[2]) * 60 + float(d[3]), 'width': 540, 'height': 1080,
       'bytes': os.path.getsize(M + '/practice-demo.mp4'), 'poster': 'practice-demo.jpg', 'posterBytes': os.path.getsize(M + '/practice-demo.jpg'),
       'streams': re.findall(r'Stream #\d+:\d+[^:]*: (\w+): (\w+)', info), 'segments': meta['segments'], 'taps': meta['taps'], 'note': meta['note']}
json.dump(out, open(M + '/demo.json', 'w'), indent=2)
print(json.dumps({k: out[k] for k in ('seconds', 'bytes', 'posterBytes', 'streams')}))
PY
