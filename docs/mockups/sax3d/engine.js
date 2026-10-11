// 3D-altsax: model, kleppen, camera en uit-elkaar-animatie. De pagina geeft een container en
// stuurt de sax aan via de API die createSax teruggeeft (zie onderaan).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { SHORT, AUTO, OPTIONAL } from "./data.js";

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createSax(stage, { onTap, dist = 14, target = [0.5, 0.15, 0] } = {}) {
const labelsEl = document.createElement("div");
labelsEl.className = "sax-labels";
labelsEl.style.cssText = "position:absolute;inset:0;pointer-events:none";
stage.append(labelsEl);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
stage.prepend(renderer.domElement);
const labelRenderer = new CSS2DRenderer({ element: labelsEl });

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-4, 6, -5);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xfff2dd, 1.1);
fill.position.set(5, 2, 5);
scene.add(fill);

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1;
controls.maxDistance = 20;
controls.zoomToCursor = true;
controls.autoRotateSpeed = 1.6;

// ---------- Materialen ----------
const brass = new THREE.MeshStandardMaterial({ color: 0xe6bd5c, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide });
const brassKey = new THREE.MeshStandardMaterial({ color: 0xeec96e, metalness: 0.9, roughness: 0.25 });
const pearlMat = new THREE.MeshStandardMaterial({ color: 0xf4eee2, metalness: 0.05, roughness: 0.18 });
const blackMat = new THREE.MeshStandardMaterial({ color: 0x18181d, metalness: 0.2, roughness: 0.35 });
const silverMat = new THREE.MeshStandardMaterial({ color: 0xd9dde3, metalness: 1, roughness: 0.2 });
const corkMat = new THREE.MeshStandardMaterial({ color: 0xb98a5a, roughness: 0.9 });
const reedMat = new THREE.MeshStandardMaterial({ color: 0xe6cf8f, roughness: 0.7 });
const feltMat = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.9 });
const pressedMat = new THREE.MeshStandardMaterial({ color: 0x2459c9, emissive: 0x1b46a8, emissiveIntensity: 0.45, metalness: 0.25, roughness: 0.3 });

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sax = new THREE.Group();
scene.add(sax);
// Losse onderdelen voor de uit-elkaar-animatie. Corpus met beker is `sax` zelf en blijft staan.
const neckPart = new THREE.Group(), mpPart = new THREE.Group();
sax.add(neckPart, mpPart);
const parts = [];

/** Buis met wisselende straal langs een reeks punten (parallel transport, dus geen knik in de naad). */
function taperedTube(pts, radii, radial = 48) {
  const n = pts.length, T = [], N = [], B = [];
  for (let i = 0; i < n; i++) T[i] = pts[Math.min(i + 1, n - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
  const up = Math.abs(T[0].y) < 0.9 ? V(0, 1, 0) : V(0, 0, 1);
  N[0] = up.clone().sub(T[0].clone().multiplyScalar(T[0].dot(up))).normalize();
  for (let i = 1; i < n; i++) {
    N[i] = N[i - 1].clone();
    const axis = new THREE.Vector3().crossVectors(T[i - 1], T[i]);
    const len = axis.length();
    if (len > 1e-6) N[i].applyAxisAngle(axis.normalize(), Math.asin(Math.min(1, len)));
  }
  for (let i = 0; i < n; i++) B[i] = new THREE.Vector3().crossVectors(T[i], N[i]);
  const pos = [], nor = [], idx = [];
  for (let i = 0; i < n; i++) for (let j = 0; j <= radial; j++) {
    const a = (j / radial) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const d = N[i].clone().multiplyScalar(c).add(B[i].clone().multiplyScalar(s));
    pos.push(...pts[i].clone().addScaledVector(d, radii[i]).toArray());
    nor.push(...d.toArray());
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
function rod(a, b, r = 0.012, mat = brassKey, parent = sax) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  parent.add(m);
  return m;
}
const ring = (x, y, r, t = 0.022) => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 12, 48), brassKey);
  m.position.set(x, y, 0); m.rotation.x = Math.PI / 2; sax.add(m);
};

// ---------- Corpus, bocht en beker ----------
// Speler staat aan +z (achterkant), publiek aan -z (voorkant met de parelkleppen). Beker zit rechts van de speler (+x).
const Y_TOP = 2.6, Y_BOW = -2.2, BOW_R = 0.6, BELL_X = 1.2, Y_BELL = -0.6;
const rBody = (y) => 0.13 + ((Y_TOP - y) / (Y_TOP - Y_BOW)) * 0.19;
{
  const pts = [], rs = [];
  for (let i = 0; i <= 60; i++) { const y = Y_TOP + (Y_BOW - Y_TOP) * (i / 60); pts.push(V(0, y, 0)); rs.push(rBody(y)); }
  for (let i = 1; i <= 40; i++) { const f = Math.PI + Math.PI * (i / 40); pts.push(V(BOW_R + BOW_R * Math.cos(f), Y_BOW + BOW_R * Math.sin(f), 0)); rs.push(0.32 + 0.1 * (i / 40)); }
  for (let i = 1; i <= 30; i++) { const y = Y_BOW + (Y_BELL - Y_BOW) * (i / 30); pts.push(V(BELL_X, y, 0)); rs.push(0.42 + 0.08 * (i / 30)); }
  sax.add(new THREE.Mesh(taperedTube(pts, rs), brass));

  const prof = [];
  for (let i = 0; i <= 40; i++) { const h = i / 40; prof.push(new THREE.Vector2(0.5 + 0.28 * Math.pow(h, 2.4), h * 0.95)); }
  const bell = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), brass);
  bell.position.set(BELL_X, Y_BELL, 0);
  sax.add(bell);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.035, 14, 80), brassKey);
  lip.position.set(BELL_X, Y_BELL + 0.95, 0); lip.rotation.x = Math.PI / 2; sax.add(lip);

  ring(0, Y_BOW + 0.02, 0.325, 0.03);
  ring(BELL_X, Y_BOW + 0.02, 0.425, 0.03);
  ring(BELL_X, Y_BELL - 0.25, 0.495);
  // Beschermkap onder de bocht
  const guard = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), brassKey);
  guard.position.set(BOW_R, Y_BOW - BOW_R - 0.33, 0); guard.scale.set(1.2, 0.35, 1.2); sax.add(guard);
  // Steun tussen corpus en beker
  rod(V(0.22, 0.15, 0), V(BELL_X - 0.75, 0.3, 0), 0.02);
  rod(V(0.3, -1.6, 0), V(BELL_X - 0.48, -1.6, 0), 0.02);
}

// ---------- Hals en mondstuk ----------
{
  // De hals buigt weg van de beker (zoals op elke saxfoto), een klein beetje naar de speler toe.
  const swing = (15 * Math.PI) / 180, N = (y, d) => V(-d * Math.cos(swing), y, d * Math.sin(swing));
  const curve = new THREE.CatmullRomCurve3([N(Y_TOP - 0.1, 0), N(2.95, 0.02), N(3.3, 0.2), N(3.42, 0.48), N(3.36, 0.76), N(3.2, 0.98)]);
  const pts = curve.getSpacedPoints(50), rs = pts.map((_, i) => 0.135 - 0.06 * (i / 50));
  neckPart.add(new THREE.Mesh(taperedTube(pts, rs, 32), brass));
  const rec = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.16, 32), brassKey);
  rec.position.set(0, Y_TOP - 0.02, 0); sax.add(rec);
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 12), brassKey);
  screw.position.set(0, Y_TOP, 0.2); screw.rotation.x = Math.PI / 2; sax.add(screw);
  // Octaafmechaniek op de hals
  const octRing = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.012, 8, 32), brassKey);
  octRing.position.copy(curve.getPoint(0.42)); octRing.quaternion.setFromUnitVectors(V(0, 0, 1), curve.getTangent(0.42)); neckPart.add(octRing);
  const pip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), brassKey);
  pip.position.copy(curve.getPoint(0.55)).add(V(0, 0.12, 0)); pip.scale.set(1.3, 0.6, 1.3); neckPart.add(pip);
  rod(curve.getPoint(0.42).add(V(0, 0.13, 0)), V(0, 2.75, -0.17), 0.012, brassKey, neckPart);

  const end = pts[pts.length - 1], dir = curve.getTangent(1);
  const mp = new THREE.Group();
  mp.position.copy(end); mp.quaternion.setFromUnitVectors(V(0, 0, 1), dir); mpPart.add(mp);
  const cyl = (r1, r2, len, z, mat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, 32), mat);
    m.rotation.x = Math.PI / 2; m.position.z = z; mp.add(m); return m;
  };
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.2, 32), corkMat);
  cork.position.copy(end); cork.quaternion.setFromUnitVectors(V(0, 1, 0), dir); neckPart.add(cork);
  cyl(0.1, 0.095, 0.36, 0.25, blackMat);
  const beak = cyl(0.095, 0.05, 0.22, 0.54, blackMat); beak.scale.set(1, 1, 0.75);
  cyl(0.103, 0.103, 0.09, 0.34, silverMat);
  cyl(0.103, 0.103, 0.06, 0.46, silverMat);
  const reed = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.5), reedMat);
  reed.position.set(0, -0.085, 0.4); mp.add(reed);

  // Hals schuift omhoog uit het corpus, het mondstuk daarna van de kurk af.
  const neckOff = V(-0.2, 1.1, 0);
  parts.push({ obj: neckPart, off: neckOff, from: 0, to: 0.65, name: "Hals", at: curve.getPoint(0.55).add(V(0, 0.35, 0)) });
  parts.push({ obj: mpPart, off: neckOff.clone().addScaledVector(dir, 1.1), from: 0.35, to: 1, name: "Mondstuk", at: end.clone().addScaledVector(dir, 0.35).add(V(0, 0.3, 0)) });
  parts.push({ obj: null, off: V(), from: 0, to: 1, name: "Corpus met beker", at: V(BELL_X + 0.95, -0.2, 0) });
}

// ---------- Kleppen ----------
/** Punt op de buitenkant van het corpus. th = hoek rond de buis: 0 = voorkant, + = bekerkant (rechts), 180 = achterkant. */
const normal = (th) => { const a = (th * Math.PI) / 180; return V(Math.sin(a), 0, -Math.cos(a)); };
const surface = (y, th, cx = 0, r = rBody(y)) => V(cx, y, 0).addScaledVector(normal(th), r);

const keys = {};
const pickables = [];
function addKey(id, { y, th, shape, w = 0.06, h = 0.16, cup = 0, out = 0.05, cx = 0, r, tilt = 0 }) {
  const n = normal(th);
  const base = surface(y, th, cx, r).addScaledVector(n, out);
  const g = new THREE.Group();
  g.position.copy(base);
  g.quaternion.setFromUnitVectors(V(0, 0, 1), n);
  g.rotateZ(tilt);
  sax.add(g);
  const hl = [];
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, out, 8), brassKey);
  post.rotation.x = Math.PI / 2; post.position.z = -out / 2; g.add(post);
  if (cup) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(cup, cup, 0.045, 36), brassKey);
    c.rotation.x = Math.PI / 2; g.add(c); hl.push(c);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(cup * 0.92, cup * 0.92, 0.02, 32), feltMat);
    pad.rotation.x = Math.PI / 2; pad.position.z = -0.03; g.add(pad);
  }
  let touch;
  if (shape === "pearl") {
    touch = new THREE.Mesh(new THREE.SphereGeometry(w, 24, 16), pearlMat);
    touch.scale.z = 0.55; touch.position.z = cup ? 0.03 : 0;
  } else if (shape === "paddle") {
    touch = new THREE.Mesh(new THREE.CapsuleGeometry(w, h, 8, 20), pearlMat);
    touch.scale.z = 0.4;
  } else {
    // Pinkklep: platte, ovale spatel
    touch = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), brassKey);
    touch.scale.set(w, h, 0.03);
  }
  g.add(touch); hl.push(touch);
  for (const m of hl) { m.userData.base = m.material; m.userData.keyId = id; pickables.push(m); }

  const el = document.createElement("div");
  el.className = "label"; el.textContent = SHORT[id] ?? id;
  const label = new CSS2DObject(el);
  label.position.set(0, 0, 0.28);
  g.add(label);
  keys[id] = { g, base, n, hl, label, el, press: 0, target: 0 };
}

/** Toongat met dekselklep die niet apart te bedienen is (voor het echte uiterlijk). */
function deco(y, th, cup, { cx = 0, r } = {}) {
  const n = normal(th);
  const p = surface(y, th, cx, r);
  const ch = new THREE.Mesh(new THREE.CylinderGeometry(cup * 0.85, cup * 0.85, 0.05, 28), brass);
  ch.position.copy(p).addScaledVector(n, 0.01); ch.quaternion.setFromUnitVectors(V(0, 1, 0), n); sax.add(ch);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(cup, cup * 0.96, 0.04, 32), brassKey);
  c.position.copy(p).addScaledVector(n, 0.06); c.quaternion.setFromUnitVectors(V(0, 1, 0), n); sax.add(c);
  return c.position.clone();
}

// Linkerhand-stapel (voor), met bis tussen 1 en 2
addKey("L1", { y: 1.55, th: 0, shape: "pearl", cup: 0.115, w: 0.058 });
addKey("bis", { y: 1.36, th: 0, shape: "pearl", w: 0.035, out: 0.04 });
addKey("L2", { y: 1.15, th: 0, shape: "pearl", cup: 0.125, w: 0.058 });
addKey("L3", { y: 0.75, th: 0, shape: "pearl", cup: 0.135, w: 0.058 });
// Rechterhand-stapel
addKey("R4", { y: -0.35, th: 0, shape: "pearl", cup: 0.16, w: 0.06 });
addKey("R5", { y: -0.78, th: 0, shape: "pearl", cup: 0.17, w: 0.06 });
addKey("R6", { y: -1.2, th: 0, shape: "pearl", cup: 0.18, w: 0.06 });
// Voorste F, handpalmkleppen (links), zijkleppen (rechts)
addKey("fF", { y: 1.88, th: 18, shape: "paddle", w: 0.04, h: 0.08, out: 0.06, tilt: 0.3 });
addKey("pD", { y: 2.3, th: -78, shape: "paddle", w: 0.045, h: 0.16 });
addKey("pEb", { y: 2.06, th: -62, shape: "paddle", w: 0.045, h: 0.16 });
addKey("pF", { y: 1.84, th: -82, shape: "paddle", w: 0.045, h: 0.16 });
addKey("sE", { y: 0.05, th: 78, shape: "paddle", w: 0.04, h: 0.13 });
addKey("sC", { y: -0.17, th: 78, shape: "paddle", w: 0.04, h: 0.13 });
addKey("sBb", { y: -0.39, th: 78, shape: "paddle", w: 0.04, h: 0.13 });
// Pinktafel links: G♯ en de lage kleppen
addKey("gs", { y: 0.46, th: -38, shape: "spatula", w: 0.1, h: 0.06, out: 0.07, tilt: 0.25 });
addKey("cs", { y: 0.34, th: -58, shape: "spatula", w: 0.07, h: 0.055, out: 0.07 });
addKey("lb", { y: 0.3, th: -32, shape: "spatula", w: 0.08, h: 0.055, out: 0.07, tilt: -0.2 });
addKey("lbb", { y: 0.2, th: -52, shape: "spatula", w: 0.09, h: 0.055, out: 0.07 });
// Pinkkleppen rechts
addKey("eb", { y: -1.5, th: 34, shape: "spatula", w: 0.12, h: 0.07, out: 0.08, tilt: -0.35 });
addKey("lc", { y: -1.66, th: 30, shape: "spatula", w: 0.12, h: 0.07, out: 0.08, tilt: -0.35 });
// Octaafklep met de linkerduim (achter) + duimsteunen
addKey("oct", { y: 1.62, th: 172, shape: "paddle", w: 0.05, h: 0.12, out: 0.06, tilt: 0.5 });
{
  const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 28), blackMat);
  thumb.position.copy(surface(1.38, 180)).add(V(0, 0, 0.05)); thumb.rotation.x = Math.PI / 2; sax.add(thumb);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 10, 24, Math.PI), brassKey);
  hook.position.copy(surface(-0.75, 180)).add(V(0, 0, 0.06)); hook.rotation.set(0, Math.PI / 2, Math.PI / 2); sax.add(hook);
}

// Toongaten die met de grepen meegaan, aan de zijkanten en op beker/bocht
const decoTops = [];
for (const [y, th, c] of [[2.15, -25, 0.07], [1.95, 35, 0.075], [1.42, 42, 0.09], [0.98, 45, 0.1], [0.58, -55, 0.11],
  [0.25, 48, 0.12], [-0.05, -42, 0.13], [-0.55, 50, 0.14], [-1.0, 48, 0.15], [-1.45, -30, 0.17], [-1.85, 18, 0.19]]) decoTops.push(deco(y, th, c));
deco(-1.75, -35, 0.2, { cx: BELL_X, r: 0.46 });
deco(-1.25, -40, 0.21, { cx: BELL_X, r: 0.475 });
deco(-0.85, -150, 0.21, { cx: BELL_X, r: 0.49 });
deco(-2.0, 30, 0.19, { cx: BELL_X, r: 0.44 });
// Asstangen langs de stapels
rod(surface(1.9, 30, 0, rBody(1.9) + 0.07), surface(0.6, 30, 0, rBody(0.6) + 0.07));
rod(surface(-0.1, 28, 0, rBody(-0.1) + 0.08), surface(-1.6, 28, 0, rBody(-1.6) + 0.08));
rod(surface(2.2, -40, 0, rBody(2.2) + 0.07), surface(0.35, -40, 0, rBody(0.35) + 0.07));
rod(surface(0.3, 62, 0, rBody(0.3) + 0.08), surface(-0.6, 62, 0, rBody(-0.6) + 0.08));

// Schaduw op de vloer
{
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"), gr = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, "rgba(0,0,0,.35)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(0.6, -3.25, 0); scene.add(m);
}

// ---------- Camera ----------
const TARGET = V(...target);
const DIST = dist;
const VIEWS = {
  front: V(0.3, 0.12, -1), back: V(-0.15, 0.12, 1), left: V(-1, 0.1, -0.12), right: V(1, 0.1, -0.12), top: V(0.05, 1, -0.35),
};
camera.position.copy(TARGET).addScaledVector(VIEWS.front.clone().normalize(), DIST);
controls.target.copy(TARGET);

let fly = null;
function flyTo(pos, target, ms = 650) {
  fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), ms };
}
let explode = 0, explodeTarget = 0;
// Uit elkaar staan de delen hoger, dus dan kijkt de camera iets hoger en van verder weg.
const framing = () => (explodeTarget ? { t: V(0.1, 0.8, 0), d: DIST * 1.2 } : { t: TARGET.clone(), d: DIST });
// ---------- Uit elkaar ----------
const partLabels = parts.map((pt) => {
  const el = document.createElement("div");
  el.className = "label part"; el.textContent = pt.name;
  const l = new CSS2DObject(el);
  l.position.copy(pt.at);
  (pt.obj ?? sax).add(l);
  l.visible = false;
  return l;
});
function updateExplode(dt) {
  const step = dt / 1.4;
  explode = explodeTarget > explode ? Math.min(explodeTarget, explode + step) : Math.max(explodeTarget, explode - step);
  for (const pt of parts) {
    if (!pt.obj) continue;
    const local = THREE.MathUtils.clamp((explode - pt.from) / (pt.to - pt.from), 0, 1);
    pt.obj.position.copy(pt.off).multiplyScalar(ease(local));
  }
  const showParts = explode > 0.6;
  partLabels.forEach((l) => (l.visible = showParts));
  // Klepnummers even weg terwijl de delen los zijn, anders wordt het te druk
  for (const k of Object.values(keys)) k.el.style.opacity = String(1 - Math.min(1, explode * 2));
}
const zoomBy = (f) => {
  const off = camera.position.clone().sub(controls.target);
  const d = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance);
  flyTo(controls.target.clone().add(off.setLength(d)), controls.target.clone(), 300);
};
// ---------- Kiezen en aantikken ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(pickables.filter((m) => keys[m.userData.keyId].g.visible), false)[0]?.object.userData.keyId;
}
let down = null, lastTap = { t: 0, id: null };
renderer.domElement.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  const id = pick(e);
  const now = performance.now();
  if (id && lastTap.id === id && now - lastTap.t < 350) focusKey(id);
  lastTap = { t: now, id };
  if (id) flash(id);
  onTap?.(id);
});
renderer.domElement.addEventListener("dblclick", (e) => { const id = pick(e); if (id) focusKey(id); });

function focusKey(id) {
  const k = keys[id];
  const p = k.g.getWorldPosition(new THREE.Vector3());
  flyTo(p.clone().addScaledVector(k.n, 1.6).add(V(0, 0.25, 0)), p, 700);
}

function flash(id) {
  for (const k of Object.values(keys)) k.flash = 0;
  keys[id].flash = 1;
}
let needed = new Set(), showAll = false, pressed = new Set();
function updateKeys() {
  for (const [id, k] of Object.entries(keys)) {
    const on = pressed.has(id);
    k.target = on ? 1 : 0;
    k.g.visible = on || showAll || (OPTIONAL.has(id) ? false : AUTO.has(id) ? needed.has(id) : true);
    // Basiskleppen houden hun nummer, zoals in de 2D-tekening; extra kleppen alleen als je ze indrukt.
    k.label.visible = on || (k.g.visible && !AUTO.has(id) && !OPTIONAL.has(id));
    k.el.classList.toggle("idle", !on);
  }
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h); labelRenderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (fly) {
    const t = Math.min(1, (performance.now() - fly.start) / fly.ms), e = ease(t);
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (t === 1) fly = null;
  }
  for (const k of Object.values(keys)) {
    k.press += (k.target - k.press) * Math.min(1, dt * 14);
    k.g.position.copy(k.base).addScaledVector(k.n, -0.035 * k.press);
    if (k.flash) k.flash = Math.max(0, k.flash - dt * 0.8);
    const blink = k.flash > 0 && Math.sin(k.flash * 18) > 0;
    for (const m of k.hl) m.material = k.press > 0.5 || blink ? pressedMat : m.userData.base;
  }
  updateExplode(dt);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});

return {
  /** pressed: klep-ids van de greep; needed: kleppen die eigen noten gebruiken; showAll: alle kleppen tonen */
  setFingering(ids) { pressed = new Set(ids); updateKeys(); },
  setNeeded(ids) { needed = new Set(ids); updateKeys(); },
  setShowAll(v) { showAll = v; updateKeys(); },
  view(name) {
    const { t, d } = framing();
    flyTo(t.clone().addScaledVector(VIEWS[name].clone().normalize(), d), t);
  },
  zoom(f) { zoomBy(f); },
  toggleSpin() { controls.autoRotate = !controls.autoRotate; return controls.autoRotate; },
  toggleExplode() {
    explodeTarget = explodeTarget ? 0 : 1;
    const dirCam = camera.position.clone().sub(controls.target).normalize();
    const { t, d } = framing();
    flyTo(t.clone().addScaledVector(dirCam, d), t, 900);
    return explodeTarget === 1;
  },
  focusKey,
  flash,
};
}
