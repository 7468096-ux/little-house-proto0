import * as THREE from 'three';
import { CFG, p2 } from '../config';
import { NavArea, type Obstacle } from '../nav/navArea';
import { box, cone, cyl, flat, mat, repivot, seeded } from './prims';
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

export function buildOutside(): OutsideArea {
  const W = CFG.world;
  const C = CFG.colors;
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
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W.size * 4, W.size * 4), mat(C.ground));
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
    house.add(box(sw, H.height, sd, C.house, hx, 0, hz));
    // двускатная крыша: треугольник, вытянутый вдоль Z
    const over = 0.35;
    const shape = new THREE.Shape();
    shape.moveTo(-sw / 2 - over, 0);
    shape.lineTo(sw / 2 + over, 0);
    shape.lineTo(0, H.roofHeight);
    shape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: sd + over * 2, bevelEnabled: false });
    roofGeo.translate(0, 0, -(sd + over * 2) / 2);
    const roof = new THREE.Mesh(roofGeo, mat(C.roof));
    roof.position.set(hx, H.height, hz);
    roof.castShadow = true;
    roof.receiveShadow = true;
    house.add(roof);
    house.add(box(0.6, 1.4, 0.6, C.roof, hx + sw * 0.25, H.height + 0.4, hz - sd * 0.15)); // труба
    // дверь и окна на южной стене
    const front = hz + sd / 2;
    const P = W.porch;
    house.add(box(W.door.width, W.door.height, 0.08, C.door, hx, P.height, front + 0.04));
    house.add(box(0.8, 0.7, 0.06, C.door, hx - sw * 0.32, 1.0, front + 0.03));
    house.add(box(0.8, 0.7, 0.06, C.door, hx + sw * 0.32, 1.0, front + 0.03));
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
    body.add(cyl(W.stumpRadius, W.stumpRadius * 1.15, W.stumpHeight, C.stump, sx, 0, sz));
    body.add(cyl(W.stumpRadius * 0.92, W.stumpRadius * 0.92, 0.02, C.stumpTop, sx, W.stumpHeight, sz));
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
    const water = flat(S.width, len, C.water, S.x, 0.03, 0);
    add({ kind: 'stream', root: water });
    root.add(flat(0.35, len, C.bank, S.x - S.width / 2 - 0.17, 0.02, 0));
    root.add(flat(0.35, len, C.bank, S.x + S.width / 2 + 0.17, 0.02, 0));
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

  // --- бабушка Агата за калиткой (видна 17:00–21:00) ---
  {
    const A = CFG.agata;
    const [ax, az] = A.pos;
    const g = new THREE.Group();
    const bodyH = A.height * 0.7;
    g.add(cone(A.radius * 1.4, bodyH, A.colors.body, ax, 0, az, 10)); // юбка-колокол
    const head = new THREE.Mesh(new THREE.SphereGeometry(A.radius * 0.7, 12, 10), mat(A.colors.head));
    head.position.set(ax, bodyH + A.radius * 0.45, az);
    head.castShadow = true;
    g.add(head);
    g.add(cone(A.radius * 0.85, A.radius * 1.1, A.colors.scarf, ax, bodyH + A.radius * 0.3, az, 10)); // платок
    g.visible = false;
    agata = add({ kind: 'agata', root: g, approach: p2(A.approach), faceTo: { x: ax, z: az } });
  }

  // --- лес вокруг участка (декор за границей) ---
  {
    const F = W.forest;
    const rnd = seeded(F.seed);
    let placed = 0;
    for (let tries = 0; placed < F.count && tries < F.count * 20; tries++) {
      const a = rnd() * Math.PI * 2;
      const r = F.ringInner + rnd() * (F.ringOuter - F.ringInner);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x) < half + 0.8 && Math.abs(z) < half + 0.8) continue;
      if (Math.abs(x - W.gate.x) < 2.5 && z > 0) continue; // дорога в деревню
      // не загораживать калитку (там стоит Агата) от камеры, которая смотрит с юго-востока
      const dg = x - W.gate.x - (z - W.fenceZ);
      if (Math.abs(dg) < F.gateViewClear && z > W.fenceZ && z - W.fenceZ < F.gateViewDepth) continue;
      const h = F.minHeight + rnd() * (F.maxHeight - F.minHeight);
      root.add(cyl(F.trunkRadius, F.trunkRadius, h * 0.3, C.forestTrunk, x, 0, z, 6));
      root.add(cone(h * 0.28, h * 0.8, C.forestCrown, x, h * 0.25, z, 7));
      placed++;
    }
  }

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
