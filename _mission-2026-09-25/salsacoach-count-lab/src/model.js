// SalsaCoach Count Lab: the step and band model. One source of truth:
// build.mjs imports it to write the static step tables, and inlines it into
// the page so the animation and the tables can never disagree.
//
// Floor frame (metres): x = to the leader's right, y = the leader's forward
// (toward the follower), z = up. The follower stands facing the leader at
// y = GEOM.gap. In world coordinates the follower's feet make the same moves
// as the leader's feet on the same side (her right foot mirrors his left).

export const GEOM = { hip: 0.12, brk: 0.32, small: 0.10, gap: 0.95 };

const BK = GEOM.brk, SM = GEOM.small;

// steps[count] = [leader foot, leader-frame y target, kind]
// kinds: break (change of direction), replace (weight change in place),
// close (foot returns beside the other), prep (small preparation step)
export const PATTERNS = {
  on1: {
    holds: [4, 8],
    breaks: [1, 5],
    init: { L: 0, R: 0, w: 'R' },
    steps: {
      1: ['L', BK, 'break'], 2: ['R', 0, 'replace'], 3: ['L', 0, 'close'],
      5: ['R', -BK, 'break'], 6: ['L', 0, 'replace'], 7: ['R', 0, 'close'],
    },
    source: '7.3',
  },
  on2t: {
    holds: [4, 8],
    breaks: [2, 6],
    init: { L: BK, R: SM, w: 'R' },
    steps: {
      1: ['L', -SM, 'prep'], 2: ['R', -BK, 'break'], 3: ['L', -SM, 'replace'],
      5: ['R', SM, 'prep'], 6: ['L', BK, 'break'], 7: ['R', SM, 'replace'],
    },
    source: '7.4',
  },
  on2c: {
    holds: [1, 5],
    breaks: [2, 6],
    init: { L: 0, R: 0, w: 'L' },
    steps: {
      2: ['R', -BK, 'break'], 3: ['L', 0, 'replace'], 4: ['R', 0, 'close'],
      6: ['L', BK, 'break'], 7: ['R', 0, 'replace'], 8: ['L', 0, 'close'],
    },
    source: '6.13',
  },
};

// State after each count: S[0] is the state before count 1 (= after 8).
export function states(p) {
  const out = [{ ...p.init }];
  for (let k = 1; k <= 8; k++) {
    const s = { ...out[k - 1] };
    const st = p.steps[k];
    if (st) { s[st[0]] = st[1]; s.w = st[0]; }
    out.push(s);
  }
  return out;
}

// A pattern must loop: the state after 8 equals the state before 1.
export function loops(p) {
  const s = states(p), a = s[0], b = s[8];
  return Math.abs(a.L - b.L) < 1e-9 && Math.abs(a.R - b.R) < 1e-9 && a.w === b.w;
}

const WORDS = {
  en: {
    foot: { L: 'Left foot', R: 'Right foot' },
    fwd: 'forward', back: 'back', hold: 'Hold: no step',
    break: 'break', replace: 'in place, weight change', close: 'closes beside the other foot',
    prepFwd: 'small step forward (prep)', prepBack: 'small step back (prep)',
  },
  es: {
    foot: { L: 'Pie izquierdo', R: 'Pie derecho' },
    fwd: 'adelante', back: 'atrás', hold: 'Pausa: sin paso',
    break: 'break', replace: 'en su lugar, cambio de peso', close: 'se junta con el otro pie',
    prepFwd: 'paso pequeño adelante (preparación)', prepBack: 'paso pequeño atrás (preparación)',
  },
};

// Plain-language description of one count for one role.
export function describe(p, count, role, lang) {
  const w = WORDS[lang] || WORDS.en;
  const st = p.steps[count];
  if (!st) return w.hold;
  const s = states(p);
  const dy = st[1] - s[count - 1][st[0]];
  const follower = role === 'follower';
  const foot = follower ? (st[0] === 'L' ? 'R' : 'L') : st[0];
  // The follower faces the leader, so his forward is her back.
  const goesFwd = follower ? dy < 0 : dy > 0;
  let what;
  if (st[2] === 'break') what = (goesFwd ? w.fwd : w.back) + ' · ' + w.break;
  else if (st[2] === 'replace') what = w.replace;
  else if (st[2] === 'close') what = w.close;
  else what = goesFwd ? w.prepFwd : w.prepBack;
  return w.foot[foot] + ' ' + what;
}

// The band, as 16 eighth-note slots across one 8-count (slot 2k-2 = count k).
// Traditional salsa patterns, arranged and synthesized for this page:
// 2-3 son clave strikes 2, 3, 5, 6& and 8 and never the 1.
export const BAND = {
  bell: { 0: 'm', 2: 'n', 3: 'n', 4: 'm', 6: 'n', 8: 'm', 10: 'n', 11: 'n', 12: 'm', 14: 'n', 15: 'n' },
  clave: { 2: 'x', 4: 'x', 8: 'x', 11: 'x', 14: 'x' },
  conga: {
    0: 'heel', 1: 'tip', 2: 'slap', 3: 'tip', 4: 'heel', 5: 'tip', 6: 'open', 7: 'open',
    8: 'heel', 9: 'tip', 10: 'slap', 11: 'tip', 12: 'heel', 13: 'tip', 14: 'open', 15: 'open',
  },
  // [frequency Hz, length in beats]; anticipated bass on 2& and 4 (and 6&, 8)
  bass: { 3: [73.42, 0.7], 6: [73.42, 2.3], 11: [110.0, 0.7], 14: [98.0, 2.3] },
};

export const LANES = ['bell', 'clave', 'conga', 'bass'];
