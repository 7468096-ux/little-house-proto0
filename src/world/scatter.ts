import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CFG } from '../config';
import { onVisualChange, roleColor, VIS } from '../visual';
import { mat, seeded } from './prims';

// Декор на поляне: кустики-«звёздочки» травы (инстансинг) и камни. Ни то ни другое не мешает ходьбе
// и не кликается: просто картинка. Не ставится на тропинку, дом, грядки, ручей и вокруг мелких объектов.
// Параметры — в visual.json → scatter. Пересобирается на лету.

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Свободно ли место (x, z) от дороги, дома, грядок и воды; pad — запас в метрах. */
function isFree(x: number, z: number, pad: number) {
  const W = CFG.world;
  const half = W.size / 2;
  if (Math.abs(x) > half - 0.5 || Math.abs(z) > half - 0.5) return false;
  for (let i = 0; i < W.path.length - 1; i++) {
    const [ax, az] = W.path[i];
    const [bx, bz] = W.path[i + 1];
    if (distToSegment(x, z, ax, az, bx, bz) < W.pathWidth / 2 + pad) return false;
  }
  const H = W.house;
  if (Math.abs(x - H.center[0]) < H.size[0] / 2 + 0.8 + pad && Math.abs(z - H.center[1]) < H.size[1] / 2 + 0.8 + pad) return false;
  const P = W.porch;
  if (Math.abs(x - P.center[0]) < P.size[0] / 2 + pad && Math.abs(z - P.center[1]) < P.size[1] / 2 + pad) return false;
  for (const [bx, bz] of W.beds) {
    if (Math.abs(x - bx) < W.bedSize[0] / 2 + 0.3 + pad && Math.abs(z - bz) < W.bedSize[1] / 2 + 0.3 + pad) return false;
  }
  if (Math.abs(x - W.stream.x) < W.stream.width / 2 + 1 + pad) return false;
  const near = (a: number[], r: number) => Math.hypot(x - a[0], z - a[1]) < r + pad;
  if (near(W.mailbox, 0.8) || near(W.board.pos, 1.3) || near(CFG.lantern.pos, 0.8)) return false;
  for (const s of W.stumps) if (near(s, 0.9)) return false;
  if (Math.abs(z - W.fenceZ) < 0.6 + pad) return false;
  return true;
}

/** Пучок травы: три тонких гранёных лепестка веером. */
function tuftGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.ConeGeometry(0.05, 0.28, 3);
    g.translate(0, 0.14, 0.05);
    g.rotateZ((i % 2 ? 1 : -1) * 0.25);
    g.rotateY((i / 4) * Math.PI * 2);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

export function buildScatter(root: THREE.Group) {
  const group = new THREE.Group();
  group.name = 'scatter';
  root.add(group);
  const tuftGeo = tuftGeometry();
  const stoneGeo = new THREE.DodecahedronGeometry(1, 0);
  const tuftMat = mat('#ffffff', VIS.scatter.tufts.role);
  const stoneMat = mat('#ffffff', VIS.scatter.stones.role);

  const build = () => {
    for (const ch of [...group.children]) {
      group.remove(ch);
      if ((ch as THREE.InstancedMesh).dispose) (ch as THREE.InstancedMesh).dispose();
    }
    const half = CFG.world.size / 2;
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();

    const T = VIS.scatter.tufts;
    if (T.enabled && T.count > 0) {
      tuftMat.color.set(roleColor(T.role, T.shade));
      const rnd = seeded(T.seed);
      const mesh = new THREE.InstancedMesh(tuftGeo, tuftMat, T.count);
      let n = 0;
      for (let tries = 0; n < T.count && tries < T.count * 12; tries++) {
        const x = (rnd() * 2 - 1) * half;
        const z = (rnd() * 2 - 1) * half;
        if (!isFree(x, z, 0.1)) continue;
        const s = T.minScale + rnd() * (T.maxScale - T.minScale);
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        const j = 1 + (rnd() * 2 - 1) * T.colorJitter;
        mesh.setColorAt(n, col.setRGB(j, j, j));
        n++;
      }
      mesh.count = n;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    const S = VIS.scatter.stones;
    if (S.enabled && S.count > 0) {
      stoneMat.color.set(roleColor(S.role, S.shade));
      const rnd = seeded(S.seed);
      const mesh = new THREE.InstancedMesh(stoneGeo, stoneMat, S.count);
      let n = 0;
      for (let tries = 0; n < S.count && tries < S.count * 40; tries++) {
        const x = (rnd() * 2 - 1) * half;
        const z = (rnd() * 2 - 1) * half;
        const size = S.minSize + rnd() * (S.maxSize - S.minSize);
        if (!isFree(x, z, size)) continue;
        dummy.position.set(x, size * 0.2, z);
        dummy.rotation.set(rnd() * 0.4, rnd() * Math.PI * 2, rnd() * 0.4);
        dummy.scale.set(size, size * (0.45 + rnd() * 0.25), size * (0.8 + rnd() * 0.3));
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        const j = 1 + (rnd() * 2 - 1) * 0.1;
        mesh.setColorAt(n, col.setRGB(j, j, j));
        n++;
      }
      mesh.count = n;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  };
  build();
  let timer = 0;
  const soon = () => {
    clearTimeout(timer);
    timer = window.setTimeout(build, 60);
  };
  onVisualChange('scatter', soon);
  onVisualChange('palette', soon);
  onVisualChange('colors', soon);
}
