const css = getComputedStyle(document.documentElement);
const BG = css.getPropertyValue('--bg').trim();
const ROPE = css.getPropertyValue('--rope').trim();
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 15, 45);

const cam = new THREE.PerspectiveCamera(50, 1, .1, 100);
const R = new THREE.WebGLRenderer({ antialias: true });
R.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(R.domElement);

const world = new THREE.Group();
scene.add(world);

const ropeM = new THREE.MeshBasicMaterial({ color: ROPE });
const lineM = new THREE.LineBasicMaterial({ color: ROPE, transparent: true, opacity: .6 });
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// -- a rope segment between two points --
function rope(a, b, r) {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 5), ropeM);
  m.position.copy(a).addScaledVector(d, .5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  return m;
}

// -- frayed rope ends: a loose bundle of short lines --
function fray(p, n, len) {
  const q = [];
  for (let i = 0; i < n; i++) {
    q.push(p.clone(), p.clone().add(V((Math.random() - .5) * .5, len * (.4 + Math.random() * .6), (Math.random() - .5) * .5)));
  }
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(q), lineM);
}

// -- placeholder "canvas" texture for one work --
function tex(c, i) {
  const k = document.createElement('canvas');
  k.width = 256; k.height = 360;
  const g = k.getContext('2d');
  g.fillStyle = c; g.fillRect(0, 0, 256, 360);
  g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 2;
  for (let j = 0; j < 12; j++) {
    g.beginPath(); g.moveTo(0, Math.random() * 360); g.lineTo(256, Math.random() * 360); g.stroke();
  }
  g.strokeStyle = 'rgba(40,70,160,.6)'; g.lineWidth = 5; g.beginPath();
  const cx = 128 + (i * 37 % 50 - 25), cy = 170 + (i * 53 % 60 - 30);
  for (let a = 0; a < 18; a += .1) {
    const r = a * 6;
    g.lineTo(cx + Math.cos(a) * r * (1 + .1 * Math.sin(a * 2)), cy + Math.sin(a) * r);
  }
  g.stroke();
  return new THREE.CanvasTexture(k);
}

// -- works: [x, y, z, width, height, placeholder color] --
// replace these 7 entries with real photos later (see README)
const W = [
  [5.2, 1.4, -.6, 2, 2.8, '#c6d4f0'],
  [3.3, -.8, 1, 1.8, 2.4, '#e9c9c0'],
  [1.7, 1.8, -1.2, 2.1, 3, '#cfe0cf'],
  [.1, -1.6, .6, 1.7, 2.4, '#f0e3b8'],
  [-1.6, .6, -.4, 2, 2.8, '#d7c9ea'],
  [-3.4, -1, 1.1, 1.8, 2.6, '#bfe0e6'],
  [-5.2, 1.2, -.8, 2, 2.8, '#ead0dd'],
];

const items = W.map(([x, y, z, pw, ph, c], i) => {
  const g = new THREE.Group();
  g.position.set(x, 7, z);
  const ly = y - 7, top = ly + ph / 2;

  const p = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex(c, i), side: THREE.DoubleSide }));
  p.position.y = ly;
  g.add(p);

  [-1, 1].forEach(s => {
    const a = V(s * pw * .38, top, 0);
    g.add(rope(a, V(0, 0, 0), .035));
    g.add(fray(a, 4, .3));
  });

  g.add(rope(V(0, 0, 0), V(0, 4, 0), .05));
  g.add(fray(V(0, 4, 0), 9, .9));
  world.add(g);

  return { g, x, y, z, ph: i * 1.7, sp: .5 + .13 * i, k: 1 };
});

// -- background web of faint threads --
const wp = [];
for (let i = 0; i < 70; i++) {
  const a = V((Math.random() - .5) * 20, (Math.random() - .5) * 10 + 2, (Math.random() - .5) * 8);
  wp.push(a, a.clone().add(V((Math.random() - .5) * 8, (Math.random() - .5) * 6, (Math.random() - .5) * 4)));
}
world.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wp), new THREE.LineBasicMaterial({ color: ROPE, transparent: true, opacity: .22 })));

// -- the long rope trailing down into the fog --
world.add(rope(V(0, 3, -2), V(0, -40, -2), .06));

// -- camera path: closed loop through a wide shot + each work --
let cP, cT, nd = 4.4;
const N = items.length + 1;

function fit() {
  const w = innerWidth, h = innerHeight, a = w / h;
  R.setSize(w, h);
  cam.aspect = a;
  cam.updateProjectionMatrix();

  const ov = Math.max(17, 15 / (.93 * a));
  nd = Math.max(4.4, 2.7 / (.93 * a));
  scene.fog.near = ov * .9;
  scene.fog.far = ov * 2.6;

  const P = [V(0, .5, ov)], T = [V(0, 1.4, 0)];
  items.forEach(o => {
    P.push(V(o.x + .5, o.y + .2, o.z + nd));
    T.push(V(o.x, o.y, o.z));
  });
  cP = new THREE.CatmullRomCurve3(P, true);
  cT = new THREE.CatmullRomCurve3(T, true);
}
addEventListener('resize', fit);
fit();

// -- scroll / swipe / keyboard drive the camera's position along the loop --
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

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, .05);
  last = now;
  idle += dt;

  // gentle autoplay once idle, respecting reduced-motion
  if (!RM && started && idle > 3) target += dt * .012;
  cur += (target - cur) * Math.min(1, dt * 4);

  const s = ((cur % 1) + 1) % 1, i = Math.floor(s * N), f = s * N - i, e = sm(sm(f)), t = (i + e) / N;
  cam.position.copy(cP.getPoint(t));
  cam.lookAt(cT.getPoint(t));

  const T = now / 1000, A = RM ? .15 : 1;
  world.rotation.y = Math.sin(T * .15) * .03 * A;
  world.position.x = Math.sin(T * .11) * .15 * A;

  // sway intensifies for works the camera isn't currently close to (readability)
  items.forEach(o => {
    tmp.set(o.x, o.y, o.z);
    const d = cam.position.distanceTo(tmp);
    const k = .2 + .8 * Math.min(1, Math.max(0, (d - nd * 1.3) / 6));
    o.k += (k - o.k) * .05;
    o.g.rotation.z = Math.sin(T * o.sp + o.ph) * .05 * o.k * A;
    o.g.rotation.x = Math.sin(T * o.sp * .7 + o.ph * 2) * .03 * o.k * A;
    o.g.rotation.y = Math.sin(T * o.sp * .5 + o.ph) * .08 * o.k * A;
  });

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
