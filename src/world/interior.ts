import * as THREE from 'three';
import { CFG } from '../config';
import { NavArea, type Obstacle } from '../nav/navArea';
import { box, cyl } from './prims';
import type { Area, Interactable, InteractKind } from './types';

// Комната внутри дома. Стоит в стороне от участка (interior.origin),
// камера при входе просто переезжает сюда. Передние стены низкие —
// «кукольный домик», чтобы изометрическая камера видела всё.

export function buildInterior(): Area {
  const I = CFG.interior;
  const C = CFG.colors;
  const T = CFG.texts.objects;
  const [ox, oz] = I.origin;
  const [rw, rd] = I.size;
  const t = I.wallThickness;
  const root = new THREE.Group();
  root.name = 'inside';
  root.position.set(ox, 0, oz);
  const obstacles: Obstacle[] = [];
  const interactables: Interactable[] = [];
  let n = 0;
  const add = (kind: InteractKind, g: THREE.Object3D, approach: number[], faceTo: number[]) => {
    const it: Interactable = {
      id: `${kind}-in-${n++}`,
      kind,
      label: T[kind],
      area: 'inside',
      root: g,
      approach: { x: ox + approach[0], z: oz + approach[1] },
      faceTo: { x: ox + faceTo[0], z: oz + faceTo[1] },
    };
    g.userData.interactable = it;
    interactables.push(it);
    root.add(g);
  };
  const solid = (pos: number[], size: number[]) => {
    obstacles.push({
      kind: 'rect',
      minX: ox + pos[0] - size[0] / 2,
      maxX: ox + pos[0] + size[0] / 2,
      minZ: oz + pos[1] - size[2] / 2,
      maxZ: oz + pos[1] + size[2] / 2,
    });
  };

  // пол
  const floor = box(rw, 0.1, rd, C.floor, 0, -0.1, 0);
  root.add(floor);

  // стены: северная и западная высокие, южная и восточная низкие
  const H = I.wallHeight;
  const L = I.frontWallHeight;
  root.add(box(rw + t, H, t, C.wall, 0, 0, -rd / 2));
  root.add(box(rw + t, L, t, C.wall, 0, 0, rd / 2));
  root.add(box(t, L, rd + t, C.wall, rw / 2, 0, 0));
  // западная стена с проёмом под дверь
  const [dx, dz] = I.door;
  const dw = CFG.world.door.width;
  const dh = CFG.world.door.height;
  const southPart = rd / 2 - (dz + dw / 2);
  const northPart = dz - dw / 2 + rd / 2;
  root.add(box(t, H, northPart, C.wall, dx, 0, -rd / 2 + northPart / 2));
  root.add(box(t, H, southPart, C.wall, dx, 0, rd / 2 - southPart / 2));
  root.add(box(t, H - dh, dw, C.wall, dx, dh, dz));

  // дверь наружу
  {
    const g = new THREE.Group();
    g.add(box(0.08, dh, dw, C.door, dx + t / 2 + 0.04, 0, dz));
    g.add(box(0.6, 0.02, 1.0, C.porch, dx + 0.55, 0, dz)); // коврик
    add('exitDoor', g, I.spawn, [dx, dz]);
  }

  // печь
  {
    const S = I.stove;
    const [sx, sz] = S.pos;
    const [w, h, d] = S.size;
    const g = new THREE.Group();
    g.add(box(w, h, d, C.stove, sx, 0, sz));
    g.add(box(w * 0.5, h * 0.35, 0.05, C.plate, sx, h * 0.2, sz + d / 2 + 0.02)); // дверца
    g.add(cyl(0.15, 0.15, H - h, C.plate, sx, h, sz - d * 0.2, 8)); // труба
    add('stove', g, [sx, sz + d / 2 + 0.5], [sx, sz]);
    solid(S.pos, S.size);
  }

  // плита
  {
    const S = I.plate;
    const [px, pz] = S.pos;
    const [w, h, d] = S.size;
    const g = new THREE.Group();
    g.add(box(w, h, d, C.plate, px, 0, pz));
    g.add(cyl(0.2, 0.2, 0.03, C.stove, px - w * 0.25, h, pz, 12));
    g.add(cyl(0.2, 0.2, 0.03, C.stove, px + w * 0.25, h, pz, 12));
    add('plate', g, [px, pz + d / 2 + 0.5], [px, pz]);
    solid(S.pos, S.size);
  }

  // кровать
  {
    const S = I.bed;
    const [bx, bz] = S.pos;
    const [w, h, d] = S.size;
    const g = new THREE.Group();
    g.add(box(w, h, d, C.bed, bx, 0, bz));
    g.add(box(w * 0.8, 0.15, 0.4, C.pillow, bx, h, bz - d / 2 + 0.3));
    add('sleepBed', g, [bx - w / 2 - 0.5, bz], [bx, bz]);
    solid(S.pos, S.size);
  }

  // тёплая лампа под потолком
  const lamp = new THREE.PointLight('#ffe2b8', CFG.render.interiorLightIntensity, rw * 2, 2);
  lamp.position.set(0, CFG.render.interiorLightHeight, 0);
  root.add(lamp);

  const nav = new NavArea(
    ox - rw / 2 + t / 2,
    ox + rw / 2 - t / 2,
    oz - rd / 2 + t / 2,
    oz + rd / 2 - t / 2,
    CFG.nav.cellSize,
    obstacles,
    CFG.player.radius,
  );

  return { id: 'inside', root, ground: floor, nav, interactables, occluders: [], floorY: () => 0 };
}
