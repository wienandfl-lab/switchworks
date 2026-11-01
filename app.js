/* =====================================================================
   SWITCHWORKS — 60% keyboard, real CC0 geometry
   Model: "60% mechanical keyboard - with case" (Innerscene, CC0)
          154 meshes: 61 keycaps, 61 switches, plate, PCB, case, USB-C.

   How it runs (this is the part that changed):
     - NO scroll spacer. The page never scrolls.
     - On load, the intro animation plays ITSELF from p=0 to p=1 over ~7 s.
     - After it finishes, the wheel scrubs the same timeline both ways.
     - Drag orbits at any time; it never fights the timeline.

   Timeline (p = 0..1, fully exploded -> fully assembled)
     0.00-0.20  ASSEMBLE  everything apart, slow drift
     0.20-0.40  CAPS      keycaps fly down onto the stems
     0.40-0.60  SWITCHES  switches seat into the plate
     0.60-0.80  PCB       plate + PCB + USB stack up
     0.80-1.00  CASE      case walls close, board settles flat
   ===================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ---------------------------------------------------------------- setup */
const canvas = document.querySelector('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0c);

const camera = new THREE.PerspectiveCamera(34, innerWidth/innerHeight, .01, 20);
scene.add(camera);

/* ---------------------------------------------------------------- light */
scene.add(new THREE.AmbientLight(0xffffff, .55));

const key = new THREE.DirectionalLight(0xfff4e8, 2.8);
key.position.set(.45, .8, .5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = .05; key.shadow.camera.far = 4;
key.shadow.camera.left = -.5; key.shadow.camera.right = .5;
key.shadow.camera.top = .5;   key.shadow.camera.bottom = -.5;
key.shadow.bias = -0.0008;
scene.add(key);

const fill = new THREE.DirectionalLight(0x8fb4ff, .85);
fill.position.set(-.5, .35, -.4);
scene.add(fill);

const rim = new THREE.PointLight(0xff4d2e, 1.6, 2.5, 2);
rim.position.set(-.22, .12, .22);
scene.add(rim);

/* ------------------------------------------------------------- helpers */
const lerp  = (a,b,t) => a + (b-a) * t;
const clamp = (v,a=0,b=1) => Math.min(b, Math.max(a, v));
const seg   = (p,f,t) => clamp((p - f) / (t - f));
const ease  = t => t<.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
const easeOut = t => 1 - Math.pow(1-t, 3);
const bounce = t => {
  const n = 7.5625, d = 2.75;
  if (t < 1/d)   return n*t*t;
  if (t < 2/d)   return n*(t-=1.5/d)*t + .75;
  if (t < 2.5/d) return n*(t-=2.25/d)*t + .9375;
  return n*(t-=2.625/d)*t + .984375;
};

/* --------------------------------------------------------- model parts */
// Filled by the loader: each entry keeps the mesh plus its HOME transform,
// so every phase is a lerp from an exploded offset back to home.
const parts = { caps:[], switches:[], plate:[], pcb:[], usb:[], case:[], screws:[] };
let board = null, boardBox = null, boardSize = null;

function classify(name) {
  if (/^Keycap/i.test(name))                    return 'caps';
  if (/^Switch mounting plate/i.test(name))     return 'plate';
  if (/^Switch /i.test(name))                   return 'switches';
  if (/Printed circuit substrate/i.test(name))  return 'pcb';
  if (/^USB/i.test(name))                       return 'usb';
  if (/^Cylinder/i.test(name))                  return 'screws';
  return 'case';                                 // walls, closed lower case
}

/* ------------------------------------------------------------- timeline */
let targetP = 0, p = 0;
let introPlaying = true, introT = 0;
const INTRO_DUR = 7.0;          // seconds for the self-playing assembly
let wheelEnabled = false;

addEventListener('wheel', e => {
  if (!wheelEnabled) return;
  e.preventDefault();
  // one notch ~ 100px; 2600px of wheel covers the whole timeline
  targetP = clamp(targetP - e.deltaY / 2600);
}, { passive:false });

// touch: vertical drag scrubs the timeline
let touchY = null;
addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive:true });
addEventListener('touchmove', e => {
  if (!wheelEnabled || touchY === null) return;
  const dy = e.touches[0].clientY - touchY;
  touchY = e.touches[0].clientY;
  targetP = clamp(targetP + dy / 900);
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
const META = ['150 PARTS · CC0 MODEL','PBT DOUBLESHOT · CHERRY PROFILE',
              '61 SWITCHES · HOT-SWAP','FR4 · 1000 HZ POLL','ALUMINIUM · GASKET MOUNT'];
let metaIdx = -1;

function updateUI() {
  panels.forEach(el => {
    const f = +el.dataset.from, t = +el.dataset.to;
    // fade INSIDE the panel's own range so neighbours never both show
    const fade = (t - f) * .22;
    // the first and last panel must not fade at the timeline's own ends
    const a = f <= 0 ? 1 : clamp((p - f) / fade);
    const b = t >= 1 ? 1 : clamp((t - p) / fade);
    el.style.opacity = Math.min(a, b);
    el.style.transform = `translateY(${(p - (f + t) / 2) * -70}px)`;
  });
  railFill.style.height = (p * 100) + '%';
  const s = Math.min(4, Math.floor(p * 5));
  railSteps.forEach((li, i) => li.classList.toggle('on', i === s));
  if (s !== metaIdx) { metaIdx = s; hdrMeta.textContent = META[s]; }
}

/* ---------------------------------------------------------------- camera */
const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
const shift = () => innerWidth > 860 ? -.055 : 0;  // aim left so board sits right

function updateCamera(t) {
  const sh = shift();
  // one continuous arc: high and wide while exploded, low and close when built
  const a  = -.5 + ease(p) * .75 + Math.sin(t * .08) * .04 + dragA;
  const r  = lerp(.92, .74, ease(p));
  const h  = lerp(.38, .26, ease(p));
  camPos.set(Math.sin(a) * r, h, Math.cos(a) * r);
  camTgt.set(sh, lerp(.02, 0, p), 0);
  camera.position.lerp(camPos, .07);
  camera.lookAt(camTgt);
}

/* ----------------------------------------------------------------- scene */
function updateScene(t) {
  if (!board) return;
  const drift = introPlaying ? 1 : 1;    // ambient float while apart

  /* --- keycaps: fly down between .20 and .40 --- */
  const capP = seg(p, .20, .40);
  parts.caps.forEach((o, i) => {
    const local = clamp((capP - o.delay) / .6);
    const e = bounce(local);
    o.mesh.position.y = o.home.y + lerp(o.lift, 0, e);
    o.mesh.position.x = o.home.x + lerp(o.spreadX, 0, easeOut(local));
    o.mesh.position.z = o.home.z + lerp(o.spreadZ, 0, easeOut(local));
    o.mesh.rotation.y = lerp(o.spin, 0, easeOut(local));
    o.mesh.rotation.x = lerp(.5, 0, easeOut(local));
    // while fully apart they bob gently so the scene is never static
    if (local <= 0) o.mesh.position.y += Math.sin(t * .9 + i * .3) * .004 * drift;
    o.mesh.visible = true;
  });

  /* --- switches: seat into the plate between .40 and .60 --- */
  const swP = seg(p, .40, .60);
  parts.switches.forEach((o, i) => {
    const local = clamp((swP - o.delay) / .6);
    const e = bounce(local);
    o.mesh.position.y = o.home.y + lerp(o.lift, 0, e);
    o.mesh.position.x = o.home.x + lerp(o.spreadX, 0, easeOut(local));
    o.mesh.position.z = o.home.z + lerp(o.spreadZ, 0, easeOut(local));
    o.mesh.rotation.y = lerp(o.spin, 0, easeOut(local));
    if (local <= 0) o.mesh.position.y += Math.sin(t * .8 + i * .25) * .003 * drift;
  });

  /* --- plate, pcb, usb: stack between .60 and .80 --- */
  const stackP = ease(seg(p, .60, .80));
  parts.plate.forEach(o => { o.mesh.position.y = o.home.y + lerp(o.lift, 0, stackP); });
  parts.pcb.forEach(o   => { o.mesh.position.y = o.home.y + lerp(o.lift, 0, stackP); });
  parts.usb.forEach(o   => {
    o.mesh.position.y = o.home.y + lerp(o.lift, 0, stackP);
    o.mesh.position.z = o.home.z + lerp(o.spreadZ, 0, stackP);
  });
  parts.screws.forEach(o => {
    const sp = ease(seg(p, .78, .95));
    o.mesh.position.y = o.home.y + lerp(o.lift, 0, sp);
    o.mesh.rotation.y = lerp(o.spin, 0, sp);     // they screw themselves in
  });

  /* --- case: closes last, walls sliding in from the sides --- */
  const caseP = ease(seg(p, .78, 1));
  parts.case.forEach(o => {
    o.mesh.position.x = o.home.x + lerp(o.spreadX, 0, caseP);
    o.mesh.position.y = o.home.y + lerp(o.lift, 0, caseP);
    o.mesh.position.z = o.home.z + lerp(o.spreadZ, 0, caseP);
  });

  /* --- the whole board tips flat as it comes together --- */
  board.rotation.x = lerp(-.30, 0, ease(p));
  board.rotation.z = lerp(.06, 0, ease(p));

  /* --- when fully assembled, a few keys type themselves --- */
  if (p > .96) {
    parts.caps.forEach(o => {
      o.nextPress -= .016;
      if (o.nextPress <= 0) { o.press = 1; o.nextPress = 2 + Math.random() * 7; }
      o.press = Math.max(0, o.press - .07);
      o.mesh.position.y = o.home.y - o.press * .0022;
    });
  }

  rim.intensity = lerp(2.2, 1.0, p);
}

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();
let elapsed = 0;
let firstFrame = true;
function frame() {
  // read the delta ONCE: getElapsedTime() also consumes it, which would
  // leave getDelta() at ~0 and freeze the intro.
  // the first delta covers the whole model download, so throw it away —
  // otherwise the intro jumps straight to the end.
  let dt = clock.getDelta();
  if (firstFrame) { dt = 0; firstFrame = false; }
  dt = Math.min(.05, dt);
  elapsed += dt;
  const t = elapsed;

  if (introPlaying) {
    introT += dt;
    // ease the whole intro so it starts slow, accelerates, settles
    const k = clamp(introT / INTRO_DUR);
    p = targetP = ease(k);
    if (k >= 1) {
      introPlaying = false;
      wheelEnabled = true;
      hint.classList.add('on');
      setTimeout(() => hint.classList.remove('on'), 4200);
    }
  } else {
    p += (targetP - p) * .09;
  }

  dragA += (dragT - dragA) * .1;
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

new GLTFLoader().load('keyboard.glb',
  gltf => {
    board = gltf.scene;

    // centre the model on the origin and scale it to a comfortable size
    boardBox  = new THREE.Box3().setFromObject(board);
    boardSize = boardBox.getSize(new THREE.Vector3());
    const centre = boardBox.getCenter(new THREE.Vector3());
    board.position.sub(centre);

    const wrap = new THREE.Group();
    wrap.add(board);
    scene.add(wrap);
    board = wrap;                              // rotate the wrapper, not the model

    // walk every mesh, remember its home transform, give it an exploded offset
    const meshes = [];
    wrap.traverse(o => { if (o.isMesh) meshes.push(o); });

    meshes.forEach(m => {
      m.castShadow = true;
      m.receiveShadow = true;
      const group = classify(m.name);
      const home = m.position.clone();
      const dist = Math.hypot(home.x, home.z);

      const rec = {
        mesh: m, home, group,
        delay: dist * 1.9 + Math.random() * .10,   // radial wave, centre first
        lift: 0, spreadX: 0, spreadZ: 0, spin: 0,
        press: 0, nextPress: 1 + Math.random() * 5,
      };

      // each class explodes along a different axis so the stack reads clearly
      // offsets are scaled to the board itself (296 x 110 mm), so the whole
      // exploded stack still fits one frame
      if (group === 'caps')     { rec.lift = .075 + Math.random() * .035;
                                  rec.spreadX = home.x * .16; rec.spreadZ = home.z * .16;
                                  rec.spin = (Math.random() - .5) * 2.2; }
      else if (group === 'switches') { rec.lift = .040 + Math.random() * .018;
                                  rec.spreadX = home.x * .07; rec.spreadZ = home.z * .07;
                                  rec.spin = (Math.random() - .5) * 1.1; }
      else if (group === 'plate')    { rec.lift = .020; }
      else if (group === 'pcb')      { rec.lift = -.026; }
      else if (group === 'usb')      { rec.lift = -.034; rec.spreadZ = -.022; }
      else if (group === 'screws')   { rec.lift = -.046; rec.spin = 7; }
      else /* case */                { rec.lift = -.058;
                                  rec.spreadX = Math.sign(home.x || 1) * .055;
                                  rec.spreadZ = Math.sign(home.z || 1) * .038; }

      parts[group].push(rec);
    });

    txtEl.textContent =
      `${parts.caps.length} CAPS · ${parts.switches.length} SWITCHES · ${meshes.length} PARTS`;

    // floor for the shadows, just under the board
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.ShadowMaterial({ opacity:.4 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -boardSize.y / 2 - .13;
    floor.receiveShadow = true;
    scene.add(floor);

    fillEl.style.width = '100%';
    renderer.render(scene, camera);             // compile shaders before the reveal
    setTimeout(() => {
      loaderEl.classList.add('gone');
      clock.start();          // zero the clock here; frame() drops its first delta
      frame();                // intro starts the moment the scene is visible
    }, 420);
  },
  xhr => {
    if (xhr.total) fillEl.style.width = (xhr.loaded / xhr.total * 92) + '%';
  },
  err => {
    txtEl.textContent = 'MODEL FAILED TO LOAD';
    console.error(err);
  }
);
