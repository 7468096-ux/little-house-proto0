import * as THREE from 'three';
import { CFG } from './config';
import type { P2 } from './nav/navArea';
import { mat } from './world/prims';
import type { Area, Interactable } from './world/types';

// Герой-капсула. Идёт по пути из точек (клик) или прямо от WASD.

export class Player {
  readonly mesh = new THREE.Group();
  pos: P2;
  heading = 0;
  private path: P2[] = [];
  private pending: { it: Interactable; face: P2 } | null = null;
  /** Вызывается, когда герой дошёл до объекта. */
  onArrive: (it: Interactable) => void = () => {};

  constructor(public area: Area, start: P2) {
    const P = CFG.player;
    const len = P.height - P.radius * 2;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(P.radius, len, 6, 12), mat(CFG.colors.player));
    body.position.y = P.height / 2;
    body.castShadow = true;
    // «нос» — чтобы было видно, куда герой смотрит
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.25), mat(CFG.colors.playerNose));
    nose.position.set(0, P.height * 0.72, P.radius);
    nose.castShadow = true;
    this.mesh.add(body, nose);
    this.pos = { ...start };
    this.syncMesh();
  }

  get isWalking() {
    return this.path.length > 0;
  }

  /** Перенести героя (вход/выход из дома). */
  teleport(area: Area, p: P2, face: P2 | null) {
    this.area = area;
    this.pos = { ...p };
    this.stop();
    if (face) this.heading = Math.atan2(face.x - p.x, face.z - p.z);
    this.syncMesh();
  }

  stop() {
    this.path = [];
    this.pending = null;
  }

  /** Идти к точке на земле. Возвращает false, если дойти нельзя. */
  walkTo(target: P2): boolean {
    const nav = this.area.nav;
    const goal = nav.nearestFree(target, this.pos, CFG.nav.maxSearchRadius);
    if (!goal) return false;
    const path = nav.findPath(this.pos, goal);
    if (!path) return false;
    this.path = path;
    this.pending = null;
    return true;
  }

  /** Подойти к объекту и потом «действовать». */
  walkToObject(it: Interactable, clickPoint: P2): boolean {
    const target = it.approach ?? clickPoint;
    const face = it.faceTo ?? clickPoint;
    if (!this.walkTo(target)) return false;
    this.pending = { it, face };
    return true;
  }

  update(dt: number, wasd: P2) {
    const P = CFG.player;
    const nav = this.area.nav;
    let moveDir: P2 | null = null;

    if (wasd.x !== 0 || wasd.z !== 0) {
      // клавиши отменяют клик-путь
      this.stop();
      const step = P.speed * dt;
      const next = nav.resolve({ x: this.pos.x + wasd.x * step, z: this.pos.z + wasd.z * step });
      this.pos = next;
      moveDir = wasd;
    } else if (this.path.length > 0) {
      let budget = P.speed * dt;
      while (budget > 0 && this.path.length > 0) {
        const tgt = this.path[0];
        const dx = tgt.x - this.pos.x;
        const dz = tgt.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d <= Math.max(budget, P.arriveDistance)) {
          this.pos = { ...tgt };
          budget -= d;
          this.path.shift();
        } else {
          this.pos = { x: this.pos.x + (dx / d) * budget, z: this.pos.z + (dz / d) * budget };
          moveDir = { x: dx, z: dz };
          budget = 0;
        }
      }
      if (this.path.length === 0 && this.pending) {
        const { it, face } = this.pending;
        this.pending = null;
        this.heading = Math.atan2(face.x - this.pos.x, face.z - this.pos.z);
        this.onArrive(it);
      }
    }

    if (moveDir) {
      const want = Math.atan2(moveDir.x, moveDir.z);
      let diff = want - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * Math.min(1, P.turnSpeed * dt);
    }
    this.syncMesh();
  }

  private syncMesh() {
    this.mesh.position.set(this.pos.x, this.area.floorY(this.pos.x, this.pos.z), this.pos.z);
    this.mesh.rotation.y = this.heading;
  }
}
