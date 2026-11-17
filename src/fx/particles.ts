import * as THREE from 'three';
import { CFG } from '../config';

// Частицы: щепки, комочки земли, брызги. Маленькие кубики,
// летят, падают под гравитацией, отскакивают от земли и тают.

export type ParticleKind = keyof typeof CFG.feedback.particles;

interface P {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  spin: THREE.Vector3;
}

const POOL = 300;

export class Particles {
  private pool: P[] = [];
  private next = 0;
  private geo = new THREE.BoxGeometry(1, 1, 1);

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }));
      mesh.visible = false;
      mesh.castShadow = true;
      scene.add(mesh);
      this.pool.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 0.1, spin: new THREE.Vector3() });
    }
  }

  /** Выпустить облачко частиц из точки (y — высота над землёй). */
  emit(kind: ParticleKind, x: number, y: number, z: number) {
    const def = CFG.feedback.particles[kind] as {
      count: number; color: string; speed: number; up: number; size: number; life: number; height?: number;
    };
    for (let i = 0; i < def.count; i++) {
      const p = this.pool[this.next];
      this.next = (this.next + 1) % POOL;
      const a = Math.random() * Math.PI * 2;
      const s = def.speed * (0.4 + Math.random() * 0.6);
      const startY = def.height !== undefined ? y + def.height * (0.8 + Math.random() * 0.4) : y;
      const spread = def.height !== undefined ? 0.5 : 0.1;
      p.mesh.position.set(
        x + (Math.random() - 0.5) * spread * 2,
        startY,
        z + (Math.random() - 0.5) * spread * 2,
      );
      p.vel.set(Math.cos(a) * s, def.up * (0.6 + Math.random() * 0.6), Math.sin(a) * s);
      p.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      p.size = def.size * (0.7 + Math.random() * 0.6);
      p.maxLife = def.life * (0.7 + Math.random() * 0.6);
      p.life = p.maxLife;
      (p.mesh.material as THREE.MeshStandardMaterial).color.set(def.color);
      p.mesh.visible = true;
    }
  }

  update(dt: number) {
    const g = CFG.feedback.gravity;
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= g * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < p.size / 2) {
        p.mesh.position.y = p.size / 2;
        p.vel.y *= -0.3;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      const k = Math.min(1, (p.life / p.maxLife) * 2);
      p.mesh.scale.setScalar(p.size * k);
    }
  }
}
