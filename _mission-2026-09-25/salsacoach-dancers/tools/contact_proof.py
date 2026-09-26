"""Draws evidence/contact-proof.png from evidence/contact-samples.json (qa/proof.mjs).

Ball-of-foot height for all four feet and the hips' side-to-side position, over two On1 8-counts,
with every count marked. Planted feet sit at 0 mm; a foot leaves after 0.6 of the beat and is back
on the floor exactly on the next count.
"""
import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

here = sys.argv[1] if len(sys.argv) > 1 else '.'
d = json.load(open(f'{here}/evidence/contact-samples.json'))['on1']
cols = d['cols']; rows = d['rows']
col = {c: [r[i] for r in rows] for i, c in enumerate(cols)}
p = col['p']
BG, INK, MUTED, GRID = '#0a0f1e', '#eaf0fa', '#a3b0ca', '#243154'
LEAD, FOLL = '#6fd3ff', '#ff72b8'
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'text.color': INK, 'axes.labelcolor': MUTED,
                     'xtick.color': MUTED, 'ytick.color': MUTED, 'axes.edgecolor': GRID})
fig, axs = plt.subplots(3, 1, figsize=(12, 7.6), sharex=True, gridspec_kw={'height_ratios': [1, 1, 1.1]})
fig.patch.set_facecolor(BG)
steps = {1: 'L fwd', 2: 'R', 3: 'L', 5: 'R back', 6: 'L', 7: 'R'}
for ax in axs:
    ax.set_facecolor(BG)
    for k in range(0, 17):
        ax.axvline(k, color=GRID, lw=0.8, zorder=0)
    for k in range(0, 16):
        ax.axvspan(k + 0.6, k + 1.0, color='#1a2542', zorder=0, lw=0)
    ax.grid(False)
for ax, who, name, c in [(axs[0], 'L', 'Leader', LEAD), (axs[1], 'F', 'Follower', FOLL)]:
    ax.plot(p, [v * 1000 for v in col[f'{who}_Lh']], color=c, lw=1.8, label=f'{name} left foot')
    ax.plot(p, [v * 1000 for v in col[f'{who}_Rh']], color=c, lw=1.8, ls='--', label=f'{name} right foot')
    ax.set_ylabel(f'{name}: ball of foot\nabove floor (mm)\nsolid L, dashed R', color=c)
    ax.set_ylim(-2, 29)
axs[2].plot(p, [v * 100 for v in col['L_pelx']], color=LEAD, lw=1.8, label='Leader hips')
axs[2].plot(p, [v * 100 for v in col['F_pelx']], color=FOLL, lw=1.4, ls=':', label='Follower hips')
axs[2].set_ylabel("hips' side shift (cm)\n+ = toward the leader's left\n(both dancers, same side)")
axs[2].set_ylim(-6, 6)
axs[2].set_xticks(range(0, 17))
axs[2].set_xticklabels([str(k % 8 + 1) for k in range(0, 17)])
axs[2].set_xlabel('count (On1, 150 BPM: one count = 400 ms). Shaded: the last 0.4 of each beat, when a foot may travel.')
for k in range(16):
    c = k % 8 + 1
    axs[0].text(k + 0.04, 28.3, steps.get(c, 'hold'), color=MUTED, fontsize=8, va='top')
fig.suptitle('Every step lands on its count: skeleton measurements, two 8-counts of On1', color=INK, fontsize=13, x=0.01, ha='left')
fig.tight_layout(rect=(0, 0, 1, 0.96))
fig.savefig(f'{here}/evidence/contact-proof.png', dpi=110, facecolor=BG)
print('ok')
