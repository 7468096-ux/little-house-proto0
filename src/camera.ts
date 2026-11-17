import * as THREE from 'three';
import { CFG } from './config';
import type { P2 } from './nav/navArea';

// Изометрическая ортографическая камера. Смотрит с юго-востока сверху,
// не вращается, мягко догоняет героя.

/** Направление от цели к камере: классическая изометрия (1, 1, 1). */
export const ISO_DIR = new THREE.Vector3(1, 1, 1).normalize();
/** Куда в мире смотрят «вверх» и «вправо» экрана (для WASD). */
export const SCREEN_UP: P2 = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };
export const SCREEN_RIGHT: P2 = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };

export class CameraRig {
  readonly camera: THREE.OrthographicCamera;
  readonly target = new THREE.Vector3();
  private viewSize = CFG.camera.viewSize;
  private w = window.innerWidth;
  private h = window.innerHeight;
  private shakeLeft = 0;
  private shakeAmp = 0;

  constructor() {
    const C = CFG.camera;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, C.near, C.far);
    this.resize(window.innerWidth, window.innerHeight);
  }

  /** Сколько метров мира видно по вертикали (в доме — ближе). */
  setViewSize(size: number) {
    this.viewSize = size;
    this.resize(this.w, this.h);
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const half = this.viewSize / 2;
    const aspect = w / h;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
  }

  snapTo(p: P2) {
    this.target.set(p.x, 0, p.z);
    this.apply();
  }

  /** Короткая тряска камеры (последний удар по пню). */
  shake(amount: number, time: number) {
    this.shakeAmp = amount;
    this.shakeLeft = time;
  }

  follow(p: P2, dt: number) {
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    const k = 1 - Math.exp(-CFG.camera.followSharpness * dt);
    this.target.x += (p.x - this.target.x) * k;
    this.target.z += (p.z - this.target.z) * k;
    this.apply();
  }

  private apply() {
    this.camera.position.copy(this.target).addScaledVector(ISO_DIR, CFG.camera.distance);
    this.camera.lookAt(this.target);
    if (this.shakeLeft > 0) {
      const a = this.shakeAmp * (this.shakeLeft / CFG.feedback.shakeTime);
      this.camera.translateX((Math.random() * 2 - 1) * a);
      this.camera.translateY((Math.random() * 2 - 1) * a);
    }
  }
}
