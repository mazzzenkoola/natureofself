const css = getComputedStyle(document.documentElement);
const BG = css.getPropertyValue('--bg').trim();
const ROPE = css.getPropertyValue('--rope').trim();
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

// -- shade a hex color lighter/darker, for the ambient gradient --
function shade(hex, pct) {
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.min(255, Math.max(0, r + 255 * pct));
  g = Math.min(255, Math.max(0, g + 255 * pct));
  b = Math.min(255, Math.max(0, b + 255 * pct));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// -- vertical gradient + soft vignette as the background, instead of a flat color --
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

// -- real rope texture, wrapped around the cylinder and tiled along its length --
const loader = new THREE.TextureLoader();
const ropePhoto = loader.load((typeof ROPE_IMG !== 'undefined') ? ROPE_IMG : 'rope.jpg');
ropePhoto.colorSpace = THREE.SRGBColorSpace;
ropePhoto.wrapS = ropePhoto.wrapT = THREE.RepeatWrapping;

function ropeMatFor(len) {
  const t = ropePhoto.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.center.set(.5, .5);
  t.rotation = Math.PI / 2; // the photo runs horizontally; rotate so it tiles along the rope's length
  t.repeat.set(1, Math.max(1, len / .45));
  return new THREE.MeshBasicMaterial({ map: t });
}

const lineM = new THREE.LineBasicMaterial({ color: ROPE, transparent: true, opacity: .55 });
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function rope(a, b, r) {
  const d = b.clone().sub(a);
  const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), ropeMatFor(len));
  m.position.copy(a).addScaledVector(d, .5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  return m;
}

function fray(p, n, len) {
  const q = [];
  for (let i = 0; i < n; i++) {
    q.push(p.clone(), p.clone().add(V((Math.random() - .5) * .5, len * (.4 + Math.random() * .6), (Math.random() - .5) * .5)));
  }
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(q), lineM);
}

// -- works: [x, y, z, height, aspect(w/h), source] --
const W = [
  [5.0, 1.2, -.6, 2.8, 0.800, 'works/01.jpg'],
  [2.9, -.9, 1.0, 2.8, 0.665, 'works/02.jpg'],
  [.9, 1.6, -1.2, 2.8, 0.748, 'works/03.jpg'],
  [-1.1, -1.4, .6, 2.8, 0.750, 'works/04.jpg'],
  [-3.1, .7, -.4, 2.8, 0.788, 'works/05.jpg'],
  [-5.1, -.6, 1.0, 2.8, 0.800, 'works/06.jpg'],
];

const SEG_X = 14, SEG_Y = 20; // cloth subdivisions

const items = W.map(([x, y, z, ph, ar, src], i) => {
  const pw = ph * ar;
  const g = new THREE.Group();
  g.position.set(x, 7, z);
  const ly = y - 7, top = ly + ph / 2;

  const tx = (typeof IMG !== 'undefined' && IMG[i]) ? loader.load(IMG[i]) : loader.load(src);
  tx.colorSpace = THREE.SRGBColorSpace;

  const geo = new THREE.PlaneGeometry(pw, ph, SEG_X, SEG_Y);
  const base = geo.attributes.position.array.slice();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide }));
  mesh.position.y = ly;
  g.add(mesh);

  [-1, 1].forEach(s => {
    const a = V(s * pw * .38, top, 0);
    g.add(rope(a, V(0, 0, 0), .035));
    g.add(fray(a, 4, .3));
  });

  g.add(rope(V(0, 0, 0), V(0, 4, 0), .05));
  g.add(fray(V(0, 4, 0), 9, .9));
  world.add(g);

  return { g, geo, base, pw, ph, x, y, z, ph2: i * 1.7, sp: .5 + .13 * i, k: 1, scl: 1 };
});

// -- background web of faint threads --
const wp = [];
for (let i = 0; i < 70; i++) {
  const a = V((Math.random() - .5) * 20, (Math.random() - .5) * 10 + 2, (Math.random() - .5) * 8);
  wp.push(a, a.clone().add(V((Math.random() - .5) * 8, (Math.random() - .5) * 6, (Math.random() - .5) * 4)));
}
world.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wp), new THREE.LineBasicMaterial({ color: ROPE, transparent: true, opacity: .18 })));

world.add(rope(V(0, 3, -2), V(0, -40, -2), .06));

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
const DUST_N = RM ? 0 : 260;
const dustPos = new Float32Array(DUST_N * 3);
const dustSeed = [];
for (let i = 0; i < DUST_N; i++) {
  dustPos[i * 3] = (Math.random() - .5) * 26;
  dustPos[i * 3 + 1] = (Math.random() - .5) * 18 + 2;
  dustPos[i * 3 + 2] = (Math.random() - .5) * 14 - 2;
  dustSeed.push(Math.random() * 100);
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  size: .07, map: makeDotTexture(), transparent: true, opacity: .35,
  color: ROPE, depthWrite: false, sizeAttenuation: true
}));
scene.add(dust);

let cP, cT, nd = 4.4;
const N = items.length + 1;

function fit() {
  const w = innerWidth, h = innerHeight, a = w / h;
  R.setSize(w, h);
  cam.aspect = a;
  cam.updateProjectionMatrix();

  const ov = Math.max(16, 14 / (.93 * a));
  nd = Math.max(4.2, 2.6 / (.93 * a));
  scene.fog.near = ov * .9;
  scene.fog.far = ov * 2.6;

  const P = [V(0, .5, ov)], T = [V(0, 1.2, 0)];
  items.forEach(o => {
    P.push(V(o.x + .5, o.y + .2, o.z + nd));
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
  const ampZ = (RM ? .03 : .22) * o.k;
  const ampX = (RM ? .02 : .12) * o.k;
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
  world.rotation.y = Math.sin(T * .15) * .03 * A;
  world.position.x = Math.sin(T * .11) * .15 * A;

  items.forEach(o => {
    tmp.set(o.x, o.y, o.z);
    const d = cam.position.distanceTo(tmp);
    const near = Math.min(1, Math.max(0, 1 - (d - nd * 1.15) / 5));
    const k = .25 + .75 * (1 - near);
    o.k += (k - o.k) * .05;
    const sclTarget = 1 + near * .4;
    o.scl += (sclTarget - o.scl) * .06;
    o.g.scale.setScalar(o.scl);
    o.g.rotation.z = Math.sin(T * o.sp + o.ph2) * .035 * o.k * A;
    o.g.rotation.x = Math.sin(T * o.sp * .7 + o.ph2 * 2) * .02 * o.k * A;
    updateCloth(o, T * A);
  });

  // dust drifts slowly upward and sideways, wrapping around
  if (DUST_N) {
    const dp = dustGeo.attributes.position.array;
    for (let i = 0; i < DUST_N; i++) {
      const sd = dustSeed[i];
      dp[i * 3] += Math.sin(T * .05 + sd) * .0009 * A;
      dp[i * 3 + 1] += .0016 * A;
      if (dp[i * 3 + 1] > 11) dp[i * 3 + 1] = -7;
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
