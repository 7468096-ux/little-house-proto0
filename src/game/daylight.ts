import * as THREE from 'three';
import { CFG } from '../config';

// Смена света по часам: утро, день, закат (17–21), ночь.
// Ключевые точки — в config.json → daylight; между ними плавный переход.

const keys = CFG.daylight.map((k) => ({
  hour: k.hour,
  sun: new THREE.Color(k.sun),
  sunI: k.sunI,
  sky: new THREE.Color(k.sky),
  ground: new THREE.Color(k.ground),
  hemiI: k.hemiI,
  bg: new THREE.Color(k.bg),
  sunPos: new THREE.Vector3(...(k.sunPos as [number, number, number])),
}));

export class Daylight {
  /** Смещение солнца относительно камеры (меняется со временем). */
  readonly sunOffset = new THREE.Vector3();

  constructor(
    private sun: THREE.DirectionalLight,
    private hemi: THREE.HemisphereLight,
    private bg: THREE.Color,
  ) {}

  apply(hour: number) {
    let i = 0;
    while (i < keys.length - 2 && hour >= keys[i + 1].hour) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const t = THREE.MathUtils.clamp((hour - a.hour) / (b.hour - a.hour), 0, 1);
    this.sun.color.copy(a.sun).lerp(b.sun, t);
    this.sun.intensity = THREE.MathUtils.lerp(a.sunI, b.sunI, t);
    this.hemi.color.copy(a.sky).lerp(b.sky, t);
    this.hemi.groundColor.copy(a.ground).lerp(b.ground, t);
    this.hemi.intensity = THREE.MathUtils.lerp(a.hemiI, b.hemiI, t);
    this.bg.copy(a.bg).lerp(b.bg, t);
    this.sunOffset.copy(a.sunPos).lerp(b.sunPos, t);
  }
}
