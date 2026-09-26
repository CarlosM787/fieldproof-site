// Teaching overlays drawn in the 3D scene (phase three). All of them read the same beat state as the
// dancers, so they can never disagree with the step table:
//  - count badges: the count number at the spot where a foot lands (or takes the weight), shown from
//    the moment the foot leaves the floor, then on the foot through the planted part of the beat;
//  - weight indicator: a dot on the floor under each pelvis (the centre of weight) with a plumb line
//    from the hips, so you see the weight travel and settle over the standing foot.
import {
  Sprite, SpriteMaterial, CanvasTexture, SRGBColorSpace, Mesh, CircleGeometry, RingGeometry, MeshBasicMaterial,
  Group, Color, Vector3,
} from 'three';
import { movingFoot, ownFoot, windowOff } from './choreo.js';

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

function badgeTexture(label) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fillStyle = '#ffffff'; g.fill();
  g.lineWidth = 7; g.strokeStyle = 'rgba(4,10,20,0.85)'; g.stroke();
  g.fillStyle = '#07101f';
  g.font = 'bold 80px Arial, Helvetica, sans-serif'; // a font every device has, loaded or not
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, 64, 70);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// the count on which the travel that starts in count k lands (loop windows wrap to their first count)
export function nextCount(k, loop) {
  if (loop !== 'all') {
    const first = windowOff(loop) + 1, last = windowOff(loop) + 4;
    if (k === last) return first;
  }
  return k % 8 + 1;
}

export class CountBadges {
  constructor(scene, colors) {
    this.tex = {};
    for (let k = 1; k <= 8; k++) this.tex[k] = badgeTexture(String(k));
    this.group = new Group();
    scene.add(this.group);
    this.sprites = {};
    this.colors = { leader: new Color(colors.leader), follower: new Color(colors.follower), hold: new Color('#9aa6bf') };
    for (const role of ['leader', 'follower']) for (const slot of ['now', 'next']) {
      const m = new SpriteMaterial({ map: this.tex[1], color: this.colors[role], transparent: true, depthTest: false, depthWrite: false });
      const s = new Sprite(m);
      s.scale.set(0.13, 0.13, 1);
      s.renderOrder = 5;
      s.visible = false;
      this.group.add(s);
      this.sprites[role + slot] = s;
    }
    this.visible = true;
  }
  // high: the dancer farther from the camera shows its badges higher, so the two never overlap
  static place(s, x, z, facing, high) { s.position.set(x, high ? 0.25 : 0.09, z + 0.1 * facing); }
  hideRole(role) { this.sprites[role + 'now'].visible = this.sprites[role + 'next'].visible = false; }
  // bs: beatState; t: dancerTargets(role, bs); facing: +1 leader, -1 follower; P: pattern steps table
  update(role, bs, t, facing, loop, holds, show, high) {
    const now = this.sprites[role + 'now'], nx = this.sprites[role + 'next'];
    if (!this.visible || !show) { now.visible = nx.visible = false; return; }
    const k = bs.k, frac = bs.frac;
    // "now": the count that just landed, on the foot that landed or took the weight
    const landed = movingFoot(bs.prev, bs.at) || (bs.prev.w !== bs.at.w ? bs.at.w : null);
    const hold = holds.includes(k);
    const nowFoot = landed ? ownFoot(role, landed) : hold ? ownFoot(role, bs.at.w) : null;
    if (nowFoot) {
      const F = t.feet[nowFoot];
      CountBadges.place(now, F.x, F.z, facing, high);
      now.material.map = this.tex[k];
      now.material.color.copy(hold ? this.colors.hold : this.colors[role]);
      now.material.opacity = bs.reduced ? 1 : (bs.travel ? 1 - clamp01((frac - 0.6) / 0.25) : 1) * (hold ? 0.8 : 1);
      now.visible = now.material.opacity > 0.01;
    } else now.visible = false;
    // "next": from the moment a foot leaves the floor, the landing spot shows the count it lands on
    const mv = bs.travel ? movingFoot(bs.A, bs.B) || (bs.A.w !== bs.B.w ? bs.B.w : null) : null;
    if (mv && !bs.reduced) {
      const f = ownFoot(role, mv), F = t.feet[f];
      const x = F.target ? F.target.x : F.x, z = F.target ? F.target.z : F.z;
      CountBadges.place(nx, x, z, facing, high);
      const kk = nextCount(k, loop);
      nx.material.map = this.tex[kk];
      nx.material.color.copy(this.colors[role]);
      nx.material.opacity = clamp01((frac - 0.6) / 0.12);
      nx.visible = true;
    } else nx.visible = false;
  }
}

export class WeightDots {
  constructor(scene, colors) {
    this.group = new Group();
    scene.add(this.group);
    this.items = {};
    this.tmp = { L: { ball: new Vector3(), ankle: new Vector3() }, R: { ball: new Vector3(), ankle: new Vector3() }, pelvis: new Vector3() };
    for (const role of ['leader', 'follower']) {
      const col = new Color(colors[role]);
      // drawn over the legs like the count badges: it is a teaching mark, not part of the scene
      const mat = (op) => new MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, depthTest: false });
      const dot = new Mesh(new CircleGeometry(0.036, 32), mat(0.95));
      const ring = new Mesh(new RingGeometry(0.058, 0.074, 48), mat(0.85));
      const halo = new Mesh(new CircleGeometry(0.058, 32), new MeshBasicMaterial({ color: 0x050914, transparent: true, opacity: 0.45, depthWrite: false, depthTest: false }));
      for (const m of [halo, ring, dot]) { m.rotation.x = -Math.PI / 2; m.position.y = 0.004; m.renderOrder = 4; }
      this.group.add(halo, ring, dot);
      this.items[role] = { dot, ring, halo };
    }
    this.visible = true;
  }
  update(role, dancer, show) {
    const it = this.items[role], on = this.visible && show;
    it.dot.visible = it.ring.visible = it.halo.visible = on;
    if (!on) return;
    const c = dancer.contact(this.tmp);
    for (const m of [it.dot, it.ring, it.halo]) { m.position.x = c.pelvis.x; m.position.z = c.pelvis.z; }
  }
}
