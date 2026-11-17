import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CFG } from '../config';

// Цветокоррекция кадра (как Gradient Map + Color Balance в Photoshop):
// тени уводим в зелёно-бирюзовый и не даём им стать чёрными, светлые места — в жёлтый,
// края кадра мягко темнеют (виньетка), чтобы свет в центре «светился».
// Все числа — в config.json → render.grade.

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    cShadow: { value: new THREE.Color() },
    cMid: { value: new THREE.Color() },
    cLight: { value: new THREE.Color() },
    cWarm: { value: new THREE.Color() },
    lift: { value: 0 },
    tint: { value: 0 },
    warmHighlights: { value: 0 },
    vignette: { value: 0 },
    saturation: { value: 1 },
    contrast: { value: 1 },
    vStart: { value: 0 },
    vEnd: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 cShadow, cMid, cLight, cWarm;
    uniform float lift, tint, warmHighlights, vignette, vStart, vEnd, saturation, contrast;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      // насыщенность и контраст вокруг среднего серого
      float l0 = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l0), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      c = clamp(c, 0.0, 1.0);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      // карта градиента по яркости: тень → средний тон → свет
      vec3 g = l < 0.5 ? mix(cShadow, cMid, l / 0.5) : mix(cMid, cLight, (l - 0.5) / 0.5);
      float gl = dot(g, vec3(0.299, 0.587, 0.114));
      // добавляем только «оттенок» карты, яркость оставляем свою
      c += (g - vec3(gl)) * tint * 2.0;
      // света — чуть теплее
      c = mix(c, c * (cWarm / max(dot(cWarm, vec3(0.299, 0.587, 0.114)), 1e-3)), warmHighlights * smoothstep(0.45, 0.95, l));
      // чёрного нет: самые тёмные места подтягиваются к цвету тени
      c = mix(cShadow * lift, vec3(1.0), c);
      // виньетка: края темнеют в сторону цвета тени
      vec2 p = (vUv - 0.5) * 2.0;
      float v = smoothstep(vStart, vEnd, length(p)) * vignette;
      c = mix(c, cShadow, v);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
    }`,
};

export class Grade {
  private composer: EffectComposer | null = null;
  private pass: ShaderPass | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    const G = CFG.render.grade;
    if (!G.enabled) return;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new OutputPass()); // перевод в sRGB — дальше работаем в «экранных» цветах, как в Photoshop
    this.pass = new ShaderPass(GradeShader);
    const u = this.pass.uniforms;
    u.cShadow.value.set(G.shadow).convertLinearToSRGB();
    u.cMid.value.set(G.mid).convertLinearToSRGB();
    u.cLight.value.set(G.light).convertLinearToSRGB();
    u.cWarm.value.set(G.warm).convertLinearToSRGB();
    u.lift.value = G.lift;
    u.tint.value = G.tint;
    u.warmHighlights.value = G.warmHighlights;
    u.vignette.value = G.vignette;
    u.saturation.value = G.saturation;
    u.contrast.value = G.contrast;
    u.vStart.value = G.vignetteStart;
    u.vEnd.value = G.vignetteEnd;
    this.composer.addPass(this.pass);
    this.resize(window.innerWidth, window.innerHeight);
  }

  resize(w: number, h: number) {
    if (!this.composer || !this.pass) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    if (this.composer) this.composer.render();
    else this.renderer.render(scene, camera);
  }
}
