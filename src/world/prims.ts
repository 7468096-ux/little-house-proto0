import * as THREE from 'three';

// Примитивы с плоским цветом. У каждого меша свой материал,
// чтобы подсветка одного объекта не зажигала остальные.

export function mat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
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
