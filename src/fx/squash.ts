import type * as THREE from 'three';
import { CFG } from '../config';

// Squash: объект коротко сжимается и тут же пружинит обратно.

const active = new Map<THREE.Object3D, number>();

export function squash(obj: THREE.Object3D, strength = 1) {
  active.set(obj, 0);
  obj.userData.squashStrength = strength;
}

export function updateSquash(dt: number) {
  const T = CFG.feedback.squashTime;
  for (const [obj, t0] of active) {
    const t = t0 + dt;
    if (t >= T) {
      obj.scale.set(1, 1, 1);
      active.delete(obj);
      continue;
    }
    active.set(obj, t);
    const k = t / T;
    // сначала сжатие, потом лёгкое вытягивание, затухает
    const e = Math.sin(k * Math.PI * 2) * (1 - k);
    const a = CFG.feedback.squashAmount * (obj.userData.squashStrength ?? 1);
    obj.scale.set(1 + a * 0.5 * e, 1 - a * e, 1 + a * 0.5 * e);
  }
}
