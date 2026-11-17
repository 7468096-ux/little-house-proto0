import * as THREE from 'three';
import { SCREEN_RIGHT, SCREEN_UP } from '../camera';
import { LIVE, VIS } from '../visual';

// Смена света по часам. Расписание VIS.schedule ссылается на пресеты VIS.presets,
// между соседними точками значения плавно перетекают. Если задан VIS.activePreset,
// расписание игнорируется и всё время горит выбранный пресет (для настройки).
//
// Угол солнца: elevationDeg — высота над горизонтом; azimuthDeg отсчитывается ОТНОСИТЕЛЬНО
// камеры: 0° — солнце со стороны камеры (светит в лицо кадру), 90° — справа на экране,
// 180° — за сценой, -90° — слева. Тени падают в противоположную сторону.

type Preset = (typeof VIS.presets)[keyof typeof VIS.presets];
const A = new THREE.Color();
const B = new THREE.Color();

function mixColor(out: THREE.Color, a: string, b: string, t: number) {
  return out.set(a).lerp(B.set(b), t);
}

function sunOffset(out: THREE.Vector3, el: number, az: number, dist: number) {
  const e = THREE.MathUtils.degToRad(el);
  const a = THREE.MathUtils.degToRad(az);
  // «к камере» = противоположно SCREEN_UP; «вправо» = SCREEN_RIGHT
  const hx = -SCREEN_UP.x * Math.cos(a) + SCREEN_RIGHT.x * Math.sin(a);
  const hz = -SCREEN_UP.z * Math.cos(a) + SCREEN_RIGHT.z * Math.sin(a);
  return out.set(hx * Math.cos(e) * dist, Math.sin(e) * dist, hz * Math.cos(e) * dist);
}

export class Daylight {
  /** Смещение солнца относительно камеры (меняется со временем). */
  readonly sunOffset = new THREE.Vector3();

  constructor(
    private sun: THREE.DirectionalLight,
    private hemi: THREE.HemisphereLight,
    private bg: THREE.Color,
    private fog: THREE.Fog,
  ) {}

  apply(hour: number) {
    const P = VIS.presets as Record<string, Preset>;
    let a: Preset;
    let b: Preset;
    let t = 0;
    if (VIS.activePreset && P[VIS.activePreset]) {
      a = b = P[VIS.activePreset];
    } else {
      const S = VIS.schedule;
      let i = 0;
      while (i < S.length - 2 && hour >= S[i + 1].hour) i++;
      a = P[S[i].preset];
      b = P[S[i + 1].preset];
      t = THREE.MathUtils.clamp((hour - S[i].hour) / (S[i + 1].hour - S[i].hour), 0, 1);
    }
    const L = THREE.MathUtils.lerp;
    mixColor(this.sun.color, a.sun.color, b.sun.color, t);
    this.sun.intensity = L(a.sun.intensity, b.sun.intensity, t);
    mixColor(this.hemi.color, a.ambient.sky, b.ambient.sky, t);
    mixColor(this.hemi.groundColor, a.ambient.ground, b.ambient.ground, t);
    this.hemi.intensity = L(a.ambient.intensity, b.ambient.intensity, t);
    mixColor(this.bg, a.bg, b.bg, t);
    sunOffset(this.sunOffset, L(a.sun.elevationDeg, b.sun.elevationDeg, t), L(a.sun.azimuthDeg, b.sun.azimuthDeg, t), L(a.sun.distance, b.sun.distance, t));
    mixColor(this.fog.color, a.fogColor, b.fogColor, t);
    this.fog.far = L(a.fogFar, b.fogFar, t);
    LIVE.exposure = L(a.exposure, b.exposure, t);
    LIVE.bloomStrength = L(a.bloomStrength, b.bloomStrength, t);
    LIVE.saturation = L(a.saturation, b.saturation, t);
    // направление пятен света — по солнцу (поправка angleDeg добавляется в prims)
    LIVE.sunAngle = Math.atan2(-this.sunOffset.z, this.sunOffset.x);
    mixColor(A, a.windowGlow.color, b.windowGlow.color, t);
    LIVE.windowGlowColor = '#' + A.getHexString();
    LIVE.windowGlowIntensity = L(a.windowGlow.intensity, b.windowGlow.intensity, t);
  }
}
