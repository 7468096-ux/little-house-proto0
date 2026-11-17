import * as THREE from 'three';
import { CFG } from '../config';
import { box, cyl, mat } from './prims';

// Фонарь у крыльца (улучшение). Появляется после покупки.
// Ночью: тёплый свет с мягкой тенью, ореол, 3–5 мотыльков вокруг.

/** Насколько сейчас «ночь» для фонаря: 0 — выключен, 1 — горит в полную силу. */
export function lanternNight(hour: number) {
  const L = CFG.lantern;
  return THREE.MathUtils.clamp((hour - L.onFrom) / (L.fullAt - L.onFrom), 0, 1);
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,220,160,1)');
  grd.addColorStop(0.25, 'rgba(255,200,120,0.5)');
  grd.addColorStop(1, 'rgba(255,180,100,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class Lantern {
  readonly root = new THREE.Group();
  readonly lampPos: THREE.Vector3;
  private light: THREE.PointLight;
  private glass: THREE.MeshStandardMaterial;
  private glow: THREE.Sprite;
  /** Тёплое пятно на земле — видно издалека, даже когда сам фонарь за краем экрана. */
  private pool: THREE.Mesh;
  private moths: { mesh: THREE.Mesh; phase: number; r: number; h: number; speed: number }[] = [];
  private t = 0;

  constructor() {
    const L = CFG.lantern;
    const C = CFG.colors;
    const [x, z] = L.pos;
    const H = L.postHeight;
    this.root.add(cyl(0.07, 0.09, H, C.lanternPost, x, 0, z, 8));
    // кронштейн и фонарь, висящий в сторону крыльца
    const arm = box(0.5, 0.06, 0.06, C.lanternPost, x - 0.22, H - 0.1, z);
    this.root.add(arm);
    const lx = x - 0.42;
    const ly = H - 0.5;
    this.root.add(box(0.26, 0.05, 0.26, C.lanternPost, lx, ly + 0.32, z)); // крышка
    const glassMesh = box(0.2, 0.3, 0.2, C.lanternGlass, lx, ly, z);
    this.glass = glassMesh.material as THREE.MeshStandardMaterial;
    this.glass.emissive.set(L.light.color);
    glassMesh.castShadow = false;
    this.root.add(glassMesh);
    this.lampPos = new THREE.Vector3(lx, ly + 0.15, z);

    this.light = new THREE.PointLight(L.light.color, 0, L.light.distance, L.light.decay);
    this.light.position.copy(this.lampPos);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(L.light.shadowMapSize, L.light.shadowMapSize);
    this.light.shadow.radius = 4;
    this.light.shadow.bias = -0.002;
    this.root.add(this.light);

    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0,
      }),
    );
    this.glow.position.copy(this.lampPos);
    this.glow.scale.setScalar(L.glowSize);
    this.root.add(this.glow);

    this.pool = new THREE.Mesh(
      new THREE.PlaneGeometry(L.groundGlowSize, L.groundGlowSize),
      new THREE.MeshBasicMaterial({
        map: (this.glow.material as THREE.SpriteMaterial).map,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0,
      }),
    );
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.set(lx, 0.03, z);
    this.root.add(this.pool);

    const M = L.moths;
    for (let i = 0; i < M.count; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(M.size * 2, M.size * 0.4, M.size), mat(M.color));
      (mesh.material as THREE.MeshStandardMaterial).emissive.set('#ffe8c0');
      this.root.add(mesh);
      this.moths.push({
        mesh,
        phase: (i / M.count) * Math.PI * 2,
        r: M.radius * (0.6 + Math.random() * 0.8),
        h: (Math.random() - 0.5) * 0.4,
        speed: M.speed * (0.7 + Math.random() * 0.6) * (i % 2 ? 1 : -1),
      });
    }
    this.root.visible = false;
  }

  /** Обновить по «ночности» 0..1. */
  update(dt: number, night: number) {
    if (!this.root.visible) return;
    const L = CFG.lantern;
    this.t += dt;
    // лёгкое мерцание фитиля
    const flicker = 1 + Math.sin(this.t * 13) * 0.04 + Math.sin(this.t * 7.3) * 0.05;
    this.light.intensity = L.light.intensity * night * flicker;
    this.light.visible = night > 0.01;
    this.glass.emissiveIntensity = 0.15 + night * 2.2 * flicker;
    (this.glow.material as THREE.SpriteMaterial).opacity = L.glowOpacity * night * flicker;
    (this.pool.material as THREE.MeshBasicMaterial).opacity = L.groundGlowOpacity * night * flicker;
    for (const m of this.moths) {
      m.mesh.visible = night > 0.5;
      if (!m.mesh.visible) continue;
      const a = m.phase + this.t * m.speed;
      const wob = Math.sin(this.t * 5 + m.phase * 3) * 0.12;
      m.mesh.position.set(
        this.lampPos.x + Math.cos(a) * (m.r + wob),
        this.lampPos.y + m.h + Math.sin(this.t * 4 + m.phase) * 0.15,
        this.lampPos.z + Math.sin(a) * (m.r + wob),
      );
      m.mesh.rotation.y = -a;
      m.mesh.scale.x = 0.4 + Math.abs(Math.sin(this.t * 30 + m.phase)); // взмахи крыльев
    }
  }
}
