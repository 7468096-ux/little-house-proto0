import * as THREE from 'three';
import { CameraRig, ISO_DIR } from './camera';
import { CFG, p2 } from './config';
import { Input } from './input';
import { Player } from './player';
import './style.css';
import { Overlay } from './ui/overlay';
import { buildInterior } from './world/interior';
import { buildOutside } from './world/outside';
import type { Area, Interactable } from './world/types';

// Точка входа: сцена, свет, зоны, герой, игровой цикл.

const app = document.getElementById('app')!;
document.title = CFG.texts.title;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CFG.render.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(CFG.colors.background);

// --- свет (день; смена времени суток — этап 2) ---
const R = CFG.render;
const hemi = new THREE.HemisphereLight('#ffffff', '#6a6a60', R.ambientIntensity);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffffff', R.sunIntensity);
sun.castShadow = true;
sun.shadow.mapSize.set(R.shadowMapSize, R.shadowMapSize);
const sc = sun.shadow.camera;
sc.left = -R.shadowArea;
sc.right = R.shadowArea;
sc.top = R.shadowArea;
sc.bottom = -R.shadowArea;
sc.near = 1;
sc.far = 100;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// --- зоны ---
const outside = buildOutside();
const inside = buildInterior();
scene.add(outside.root, inside.root);

// --- герой и камера ---
const doorOut = p2(CFG.world.houseDoorOutside);
const player = new Player(outside, { x: doorOut.x, z: doorOut.z + 1.5 });
player.heading = 0;
scene.add(player.mesh);

const rig = new CameraRig();
rig.snapTo(player.pos);
const input = new Input(renderer.domElement);
const ui = new Overlay(app);

/** В доме камера смотрит в центр комнаты, на улице — на героя. */
const roomCenter = p2(CFG.interior.origin);
const cameraFocus = () => (player.area.id === 'inside' ? roomCenter : player.pos);

let busy = false; // идёт затемнение — ввод игнорируется

function setHighlight(it: Interactable | null, on: boolean) {
  if (!it) return;
  it.root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && 'emissive' in m) {
      m.emissive.set(on ? R.highlightColor : '#000000');
      m.emissiveIntensity = on ? R.highlightEmissive : 0;
    }
  });
}

function moveTo(area: Area, pos: { x: number; z: number }, face: { x: number; z: number }) {
  busy = true;
  ui.fadeThrough(() => {
    player.teleport(area, pos, face);
    rig.setViewSize(area.id === 'inside' ? CFG.camera.interiorViewSize : CFG.camera.viewSize);
    rig.snapTo(cameraFocus());
  }).then(() => (busy = false));
}

player.onArrive = (it) => {
  if (it.kind === 'houseDoor') {
    const I = CFG.interior;
    const o = I.origin;
    moveTo(inside, { x: o[0] + I.spawn[0], z: o[1] + I.spawn[1] }, { x: o[0] + I.spawn[0] + 1, z: o[1] + I.spawn[1] });
  } else if (it.kind === 'exitDoor') {
    moveTo(outside, doorOut, { x: doorOut.x, z: doorOut.z + 1 });
  } else {
    // действия с объектами появятся на следующих этапах
    ui.message(CFG.texts.ui.arrived.replace('{name}', it.label));
  }
};

let hovered: Interactable | null = null;

// --- дом просвечивает, когда герой за ним ---
const occRay = new THREE.Raycaster();
const faded = new Set<THREE.Object3D>();
function setFaded(obj: THREE.Object3D, on: boolean) {
  obj.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!m) return;
    m.transparent = on;
    m.opacity = on ? R.occluderOpacity : 1;
    m.depthWrite = !on;
    m.needsUpdate = true;
  });
}
function updateOccluders() {
  const from = new THREE.Vector3(player.pos.x, CFG.player.height * 0.5, player.pos.z);
  occRay.set(from, ISO_DIR);
  for (const occ of player.area.occluders) {
    const hidden = occRay.intersectObject(occ, true).length > 0;
    if (hidden !== faded.has(occ)) {
      setFaded(occ, hidden);
      if (hidden) faded.add(occ);
      else faded.delete(occ);
    }
  }
}

function frame(dt: number) {
  // наведение и клик
  const pick = busy ? null : input.pick(rig.camera, player.area);
  const nowHover = pick?.it ?? null;
  if (nowHover !== hovered) {
    setHighlight(hovered, false);
    setHighlight(nowHover, true);
    hovered = nowHover;
  }
  renderer.domElement.style.cursor = nowHover ? 'pointer' : 'default';
  ui.setHover(nowHover?.label ?? null, input.mouseX, input.mouseY);

  if (input.clicked) {
    input.clicked = false;
    if (pick && !busy) {
      if (pick.it) player.walkToObject(pick.it, pick.point);
      else player.walkTo(pick.point);
    }
  }

  player.update(dt, busy ? { x: 0, z: 0 } : input.wasd());
  rig.follow(cameraFocus(), dt);
  updateOccluders();

  // солнце следует за камерой, чтобы тени всегда были вокруг героя
  sun.position.set(rig.target.x + R.sunOffset[0], R.sunOffset[1], rig.target.z + R.sunOffset[2]);
  sun.target.position.copy(rig.target);

  renderer.render(scene, rig.camera);
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  frame(dt);
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  rig.resize(window.innerWidth, window.innerHeight);
});
