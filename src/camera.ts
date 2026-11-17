import * as THREE from 'three';
import { CFG } from './config';
import type { P2 } from './nav/navArea';
import { onVisualChange, VIS } from './visual';

// Изометрическая ортографическая камера. Смотрит с юго-востока сверху,
// не вращается, мягко догоняет героя.

/** Направление от цели к камере. Считается из VIS.camera (наклон и поворот); 35.264° и 45° — классическая изометрия. */
export const ISO_DIR = new THREE.Vector3(1, 1, 1).normalize();
/** Куда в мире смотрят «вверх» и «вправо» экрана (для WASD). Меняются вместе с углами камеры. */
export const SCREEN_UP: P2 = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };
export const SCREEN_RIGHT: P2 = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };

function updateBasis() {
  const pitch = THREE.MathUtils.degToRad(VIS.camera.pitchDeg);
  const yaw = THREE.MathUtils.degToRad(VIS.camera.yawDeg);
  const hx = Math.sin(yaw);
  const hz = Math.cos(yaw);
  ISO_DIR.set(Math.cos(pitch) * hx, Math.sin(pitch), Math.cos(pitch) * hz);
  SCREEN_UP.x = -hx;
  SCREEN_UP.z = -hz;
  SCREEN_RIGHT.x = hz;
  SCREEN_RIGHT.z = -hx;
}
updateBasis();
onVisualChange('camera', updateBasis);

export class CameraRig {
  readonly camera: THREE.OrthographicCamera;
  readonly target = new THREE.Vector3();
  private indoors = false;
  private w = window.innerWidth;
  private h = window.innerHeight;
  private shakeLeft = 0;
  private shakeAmp = 0;
  private look = new THREE.Vector3();
  private off = new THREE.Vector3();

  constructor() {
    const C = CFG.camera;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, C.near, C.far);
    this.resize(window.innerWidth, window.innerHeight);
    onVisualChange('camera', () => this.resize(this.w, this.h));
  }

  /** В доме камера ближе (меньше метров по вертикали). */
  setIndoors(indoors: boolean) {
    this.indoors = indoors;
    this.resize(this.w, this.h);
  }

  private get viewSize() {
    return this.indoors ? VIS.camera.interiorViewSize : VIS.camera.viewSize;
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
    // на улице кадр можно сдвинуть (focusOffset, метры по миру x/z), чтобы дом стоял ближе к центру
    const o = this.indoors ? null : VIS.camera.focusOffset;
    const look = this.look.copy(this.target);
    if (o) look.add(this.off.set(o[0], 0, o[1]));
    this.camera.position.copy(look).addScaledVector(ISO_DIR, VIS.camera.distance);
    this.camera.lookAt(look);
    if (this.shakeLeft > 0) {
      const a = this.shakeAmp * (this.shakeLeft / CFG.feedback.shakeTime);
      this.camera.translateX((Math.random() * 2 - 1) * a);
      this.camera.translateY((Math.random() * 2 - 1) * a);
    }
  }
}
