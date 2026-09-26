"""Before/after pairs for CHANGES.md: evidence/changes/{before,after,after-overlays}/<shot>.jpg ->
evidence/changes/pair-<shot>.jpg (phase two left, phase three right, labelled)."""
import os, sys
from PIL import Image, ImageDraw, ImageFont
D = sys.argv[1] if len(sys.argv) > 1 else 'evidence/changes'
def font(sz):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']:
        try: return ImageFont.truetype(p, sz)
        except Exception: pass
    return ImageFont.load_default()
F = font(18)
def label(im, text, col):
    d = ImageDraw.Draw(im); w = d.textlength(text, font=F)
    d.rounded_rectangle((10, 10, 30 + w, 40), radius=12, fill=(8, 12, 26), outline=col); d.text((20, 15), text, font=F, fill=col)
jobs = [(n[:-4], 'after') for n in sorted(os.listdir(D + '/before')) if n.endswith('.jpg')]
jobs += [(n[:-4], 'after-overlays') for n in sorted(os.listdir(D + '/after-overlays')) if n.endswith('.jpg')] if os.path.isdir(D + '/after-overlays') else []
for name, after in jobs:
    b, a = D + '/before/' + name + '.jpg', D + '/' + after + '/' + name + '.jpg'
    if not (os.path.exists(b) and os.path.exists(a)): continue
    B, A = Image.open(b).convert('RGB'), Image.open(a).convert('RGB')
    w, h = 640, int(640 * B.size[1] / B.size[0])
    B, A = B.resize((w, h), Image.LANCZOS), A.resize((w, h), Image.LANCZOS)
    label(B, 'Phase two', (170, 180, 200)); label(A, 'Phase three' + (' · overlays on' if after == 'after-overlays' else ''), (111, 211, 255))
    out = Image.new('RGB', (w * 2 + 6, h), (8, 12, 26)); out.paste(B, (0, 0)); out.paste(A, (w + 6, 0))
    suffix = '-overlays' if after == 'after-overlays' else ''
    out.save(f'{D}/pair-{name}{suffix}.jpg', quality=84, optimize=True)
    print('pair', name + suffix, os.path.getsize(f'{D}/pair-{name}{suffix}.jpg'))
