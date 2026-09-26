// The practice floor: renderer, lights, a wood floor drawn in code, the camera rig, and the teaching
// marks on the floor (footprints that glow under the weighted foot, the landing spot of a foot in the
// air, and a pulse when a step lands on the count).
import {
  WebGLRenderer, Scene, PerspectiveCamera, Fog, PMREMGenerator, SRGBColorSpace, ACESFilmicToneMapping,
  PCFSoftShadowMap, DirectionalLight, HemisphereLight, Mesh, PlaneGeometry, MeshStandardMaterial,
  CanvasTexture, RepeatWrapping, Shape, ShapeGeometry, MeshBasicMaterial, Color, RingGeometry, Group,
  Vector3, LineLoop, BufferGeometry, LineBasicMaterial, Float32BufferAttribute,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Soft contact shadows under each shoe and each dancer: they ground the feet where the shadow map is
// too coarse. A shoe's shadow is darkest when the foot is flat and carries the weight, shrinks towards
// the ball as the heel rises, and fades as the ball leaves the floor.
export class ContactShadows {
  constructor(scene) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.72)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const tex = new CanvasTexture(c);
    const geo = new PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.items = {};
    const make = (op) => {
      const m = new Mesh(geo, new MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, opacity: op, depthWrite: false }));
      m.renderOrder = 1; m.position.y = 0.002; scene.add(m); return m;
    };
    for (const role of ['leader', 'follower']) {
      this.items[role] = { L: make(0.5), R: make(0.5), body: make(0.22) };
      this.items[role].body.scale.set(0.46, 1, 0.36);
    }
    this.tmp = { L: { ball: new Vector3(), ankle: new Vector3() }, R: { ball: new Vector3(), ankle: new Vector3() }, pelvis: new Vector3() };
  }
  update(role, dancer, targets, visible) {
    const it = this.items[role];
    for (const k of ['L', 'R', 'body']) it[k].visible = visible;
    if (!visible) return;
    const c = dancer.contact(this.tmp);
    for (const s of ['L', 'R']) {
      const m = it[s], f = c[s], F = targets.feet[s];
      const dx = f.ball.x - f.ankle.x, dz = f.ball.z - f.ankle.z, len = Math.hypot(dx, dz) || 1e-6;
      const ux = dx / len, uz = dz / len;
      const heel = Math.min(1, Math.max(0, f.ankleUp / 0.06)); // 0 flat .. 1 heel well up
      const air = Math.min(1, Math.max(0, f.ballUp / 0.03)); // 0 ball down .. 1 ball well up
      // footprint from the heel (0.07 m behind the ankle) to the toe tip (0.06 m past the ball)
      const back = -0.07 + heel * 0.12, front = len + 0.06;
      const mid = (back + front) / 2, L = Math.max(0.08, front - back) * (1 + air * 0.5);
      m.position.x = f.ankle.x + ux * mid; m.position.z = f.ankle.z + uz * mid;
      m.rotation.y = Math.atan2(ux, uz);
      m.scale.set(0.12 * (1 + air * 0.5), 1, L * 1.05);
      m.material.opacity = (F && F.weighted ? 0.62 : 0.48) * (1 - air * 0.85) * (1 - heel * 0.25);
    }
    it.body.position.x = c.pelvis.x; it.body.position.z = c.pelvis.z;
  }
}

export function makeRenderer(canvas, opts) {
  const r = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.keep });
  r.outputColorSpace = SRGBColorSpace;
  r.toneMapping = ACESFilmicToneMapping;
  r.toneMappingExposure = 1.08;
  r.shadowMap.enabled = true;
  r.shadowMap.type = PCFSoftShadowMap;
  return r;
}

function woodTexture(anisotropy, size) {
  // oak planks running along the dancers' forward axis: one tone per board, soft grain, staggered joints
  const c = document.createElement('canvas'), S = 1024;
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.scale(size / S, size / S);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tones = [[118, 84, 58], [106, 74, 50], [126, 90, 62], [98, 69, 47], [112, 80, 55]];
  const planks = 8, pw = S / planks;
  for (let i = 0; i < planks; i++) {
    let y = -rnd() * S;
    while (y < S) {
      const len = S * (0.55 + rnd() * 0.6), t = tones[(rnd() * tones.length) | 0], k = 0.94 + rnd() * 0.12;
      const x0 = i * pw;
      const grad = g.createLinearGradient(x0, 0, x0 + pw, 0);
      grad.addColorStop(0, `rgb(${t.map((v) => (v * k * 0.96) | 0)})`);
      grad.addColorStop(0.5, `rgb(${t.map((v) => (v * k) | 0)})`);
      grad.addColorStop(1, `rgb(${t.map((v) => (v * k * 0.94) | 0)})`);
      g.fillStyle = grad;
      for (const dy of [0, S, -S]) g.fillRect(x0, y + dy, pw, len);
      // grain: long, faint, gently wavy lines
      for (let n = 0; n < 16; n++) {
        const gx = x0 + 3 + rnd() * (pw - 6), a = 0.035 + rnd() * 0.05, ph = rnd() * 6;
        g.strokeStyle = rnd() < 0.6 ? `rgba(40,24,14,${a})` : `rgba(190,150,110,${a * 0.8})`;
        g.lineWidth = 0.8 + rnd() * 1.4;
        g.beginPath();
        for (let yy = 0; yy <= len; yy += 24) { const px = gx + Math.sin((yy + ph * 90) * 0.012) * 1.6; for (const dy of [0]) (yy ? g.lineTo(px, y + yy + dy) : g.moveTo(px, y + dy)); }
        g.stroke();
      }
      // board end joint
      g.fillStyle = 'rgba(30,18,10,0.55)';
      for (const dy of [0, S, -S]) g.fillRect(x0, y + len - 1 + dy, pw, 2);
      y += len;
    }
    g.fillStyle = 'rgba(25,15,8,0.6)';
    g.fillRect(i * pw, 0, 2, S);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

export function makeScene(renderer, tier) {
  const scene = new Scene();
  // a dim studio: warm spill behind the couple fading to the page's navy
  const bg = document.createElement('canvas');
  bg.width = 16; bg.height = 256;
  const bgc = bg.getContext('2d'), grad = bgc.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#070b17'); grad.addColorStop(0.55, '#1a1830'); grad.addColorStop(0.72, '#2a2238'); grad.addColorStop(1, '#141425');
  bgc.fillStyle = grad; bgc.fillRect(0, 0, 16, 256);
  const bgt = new CanvasTexture(bg); bgt.colorSpace = SRGBColorSpace;
  scene.background = bgt;
  scene.fog = new Fog(0x1c1a2e, 5.5, 12);
  const pm = new PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  pm.dispose();

  const hemi = new HemisphereLight(0xd6e4ff, 0x2a1b12, 0.45);
  scene.add(hemi);
  const key = new DirectionalLight(0xfff0dc, 2.4);
  key.position.set(2.6, 4.6, -0.4);
  key.target.position.set(0, 0.8, 0.21);
  key.castShadow = true;
  const sm = tier === 'lite' ? 1024 : 2048;
  key.shadow.mapSize.set(sm, sm);
  Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 2.1, bottom: -0.4, near: 1.5, far: 9 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 3;
  scene.add(key, key.target);
  const rim = new DirectionalLight(0xa9d8ff, 1.3);
  rim.position.set(-2.4, 3.2, 3.4);
  scene.add(rim);
  const fill = new DirectionalLight(0xffd9c9, 0.55);
  fill.position.set(-1.5, 1.8, -3.5);
  scene.add(fill);

  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const wood = woodTexture(aniso, tier === 'lite' ? 512 : 1024);
  wood.repeat.set(6, 6);
  const floor = new Mesh(new PlaneGeometry(12, 12), new MeshStandardMaterial({ map: wood, roughness: 0.84, metalness: 0, color: 0xd2bfae, envMapIntensity: 0.14 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 0.21;
  floor.receiveShadow = true;
  scene.add(floor);
  return { scene, key };
}

// Camera around the couple. yaw 0 = behind the leader, looking at the follower's face.
export const VIEWS = {
  leader: { yaw: 0.32, pitch: 0.16, dist: 4.1 },
  follower: { yaw: Math.PI + 0.32, pitch: 0.16, dist: 4.1 },
  side: { yaw: Math.PI / 2, pitch: 0.08, dist: 4.0 },
  top: { yaw: 0.35, pitch: 0.95, dist: 3.9 },
};

export class CameraRig {
  constructor(aspect, target) {
    this.cam = new PerspectiveCamera(30, aspect, 0.1, 40);
    this.target = new Vector3(...target);
    this.cur = { ...VIEWS.leader };
    this.goal = { ...VIEWS.leader };
  }
  set(view, instant) { this.goal = { ...VIEWS[view] }; if (instant) this.cur = { ...this.goal }; }
  nudge(dyaw, dpitch) {
    this.goal.yaw += dyaw; this.goal.pitch = Math.max(0.02, Math.min(1.35, this.goal.pitch + dpitch));
    this.cur.yaw = this.goal.yaw; this.cur.pitch = this.goal.pitch;
  }
  // returns true while still moving
  step(dt, instant) {
    let moving = false;
    for (const k of ['yaw', 'pitch', 'dist']) {
      const d = this.goal[k] - this.cur[k];
      if (instant || Math.abs(d) < 1e-4) this.cur[k] = this.goal[k];
      else { this.cur[k] += d * Math.min(1, dt * 5); moving = true; }
    }
    const { yaw, pitch, dist } = this.cur;
    // pull back a little on tall, narrow screens so both dancers fit
    const fit = this.cam.aspect < 0.75 ? 1 + (0.75 - this.cam.aspect) * 1.2 : 1;
    const d = dist * fit;
    this.cam.position.set(this.target.x + d * Math.sin(yaw) * Math.cos(pitch), this.target.y + d * Math.sin(pitch), this.target.z - d * Math.cos(yaw) * Math.cos(pitch));
    this.cam.lookAt(this.target);
    return moving;
  }
}

// Shoe outline in foot space (x across, y along; heel at -0.07 m, toe at +0.21 m from the ankle)
function shoeShape(scale) {
  const s = new Shape(), N = 14, len = 0.28 * scale, heel = -0.07 * scale;
  const hw = (t) => (t < 0.12 ? 0.04 * Math.sqrt(t / 0.12) : t < 0.45 ? 0.04 - 0.006 * (t - 0.12) / 0.33 : t < 0.76 ? 0.034 + 0.018 * (t - 0.45) / 0.31 : 0.052 * Math.sqrt(Math.max(0, 1 - (t - 0.76) / 0.24))) * scale;
  const pts = [];
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push([hw(t), heel + t * len]); }
  for (let i = N; i >= 0; i--) { const t = i / N; pts.push([-hw(t), heel + t * len]); }
  pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  return { shape: s, pts };
}

export class FloorMarks {
  constructor(scene, colors) {
    this.group = new Group();
    scene.add(this.group);
    this.marks = {};
    for (const role of ['leader', 'follower']) {
      const col = new Color(colors[role]);
      // drawn larger than the shoe so the colour shows as a halo around the foot on the floor
      const { shape, pts } = shoeShape(role === 'leader' ? 1.34 : 1.24);
      const geo = new ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2); // shape y -> world -z; turned per foot below
      const lineGeo = new BufferGeometry();
      lineGeo.setAttribute('position', new Float32BufferAttribute(pts.flatMap((p) => [p[0], 0, -p[1]]), 3));
      for (const f of ['L', 'R']) {
        const print = new Mesh(geo, new MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, depthWrite: false }));
        const ghost = new LineLoop(lineGeo, new LineBasicMaterial({ color: col, transparent: true, opacity: 0 }));
        const pulse = new Mesh(new RingGeometry(0.16, 0.19, 48), new MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false }));
        pulse.rotation.x = -Math.PI / 2;
        for (const m of [print, ghost, pulse]) { m.renderOrder = 2; m.position.y = 0.003; this.group.add(m); }
        this.marks[role + f] = { print, ghost, pulse };
      }
    }
  }
  // place a shoe-shaped mark: facing +1 = +Z (leader), -1 = -Z (follower); out: +1 left foot,
  // -1 right foot, turning the toe slightly outward like the avatars' own stance
  static orient(m, x, z, facing, out) {
    m.position.x = x; m.position.z = z;
    m.rotation.y = (facing > 0 ? Math.PI : 0) + out * 0.2;
  }
  update(role, targets, facing, visible, landing) {
    for (const f of ['L', 'R']) {
      const M = this.marks[role + f], F = targets.feet[f];
      const out = f === 'L' ? 1 : -1;
      M.print.visible = M.ghost.visible = M.pulse.visible = visible;
      if (!visible) continue;
      FloorMarks.orient(M.print, F.x, F.z, facing, out);
      M.print.material.opacity = F.planted ? (F.weighted ? 0.62 : 0.2) : 0.08;
      if (F.target) {
        FloorMarks.orient(M.ghost, F.target.x, F.target.z, facing, out);
        M.ghost.material.opacity = 0.95;
      } else M.ghost.material.opacity = 0;
      const L = landing && landing[f];
      if (L !== undefined && L >= 0 && L < 1) {
        M.pulse.position.x = F.x; M.pulse.position.z = F.z + 0.07 * facing;
        const s = 0.7 + L * 1.1;
        M.pulse.scale.set(s, s, s);
        M.pulse.material.opacity = 0.85 * (1 - L);
      } else M.pulse.material.opacity = 0;
    }
  }
}
