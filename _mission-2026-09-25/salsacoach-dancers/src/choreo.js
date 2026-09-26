// Turns the Count Lab step model into targets for two life-size dancers.
//
// Timing is the Count Lab's, unchanged: a foot stays planted until 0.6 of the beat, travels with a
// smoothstep, and lands exactly on the next count. Weight arrives with the landing. Loop windows
// (1-4, 5-8) reset during the hold the same way. Only the distances change: the schematic's 0.32 m
// break and 0.95 m partner gap are drawn for legibility; real bodies in closed hold are closer.
//
// World frame (three.js, metres, Y up): the leader stands at the origin facing +Z, so his left is
// +X. The follower stands at Z = GAP facing -Z. Count Lab floor (x right, y forward, z up) maps to
// world X = -x, Y = z, Z = y. Her feet make the same world moves as his feet on the same side.
import { PATTERNS, states } from '../../salsacoach-count-lab/src/model.js';

export const REAL = {
  scale: 0.75, // schematic break 0.32 m -> 0.24 m
  gap: 0.42, // ankle to ankle between partners at home
  footX: { leader: 0.095, follower: 0.085 },
  lift: 0.022, // swing clearance: salsa feet skim the floor
  hipShift: 0.045, // pelvis over the standing leg
  frontShare: 0.78, // share of the stride the pelvis travels onto the new foot
  peel: 0.22, // heel lift (rad) as a foot leaves the floor
  ballLand: 0.16, // back steps touch down on the ball, then the heel lowers
  // Phase three: generated motion layered on top of the timing above. None of it moves a planted
  // ball of the foot or changes when a foot lifts or lands.
  settle: 0.012, // extra pelvis shift out over the standing leg once the weight has arrived (m)
  settleIn: 0.4, // beats for that settle to ease in after the weight arrives
  settleFrom: 0.35, // share of the settle already there at the moment of landing
  roll: 0.05, // ankle roll (rad): a free foot resting on its ball rolls a little onto the big-toe side
  swingRoll: 0.035, // ankle roll (rad) mid-swing; gone again by the landing, so the foot lands level
  handLag: 0.05, // beats the joined hands trail the bodies (relaxed arms; at most about 3.5 cm)
};

export const STATES = {};
for (const id in PATTERNS) STATES[id] = states(PATTERNS[id]);

const mod = (a, n) => ((a % n) + n) % n;
const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

export const windowOff = (loop) => (loop === 'second' ? 4 : 0);
export const windowLen = (loop) => (loop === 'all' ? 8 : 4);
export const posFrom = (b, loop) => windowOff(loop) + mod(b, windowLen(loop));
export const slotOf = (tick, loop) => (loop === 'all' ? mod(tick, 16) : windowOff(loop) * 2 + mod(tick, 8));
// the position d beats earlier, wrapped inside the current loop window (phase three: hand lag)
export const lagPos = (p, d, loop) => windowOff(loop) + mod(p - windowOff(loop) - d, windowLen(loop));

// The Count Lab's poseAt, parameterised instead of reading page state. Returns the two leader-frame
// states the body is between (A -> B), the eased travel fraction u, and look-ahead (N: where the
// travel at 0.6 of this beat will go) and look-back (prev: the state before this count).
export function beatState(p, pattern, loop, reduced) {
  const P = STATES[pattern];
  const k = Math.floor(p) % 8 + 1, frac = p - Math.floor(p);
  let next = k % 8 + 1, reset = false;
  if (loop !== 'all') {
    const first = windowOff(loop) + 1, last = windowOff(loop) + 4;
    if (k === last) { next = first; reset = true; }
  }
  const A = P[k], Bn = P[next];
  const R0 = reset ? P[loop === 'second' ? 4 : 8] : null;
  // at: the state this count landed in; prev: the one before it; upFrom -> N: the step at 0.6
  const out = { k, frac, A, B: A, u: 0, ghost: false, travel: false, reduced: !!reduced,
    at: A, prev: P[k - 1], upFrom: reset ? R0 : A, N: Bn };
  if (reduced) return out;
  if (reset) {
    if (frac < 0.15) return out;
    if (frac < 0.55) return Object.assign(out, { B: R0, u: ease((frac - 0.15) / 0.4), ghost: true });
    if (frac < 0.6) return Object.assign(out, { A: R0, B: R0 });
    return Object.assign(out, { A: R0, B: Bn, u: ease((frac - 0.6) / 0.4), travel: true });
  }
  if (frac < 0.6) return out;
  return Object.assign(out, { B: Bn, u: ease((frac - 0.6) / 0.4), travel: true });
}

// Which leader-frame foot moves between two states (null if none).
export const movingFoot = (A, B) => (Math.abs(A.L - B.L) > 1e-6 ? 'L' : Math.abs(A.R - B.R) > 1e-6 ? 'R' : null);

// Own-foot naming: her right foot mirrors his left. The mapping is its own inverse.
export const ownFoot = (role, leaderFoot) => (role === 'leader' ? leaderFoot : leaderFoot === 'L' ? 'R' : 'L');

// Where a dancer's foot sits on the floor for a leader-frame foot and state value y (world X, Z).
// This is the point under the ankle; the rig keeps the ball of the foot fixed while planted.
export function footXZ(role, lf, y) {
  const fx = REAL.footX[role];
  return [lf === 'L' ? fx : -fx, (role === 'leader' ? 0 : REAL.gap) + REAL.scale * y];
}

// Body (pelvis) position for a state: most of the way onto the standing foot, hips out over it.
function bodyXZ(role, st) {
  const w = st.w, o = w === 'L' ? 'R' : 'L';
  const fw = footXZ(role, w, st[w]), fo = footXZ(role, o, st[o]);
  return [(w === 'L' ? 1 : -1) * REAL.hipShift, lerp(fo[1], fw[1], REAL.frontShare)];
}

// Full per-dancer targets for one beat state. World space.
//   feet[own]: { x, z, lift, pitch (rad, heel up about the ball), planted, weighted, target }
//   body: { x, z, side (+1 = over own right leg), dip }
export function dancerTargets(role, bs) {
  const { A, B, u, frac } = bs;
  const fwdSign = role === 'leader' ? 1 : -1; // world Z per unit of the dancer's own forward
  const mv = bs.ghost ? null : movingFoot(A, B);
  const up = bs.travel || bs.reduced ? null : movingFoot(bs.upFrom, bs.N);
  const landed = movingFoot(bs.prev, bs.at);
  const arrived = landed || bs.prev.w !== bs.at.w;
  const ba = bodyXZ(role, A), bb = bodyXZ(role, B);
  const body = { x: lerp(ba[0], bb[0], u), z: lerp(ba[1], bb[1], u) };
  // leader-frame foot carrying the weight: it changes when the stepping foot lands on the count
  // (a loop reset's in-place weight change flips halfway through it)
  const w = bs.ghost && u >= 0.5 ? B.w : A.w;
  const feet = {};
  for (const lf of ['L', 'R']) {
    const f = ownFoot(role, lf);
    const a = footXZ(role, lf, A[lf]), b = footXZ(role, lf, B[lf]);
    const moving = mv === lf, weighted = w === lf;
    const x = moving ? lerp(a[0], b[0], u) : a[0], z = moving ? lerp(a[1], b[1], u) : a[1];
    let lift = 0, pitch = 0;
    if (moving) {
      // skim the floor; the heel leads off, forward steps land flat, back steps land on the ball
      const back = (b[1] - a[1]) * fwdSign < 0;
      lift = Math.sin(Math.PI * u) * REAL.lift;
      pitch = lerp(REAL.peel, back ? REAL.ballLand : 0, u) + 0.1 * Math.sin(Math.PI * u);
    } else if (!bs.reduced) {
      // after a back step lands on the ball, the heel lowers over the first quarter beat
      if (landed === lf) {
        const pa = footXZ(role, lf, bs.prev[lf]);
        if ((a[1] - pa[1]) * fwdSign < 0) pitch = REAL.ballLand * (1 - ease(clamp01(frac / 0.25)));
      }
      if (!weighted) {
        // heel peels over the last 0.2 beat before this foot leaves; the ball stays planted
        if (up === lf) pitch = Math.max(pitch, REAL.peel * ease(clamp01((frac - 0.4) / 0.2)));
        // a free foot left behind the body rolls onto its ball
        const behind = (body.z - z) * fwdSign;
        pitch = Math.max(pitch, Math.min(0.5, Math.max(0, (behind - 0.06) * 1.8)));
      }
    }
    // subtle ankle roll about the foot's long axis through the ball (+ = sole turns inward): a little
    // inversion mid-swing that is gone by the landing; a free foot on its ball rolls onto the big toe
    let roll = 0;
    if (moving) roll = REAL.swingRoll * Math.sin(Math.PI * u);
    else if (!bs.reduced && !weighted && pitch > 0.02) roll = -REAL.roll * Math.min(1, pitch / REAL.peel);
    feet[f] = { x, z, lift, pitch, roll, planted: !moving, weighted, target: moving ? { x: b[0], z: b[1] } : null };
  }
  const sideA = ownFoot(role, A.w) === 'R' ? 1 : -1, sideB = ownFoot(role, B.w) === 'R' ? 1 : -1;
  body.side = lerp(sideA, sideB, u);
  // hip settle (a Cuban-motion hint, generated): the weight lands on the count, then the pelvis
  // sinks out over the standing leg during the planted part of the beat. It releases while the
  // weight travels to the other foot and never happens on a hold or with reduced motion.
  let settle = 1;
  if (!bs.reduced && !bs.ghost) {
    if (bs.travel && A.w !== B.w) settle = lerp(1, REAL.settleFrom, u);
    else if (!bs.travel && arrived) settle = REAL.settleFrom + (1 - REAL.settleFrom) * ease(clamp01(frac / REAL.settleIn));
  }
  body.settle = settle;
  // world X of the settle: towards the weighted foot (leader-frame L = world +X for both dancers)
  body.x += lerp(A.w === 'L' ? 1 : -1, B.w === 'L' ? 1 : -1, u) * REAL.settle * settle;
  // weight arriving: a small give in the knees right after a step lands (none on holds)
  body.dip = !bs.travel && !bs.ghost && arrived && !bs.reduced ? 0.009 * Math.sin(Math.PI * clamp01(frac / 0.4)) : 0;
  body.sep = Math.abs(feet.L.z - feet.R.z);
  return { feet, body, moving: mv ? ownFoot(role, mv) : null, fwdSign };
}

// Where the hands go in closed hold, from both pelvis positions (world) and the dancers' heights.
// Leader's left holds follower's right, out to his left at about her shoulder height; his right hand
// sits on her left shoulder blade; her left hand rests on his right shoulder.
// lagLead / lagFoll (optional): the bodies a moment earlier. The joined hands follow those, so they
// trail the couple a little like relaxed arms; the hands that rest on a partner stay attached.
export function holdTargets(lead, foll, dims, lagLead, lagFoll) {
  const midZ = ((lagLead || lead).z + (lagFoll || foll).z) / 2;
  const handY = dims.follower.shoulder - 0.05;
  return {
    leader: {
      L: [0.45, handY, midZ - 0.05],
      R: [-0.15, dims.follower.shoulder - 0.12, foll.z + 0.03],
    },
    follower: {
      R: [0.45, handY + 0.005, midZ + 0.05],
      L: [-0.17, dims.leader.shoulder - 0.04, lead.z + 0.02],
    },
  };
}
