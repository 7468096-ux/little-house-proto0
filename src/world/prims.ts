import * as THREE from 'three';

// Примитивы с плоским цветом и гранёной (low-poly) заливкой. У каждого меша свой материал,
// чтобы подсветка одного объекта не зажигала остальные.

export function mat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true });
}

/** Материал, который берёт цвет из вершин (градиенты на земле, ярусах елей, воде). */
export function vmat(flatShading = true): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading });
}

/** Раскрасить вершины геометрии функцией от позиции вершины. */
export function paint(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number, out: THREE.Color) => void) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), c);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Плавный переход по нескольким цветам: stops — [позиция, цвет] по возрастанию. */
export function ramp(stops: [number, string][]) {
  const cs = stops.map(([t, c]) => [t, new THREE.Color(c)] as const);
  return (t: number, out: THREE.Color) => {
    if (t <= cs[0][0]) return out.copy(cs[0][1]);
    for (let i = 0; i < cs.length - 1; i++) {
      const [a, ca] = cs[i];
      const [b, cb] = cs[i + 1];
      if (t <= b) return out.copy(ca).lerp(cb, THREE.MathUtils.smoothstep(t, a, b));
    }
    return out.copy(cs[cs.length - 1][1]);
  };
}

function shadowed<T extends THREE.Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Коробка, стоящая основанием на y. */
export function box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)));
  m.position.set(x, y + h / 2, z);
  return m;
}

/** Цилиндр, стоящий основанием на y. */
export function cyl(rTop: number, rBottom: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 10): THREE.Mesh {
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat(color)));
  m.position.set(x, y + h / 2, z);
  return m;
}

/** Конус, стоящий основанием на y. */
export function cone(r: number, h: number, color: string, x = 0, y = 0, z = 0, seg = 8): THREE.Mesh {
  const m = shadowed(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color)));
  m.position.set(x, y + h / 2, z);
  return m;
}

/** Бревно, лежащее вдоль оси X (или Z, если alongZ), центр на высоте y. */
export function log(len: number, r: number, color: string, x: number, y: number, z: number, alongZ = false, seg = 8): THREE.Mesh {
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat(color)));
  m.position.set(x, y, z);
  if (alongZ) m.rotation.x = Math.PI / 2;
  else m.rotation.z = Math.PI / 2;
  return m;
}

/** Плоская полоса на земле (тропинка, вода). */
export function flat(w: number, d: number, color: string, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

/** Простой генератор псевдослучайных чисел с зерном — лес каждый раз одинаковый. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Переносит «точку опоры» группы в центр её основания.
 * Нужно, чтобы объект сжимался (squash) на месте, а не относительно центра мира.
 * Вызывать до добавления группы в сцену.
 */
export function repivot(g: THREE.Object3D) {
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g);
  const cx = (b.min.x + b.max.x) / 2;
  const cz = (b.min.z + b.max.z) / 2;
  for (const ch of g.children) {
    ch.position.x -= cx;
    ch.position.z -= cz;
  }
  g.position.x += cx;
  g.position.z += cz;
}
