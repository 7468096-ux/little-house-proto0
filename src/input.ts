import * as THREE from 'three';
import { SCREEN_RIGHT, SCREEN_UP } from './camera';
import type { P2 } from './nav/navArea';
import type { Area, Interactable } from './world/types';

// Мышь и клавиатура: что под курсором, клики, направление от WASD.

export interface Pick {
  it: Interactable | null;
  point: P2;
}

export class Input {
  private keys = new Set<string>();
  private ndc = new THREE.Vector2();
  private hasMouse = false;
  private ray = new THREE.Raycaster();
  mouseX = 0;
  mouseY = 0;
  /** Клик мышью, накопленный до следующего кадра. */
  clicked = false;

  constructor(private dom: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('pointermove', (e) => this.setMouse(e));
    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.setMouse(e);
      this.clicked = true;
    });
    dom.addEventListener('pointerleave', () => (this.hasMouse = false));
  }

  private setMouse(e: PointerEvent) {
    const r = this.dom.getBoundingClientRect();
    this.mouseX = e.clientX - r.left;
    this.mouseY = e.clientY - r.top;
    this.ndc.set((this.mouseX / r.width) * 2 - 1, -(this.mouseY / r.height) * 2 + 1);
    this.hasMouse = true;
  }

  /** Направление движения от WASD/стрелок в координатах мира (единичное или нулевое). */
  wasd(): P2 {
    let u = 0;
    let r = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) u += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) u -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) r += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) r -= 1;
    if (u === 0 && r === 0) return { x: 0, z: 0 };
    let x = SCREEN_UP.x * u + SCREEN_RIGHT.x * r;
    let z = SCREEN_UP.z * u + SCREEN_RIGHT.z * r;
    const l = Math.hypot(x, z);
    x /= l;
    z /= l;
    return { x, z };
  }

  /** Что под курсором в текущей зоне: объект (если есть) и точка на земле. */
  pick(camera: THREE.Camera, area: Area): Pick | null {
    if (!this.hasMouse) return null;
    this.ray.setFromCamera(this.ndc, camera);
    const objHits = this.ray.intersectObjects(
      area.interactables.map((i) => i.root),
      true,
    );
    if (objHits.length > 0) {
      const h = objHits[0];
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.interactable) o = o.parent;
      if (o) return { it: o.userData.interactable as Interactable, point: { x: h.point.x, z: h.point.z } };
    }
    const g = this.ray.intersectObject(area.ground, false);
    if (g.length > 0) return { it: null, point: { x: g[0].point.x, z: g[0].point.z } };
    return null;
  }
}
