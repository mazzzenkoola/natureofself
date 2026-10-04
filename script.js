const css = getComputedStyle(document.documentElement);
const BG = css.getPropertyValue('--bg').trim();
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

function shade(hex, pct) {
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.min(255, Math.max(0, r + 255 * pct));
  g = Math.min(255, Math.max(0, g + 255 * pct));
  b = Math.min(255, Math.max(0, b + 255 * pct));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function makeBgTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, shade(BG, .10));
  grad.addColorStop(.45, BG);
  grad.addColorStop(1, shade(BG, -.07));
  g.fillStyle = grad; g.fillRect(0, 0, 8, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const scene = new THREE.Scene();
scene.background = makeBgTexture();
scene.fog = new THREE.Fog(BG, 15, 45);

const cam = new THREE.PerspectiveCamera(50, 1, .1, 100);
const R = new THREE.WebGLRenderer({ antialias: true });
R.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(R.domElement);

const world = new THREE.Group();
scene.add(world);

const loader = new THREE.TextureLoader();
const ropeMaterial = new THREE.MeshBasicMaterial({ color: 0x111111 });
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function rope(a, b, r) {
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < .001) return new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), ropeMaterial);
  m.position.copy(a).addScaledVector(d, .5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  return m;
}

// -- works, placed at the exact position / size / rotation from the sketch --
// (built first, so rope segments near each work can be parented to it below)
const SEG_X = 14, SEG_Y = 20;

const items = SVG_WORKS.map((w, i) => {
  const g = new THREE.Group();
  g.position.set(w.x, w.y, w.z);
  const baseRotZ = THREE.MathUtils.degToRad(w.rot);
  g.rotation.z = baseRotZ;
  g.updateMatrixWorld(true);

  const tx = (typeof IMG !== 'undefined' && IMG[i]) ? loader.load(IMG[i]) : loader.load(`works/0${i + 1}.jpg`);
  tx.colorSpace = THREE.SRGBColorSpace;

  const geo = new THREE.PlaneGeometry(w.pw, w.ph, SEG_X, SEG_Y);
  const base = geo.attributes.position.array.slice();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide }));
  g.add(mesh);
  world.add(g);

  const reach = Math.max(w.pw, w.ph) * .6 + .25; // catch radius for nearby rope points
  return { g, geo, base, pw: w.pw, ph: w.ph, x: w.x, y: w.y, z: w.z, reach, baseRotZ, ph2: i * 1.7, sp: .5 + .13 * i, k: 1, scl: 1 };
});

// -- the hand-drawn rope tangle, traced point-for-point from the original sketch --
// any segment with an endpoint close to a work is parented to that work's group,
// so it sways/scales together with it instead of clipping through a static tangle
function nearestItem(p) {
  let best = null, bestD = Infinity;
  for (const o of items) {
    const d = Math.hypot(p[0] - o.x, p[1] - o.y, p[2] - o.z);
    if (d < o.reach && d < bestD) { bestD = d; best = o; }
  }
  return best;
}

const bgRopes = [];
(SVG_ROPES || []).forEach((poly, pi) => {
  const worldGroup = new THREE.Group();
  const bgPts = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const owner = nearestItem(a) || nearestItem(b);
    if (owner) {
      const la = owner.g.worldToLocal(V(...a));
      const lb = owner.g.worldToLocal(V(...b));
      owner.g.add(rope(la, lb, .018));
    } else {
      worldGroup.add(rope(V(...a), V(...b), .018));
      bgPts.push(a, b);
    }
  }
  if (bgPts.length) {
    // recenter this strand on its own midpoint so it can sway around its own
    // pivot, instead of sweeping around the world origin
    const cx = bgPts.reduce((s, p) => s + p[0], 0) / bgPts.length;
    const cy = bgPts.reduce((s, p) => s + p[1], 0) / bgPts.length;
    const cz = bgPts.reduce((s, p) => s + p[2], 0) / bgPts.length;
    worldGroup.children.forEach(m => m.position.sub(V(cx, cy, cz)));
    worldGroup.position.set(cx, cy, cz);
    bgRopes.push({ group: worldGroup, phase: pi * 1.7 + Math.random() * 2, sp: .35 + Math.random() * .35 });
  }
  world.add(worldGroup);
});

// the long cord trailing down out of the tangle, into the fog
world.add(rope(V(...SVG_TRUNK), V(SVG_TRUNK[0], -38, SVG_TRUNK[2]), .045));

// -- drifting dust motes, for an ambient feel --
function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const DUST_N = RM ? 0 : 220;
const dustPos = new Float32Array(DUST_N * 3);
const dustSeed = [];
for (let i = 0; i < DUST_N; i++) {
  dustPos[i * 3] = (Math.random() - .5) * 20;
  dustPos[i * 3 + 1] = (Math.random() - .5) * 18 + 4;
  dustPos[i * 3 + 2] = (Math.random() - .5) * 12 - 2;
  dustSeed.push(Math.random() * 100);
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  size: .06, map: makeDotTexture(), transparent: true, opacity: .3,
  color: 0x8a7660, depthWrite: false, sizeAttenuation: true
}));
scene.add(dust);

let cP, cT, nd = 4.0;
const N = items.length + 1;

function fit() {
  const w = innerWidth, h = innerHeight, a = w / h;
  R.setSize(w, h);
  cam.aspect = a;
  cam.updateProjectionMatrix();

  const ov = Math.max(14, 12 / (.93 * a));
  nd = Math.max(3.4, 2.1 / (.93 * a));
  scene.fog.near = ov * .9;
  scene.fog.far = ov * 2.6;

  const wideShot = V(0, 6, ov);
  const wideTarget = V(0, 5.5, 0);
  const P = [wideShot], T = [wideTarget];
  items.forEach(o => {
    P.push(V(o.x + .4, o.y + .15, o.z + nd));
    T.push(V(o.x, o.y, o.z));
  });
  cP = new THREE.CatmullRomCurve3(P, true);
  cT = new THREE.CatmullRomCurve3(T, true);
}
addEventListener('resize', fit);
fit();

let target = 0, cur = 0, last = performance.now(), idle = 0, started = false, ty = null, shown = -2;
const bump = d => { target += d; idle = 0; };

addEventListener('wheel', e => { e.preventDefault(); bump(e.deltaY * .00025); }, { passive: false });
addEventListener('touchstart', e => { ty = e.touches[0].clientY; idle = 0; }, { passive: true });
addEventListener('touchmove', e => {
  if (ty === null) return;
  const y = e.touches[0].clientY;
  bump((ty - y) * .0004);
  ty = y;
}, { passive: true });
addEventListener('touchend', () => ty = null);
addEventListener('keydown', e => {
  if (['ArrowDown', 'ArrowRight', ' '].includes(e.key)) bump(.02);
  if (['ArrowUp', 'ArrowLeft'].includes(e.key)) bump(-.02);
});

const cap = document.getElementById('cap');
const intro = document.getElementById('intro');
document.getElementById('go').onclick = () => {
  started = true;
  idle = 0;
  intro.style.opacity = 0;
  intro.style.pointerEvents = 'none';
};

const sm = x => x * x * (3 - 2 * x);
const tmp = V(0, 0, 0);

function updateCloth(o, T) {
  const pos = o.geo.attributes.position;
  const arr = pos.array, base = o.base;
  const ampZ = (RM ? .025 : .16) * o.k;
  const ampX = (RM ? .015 : .09) * o.k;
  const freq = .9 + o.sp * .3;
  for (let idx = 0; idx < arr.length; idx += 3) {
    const bx = base[idx], by = base[idx + 1];
    const f = Math.pow(Math.max(0, (o.ph / 2 - by) / o.ph), 1.6);
    const wave = Math.sin(T * freq + bx * 1.6 + o.ph2) + .5 * Math.sin(T * freq * 1.7 + by * 2.1 + o.ph2 * 1.3);
    arr[idx + 2] = base[idx + 2] + wave * ampZ * f;
    arr[idx] = bx + Math.sin(T * freq * .8 + by * 1.3 + o.ph2) * ampX * f;
  }
  pos.needsUpdate = true;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, .05);
  last = now;
  idle += dt;

  if (!RM && started && idle > 3) target += dt * .012;
  cur += (target - cur) * Math.min(1, dt * 4);

  const s = ((cur % 1) + 1) % 1, i = Math.floor(s * N), f = s * N - i, e = sm(sm(f)), t = (i + e) / N;
  cam.position.copy(cP.getPoint(t));
  cam.lookAt(cT.getPoint(t));

  const T = now / 1000, A = RM ? .15 : 1;
  world.rotation.y = Math.sin(T * .15) * .02 * A;
  world.position.x = Math.sin(T * .11) * .1 * A;

  items.forEach(o => {
    tmp.set(o.x, o.y, o.z);
    const d = cam.position.distanceTo(tmp);
    const near = Math.min(1, Math.max(0, 1 - (d - nd * 1.15) / 5));
    const k = .25 + .75 * (1 - near);
    o.k += (k - o.k) * .05;
    const sclTarget = 1 + near * .4;
    o.scl += (sclTarget - o.scl) * .06;
    o.g.scale.setScalar(o.scl);
    o.g.rotation.z = o.baseRotZ + Math.sin(T * o.sp + o.ph2) * .025 * o.k * A;
    o.g.rotation.x = Math.sin(T * o.sp * .7 + o.ph2 * 2) * .015 * o.k * A;
    updateCloth(o, T * A);
  });

  bgRopes.forEach(o => {
    o.group.rotation.z = Math.sin(T * o.sp + o.phase) * .045 * A;
    o.group.rotation.x = Math.sin(T * o.sp * .8 + o.phase * 1.3) * .03 * A;
  });

  if (DUST_N) {
    const dp = dustGeo.attributes.position.array;
    for (let i = 0; i < DUST_N; i++) {
      const sd = dustSeed[i];
      dp[i * 3] += Math.sin(T * .05 + sd) * .0009 * A;
      dp[i * 3 + 1] += .0016 * A;
      if (dp[i * 3 + 1] > 13) dp[i * 3 + 1] = -5;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  const idx = e < .08 ? i : (e > .92 ? (i + 1) % N : -1);
  if (started && idx !== shown) {
    shown = idx;
    if (idx > 0) {
      cap.innerHTML = 'Работа ' + idx + '<small>название · год · материалы</small>';
      cap.style.opacity = 1;
    } else cap.style.opacity = 0;
  }

  R.render(scene, cam);
}
requestAnimationFrame(frame);
