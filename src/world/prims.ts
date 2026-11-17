import { LIVE, VIS, onVisualChange } from '../visual';
import * as THREE from 'three';

// Примитивы с плоским цветом и гранёной (low-poly) заливкой. У каждого меша свой материал,
// чтобы подсветка одного объекта не зажигала остальные.

/** Ссылка на цвет палитры по имени: материал помнит имя и перекрашивается при правке VIS.colors. */
export interface ColorRef {
  readonly key: string;
}
export type ColorKey = keyof typeof VIS.colors;
export type Col = string | ColorRef;
/** Имена цветов палитры: `COLK.house` → ссылка на VIS.colors.house. */
export const COLK = new Proxy({}, { get: (_t, k) => ({ key: String(k) }) }) as Record<ColorKey, ColorRef>;

export function resolve(c: Col): string {
  return typeof c === 'string' ? c : (VIS.colors as Record<string, string>)[c.key];
}

const byColor = new Map<string, Set<THREE.MeshStandardMaterial>>();
const allMats = new Set<THREE.MeshStandardMaterial>();

// --- двухтоновая заливка по палитре ---
// Освещённость пикселя (отношение света к цвету поверхности) выбирает между цветом роли
// на свету и в тени (тень = свет × shadow/light). Так тени получаются зелёными, а не серыми.
const PAL = {
  on: { value: 1 },
  tint: { value: 0 },
  ref: { value: 0.9 },
  from: { value: 0.5 },
  to: { value: 2 },
};
function syncPal() {
  PAL.on.value = VIS.materials.paletteShading ? 1 : 0;
  PAL.tint.value = VIS.materials.lightTint;
  PAL.ref.value = VIS.materials.shadeRef;
  PAL.from.value = VIS.materials.shadeFrom;
  PAL.to.value = VIS.materials.shadeTo;
}
syncPal();

// Пятна света: крупный процедурный рисунок «крон» по мировым координатам (привязан к миру, не к камере).
// Применяется в двухтоновой заливке: в пятне тени место на свету красится как в тени.
const PATCH = {
  strength: { value: 0 },
  scale: { value: 0.1 },
  soft: { value: 0.1 },
  stretch: { value: 2 },
  angle: { value: 0 },
  seed: { value: 0 },
};
function syncPatch() {
  const P = VIS.lightPatches;
  PATCH.strength.value = P.enabled ? P.strength : 0;
  PATCH.scale.value = P.scale;
  PATCH.soft.value = P.softness;
  PATCH.stretch.value = P.stretch;
  PATCH.angle.value = (P.angleDeg * Math.PI) / 180;
  PATCH.seed.value = P.seed;
}
syncPatch();
onVisualChange('lightPatches', syncPatch);

/** Каждый кадр: при followSun пятна вытянуты вдоль теней от солнца (angleDeg — поправка). */
export function tickPatches() {
  const P = VIS.lightPatches;
  const extra = (P.angleDeg * Math.PI) / 180;
  PATCH.angle.value = P.followSun ? LIVE.sunAngle + extra : extra;
}

/** Отношение shadow/light роли по каналам: на сколько цвет в тени темнее и в какую сторону сдвинут. */
function roleRatio(role: string | undefined, out: THREE.Vector3) {
  const p = role ? (VIS.palette as Record<string, { light: string; shadow: string }>)[role] : undefined;
  if (!p) return out.set(1, 1, 1);
  const a = new THREE.Color(p.light);
  const b = new THREE.Color(p.shadow);
  return out.set(b.r / Math.max(a.r, 1e-3), b.g / Math.max(a.g, 1e-3), b.b / Math.max(a.b, 1e-3));
}

function patchPalette(m: THREE.MeshStandardMaterial, role: string | undefined) {
  const mul = { value: roleRatio(role, new THREE.Vector3()) };
  m.userData.role = role;
  m.userData.mul = mul;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPalOn = PAL.on;
    sh.uniforms.uPalTint = PAL.tint;
    sh.uniforms.uPalRef = PAL.ref;
    sh.uniforms.uPalFrom = PAL.from;
    sh.uniforms.uPalTo = PAL.to;
    sh.uniforms.uPalMul = mul;
    sh.uniforms.uPatchStrength = PATCH.strength;
    sh.uniforms.uPatchScale = PATCH.scale;
    sh.uniforms.uPatchSoft = PATCH.soft;
    sh.uniforms.uPatchStretch = PATCH.stretch;
    sh.uniforms.uPatchAngle = PATCH.angle;
    sh.uniforms.uPatchSeed = PATCH.seed;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPalWorld;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 palW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          palW = instanceMatrix * palW;
        #endif
        vPalWorld = (modelMatrix * palW).xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPalWorld;
        uniform float uPalOn, uPalTint, uPalRef, uPalFrom, uPalTo, uPatchStrength, uPatchScale, uPatchSoft, uPatchStretch, uPatchAngle, uPatchSeed;
        uniform vec3 uPalMul;
        float palHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float palNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(palHash(i), palHash(i + vec2(1.0, 0.0)), f.x), mix(palHash(i + vec2(0.0, 1.0)), palHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`)
      .replace(
        '#include <opaque_fragment>',
        `if (uPalOn > 0.5) {
          vec3 lit = outgoingLight - totalEmissiveRadiance;
          vec3 lw = vec3(0.299, 0.587, 0.114);
          float illum = dot(lit, lw) / max(dot(diffuseColor.rgb, lw), 1e-3);
          float t = smoothstep(uPalFrom, uPalTo, illum);
          vec2 q = vPalWorld.xz + uPatchSeed * 17.0;
          q = vec2(cos(uPatchAngle) * q.x - sin(uPatchAngle) * q.y, sin(uPatchAngle) * q.x + cos(uPatchAngle) * q.y);
          q.x /= uPatchStretch;
          q *= uPatchScale * 10.0;
          float pn = palNoise(q) * 0.65 + palNoise(q * 2.3 + 7.1) * 0.35;
          t *= mix(1.0 - uPatchStrength, 1.0, smoothstep(0.5 - uPatchSoft, 0.5 + uPatchSoft, pn));
          // оттенок света на освещённых местах: цвет падающего света (солнце) без яркости, доля uPalTint;
          // теневой цвет берётся из палитры как есть
          vec3 irr = lit / max(diffuseColor.rgb, vec3(0.02));
          vec3 chroma = clamp(irr / max(dot(irr, lw), 1e-3), 0.0, 2.0);
          vec3 tintMul = mix(vec3(1.0), chroma, uPalTint * t);
          outgoingLight = mix(diffuseColor.rgb * uPalMul, diffuseColor.rgb, t) * tintMul * clamp(illum / uPalRef, 0.0, 1.0) + totalEmissiveRadiance;
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'pal';
}

/** Материал цвета color. role — роль палитры для двухтоновой заливки, если цвет задан строкой (декор). */
export function mat(color: Col, role?: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: resolve(color), roughness: VIS.materials.roughness, metalness: VIS.materials.metalness, flatShading: true });
  allMats.add(m);
  if (typeof color === 'string') {
    if (role) patchPalette(m, role);
  } else {
    patchPalette(m, (VIS.colorRoles as Record<string, { role: string }>)[color.key]?.role);
    const set = byColor.get(color.key) ?? new Set();
    set.add(m);
    byColor.set(color.key, set);
  }
  return m;
}

/** Материал, который берёт цвет из вершин (градиенты на земле, ярусах елей, воде). */
export function vmat(flatShading = true, role?: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: VIS.materials.vertexRoughness, metalness: VIS.materials.metalness, flatShading });
  m.userData.vertex = true;
  patchPalette(m, role);
  allMats.add(m);
  return m;
}

/** Материалы, созданные для цвета палитры key (например окна). */
export function materialsOf(key: ColorKey): Iterable<THREE.MeshStandardMaterial> {
  return byColor.get(key) ?? [];
}

/** Перекрасить все материалы по текущей палитре. */
function recolorAll() {
  for (const [key, set] of byColor) {
    const hex = (VIS.colors as Record<string, string>)[key];
    for (const m of set) m.color.set(hex);
  }
}
function updateMaterialParams() {
  for (const m of allMats) {
    m.roughness = m.userData.vertex ? VIS.materials.vertexRoughness : VIS.materials.roughness;
    m.metalness = VIS.materials.metalness;
  }
}
onVisualChange('colors', recolorAll);
onVisualChange('materials', () => {
  updateMaterialParams();
  syncPal();
});
onVisualChange('palette', () => {
  for (const m of allMats) if (m.userData.mul) roleRatio(m.userData.role, m.userData.mul.value);
});

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
export function ramp(stops: [number, Col][]) {
  const cs = stops.map(([t, c]) => [t, new THREE.Color(resolve(c))] as const);
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
export function box(w: number, h: number, d: number, color: Col, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)));
  m.position.set(x, y + h / 2, z);
  return m;
}

/** Цилиндр, стоящий основанием на y. */
export function cyl(rTop: number, rBottom: number, h: number, color: Col, x = 0, y = 0, z = 0, seg = 10): THREE.Mesh {
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat(color)));
  m.position.set(x, y + h / 2, z);
  return m;
}

/** Конус, стоящий основанием на y. */
export function cone(r: number, h: number, color: Col, x = 0, y = 0, z = 0, seg = 8): THREE.Mesh {
  const m = shadowed(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color)));
  m.position.set(x, y + h / 2, z);
  return m;
}

/** Бревно, лежащее вдоль оси X (или Z, если alongZ), центр на высоте y. */
export function log(len: number, r: number, color: Col, x: number, y: number, z: number, alongZ = false, seg = 8): THREE.Mesh {
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat(color)));
  m.position.set(x, y, z);
  if (alongZ) m.rotation.x = Math.PI / 2;
  else m.rotation.z = Math.PI / 2;
  return m;
}

/** Плоская полоса на земле (тропинка, вода). */
export function flat(w: number, d: number, color: Col, x: number, y: number, z: number): THREE.Mesh {
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
