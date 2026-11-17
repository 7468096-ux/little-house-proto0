import * as THREE from 'three';
import type { NavArea, P2 } from '../nav/navArea';

export type AreaId = 'outside' | 'inside';

export type InteractKind =
  | 'houseDoor'
  | 'exitDoor'
  | 'bed'
  | 'stump'
  | 'stream'
  | 'mailbox'
  | 'gate'
  | 'stove'
  | 'plate'
  | 'sleepBed'
  | 'agata';

export interface Interactable {
  id: string;
  kind: InteractKind;
  label: string;
  area: AreaId;
  /** Группа мешей: по ней работает подсветка и клик. */
  root: THREE.Object3D;
  /** Номер грядки или пня (для состояния). */
  index?: number;
  /** Куда подходить. Если нет — к точке клика (например, к нужному месту ручья). */
  approach?: P2;
  /** Куда повернуться после подхода. Если нет — к точке клика. */
  faceTo?: P2;
}

export interface Area {
  id: AreaId;
  root: THREE.Group;
  /** Пол/земля для кликов «просто иди сюда». */
  ground: THREE.Object3D;
  nav: NavArea;
  interactables: Interactable[];
  /** Крупные объекты, которые просвечивают, когда герой за ними. */
  occluders: THREE.Object3D[];
  /** Высота пола в точке (крыльцо чуть выше земли). */
  floorY(x: number, z: number): number;
}
