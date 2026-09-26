// One avatar: loading, materials, placement, and turning world-space choreography into rig targets.
import {
  Group, MeshStandardMaterial, MeshBasicMaterial, DoubleSide, SRGBColorSpace, RepeatWrapping,
  Vector3, Color,
} from 'three';
import { Rig } from './rig.js';

// Rocketbox texture sets, shipped as WebP tiers (see assets/NOTICE.md)
export const LOOKS = {
  leader: { glb: 'assets/leader.glb', tex: 'm014' },
  follower: { glb: 'assets/follower.glb', tex: 'f022' },
};

export class Dancer {
  constructor(role, gltf, maps, color) {
    this.role = role;
    this.group = new Group();
    this.group.name = role;
    this.model = gltf.scene;
    this.group.add(this.model);
    this.meshes = [];
    this.real = {};
    const fringes = [];
    this.ghostMat = new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.16, depthWrite: false });
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false; // skinned bounds do not follow the pose
      o.castShadow = true; o.receiveShadow = true;
      const part = /_head$/.test(o.material.name) ? 'head' : /_opacity$/.test(o.material.name) ? 'hair' : 'body';
      const m = maps[part] || {};
      const mat = new MeshStandardMaterial({
        name: role + '-' + part,
        map: m.color || null,
        normalMap: m.normal || null,
        roughness: part === 'head' ? 0.55 : part === 'hair' ? 0.62 : 0.74,
        metalness: 0,
      });
      if (m.normal) mat.normalScale.set(0.8, 0.8);
      if (part === 'hair') { mat.alphaTest = 0.55; mat.side = DoubleSide; }
      o.material = mat;
      this.real[o.uuid] = mat;
      this.meshes.push(o);
      if (part === 'hair') fringes.push(o);
    });
    // Hair cards in two passes: an alpha-tested core that writes depth, then the soft edges blended
    // on top without writing depth. The second mesh shares the geometry and the skeleton.
    for (const o of fringes) {
      const soft = o.clone();
      soft.material = o.material.clone();
      Object.assign(soft.material, { alphaTest: 0.04, transparent: true, depthWrite: false, name: role + '-hair-soft' });
      soft.castShadow = false;
      soft.renderOrder = 1;
      o.parent.add(soft);
      this.real[soft.uuid] = soft.material;
      this.meshes.push(soft);
    }
    this.rig = new Rig(this.model);
    this.ghost = false;
  }

  place(x, z, yaw) {
    this.group.position.set(x, 0, z);
    this.group.rotation.set(0, yaw, 0);
    this.group.updateMatrixWorld(true);
    this.yaw = yaw;
    this.cos = Math.cos(yaw); this.sin = Math.sin(yaw);
  }

  // world point -> avatar space (the group only translates and turns about Y)
  toAvatar(x, y, z, out = new Vector3()) {
    const dx = x - this.group.position.x, dz = z - this.group.position.z;
    return out.set(this.cos * dx - this.sin * dz, y, this.sin * dx + this.cos * dz);
  }
  toWorld(v, out = new Vector3()) {
    return out.set(this.cos * v.x + this.sin * v.z + this.group.position.x, v.y, -this.sin * v.x + this.cos * v.z + this.group.position.z);
  }
  // world direction -> avatar direction
  dirToAvatar(d) { return new Vector3(this.cos * d[0] - this.sin * d[2], d[1], this.sin * d[0] + this.cos * d[2]).normalize(); }

  setGhost(on) {
    if (on === this.ghost) return;
    this.ghost = on;
    for (const o of this.meshes) {
      o.material = on ? this.ghostMat : this.real[o.uuid];
      o.castShadow = !on;
    }
  }

  // t: dancerTargets() for this role; hands: holdTargets()[role]; look: world point to face
  apply(t, hands, look, style) {
    const R = this.rig, J = R.j;
    const b = this.toAvatar(t.body.x, 0, t.body.z);
    const side = t.body.side; // +1 = weight over own right leg
    const drop = style.drop + 0.08 * t.body.sep * t.body.sep + t.body.dip;
    const T = {
      body: { x: b.x, z: b.z, drop, roll: -side * style.hipRoll, yaw: -side * style.hipYaw, pitch: style.pelvisTilt },
      chest: { pitch: style.lean, yaw: side * style.chestCounter, roll: side * style.hipRoll * 0.35 },
      feet: {}, kneePole: {}, hands: {}, grip: style.grip,
      look: look ? this.toAvatar(look.x, look.y, look.z) : null,
    };
    for (const f of ['L', 'R']) {
      const F = t.feet[f];
      const a = this.toAvatar(F.x, 0, F.z);
      const toe0 = J[f + 'toe'].p0, ank0 = J[f + 'foot'].p0;
      T.feet[f] = {
        ball: new Vector3(toe0.x + (a.x - ank0.x), toe0.y + F.lift, toe0.z + (a.z - ank0.z)),
        pitch: F.pitch, lift: F.lift,
      };
      T.kneePole[f] = R.bend0[f + 'leg'];
    }
    for (const s of ['L', 'R']) {
      const h = hands && hands[s];
      if (!h) continue;
      T.hands[s] = { pos: this.toAvatar(h[0], h[1], h[2]), pole: this.dirToAvatar(style.elbow[s]) };
    }
    R.pose(T);
    this.lastT = T;
  }

  // world-space joint positions for QA and overlays
  probe() {
    const o = this.rig.probe(), out = {};
    for (const k in o) out[k] = this.toWorld(o[k]);
    return out;
  }
}

export const STYLE = {
  leader: {
    drop: 0.012, hipRoll: 0.07, hipYaw: 0.08, pelvisTilt: 0, lean: 0.07, chestCounter: 0.035,
    // elbow directions in world space for closed hold (the leader faces +Z; his left is +X)
    elbow: { L: [0.35, -1, -0.15], R: [-1, -0.55, -0.1] },
    grip: { L: true, R: false },
  },
  follower: {
    drop: 0.014, hipRoll: 0.085, hipYaw: 0.09, pelvisTilt: 0, lean: 0.1, chestCounter: 0.04,
    // she faces -Z; her right is +X
    elbow: { R: [0.35, -1, 0.15], L: [-0.6, -1, 0.25] },
    grip: { L: false, R: true },
  },
};

export async function loadDancer(role, loader, texLoader, tier, color, anisotropy) {
  const look = LOOKS[role];
  const size = tier === 'lite' ? 512 : 1024;
  const url = (part, kind, s) => `assets/${look.tex}_${part}_${kind}_${s}.webp`;
  const load = (u, srgb) => texLoader.loadAsync(u).then((t) => {
    t.flipY = false; // glTF UV convention
    if (srgb) t.colorSpace = SRGBColorSpace;
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = anisotropy;
    return t;
  });
  // The claude.ai artifact build embeds the avatars (its host does not serve .glb files).
  const embedded = window.__GLB && window.__GLB[role];
  const glb = embedded
    ? loader.parseAsync(Uint8Array.from(atob(embedded), (c) => c.charCodeAt(0)).buffer, '')
    : loader.loadAsync(look.glb);
  const jobs = {
    gltf: glb,
    bodyC: load(url('body', 'color', size), true),
    headC: load(url('head', 'color', size), true),
    hairC: load(url('opacity', 'color', size), true),
  };
  if (tier !== 'lite') {
    jobs.bodyN = load(url('body', 'normal', 1024), false);
    jobs.headN = load(url('head', 'normal', 1024), false);
  }
  const keys = Object.keys(jobs), vals = await Promise.all(keys.map((k) => jobs[k]));
  const r = Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
  return new Dancer(role, r.gltf, {
    body: { color: r.bodyC, normal: r.bodyN }, head: { color: r.headC, normal: r.headN }, hair: { color: r.hairC },
  }, color);
}

