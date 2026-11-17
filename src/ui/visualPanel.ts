import GUI from 'lil-gui';
import { emitVisualChange, VIS } from '../visual';

// Панель визуала по клавише F2. Строится сама по объекту VIS:
// «#xxxxxx» → выбор цвета, число → ползунок, остальные строки → поле.
// Правка видна сразу. «Сохранить» пишет src/visual.json (в разработке) или скачивает файл.

export interface PanelCtx {
  getHour(): number;
  setHour(h: number): void;
  setFrozen(on: boolean): void;
  isFrozen(): boolean;
}

/** Диапазоны ползунков по имени поля; для остальных — от значения. */
const RANGES: Record<string, [number, number, number]> = {
  pitchDeg: [10, 80, 0.5],
  yawDeg: [0, 360, 1],
  viewSize: [6, 40, 0.1],
  interiorViewSize: [4, 20, 0.1],
  distance: [10, 100, 1],
  focusOffset: [-8, 8, 0.1],
  hour: [0, 27, 0.1],
  bias: [-0.01, 0.01, 0.0001],
  normalBias: [0, 0.2, 0.001],
  shadowBias: [-0.01, 0.01, 0.0001],
  roughness: [0, 1, 0.01],
  vertexRoughness: [0, 1, 0.01],
  metalness: [0, 1, 0.01],
  particleRoughness: [0, 1, 0.01],
  vignette: [0, 1, 0.01],
  vignetteStart: [0, 2, 0.01],
  vignetteEnd: [0, 3, 0.01],
  saturation: [0, 2, 0.01],
  contrast: [0.5, 2, 0.01],
  lift: [0, 2, 0.01],
  tint: [0, 1, 0.01],
  warmHighlights: [0, 1, 0.01],
  shadowMapSize: [256, 4096, 256],
};

function rangeFor(key: string, v: number): [number, number, number] {
  if (RANGES[key]) return RANGES[key];
  const m = Math.max(1, Math.abs(v) * 3);
  return [v < 0 ? -m : 0, m, m / 200];
}

function build(gui: GUI, obj: Record<string, unknown>, section: string) {
  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val)) {
      const f = gui.addFolder(key).close();
      val.forEach((item, i) => {
        if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>;
          build(f.addFolder(String(o.hour ?? i)).close(), o, section);
        } else if (typeof item === 'number') {
          const [mn, mx, st] = rangeFor(key, item);
          f.add(val as unknown as Record<string, number>, String(i), mn, mx, st).name(String(i)).onChange(() => emitVisualChange(section));
        }
      });
    } else if (val && typeof val === 'object') {
      build(gui.addFolder(key).close(), val as Record<string, unknown>, section);
    } else if (typeof val === 'number') {
      const [mn, mx, st] = rangeFor(key, val);
      gui.add(obj, key, mn, mx, st).onChange(() => emitVisualChange(section));
    } else if (typeof val === 'boolean') {
      gui.add(obj, key).onChange(() => emitVisualChange(section));
    } else if (typeof val === 'string') {
      const c = /^#[0-9a-fA-F]{6}$/.test(val) ? gui.addColor(obj, key) : gui.add(obj, key);
      c.onChange(() => emitVisualChange(section));
    }
  }
}

function pretty() {
  return JSON.stringify(VIS, null, 2) + '\n';
}

export class VisualPanel {
  private gui: GUI;

  constructor(ctx: PanelCtx) {
    this.gui = new GUI({ title: 'Визуал (F2)', width: 320 });
    this.gui.domElement.style.zIndex = '1000';
    this.gui.hide();

    const top = {
      hour: ctx.getHour(),
      frozen: ctx.isFrozen(),
      save: async () => {
        if (import.meta.env.DEV) {
          const r = await fetch('/__save-visual', { method: 'POST', body: pretty() });
          this.gui.title(r.ok ? 'Визуал — сохранено' : 'Визуал — ошибка записи');
        } else {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([pretty()], { type: 'application/json' }));
          a.download = 'visual.json';
          a.click();
        }
      },
      copy: () => navigator.clipboard?.writeText(pretty()),
      reload: () => location.reload(),
    };
    const hourCtl = this.gui.add(top, 'hour', 0, 27, 0.05).name('час').onChange((h: number) => ctx.setHour(h));
    const presetNames = ['', ...Object.keys(VIS.presets)];
    this.gui
      .add(VIS, 'activePreset', presetNames)
      .name('пресет (пусто = по часам)');
    this.gui.add(top, 'frozen').name('время стоит').onChange((on: boolean) => ctx.setFrozen(on));
    this.gui.add(top, 'save').name('Сохранить в visual.json');
    this.gui.add(top, 'copy').name('Скопировать JSON');
    this.gui.add(top, 'reload').name('Сбросить (перезагрузка)');
    setInterval(() => {
      if (!this.gui._hidden) hourCtl.setValue(ctx.getHour());
    }, 500);

    for (const [section, val] of Object.entries(VIS)) {
      const f = this.gui.addFolder(section).close();
      if (typeof val !== 'object') continue;
      if (Array.isArray(val)) build(f, { [section]: val }, section);
      else build(f, val as Record<string, unknown>, section);
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F2') {
        e.preventDefault();
        this.gui._hidden ? this.gui.show() : this.gui.hide();
      }
    });
  }
}
