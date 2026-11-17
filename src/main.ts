import * as THREE from 'three';
import { CameraRig, ISO_DIR } from './camera';
import { CFG, p2 } from './config';
import { Audio } from './fx/audio';
import { Particles } from './fx/particles';
import { squash, updateSquash } from './fx/squash';
import { GameClock } from './game/clock';
import { Daylight } from './game/daylight';
import { Cooking, RECIPES, type StationId } from './game/cooking';
import { Gathering } from './game/gather';
import { Inventory, type ItemId } from './game/inventory';
import { Input } from './input';
import type { P2 } from './nav/navArea';
import { Player } from './player';
import './style.css';
import { DebugPanel } from './ui/debug';
import { Hud } from './ui/hud';
import { InventoryUi } from './ui/inventoryUi';
import { StationMenu } from './ui/stationMenu';
import { StationTimers } from './ui/stationTimers';
import { Overlay } from './ui/overlay';
import { buildInterior } from './world/interior';
import { buildOutside } from './world/outside';
import type { Area, Interactable, InteractKind } from './world/types';

// Точка входа: сцена, свет, зоны, герой, время, игровой цикл.

const app = document.getElementById('app')!;
document.title = CFG.texts.title;
const R = CFG.render;
const U = CFG.texts.ui;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, R.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const bgColor = new THREE.Color(CFG.colors.background);
scene.background = bgColor;

// --- свет: солнце/луна + рассеянный, меняются по часам ---
const hemi = new THREE.HemisphereLight();
scene.add(hemi);
const sun = new THREE.DirectionalLight();
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
const daylight = new Daylight(sun, hemi, bgColor);

// --- зоны ---
const outside = buildOutside();
const inside = buildInterior();
scene.add(outside.root, inside.root);
const find = (area: Area, kind: InteractKind) => area.interactables.find((i) => i.kind === kind)!;
const houseDoor = find(outside, 'houseDoor');
const sleepBed = find(inside, 'sleepBed');

// --- герой, камера, время ---
const doorOut = p2(CFG.world.houseDoorOutside);
const startPos: P2 = { x: doorOut.x, z: doorOut.z + 1.5 };
const player = new Player(outside, startPos);
scene.add(player.mesh);

const rig = new CameraRig();
rig.snapTo(player.pos);
const input = new Input(renderer.domElement);
const ui = new Overlay(app);
const hud = new Hud(app);
const clock = new GameClock();

// --- инвентарь, добыча, отклик ---
const audio = new Audio();
const particles = new Particles(scene);
const inv = new Inventory();
const invUi = new InventoryUi(app, inv);
inv.onChange = () => invUi.sync();
invUi.onLand = (_id, i) => audio.play('pickup', 1 + i * CFG.feedback.pickupPitchStep);
const projV = new THREE.Vector3();
/** Точка мира → пиксели экрана. */
function toScreen(x: number, y: number, z: number) {
  projV.set(x, y, z).project(rig.camera);
  const r = renderer.domElement.getBoundingClientRect();
  return { x: r.left + ((projV.x + 1) / 2) * r.width, y: r.top + ((1 - projV.y) / 2) * r.height };
}
const gather = new Gathering(outside, {
  inv,
  invUi,
  audio,
  particles,
  rig,
  toScreen,
  message: (t) => ui.message(t),
  hero: () => ({ x: player.pos.x, z: player.pos.z, heading: player.heading }),
});
gather.dayRef = () => clock.day;

// --- готовка: печь, плита, связка дров ---
const cooking = new Cooking(inv);
const menu = new StationMenu(app, inv, cooking);
const timers = new StationTimers(app);
const stations = (['stove', 'plate'] as StationId[]).map((id) => {
  const it = find(inside, id);
  const pos = new THREE.Vector3();
  it.root.getWorldPosition(pos);
  return { id, it, pos, height: CFG.interior[id].size[1] };
});
const bundleRecipe = RECIPES.find((r) => r.station === 'inventory')!;

function updateCraftButton() {
  const U = CFG.texts.ui;
  const miss = cooking.missing(bundleRecipe);
  const name = CFG.items[bundleRecipe.product].name;
  const need = Cooking.listText(Object.entries(bundleRecipe.inputs) as [ItemId, number][]);
  if (miss.length === 0) invUi.setCraft(U.bundle, need, true);
  else invUi.setCraft(name, U.missing.replace('{list}', Cooking.listText(miss)), false);
}
inv.onChange = () => {
  invUi.sync();
  updateCraftButton();
};
updateCraftButton();
invUi.craftBtn.onclick = () => {
  if (!cooking.craftNow(bundleRecipe)) return;
  audio.play('bundle');
  const r = invUi.craftBtn.getBoundingClientRect();
  invUi.fly(bundleRecipe.product, r.left + r.width / 2, r.top - 10, 1);
  inv.add(bundleRecipe.product, 1);
};

function stationLabel(id: StationId, label: string) {
  const U = CFG.texts.ui;
  const slot = cooking.slots[id];
  if (!slot) return `${label}: ${U.stationIdle}`;
  const name = CFG.items[slot.recipe.product].name;
  return slot.left > 0
    ? `${label}: ${name}, ${U.cooking.replace('{m}', String(Math.ceil(slot.left * 60)))}`
    : `${label}: ${name} — ${U.ready}`;
}

/** Клик по печи или плите: забрать готовое, сказать сколько ждать или открыть меню. */
function actStation(id: StationId, it: Interactable) {
  const st = stations.find((s) => s.id === id)!;
  const slot = cooking.slots[id];
  const U = CFG.texts.ui;
  if (slot && slot.left > 0) {
    squash(it.root, 0.3);
    ui.message(U.cookingMsg.replace('{name}', CFG.items[slot.recipe.product].name).replace('{m}', String(Math.ceil(slot.left * 60))));
    return;
  }
  if (slot) {
    const product = cooking.take(id)!;
    audio.play(id === 'stove' ? 'ovenOpen' : 'pot');
    squash(it.root, 1);
    const s = toScreen(st.pos.x, st.height + 0.2, st.pos.z);
    invUi.fly(product, s.x, s.y, 1);
    inv.add(product, 1);
    return;
  }
  if (id === 'stove') audio.play('ovenOpen');
  squash(it.root, 0.5);
  menu.open(it.label, cooking.recipesFor(id)).then((r) => {
    if (!r || !cooking.start(id, r)) return;
    audio.play(id === 'stove' ? 'ovenClose' : 'pot');
    squash(it.root, 1);
    particles.emit(id === 'stove' ? 'sparks' : 'steam', st.pos.x, st.height, st.pos.z);
  });
}

let steamTimer = 0;
function updateStations(dt: number) {
  const insideNow = player.area.id === 'inside';
  steamTimer -= dt;
  const puff = steamTimer <= 0;
  if (puff) steamTimer = CFG.feedback.steamEvery;
  for (const st of stations) {
    const slot = cooking.slots[st.id];
    timers.update(st.id, slot, insideNow ? toScreen(st.pos.x, st.height + 0.3, st.pos.z) : null);
    // пар над супом
    if (insideNow && puff && slot && slot.recipe.product === 'soup') {
      particles.emit('steam', st.pos.x, st.height + 0.05, st.pos.z);
    }
  }
}

/** Начало нового дня: часы, рост грядок, пни. */
function startDay(n: number) {
  clock.startDay(n);
  cooking.finishAll();
  gather.newDay(n);
  autoReturn = false;
}

/** В доме камера смотрит в центр комнаты, на улице — на героя. */
const roomCenter = p2(CFG.interior.origin);
const cameraFocus = () => (player.area.id === 'inside' ? roomCenter : player.pos);

let busy = false; // идёт затемнение — ввод игнорируется
let autoReturn = false; // 2:00 — герой сам идёт домой спать

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

/** Затемнить экран и перенести героя (вход/выход, сон, отладка). */
function moveTo(area: Area, pos: P2, face: P2 | null, also?: () => void): Promise<void> {
  busy = true;
  return ui
    .fadeThrough(() => {
      also?.();
      player.teleport(area, pos, face);
      rig.setViewSize(area.id === 'inside' ? CFG.camera.interiorViewSize : CFG.camera.viewSize);
      rig.snapTo(cameraFocus());
    })
    .then(() => {
      busy = false;
    });
}

const insideSpawn = (): [P2, P2] => {
  const I = CFG.interior;
  const [ox, oz] = I.origin;
  const p = { x: ox + I.spawn[0], z: oz + I.spawn[1] };
  return [p, { x: p.x + 1, z: p.z }];
};

/** Сон: следующий день, 6:00, герой просыпается у кровати. */
function sleep() {
  const next = clock.day + 1;
  moveTo(inside, sleepBed.approach!, sleepBed.faceTo!, () => startDay(next)).then(() => ui.message(U.goodMorning.replace('{day}', String(next))));
}

/** 2:00 — герой зевает и сам идёт домой, потом ложится. */
function startAutoReturn() {
  autoReturn = true;
  ui.message(U.yawn);
  // в доме — сразу к кровати, на улице — сначала к двери
  const target = player.area.id === 'inside' ? sleepBed : houseDoor;
  if (!player.walkToObject(target, target.approach!)) sleep();
}

player.onArrive = (it) => {
  player.setTool(null);
  if (it.kind === 'stove' || it.kind === 'plate') {
    actStation(it.kind, it);
    return;
  }
  if (gather.act(it)) {
    player.setTool(gather.toolFor(it));
    return;
  }
  if (it.kind === 'houseDoor') {
    audio.play('doorOpen');
    const [p, face] = insideSpawn();
    moveTo(inside, p, face).then(() => {
      if (autoReturn && !player.walkToObject(sleepBed, sleepBed.approach!)) sleep();
    });
  } else if (it.kind === 'exitDoor') {
    audio.play('doorClose');
    moveTo(outside, doorOut, { x: doorOut.x, z: doorOut.z + 1 });
  } else if (it.kind === 'sleepBed') {
    if (autoReturn) sleep();
    else hud.ask(U.sleepQuestion).then((yes) => yes && sleep());
  } else {
    // действия с объектами появятся на следующих этапах
    ui.message(U.arrived.replace('{name}', it.label));
  }
};

// --- панель отладки ---
new DebugPanel(app, {
  setFast: (on) => (clock.scale = on ? CFG.debug.timeScaleFast : 1),
  goToDay: (n) => {
    moveTo(outside, startPos, { x: startPos.x, z: startPos.z + 1 }, () => startDay(n));
  },
  give: () => {
    const G = CFG.debug.give;
    inv.add('potato', G.potato);
    inv.add('wood', G.wood);
    inv.add('water', Math.max(0, G.water - inv.get('water')));
  },
  reset: () => location.reload(),
});

let hovered: Interactable | null = null;

function labelFor(it: Interactable) {
  if (it.kind === 'stove' || it.kind === 'plate') return stationLabel(it.kind, it.label);
  return gather.labelFor(it);
}

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

let clockText = '';

/** dt — для движения (обрезан, чтобы не было рывков); realDt — для часов (точный). */
function frame(dt: number, realDt: number) {
  const locked = busy || hud.modalOpen || menu.isOpen || autoReturn;

  // наведение и клик
  const pick = locked ? null : input.pick(rig.camera, player.area);
  const nowHover = pick?.it ?? null;
  if (nowHover !== hovered) {
    setHighlight(hovered, false);
    setHighlight(nowHover, true);
    hovered = nowHover;
  }
  renderer.domElement.style.cursor = nowHover ? 'pointer' : 'default';
  ui.setHover(nowHover ? labelFor(nowHover) : null, input.mouseX, input.mouseY);

  if (input.clicked) {
    input.clicked = false;
    if (pick && !locked) {
      if (pick.it) {
        if (player.walkToObject(pick.it, pick.point)) player.setTool(gather.toolFor(pick.it));
      }
      else player.walkTo(pick.point);
    }
  }

  // время стоит, пока открыто окно; в доме идёт медленнее (time.insideScale)
  const running = !hud.modalOpen && !menu.isOpen && !busy;
  const indoors = player.area.id === 'inside';
  if (running) {
    const h0 = clock.hour;
    clock.tick(realDt * (indoors ? CFG.time.insideScale : 1));
    cooking.tick(clock.hour - h0);
  }
  if (clock.ended && !autoReturn && !busy && !hud.modalOpen && !menu.isOpen) startAutoReturn();

  const clockState = !running ? 'paused' : indoors ? 'slow' : 'normal';
  const text = `${clock.day}|${clock.format()}|${clockState}`;
  if (text !== clockText) {
    clockText = text;
    hud.setClock(clock.day, clock.format(), clockState);
  }

  player.update(dt, locked ? { x: 0, z: 0 } : input.wasd());
  rig.follow(cameraFocus(), dt);
  updateOccluders();
  updateStations(dt);
  particles.update(dt);
  updateSquash(dt);

  // свет по часам; солнце следует за камерой, чтобы тени всегда были вокруг героя
  daylight.apply(clock.hour);
  sun.position.copy(rig.target).add(daylight.sunOffset);
  sun.target.position.copy(rig.target);

  renderer.render(scene, rig.camera);
}

const timer = new THREE.Timer();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const raw = timer.getDelta();
  frame(Math.min(raw, 0.1), Math.min(raw, 1));
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  rig.resize(window.innerWidth, window.innerHeight);
});

// только для разработки: доступ к состоянию из консоли браузера
if (import.meta.env.DEV) {
  (window as unknown as { __game: unknown }).__game = { clock, player, frame, gather, inv, outside, cooking, inside };
}
