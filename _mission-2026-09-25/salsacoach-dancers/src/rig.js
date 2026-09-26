// Poses a Rocketbox (3ds Max Biped) avatar from choreography targets.
//
// Everything is solved in avatar space (the glTF scene root: +Z forward, +X the avatar's left,
// Y up, metres) with a small forward-kinematics chain of our own, then written back as local
// bone rotations. Legs and arms use analytic two-bone IK; each bone's new orientation is its rest
// orientation carried by the rotation that maps its rest frame (bone direction + bend direction)
// onto the solved frame, so bone twist never drifts.
import { Quaternion, Vector3, Matrix4, Euler } from 'three';

const V = () => new Vector3();
const _m1 = new Matrix4(), _m2 = new Matrix4(), _q1 = new Quaternion(), _q2 = new Quaternion(), _qs = new Quaternion();
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);

// Biped bones point along local +X; GLTFLoader turns spaces into underscores.
const NAMES = {
  root: 'Bip01', pelvis: 'Bip01_Pelvis', spine: 'Bip01_Spine', spine1: 'Bip01_Spine1', spine2: 'Bip01_Spine2',
  neck: 'Bip01_Neck', head: 'Bip01_Head',
};
for (const s of ['L', 'R']) {
  Object.assign(NAMES, {
    [s + 'clav']: `Bip01_${s}_Clavicle`, [s + 'upper']: `Bip01_${s}_UpperArm`, [s + 'fore']: `Bip01_${s}_Forearm`, [s + 'hand']: `Bip01_${s}_Hand`,
    [s + 'thigh']: `Bip01_${s}_Thigh`, [s + 'calf']: `Bip01_${s}_Calf`, [s + 'foot']: `Bip01_${s}_Foot`, [s + 'toe']: `Bip01_${s}_Toe0`,
  });
}
const ORDER = ['root', 'pelvis', 'spine', 'spine1', 'spine2', 'neck', 'head',
  'Lclav', 'Lupper', 'Lfore', 'Lhand', 'Rclav', 'Rupper', 'Rfore', 'Rhand',
  'Lthigh', 'Lcalf', 'Lfoot', 'Ltoe', 'Rthigh', 'Rcalf', 'Rfoot', 'Rtoe'];

class Joint {
  constructor(bone, parent) {
    this.bone = bone; this.parent = parent;
    this.t = bone.position.clone(); // local translation (constant)
    this.r0 = bone.quaternion.clone(); // rest local rotation
    this.r = bone.quaternion.clone(); // current local rotation
    this.q = new Quaternion(); this.p = new Vector3(); // current avatar-space orientation, position
    this.q0 = new Quaternion(); this.p0 = new Vector3(); // rest avatar-space
  }
  fk() {
    if (this.parent) {
      this.q.copy(this.parent.q).multiply(this.r);
      this.p.copy(this.t).applyQuaternion(this.parent.q).add(this.parent.p);
    } else { this.q.copy(this.r); this.p.copy(this.t); }
  }
  // set the avatar-space orientation; stores the matching local rotation
  setQ(q) { this.r.copy(this.parent ? _qs.copy(this.parent.q).invert().multiply(q) : q); this.fk(); }
}

// frame from a bone direction a and a bend direction b (made perpendicular to a)
function frame(a, b, out) {
  const x = a.clone().normalize();
  const y = b.clone().addScaledVector(x, -b.dot(x));
  if (y.lengthSq() < 1e-10) y.copy(Math.abs(x.y) < 0.9 ? Y : Z).addScaledVector(x, -(Math.abs(x.y) < 0.9 ? x.y : x.z));
  y.normalize();
  const z = V().crossVectors(x, y);
  return out.makeBasis(x, y, z);
}
// rotation carrying frame (a0,b0) onto (a1,b1)
function mapFrames(a0, b0, a1, b1, out) {
  frame(a0, b0, _m1); frame(a1, b1, _m2);
  _m1.transpose(); // orthonormal inverse
  return out.setFromRotationMatrix(_m2.multiply(_m1));
}

export class Rig {
  constructor(scene) {
    this.scene = scene;
    const bones = {};
    scene.traverse((o) => { if (o.isBone || o.type === 'Bone' || /^Bip01/.test(o.name)) bones[o.name] = o; });
    this.j = {};
    for (const k of ORDER) {
      const bone = bones[NAMES[k]];
      if (!bone) throw new Error('missing bone ' + NAMES[k]);
      let par = bone.parent, pj = null;
      while (par && !pj) { const key = ORDER.find((kk) => this.j[kk] && this.j[kk].bone === par); pj = key ? this.j[key] : null; if (!pj) { if (par.position.lengthSq() > 1e-12 || par.quaternion.w < 0.99999) console.warn('unexpected transform on', par.name); par = par.parent; if (par === scene) break; } }
      this.j[k] = new Joint(bone, pj);
    }
    for (const k of ORDER) { const J = this.j[k]; J.fk(); J.q0.copy(J.q); J.p0.copy(J.p); }
    // eyes (optional; every Rocketbox head has them): children of the head, aimed at the partner
    this.eyes = [];
    for (const s of ['L', 'R']) {
      const bone = bones[`Bip01_${s}Eye`];
      if (bone && bone.parent === this.j.head.bone) {
        const E = new Joint(bone, this.j.head);
        E.fk(); E.q0.copy(E.q); E.p0.copy(E.p);
        this.eyes.push(E);
      }
    }
    // fingers: curl about their local Z (the Biped flexion axis)
    this.fingers = [];
    scene.traverse((o) => { const m = /^Bip01_([LR])_Finger(\d)(\d?)$/.exec(o.name); if (m) this.fingers.push({ bone: o, r0: o.quaternion.clone(), side: m[1], digit: +m[2], seg: m[3] ? +m[3] : 0 }); });
    const J = this.j;
    this.len = {
      thigh: J.Lcalf.t.length(), calf: J.Lfoot.t.length(),
      upper: J.Lfore.t.length(), fore: J.Lhand.t.length(),
    };
    this.dims = {
      pelvis: J.root.p0.y, shoulder: (J.Lupper.p0.y + J.Rupper.p0.y) / 2, head: J.head.p0.y,
      footX: J.Lfoot.p0.x,
      eye: this.eyesY(bones),
    };
    // toe length past the ball joint (shoe included), used for the toe-off; no Toe0Nub in these rigs
    this.toeLen = 0.055;
    // rest-pose bend directions (avatar space): the child joint's offset from the chain line
    this.bend0 = {};
    for (const s of ['L', 'R']) {
      this.bend0[s + 'leg'] = this.restBend(J[s + 'thigh'], J[s + 'calf'], J[s + 'foot']);
      this.bend0[s + 'arm'] = this.restBend(J[s + 'upper'], J[s + 'fore'], J[s + 'hand']);
    }
    this.err = { leg: 0, arm: 0 };
  }

  // rest height of the eyes (avatar space), from the eye bones if present, else a head-joint estimate
  eyesY(bones) {
    const e = bones.Bip01_LEye;
    if (!e) return this.j.head.p0.y + 0.09;
    const J = new Joint(e, this.j.head); J.fk();
    return J.p.y;
  }

  restBend(a, b, c) {
    const line = V().subVectors(c.p0, a.p0).normalize();
    const off = V().subVectors(b.p0, a.p0);
    off.addScaledVector(line, -off.dot(line));
    return off.normalize();
  }

  // Two-bone IK in avatar space. pole: where the middle joint (knee/elbow) should point.
  // Returns the distance between the reached end point and the target (0 when reachable).
  solve2(a, b, c, target, pole, bend0) {
    const l1 = b.t.length(), l2 = c.t.length();
    const d = V().subVectors(target, a.p);
    let dist = d.length();
    const maxR = (l1 + l2) * 0.9995, minR = Math.abs(l1 - l2) + 1e-4;
    const dn = d.clone().normalize();
    const reach = Math.min(maxR, Math.max(minR, dist));
    const cosA = (l1 * l1 + reach * reach - l2 * l2) / (2 * l1 * reach);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const pp = pole.clone().addScaledVector(dn, -pole.dot(dn));
    if (pp.lengthSq() < 1e-10) pp.copy(bend0); pp.normalize();
    const mid = V().copy(a.p).addScaledVector(dn, l1 * cosA).addScaledVector(pp, l1 * sinA);
    const end = V().copy(a.p).addScaledVector(dn, reach);
    // upper bone
    const u1_0 = V().subVectors(b.p0, a.p0), u1 = V().subVectors(mid, a.p);
    const bendNow = V().subVectors(mid, V().copy(a.p).addScaledVector(dn, l1 * cosA));
    if (bendNow.lengthSq() < 1e-12) bendNow.copy(pp);
    mapFrames(u1_0, bend0, u1, bendNow, _q2);
    a.setQ(_q1.copy(_q2).multiply(a.q0));
    b.fk();
    // lower bone: same bend plane, carried to the new lower direction
    const u2_0 = V().subVectors(c.p0, b.p0), u2 = V().subVectors(end, mid);
    mapFrames(u2_0, bend0, u2, bendNow, _q2);
    b.setQ(_q1.copy(_q2).multiply(b.q0));
    c.fk();
    return Math.max(0, dist - reach);
  }

  // One full pose. T: targets in avatar space (see Dancer.apply).
  pose(T) {
    const J = this.j;
    // --- body ---
    J.root.r.copy(J.root.r0);
    J.root.t.set(T.body.x, this.dims.pelvis - T.body.drop, T.body.z);
    J.root.fk();
    const Rp = new Quaternion().setFromEuler(new Euler(T.body.pitch || 0, T.body.yaw, T.body.roll, 'YXZ'));
    J.pelvis.setQ(_q1.copy(Rp).multiply(J.pelvis.q0));
    J.spine.r.copy(J.spine.r0); J.spine.fk();
    const Rc = new Quaternion().setFromEuler(new Euler(T.chest.pitch, T.chest.yaw, T.chest.roll, 'YXZ'));
    const Rm = Rp.clone().slerp(Rc, 0.55);
    J.spine1.setQ(Rm.multiply(J.spine1.q0));
    J.spine2.setQ(_q1.copy(Rc).multiply(J.spine2.q0));
    J.neck.r.copy(J.neck.r0); J.neck.fk();
    // head: turn the rest face direction toward the look target (clamped), in avatar space
    J.head.r.copy(J.head.r0); J.head.fk();
    let headYaw = 0, headPitch = 0;
    if (T.look) {
      const dir = V().subVectors(T.look, J.head.p).normalize();
      const yaw = clamp(Math.atan2(dir.x, dir.z), -0.35, 0.35), pitch = clamp(-Math.asin(clamp(dir.y, -1, 1)), -0.3, 0.25);
      const chestYaw = T.chest.yaw;
      headYaw = yaw * 0.8 - chestYaw * 0.2; headPitch = pitch * 0.8;
      // set in avatar space, so the head stays level while the pelvis and chest roll under it
      const Rh = new Quaternion().setFromEuler(new Euler(headPitch, headYaw, 0, 'YXZ'));
      J.head.setQ(_q1.copy(Rh).multiply(J.head.q0));
    }
    // eyes: the rest of the way to the partner's eyes, within a small range of the head's turn
    for (const E of this.eyes) {
      E.fk();
      if (!T.look) { E.r.copy(E.r0); E.fk(); continue; }
      const dir = V().subVectors(T.eyeLook || T.look, E.p).normalize();
      const yaw = headYaw + clamp(Math.atan2(dir.x, dir.z) - headYaw, -0.3, 0.3);
      const pitch = headPitch + clamp(-Math.asin(clamp(dir.y, -1, 1)) - headPitch, -0.2, 0.2);
      E.setQ(_q1.setFromEuler(new Euler(pitch, yaw, 0, 'YXZ')).multiply(E.q0));
    }
    // clavicles: shoulders a little down and relaxed (rotation about the avatar's forward axis)
    for (const s of ['L', 'R']) {
      const C = J[s + 'clav'];
      C.r.copy(C.r0); C.fk();
      if (T.shoulderDrop) C.setQ(_q1.setFromAxisAngle(Z, (s === 'L' ? -1 : 1) * T.shoulderDrop).multiply(C.q));
    }
    // --- arms ---
    let armErr = 0;
    for (const s of ['L', 'R']) {
      const up = J[s + 'upper'], fo = J[s + 'fore'], ha = J[s + 'hand'];
      up.fk();
      if (T.hands && T.hands[s]) {
        armErr = Math.max(armErr, this.solve2(up, fo, ha, T.hands[s].pos, T.hands[s].pole, this.bend0[s + 'arm']));
        if (T.hands[s].q) ha.setQ(T.hands[s].q); else { ha.r.copy(ha.r0); ha.fk(); }
      } else {
        up.r.copy(up.r0); up.fk(); fo.r.copy(fo.r0); fo.fk(); ha.r.copy(ha.r0); ha.fk();
      }
    }
    // --- legs ---
    let legErr = 0;
    for (const s of ['L', 'R']) {
      const th = J[s + 'thigh'], ca = J[s + 'calf'], ft = J[s + 'foot'], to = J[s + 'toe'];
      th.fk();
      const F = T.feet[s];
      // foot orientation: rest orientation, pitched heel-up about the foot's lateral axis
      const fwd = V().subVectors(to.p0, ft.p0); fwd.y = 0; fwd.normalize();
      const lat = V().crossVectors(Y, fwd).normalize(); // points to the avatar's left for a +Z foot
      let pitch = F.pitch;
      let ankle, Rf;
      const ball = F.ball; // avatar-space target of the Toe0 joint (ball of the foot)
      const rel0 = V().subVectors(ft.p0, to.p0);
      // ankle roll about the foot's long axis through the ball (+ = sole turns inward, both feet)
      const rollAng = (F.roll || 0) * (s === 'L' ? -1 : 1);
      const Rroll = new Quaternion().setFromAxisAngle(fwd, rollAng);
      // raise the heel further if the leg cannot otherwise reach (the ball stays planted)
      for (let it = 0; it < 12; it++) {
        Rf = new Quaternion().setFromAxisAngle(lat, pitch).multiply(Rroll);
        ankle = V().copy(rel0).applyQuaternion(Rf).add(ball);
        if (ankle.distanceTo(th.p) <= (this.len.thigh + this.len.calf) * 0.999 || pitch > 1.0) break;
        pitch += 0.05;
      }
      F.pitchUsed = pitch;
      const poleDir = V().copy(T.kneePole[s]);
      legErr = Math.max(legErr, this.solve2(th, ca, ft, ankle, poleDir, this.bend0[s + 'leg']));
      ft.setQ(_q1.copy(Rf).multiply(ft.q0));
      // toe-off: the toes bend at the ball so their tip stays on the floor until the ball has risen
      // far enough, then they follow the foot. Flat on the floor while the ball is down (as before).
      const toePitch = Math.min(pitch, Math.asin(Math.min(1, Math.max(0, F.lift) / this.toeLen)));
      const share = pitch > 1e-6 ? toePitch / pitch : 0;
      to.setQ(_q1.setFromAxisAngle(lat, toePitch).multiply(_q2.setFromAxisAngle(fwd, rollAng * share)).multiply(to.q0));
    }
    this.err.leg = legErr; this.err.arm = armErr;
    // --- fingers: a relaxed curl, a little more in a held hand ---
    for (const f of this.fingers) {
      const held = T.grip && T.grip[f.side];
      const base = f.digit === 0 ? 0.12 : held ? 0.55 : 0.28;
      const amt = f.seg === 0 ? base * 0.8 : base;
      f.bone.quaternion.copy(f.r0).multiply(_q1.setFromAxisAngle(Z, amt));
    }
    // write local rotations and the root translation to the three.js bones
    for (const k of ORDER) { const Jk = J[k]; Jk.bone.quaternion.copy(Jk.r); }
    J.root.bone.position.copy(J.root.t);
  }

  // avatar-space positions for QA
  probe() {
    const J = this.j, o = {};
    for (const s of ['L', 'R']) {
      o[s + 'ball'] = J[s + 'toe'].p.clone(); o[s + 'ankle'] = J[s + 'foot'].p.clone();
      o[s + 'hand'] = J[s + 'hand'].p.clone(); o[s + 'knee'] = J[s + 'calf'].p.clone(); o[s + 'hip'] = J[s + 'thigh'].p.clone();
      o[s + 'ballRest'] = J[s + 'toe'].p0.clone();
    }
    o.pelvis = J.root.p.clone(); o.head = J.head.p.clone();
    // toe tip: the toe joint plus the toe's current forward direction times the toe length
    for (const s of ['L', 'R']) {
      const to = J[s + 'toe'], ft = J[s + 'foot'];
      const f0 = V().subVectors(to.p0, ft.p0); f0.y = 0; f0.normalize();
      const rel = _q1.copy(to.q).multiply(_q2.copy(to.q0).invert());
      o[s + 'toeTip'] = f0.applyQuaternion(rel).multiplyScalar(this.toeLen).add(to.p);
      o[s + 'toeTipRest'] = V().copy(to.p0);
    }
    if (this.eyes.length) o.eye = this.eyes[0].p.clone();
    return o;
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
