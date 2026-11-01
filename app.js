/* =====================================================================
   SWITCHWORKS — one continuous shot, two real CC0 models

   switch.glb   13 named parts: compression spring, two copper contact
                leaves, cross stem, solder pins, housings. 15.6 x 17.5 mm.
   keyboard.glb 154 parts: 61 keycaps, 61 switches, plate, PCB, case.
                296 x 110 mm.

   MOTION RULE: no phases that start and stop. ONE master curve drives
   everything. Every part has a delay from its type AND its distance to
   the centre, with long overlapping windows, so something is always in
   flight — the screen never settles between "steps". The camera runs a
   single continuous arc from macro to overview, never a cut.

   TIMELINE (p = 0..1)
     0.00  macro: hero switch hangs apart, slowly turning
     0.14  its parts begin sliding together, staggered
     0.34  camera starts the long pull-back; hero shrinks and fades
     0.34+ board wave: case -> pcb -> plate -> switches -> caps,
           each rippled outward by radius
     1.00  home, board flat, keys typing
   ===================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ---------------------------------------------------------------- setup */
const canvas = document.querySelector('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0c);

const camera = new THREE.PerspectiveCamera(32, innerWidth/innerHeight, .004, 20);
scene.add(camera);

/* ---------------------------------------------------------------- light */
scene.add(new THREE.AmbientLight(0xffffff, .5));

const key = new THREE.DirectionalLight(0xfff4e8, 2.9);
key.position.set(.45, .85, .5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = .02; key.shadow.camera.far = 4;
key.shadow.camera.left = -.45; key.shadow.camera.right = .45;
key.shadow.camera.top = .45;   key.shadow.camera.bottom = -.45;
key.shadow.bias = -0.0009;
scene.add(key);

const fill = new THREE.DirectionalLight(0x8fb4ff, .9);
fill.position.set(-.5, .4, -.45);
scene.add(fill);

const rim = new THREE.PointLight(0xff4d2e, 2.2, 1.2, 2);
scene.add(rim);

/* ------------------------------------------------------------- easing */
const lerp  = (a,b,t) => a + (b-a) * t;
const clamp = (v,a=0,b=1) => Math.min(b, Math.max(a, v));
const smooth = t => t*t*(3 - 2*t);
const easeInOut = t => t<.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
const easeOut = t => 1 - Math.pow(1-t, 3);
const overshoot = t => {                       // lands with weight, no bounce steps
  const c = 1.70158, c3 = c + 1;
  return 1 + c3*Math.pow(t-1,3) + c*Math.pow(t-1,2);
};

/* --------------------------------------------------------- the one curve */
let targetP = 0, p = 0;
let introPlaying = true, introT = 0;
const INTRO_DUR = 11.0;
let wheelEnabled = false;

addEventListener('wheel', e => {
  if (!wheelEnabled) return;
  e.preventDefault();
  targetP = clamp(targetP - e.deltaY / 3200);
}, { passive:false });

let touchY = null;
addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive:true });
addEventListener('touchmove', e => {
  if (!wheelEnabled || touchY === null) return;
  const dy = e.touches[0].clientY - touchY;
  touchY = e.touches[0].clientY;
  targetP = clamp(targetP + dy / 1100);
}, { passive:true });

/* ------------------------------------------------------------ drag orbit */
let dragA = 0, dragT = 0, dragging = false, lastX = 0;
canvas.addEventListener('pointerdown', e => {
  dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (dragging) { dragT += (e.clientX - lastX) * .006; lastX = e.clientX; }
});
canvas.addEventListener('pointerup',     () => dragging = false);
canvas.addEventListener('pointercancel', () => dragging = false);

/* --------------------------------------------------------------- UI bind */
const panels    = [...document.querySelectorAll('.panel')];
const railFill  = document.querySelector('#rail-fill');
const railSteps = [...document.querySelectorAll('.rail__steps li')];
const hint      = document.querySelector('#hint');
const hdrMeta   = document.querySelector('#hdr-meta');
const META = ['13 PARTS · 15.6 MM','45 G LINEAR · 2 MM TRAVEL','61 SWITCHES SEATING',
              'PBT DOUBLESHOT · CHERRY','ALUMINIUM · GASKET MOUNT'];
let metaIdx = -1;

function updateUI() {
  panels.forEach(el => {
    const f = +el.dataset.from, t = +el.dataset.to;
    const fade = (t - f) * .3;
    const a = f <= 0 ? 1 : clamp((p - f) / fade);
    const b = t >= 1 ? 1 : clamp((t - p) / fade);
    el.style.opacity = Math.min(a, b);
    el.style.transform = `translateY(${(p - (f + t) / 2) * -60}px)`;
  });
  railFill.style.height = (p * 100) + '%';
  const s = Math.min(4, Math.floor(p * 5));
  railSteps.forEach((li, i) => li.classList.toggle('on', i === s));
  if (s !== metaIdx) { metaIdx = s; hdrMeta.textContent = META[s]; }
}

/* ------------------------------------------------------------ containers */
const hero = new THREE.Group();
const rack = new THREE.Group();
scene.add(hero, rack);

const heroParts = [];
const boardParts = [];
let boardReady = false, heroReady = false;
let boardSize = new THREE.Vector3(.3,.1,.11);

function boardRole(name) {
  if (/^Keycap/i.test(name))                   return 'cap';
  if (/^Switch mounting plate/i.test(name))    return 'plate';
  if (/^Switch /i.test(name))                  return 'switch';
  if (/Printed circuit substrate/i.test(name)) return 'pcb';
  if (/^USB/i.test(name))                      return 'usb';
  if (/^Cylinder/i.test(name))                 return 'screw';
  return 'case';
}
const ROLE_DELAY = { case:.00, pcb:.06, usb:.09, plate:.13, screw:.17,
                     switch:.22, cap:.38 };

/* ----------------------------------------------------------------- scene */
function updateScene(t) {

  if (heroReady) {
    heroParts.forEach((o, i) => {
      const local = clamp((p - (.14 + o.delay * .16)) / .26);
      const e = smooth(local);
      o.mesh.position.set(
        lerp(o.home.x + o.dir.x, o.home.x, e),
        lerp(o.home.y + o.dir.y, o.home.y, e),
        lerp(o.home.z + o.dir.z, o.home.z, e),
      );
      o.mesh.rotation.y = lerp(o.spin, 0, e);
      o.mesh.rotation.x = lerp(o.spin * .4, 0, e);
      if (local < 1) o.mesh.position.y += Math.sin(t * 1.1 + i * .7) * (1 - e) * .0012;
    });

    hero.rotation.y = t * .34 * (1 - smooth(clamp((p - .2) / .3))) + smooth(p) * .5;

    const vanish = smooth(clamp((p - .40) / .20));
    hero.scale.setScalar(lerp(4.2, .9, vanish));
    hero.position.y = lerp(.055, .004, vanish);
    hero.visible = vanish < .995;
    heroParts.forEach(o => {
      o.mesh.material.transparent = vanish > .01;
      o.mesh.material.opacity = 1 - vanish;
    });
  }

  if (boardReady) {
    const asm = clamp((p - .34) / .66);
    boardParts.forEach((o, i) => {
      const local = clamp((asm - o.delay) / o.dur);
      const e = (o.role === 'cap' || o.role === 'switch') ? overshoot(local) : smooth(local);
      o.mesh.position.set(
        lerp(o.home.x + o.spreadX, o.home.x, easeOut(local)),
        lerp(o.home.y + o.lift,    o.home.y, e),
        lerp(o.home.z + o.spreadZ, o.home.z, easeOut(local)),
      );
      o.mesh.rotation.y = lerp(o.spin, 0, easeOut(local));
      if (o.role === 'cap') o.mesh.rotation.x = lerp(.45, 0, easeOut(local));
      if (local <= 0.001) {
        o.mesh.position.y += Math.sin(t * .85 + i * .21) * .0035;
        o.mesh.position.x += Math.cos(t * .6  + i * .17) * .0015;
      }
    });

    const tip = easeInOut(clamp((p - .3) / .7));
    rack.rotation.x = lerp(-.16, 0, tip);
    rack.rotation.z = lerp(.035, 0, tip);
    rack.visible = p > .33;

    if (p > .95) {
      boardParts.forEach(o => {
        if (o.role !== 'cap') return;
        o.nextPress -= .016;
        if (o.nextPress <= 0) { o.press = 1; o.nextPress = 1.5 + Math.random() * 6; }
        o.press = Math.max(0, o.press - .075);
        o.mesh.position.y = o.home.y - o.press * .0022;
      });
    }
  }

  rim.position.set(Math.sin(t * .5) * .12, .06, Math.cos(t * .5) * .12);
  rim.intensity = lerp(2.6, .9, smooth(p));
}

/* ---------------------------------------------------------------- camera */
const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
const shiftX = () => innerWidth > 860 ? -.052 : 0;

function updateCamera(t) {
  const e = easeInOut(p);
  const a = -.62 + e * .92 + Math.sin(t * .07) * .035 + dragA;
  const r = lerp(.38, .82, Math.pow(e, .78));
  const h = lerp(.055, .34, Math.pow(e, .9));
  camPos.set(Math.sin(a) * r, h, Math.cos(a) * r);
  camTgt.set(lerp(.012, shiftX(), e), lerp(.038, .004, e), 0);
  camera.position.lerp(camPos, .075);
  camera.lookAt(camTgt);
}

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();
let elapsed = 0, firstFrame = true;

function frame() {
  let dt = clock.getDelta();
  if (firstFrame) { dt = 0; firstFrame = false; }   // first delta = load time
  dt = Math.min(.05, dt);
  elapsed += dt;
  const t = elapsed;

  if (introPlaying) {
    introT += dt;
    const k = clamp(introT / INTRO_DUR);
    p = targetP = easeInOut(k);
    if (k >= 1) {
      introPlaying = false; wheelEnabled = true;
      hint.classList.add('on');
      setTimeout(() => hint.classList.remove('on'), 4500);
    }
  } else {
    p += (targetP - p) * .075;
  }

  dragA += (dragT - dragA) * .09;
  updateScene(t);
  updateCamera(t);
  updateUI();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}, { passive:true });

/* ------------------------------------------------------------------ load */
const loaderEl = document.querySelector('#loader');
const fillEl   = document.querySelector('#loader-fill');
const txtEl    = document.querySelector('#loader-txt');
const loader   = new GLTFLoader();
let done = 0;

function maybeStart() {
  if (++done < 2) { fillEl.style.width = '55%'; return; }
  fillEl.style.width = '100%';
  txtEl.textContent = `${heroParts.length} SWITCH PARTS · ${boardParts.length} BOARD PARTS`;
  renderer.render(scene, camera);
  setTimeout(() => { loaderEl.classList.add('gone'); clock.start(); frame(); }, 400);
}

loader.load('switch.glb', g => {
  const m = g.scene;
  const box = new THREE.Box3().setFromObject(m);
  m.position.sub(box.getCenter(new THREE.Vector3()));
  hero.add(m);
  hero.scale.setScalar(4.2);
  hero.position.y = .055;

  m.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.material = o.material.clone();
    const home = o.position.clone();
    const n = o.name.toLowerCase();
    let dir, spin = (Math.random() - .5) * 1.2, delay = Math.random();

    if (n.includes('cross stem') || n.includes('slider shoulder'))
      { dir = new THREE.Vector3(0, .022, 0); delay = 0; }
    else if (n.includes('spring guide'))
      { dir = new THREE.Vector3(0, .015, 0); delay = .25; }
    else if (n.includes('spring'))
      { dir = new THREE.Vector3(0, .008, 0); delay = .45; }
    else if (n.includes('contact leaf'))
      { dir = new THREE.Vector3(Math.sign(home.x||1)*.014, .002, 0); delay = .6; }
    else if (n.includes('upper housing') || n.includes('switch wall'))
      { dir = new THREE.Vector3(Math.sign(home.x||1)*.016, .010, Math.sign(home.z||1)*.010); delay = .35; }
    else if (n.includes('solder pin'))
      { dir = new THREE.Vector3(0, -.016, 0); delay = .7; }
    else
      { dir = new THREE.Vector3(0, -.012, 0); delay = .8; }

    heroParts.push({ mesh:o, home, dir, spin, delay });
  });
  heroReady = true;
  maybeStart();
}, undefined, e => { txtEl.textContent = 'SWITCH MODEL FAILED'; console.error(e); });

loader.load('keyboard.glb', g => {
  const m = g.scene;
  const box = new THREE.Box3().setFromObject(m);
  boardSize = box.getSize(new THREE.Vector3());
  m.position.sub(box.getCenter(new THREE.Vector3()));
  rack.add(m);

  const half = Math.max(boardSize.x, boardSize.z) / 2;
  m.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const home = o.position.clone();
    const role = boardRole(o.name);
    const radial = Math.min(1, Math.hypot(home.x, home.z) / half);

    const rec = { mesh:o, home, role,
                  delay: ROLE_DELAY[role] + radial * .17,
                  dur: role === 'cap' ? .34 : .30,
                  lift:0, spreadX:0, spreadZ:0, spin:0,
                  press:0, nextPress: 1 + Math.random() * 5 };

    if (role === 'cap')         { rec.lift = .085 + Math.random() * .03;
                                  rec.spreadX = home.x * .13; rec.spreadZ = home.z * .13;
                                  rec.spin = (Math.random() - .5) * 1.8; }
    else if (role === 'switch') { rec.lift = .046 + Math.random() * .014;
                                  rec.spreadX = home.x * .06; rec.spreadZ = home.z * .06;
                                  rec.spin = (Math.random() - .5) * .9; }
    else if (role === 'plate')  { rec.lift = .024; }
    else if (role === 'pcb')    { rec.lift = -.028; }
    else if (role === 'usb')    { rec.lift = -.034; rec.spreadZ = -.024; }
    else if (role === 'screw')  { rec.lift = -.048; rec.spin = 8; }
    else                        { rec.lift = -.060;
                                  rec.spreadX = Math.sign(home.x || 1) * .05;
                                  rec.spreadZ = Math.sign(home.z || 1) * .035; }

    boardParts.push(rec);
  });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
                               new THREE.ShadowMaterial({ opacity:.42 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -boardSize.y / 2 - .105;
  floor.receiveShadow = true;
  scene.add(floor);

  boardReady = true;
  maybeStart();
}, undefined, e => { txtEl.textContent = 'KEYBOARD MODEL FAILED'; console.error(e); });
