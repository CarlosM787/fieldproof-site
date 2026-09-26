# Test helper (Linux + Xvfb only): sends a real X11 key chord through the XTEST extension.
# Needs python-xlib: pip install --target <lane>/_work/pylib python-xlib
# Send a real X11 key chord through XTEST to a window whose title contains argv[1] (tests under Xvfb only).
import sys, time
from Xlib import X, XK, display
from Xlib.ext import xtest
d = display.Display()
root = d.screen().root
NET_WM_NAME = d.intern_atom('_NET_WM_NAME'); UTF8 = d.intern_atom('UTF8_STRING')
def title(win):
    try:
        p = win.get_full_property(NET_WM_NAME, UTF8)
        if p and p.value: return p.value.decode('utf-8', 'replace') if isinstance(p.value, bytes) else str(p.value)
    except Exception: pass
    try:
        n = win.get_wm_name()
        if n: return n.decode() if isinstance(n, bytes) else str(n)
    except Exception: pass
    return None
def walk(win, acc):
    acc.append(win)
    try:
        for c in win.query_tree().children: walk(c, acc)
    except Exception: pass
    return acc
wins = walk(root, [])
if sys.argv[1] == '--list':
    for w in wins:
        t = title(w)
        if t: print(hex(w.id), repr(t))
    sys.exit(0)
target = [w for w in wins if (title(w) or '').find(sys.argv[1]) >= 0]
if not target:
    print('window not found'); sys.exit(2)
w = target[0]
w.set_input_focus(X.RevertToParent, X.CurrentTime)
d.sync(); time.sleep(0.2)
keys = sys.argv[2].split('+')
codes = [d.keysym_to_keycode(XK.string_to_keysym(k)) for k in keys]
for c in codes:
    xtest.fake_input(d, X.KeyPress, c); d.sync(); time.sleep(0.03)
for c in reversed(codes):
    xtest.fake_input(d, X.KeyRelease, c); d.sync(); time.sleep(0.03)
print('sent', keys, 'to', title(w))
