import { onVisualChange, VIS } from '../visual';
import * as THREE from 'three';
import { CFG, p2 } from '../config';
import { SCREEN_RIGHT } from '../camera';
import { NavArea, type Obstacle } from '../nav/navArea';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, COLK, cone, cyl, flat, log, mat, paint, ramp, repivot, seeded, vmat } from './prims';
import { buildScatter } from './scatter';
import { aoLayer, type AoSpot } from './ao';
import type { Area, Interactable } from './types';

/** Части грядки, которые меняются по состоянию. */
export interface BedView {
  soil: THREE.Mesh;
  plants: THREE.Group;
  sprouts: THREE.Group;
}

/** Часть пня, которая становится низким пеньком после рубки. */
export interface StumpView {
  body: THREE.Group;
}

export interface OutsideArea extends Area {
  beds: BedView[];
  stumps: StumpView[];
  /** Флажок и письмо почтового ящика. */
  mailbox: { flag: THREE.Object3D; envelope: THREE.Object3D };
  agata: Interactable;
}

// Участок примерно 30×30 м. Ось X — на восток, ось Z — на юг (к камере).
// Дом на севере, лес вокруг, ручей на западе, калитка и тропинка в деревню на юге.

/**
 * Ель из гранёных ярусов-конусов (visual.json → forest: число ярусов, граней, глубина зубцов).
 * При toothDepth = 0 край яруса гладкий; светлые и теневые грани даёт двухтоновая заливка по солнцу.
 */
export function spruce(out: THREE.BufferGeometry[], x: number, z: number, h: number, rnd: () => number) {
  const F = { ...CFG.world.forest, ...VIS.forest };
  const C = VIS.colors;
  const n = F.tiersMin + Math.floor(rnd() * (F.tiersMax - F.tiersMin + 1));
  const base = h * F.trunkShare;
  const step = (h - base) / (n + 0.7);
  const th = step * F.tierOverlap;
  const seg = F.segments;
  const drop = Math.min(1, F.toothDepth / 0.22);
  const inner = ramp([
    [0, C.forestShade],
    [0.55, C.forestMid],
    [1, C.forestLit],
  ]);
  const top = ramp([
    [0, C.forestMid],
    [0.5, C.forestLit],
    [1, C.forestTip],
  ]);
  for (let i = 0; i < n; i++) {
    const r = h * F.widthShare * (1 - i / (n + 0.4));
    const geo = new THREE.ConeGeometry(r, th, seg, 1);
    const pos = geo.attributes.position;
    if (F.toothDepth > 0) {
      for (let k = 0; k < pos.count; k++) {
        const vx = pos.getX(k);
        const vz = pos.getZ(k);
        if (Math.hypot(vx, vz) < 1e-4 || pos.getY(k) > -th / 2 + 1e-4) continue;
        const a = Math.atan2(vz, vx);
        const tooth = (((Math.round(a / ((Math.PI * 2) / seg)) % seg) + seg) % 2) === 0;
        const f = tooth ? 1 : 1 - F.toothDepth;
        pos.setXYZ(k, vx * f, pos.getY(k) - (tooth ? th * 0.06 * drop : 0), vz * f);
      }
    }
    const tint = i === n - 1 ? top : inner;
    paint(geo, (px, _py, pz, c) => tint(Math.min(1, Math.hypot(px, pz) / r), c));
    geo.rotateY(rnd() * Math.PI);
    geo.translate(x, base + i * step + th / 2, z);
    out.push(geo);
  }
}

export function buildOutside(): OutsideArea {
  const W = CFG.world;
  const C = COLK;
  const T = CFG.texts.objects;
  const half = W.size / 2;
  const root = new THREE.Group();
  root.name = 'outside';
  const obstacles: Obstacle[] = [];
  const interactables: Interactable[] = [];
  const occluders: THREE.Object3D[] = [];
  const beds: BedView[] = [];
  const stumps: StumpView[] = [];
  let mailbox!: { flag: THREE.Object3D; envelope: THREE.Object3D };
  let agata!: Interactable;
  let n = 0;
  const add = (it: Omit<Interactable, 'id' | 'area' | 'label'>) => {
    const full: Interactable = { ...it, id: `${it.kind}-${n++}`, area: 'outside', label: T[it.kind] };
    full.root.userData.interactable = full;
    if (it.kind !== 'stream') repivot(full.root);
    interactables.push(full);
    root.add(full.root);
    return full;
  };

  // --- земля ---
  // Поляна в центре светлая, к краям и в глубину леса темнеет — естественная виньетка.
  const groundGeo = new THREE.PlaneGeometry(W.size * 4, W.size * 4, VIS.ground.segments, VIS.ground.segments);
  const repaintGround = () => {
    const G = VIS.ground;
    const groundRamp = ramp([
      [G.litUntil, C.ground],
      [G.oliveAt, C.groundOlive],
      [G.shadeAt, C.groundShade],
      [G.deepAt, C.groundDeep],
    ]);
    paint(groundGeo, (x, y, _z, out) => {
      const d = (Math.max(Math.abs(x), Math.abs(y)) * 0.6 + Math.hypot(x, y) * 0.4) / half;
      groundRamp(d, out);
    });
  };
  repaintGround();
  onVisualChange('colors', repaintGround);
  onVisualChange('ground', repaintGround);
  const ground = new THREE.Mesh(groundGeo, vmat(false, 'grass'));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // --- тропинка ---
  const pw = W.pathWidth;
  for (let i = 0; i < W.path.length - 1; i++) {
    const a = p2(W.path[i]);
    const b = p2(W.path[i + 1]);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const seg = new THREE.Group();
    seg.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    seg.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    seg.add(flat(pw, len, C.path, 0, 0.01, 0));
    root.add(seg);
  }
  for (const pt of W.path) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(pw / 2, 16), mat(C.path));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(pt[0], 0.011, pt[1]);
    disc.receiveShadow = true;
    root.add(disc);
  }

  // --- дом с крыльцом ---
  {
    const H = W.house;
    const [hx, hz] = H.center;
    const [sw, sd] = H.size;
    const house = new THREE.Group();
    // оштукатуренные кремовые стены с деревянной обвязкой: цоколь, угловые стойки, пояс под крышей
    house.add(box(sw, H.height, sd, C.house, hx, 0, hz));
    house.add(box(sw + 0.08, 0.22, sd + 0.08, C.houseGap, hx, 0, hz)); // цоколь
    const tr = 0.16;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) house.add(box(tr, H.height, tr, C.door, hx + (sx * sw) / 2, 0, hz + (sz * sd) / 2));
    }
    house.add(box(sw + 0.06, 0.14, sd + 0.06, C.door, hx, H.height - 0.14, hz)); // пояс под крышей
    // фронтоны: тёмные доски в треугольниках над торцевыми стенами
    const gable = new THREE.Shape();
    gable.moveTo(-sw / 2, 0);
    gable.lineTo(sw / 2, 0);
    gable.lineTo(0, H.roofHeight);
    gable.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(gable, { depth: sd, bevelEnabled: false });
    gableGeo.translate(0, 0, -sd / 2);
    const gableMesh = new THREE.Mesh(gableGeo, mat(C.houseGap));
    gableMesh.position.set(hx, H.height, hz);
    gableMesh.castShadow = gableMesh.receiveShadow = true;
    house.add(gableMesh);
    // двускатная крыша из двух скатов-плит, вытянута вдоль Z, с выносом над стенами
    const over = 0.4;
    const halfW = sw / 2 + over;
    const rise = H.roofHeight * (halfW / (sw / 2));
    const slope = Math.atan2(rise, halfW);
    const slab = Math.hypot(halfW, rise);
    const roofLen = sd + over * 2;
    const roofT = 0.14;
    const y0 = H.height - over * (rise / halfW);
    for (const side of [-1, 1]) {
      const r = box(slab + 0.05, roofT, roofLen, C.roof, 0, 0, 0);
      r.position.set(hx + side * (halfW / 2), y0 + rise / 2 + roofT * 0.5, hz);
      r.rotation.z = -side * slope;
      house.add(r);
      // плоские швы фальца вдоль ската
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        const seam = box(slab * 0.98, 0.03, 0.05, C.roofRidge, 0, 0, 0);
        seam.position.set(hx + side * (halfW / 2), y0 + rise / 2 + roofT + 0.01, hz - roofLen / 2 + roofLen * t);
        seam.rotation.z = -side * slope;
        house.add(seam);
      }
    }
    house.add(box(0.22, 0.1, roofLen + 0.02, C.roofRidge, hx, y0 + rise + roofT * 0.6, hz)); // конёк
    // труба: светлая штукатурка с тёмным оголовком
    const chx = hx + sw * 0.22;
    const chz = hz - sd * 0.12;
    house.add(box(0.6, 1.5, 0.6, C.board, chx, H.height + 0.5, chz));
    house.add(box(0.72, 0.12, 0.72, C.houseGap, chx, H.height + 2.0, chz));
    // дверь и окна на южной стене; рамы — дерево
    const front = hz + sd / 2;
    const P = W.porch;
    const face = front;
    house.add(box(W.door.width + 0.18, W.door.height + 0.1, 0.06, C.door, hx, P.height, face + 0.01));
    house.add(box(W.door.width, W.door.height, 0.08, C.houseGap, hx, P.height, face + 0.04));
    for (const wx of [hx - sw * 0.3, hx + sw * 0.3]) {
      house.add(box(0.94, 0.84, 0.05, C.door, wx, 0.93, face + 0.01));
      house.add(box(0.76, 0.66, 0.06, C.windowGlass, wx, 1.02, face + 0.03));
      house.add(box(0.06, 0.66, 0.07, C.door, wx, 1.02, face + 0.035)); // переплёт
      house.add(box(0.76, 0.06, 0.07, C.door, wx, 1.32, face + 0.035));
    }
    // крыльцо
    house.add(box(P.size[0], P.height, P.size[1], C.porch, P.center[0], 0, P.center[1]));
    add({
      kind: 'houseDoor',
      root: house,
      approach: p2(W.houseDoorOutside),
      faceTo: { x: hx, z: front },
    });
    occluders.push(house);
    obstacles.push({ kind: 'rect', minX: hx - sw / 2, maxX: hx + sw / 2, minZ: hz - sd / 2, maxZ: hz + sd / 2 });
  }

  // --- грядки ---
  {
    const [bw, bd] = W.bedSize;
    for (const [bx, bz] of W.beds) {
      const g = new THREE.Group();
      g.add(box(bw + 0.15, 0.12, bd + 0.15, C.bedFrame, bx, 0, bz));
      const soil = box(bw, 0.2, bd, C.bedSoil, bx, 0, bz);
      g.add(soil);
      // кустики картофеля (спелая грядка) и ростки (посажено)
      const plants = new THREE.Group();
      const sprouts = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
          const px = bx - bw / 2 + (bw / 3) * (i + 0.5);
          const pz = bz - bd / 2 + (bd / 2) * (j + 0.5);
          plants.add(cone(0.22, 0.45, C.plant, px, 0.2, pz, 6));
          sprouts.add(cone(0.07, 0.16, C.sprout, px, 0.2, pz, 5));
        }
      }
      g.add(plants, sprouts);
      beds.push({ soil, plants, sprouts });
      add({
        kind: 'bed',
        index: beds.length - 1,
        root: g,
        approach: { x: bx, z: bz + bd / 2 + 0.45 },
        faceTo: { x: bx, z: bz },
      });
    }
  }

  // --- пни ---
  for (const [sx, sz] of W.stumps) {
    const g = new THREE.Group();
    const body = new THREE.Group();
    body.add(cyl(W.stumpRadius, W.stumpRadius * 1.2, W.stumpHeight, C.stump, sx, 0, sz, 12));
    body.add(cyl(W.stumpRadius * 0.9, W.stumpRadius * 0.9, 0.02, C.stumpTop, sx, W.stumpHeight, sz, 12));
    g.add(body);
    stumps.push({ body });
    add({ kind: 'stump', index: stumps.length - 1, root: g, approach: { x: sx, z: sz }, faceTo: { x: sx, z: sz } });
    obstacles.push({ kind: 'circle', x: sx, z: sz, r: W.stumpRadius });
  }

  // --- сухостой (декор, но мешает пройти) ---
  for (const [tx, tz] of W.deadTrees) {
    const r = W.deadTreeRadius;
    const h = W.deadTreeHeight;
    root.add(cyl(r * 0.5, r, h, C.deadTree, tx, 0, tz, 7));
    const b1 = cyl(r * 0.25, r * 0.4, h * 0.3, C.deadTree, 0, 0, 0, 5);
    b1.position.set(tx + 0.35, h * 0.55, tz);
    b1.rotation.z = -0.8;
    root.add(b1);
    const b2 = cyl(r * 0.2, r * 0.35, h * 0.25, C.deadTree, 0, 0, 0, 5);
    b2.position.set(tx - 0.3, h * 0.7, tz + 0.1);
    b2.rotation.z = 0.9;
    root.add(b2);
    obstacles.push({ kind: 'circle', x: tx, z: tz, r });
  }

  // --- ручей ---
  {
    const S = W.stream;
    const len = W.size * 3;
    // вода: глубокая бирюза, темнее у берегов, несколько светлых бликов
    const waterGeo = new THREE.PlaneGeometry(S.width, len, 8, 1);
    const repaintWater = () => {
      const edge = ramp([
        [0.55, C.water],
        [1, C.waterEdge],
      ]);
      paint(waterGeo, (x, _y, _z, out) => edge(Math.abs(x) / (S.width / 2), out));
    };
    repaintWater();
    onVisualChange('colors', repaintWater);
    const water = new THREE.Mesh(waterGeo, vmat(false, 'water'));
    water.rotation.x = -Math.PI / 2;
    water.position.set(S.x, 0.03, 0);
    water.receiveShadow = true;
    add({ kind: 'stream', root: water });
    const rnd = seeded(31);
    for (let i = 0; i < 26; i++) {
      const w = 0.08 + rnd() * 0.1;
      const l = 0.5 + rnd() * 0.9;
      const glint = flat(w, l, C.waterGlint, S.x + (rnd() - 0.5) * S.width * 0.6, 0.035, -half - 4 + rnd() * (W.size + 8));
      glint.receiveShadow = false;
      root.add(glint);
    }
    // берега: бежево-серая полоса, округлые камни и брёвна
    for (const side of [-1, 1]) {
      const bx = S.x + side * (S.width / 2 + 0.2);
      root.add(flat(0.45, len, C.bank, bx, 0.02, 0));
      for (let z = -half - 6; z < half + 6; z += 0.7 + rnd() * 0.9) {
        if (rnd() < 0.18) {
          const lg = log(1.2 + rnd() * 0.8, 0.13, C.bankLog, bx + side * 0.05, 0.1, z + 0.6, true);
          lg.rotation.z = (rnd() - 0.5) * 0.3;
          root.add(lg);
          z += 1.2;
          continue;
        }
        const r = 0.12 + rnd() * 0.18;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(C.bank));
        rock.scale.y = 0.55;
        rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        rock.position.set(bx + side * (rnd() - 0.3) * 0.25, r * 0.3, z);
        rock.castShadow = rock.receiveShadow = true;
        root.add(rock);
      }
    }
    obstacles.push({ kind: 'rect', minX: -half - 1, maxX: S.x + S.width / 2, minZ: -half - 1, maxZ: half + 1 });
  }

  // --- почтовый ящик ---
  {
    const [mx, mz] = W.mailbox;
    const g = new THREE.Group();
    g.add(cyl(0.06, 0.06, 1.0, C.mailbox, mx, 0, mz, 6));
    g.add(box(0.35, 0.3, 0.5, C.mailbox, mx, 1.0, mz));
    // флажок: поднят, когда в ящике новое письмо
    const flag = new THREE.Group();
    flag.add(box(0.03, 0.4, 0.03, C.door, 0, 0, 0));
    flag.add(box(0.03, 0.14, 0.18, C.mailFlag, 0, 0.26, 0.09));
    flag.position.set(mx + 0.2, 1.05, mz + 0.1);
    g.add(flag);
    // уголок письма, торчащий из ящика
    const envelope = box(0.22, 0.04, 0.16, C.envelope, mx, 1.3, mz + 0.18);
    g.add(envelope);
    mailbox = { flag, envelope };
    add({ kind: 'mailbox', root: g, approach: { x: mx, z: mz }, faceTo: { x: mx, z: mz } });
    obstacles.push({ kind: 'circle', x: mx, z: mz, r: 0.3 });
  }

  // --- забор и калитка на юге ---
  {
    const fz = W.fenceZ;
    const x0 = W.stream.x + W.stream.width / 2 + 0.4;
    const x1 = half;
    const gx = W.gate.x;
    const gw = W.gate.width;
    for (let x = x0; x <= x1 + 0.01; x += 2) {
      if (Math.abs(x - gx) < gw / 2 + 0.1) continue;
      root.add(box(0.14, 1.0, 0.14, C.fence, x, 0, fz));
    }
    const rail = (from: number, to: number) => {
      if (to - from < 0.05) return;
      for (const y of [0.4, 0.8]) root.add(box(to - from, 0.08, 0.06, C.fence, (from + to) / 2, y, fz));
    };
    rail(x0, gx - gw / 2);
    rail(gx + gw / 2, x1);
    const gate = new THREE.Group();
    gate.add(box(0.18, 1.2, 0.18, C.gate, gx - gw / 2, 0, fz));
    gate.add(box(0.18, 1.2, 0.18, C.gate, gx + gw / 2, 0, fz));
    for (let i = 0; i < 5; i++) {
      const x = gx - gw / 2 + (gw / 5) * (i + 0.5);
      gate.add(box(0.22, 0.95, 0.05, C.gate, x, 0.05, fz));
    }
    gate.add(box(gw, 0.1, 0.06, C.gate, gx, 0.7, fz + 0.04));
    add({ kind: 'gate', root: gate, approach: { x: gx, z: fz - 0.6 }, faceTo: { x: gx, z: fz } });
    obstacles.push({ kind: 'rect', minX: x0 - 1, maxX: x1 + 1, minZ: fz - 0.1, maxZ: fz + 0.1 });
  }

  // --- доска улучшений у крыльца ---
  {
    const B = W.board;
    const [bx, bz] = B.pos;
    const [bw, bh] = B.size;
    const g = new THREE.Group();
    g.add(box(0.1, 1.6, 0.1, C.board, bx - bw / 2 + 0.1, 0, bz));
    g.add(box(0.1, 1.6, 0.1, C.board, bx + bw / 2 - 0.1, 0, bz));
    g.add(box(bw, bh, 0.08, C.board, bx, 0.75, bz));
    g.add(box(bw * 0.4, bh * 0.6, 0.02, C.boardPaper, bx - bw * 0.2, 0.9, bz + 0.05));
    add({ kind: 'board', root: g, approach: { x: bx, z: bz + 0.8 }, faceTo: { x: bx, z: bz } });
    obstacles.push({ kind: 'rect', minX: bx - bw / 2, maxX: bx + bw / 2, minZ: bz - 0.1, maxZ: bz + 0.1 });
  }

  // --- столб фонаря (сам фонарь появится после покупки, но место под столб занято сразу) ---
  {
    const [lx, lz] = CFG.lantern.pos;
    obstacles.push({ kind: 'circle', x: lx, z: lz, r: 0.12 });
  }

  // --- бабушка Агата за калиткой (видна 17:00–21:00) ---
  {
    const A = CFG.agata;
    const [ax, az] = A.pos;
    const g = new THREE.Group();
    const bodyH = A.height * 0.7;
    g.add(cone(A.radius * 1.4, bodyH, VIS.agata.colors.body, ax, 0, az, 10)); // юбка-колокол
    const head = new THREE.Mesh(new THREE.SphereGeometry(A.radius * 0.7, 12, 10), mat(VIS.agata.colors.head));
    head.position.set(ax, bodyH + A.radius * 0.45, az);
    head.castShadow = true;
    g.add(head);
    g.add(cone(A.radius * 0.85, A.radius * 1.1, VIS.agata.colors.scarf, ax, bodyH + A.radius * 0.3, az, 10)); // платок
    g.visible = false;
    agata = add({ kind: 'agata', root: g, approach: p2(A.approach), faceTo: { x: ax, z: az } });
  }

  // --- лес вокруг участка (декор за границей) ---
  // Пересобирается на лету, когда в VIS меняются цвета или форма ёлок.
  const forestGroup = new THREE.Group();
  root.add(forestGroup);
  const buildForest = () => {
    for (const ch of [...forestGroup.children]) {
      forestGroup.remove(ch);
      (ch as THREE.Mesh).geometry.dispose();
    }
    const F = W.forest;
    const rnd = seeded(F.seed);
    const crowns: THREE.BufferGeometry[] = [];
    const trunks: THREE.BufferGeometry[] = [];
    const spots: AoSpot[] = [];
    const spot = (x: number, z: number, h: number) => {
      const r = h * VIS.forest.widthShare * 0.85;
      spots.push({ x, z, rx: r, rz: r });
    };
    let placed = 0;
    for (let tries = 0; placed < F.count && tries < F.count * 20; tries++) {
      const a = rnd() * Math.PI * 2;
      const r = F.ringInner + rnd() * (F.ringOuter - F.ringInner);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x) < half + 0.8 && Math.abs(z) < half + 0.8) continue;
      if (Math.abs(x - W.gate.x) < 2.5 && z > 0) continue; // дорога в деревню
      // не загораживать калитку (там стоит Агата) от камеры, которая смотрит с юго-востока
      const dg = ((x - W.gate.x) * SCREEN_RIGHT.x + (z - W.fenceZ) * SCREEN_RIGHT.z) * Math.SQRT2;
      if (Math.abs(dg) < F.gateViewClear && z > W.fenceZ && z - W.fenceZ < F.gateViewDepth) continue;
      const h = F.minHeight + rnd() * (F.maxHeight - F.minHeight);
      trunks.push(new THREE.CylinderGeometry(F.trunkRadius * 0.7, F.trunkRadius, h * 0.3, 6).translate(x, h * 0.15, z));
      spruce(crowns, x, z, h, rnd);
      spot(x, z, h);
      placed++;
    }
    // декоративные ели у краёв поляны (visual.json → forest.decor: [x, z, высота]); в навигацию не входят
    for (const [x, z, h] of VIS.forest.decor) {
      trunks.push(new THREE.CylinderGeometry(F.trunkRadius * 0.7, F.trunkRadius, h * 0.3, 6).translate(x, h * 0.15, z));
      spruce(crowns, x, z, h, rnd);
      spot(x, z, h);
    }
    forestAo.set(spots);
    // все ели — одним мешем: свой материал им не нужен (их не подсвечивают), а кадр легче
    const crownMesh = new THREE.Mesh(mergeGeometries(crowns), crownMat);
    const trunkMesh = new THREE.Mesh(mergeGeometries(trunks), trunkMat);
    for (const m of [crownMesh, trunkMesh]) {
      m.castShadow = m.receiveShadow = true;
      forestGroup.add(m);
    }
  };
  const crownMat = vmat(true, 'pine');
  const trunkMat = mat(C.forestTrunk);
  const forestAo = aoLayer(root);
  buildForest();
  let forestTimer = 0;
  const rebuildSoon = () => {
    clearTimeout(forestTimer);
    forestTimer = window.setTimeout(buildForest, 60);
  };
  onVisualChange('colors', rebuildSoon);
  onVisualChange('forest', rebuildSoon);
  onVisualChange('camera', rebuildSoon);

  // тёмные пятна под крупными предметами (запасной AO)
  {
    const H = W.house;
    const spots: AoSpot[] = [
      { x: H.center[0], z: H.center[1], rx: H.size[0] / 2 + 0.6, rz: H.size[1] / 2 + 0.6 },
    ];
    for (const [bx, bz] of W.beds) spots.push({ x: bx, z: bz, rx: W.bedSize[0] / 2 + 0.3, rz: W.bedSize[1] / 2 + 0.3 });
    for (const [sx, sz] of W.stumps) spots.push({ x: sx, z: sz, rx: W.stumpRadius * 1.8, rz: W.stumpRadius * 1.8 });
    for (const [tx, tz] of W.deadTrees) spots.push({ x: tx, z: tz, rx: 0.6, rz: 0.6 });
    spots.push({ x: W.mailbox[0], z: W.mailbox[1], rx: 0.45, rz: 0.45 });
    spots.push({ x: W.board.pos[0], z: W.board.pos[1], rx: W.board.size[0] / 2 + 0.3, rz: 0.4 });
    aoLayer(root).set(spots);
  }

  buildScatter(root);

  const nav = new NavArea(-half, half, -half, half, CFG.nav.cellSize, obstacles, CFG.player.radius);
  const P = W.porch;
  return {
    id: 'outside',
    root,
    ground,
    nav,
    interactables,
    occluders,
    beds,
    stumps,
    mailbox,
    agata,
    floorY(x, z) {
      const inPorch =
        Math.abs(x - P.center[0]) < P.size[0] / 2 && Math.abs(z - P.center[1]) < P.size[1] / 2;
      return inPorch ? P.height : 0;
    },
  };
}
