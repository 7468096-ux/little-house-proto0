import { CFG } from '../config';
import type { Audio } from '../fx/audio';
import type { Particles } from '../fx/particles';
import { squash } from '../fx/squash';
import type { CameraRig } from '../camera';
import type { Tool } from '../player';
import type { InventoryUi } from '../ui/inventoryUi';
import type { OutsideArea } from '../world/outside';
import type { Interactable } from '../world/types';
import type { Inventory } from './inventory';

// Добыча: грядки, пни, ручей. Правила — из config.json → gather.
// Каждое действие даёт отклик: звук, частицы, squash, полёт предмета в инвентарь.

export type BedState = 'ripe' | 'empty' | 'planted' | 'watered';

export interface GatherCtx {
  inv: Inventory;
  invUi: InventoryUi;
  audio: Audio;
  particles: Particles;
  rig: CameraRig;
  /** Точка мира → пиксели экрана. */
  toScreen(x: number, y: number, z: number): { x: number; y: number };
  message(text: string): void;
  /** Где стоит герой и куда смотрит (для брызг у ручья). */
  hero(): { x: number; z: number; heading: number };
}

export class Gathering {
  readonly beds: BedState[];
  readonly stumps: { hits: number; choppedDay: number | null }[];
  private lastAction = 0;

  constructor(private area: OutsideArea, private ctx: GatherCtx) {
    // в начале дня 1 все грядки спелые
    this.beds = area.beds.map(() => 'ripe');
    this.stumps = area.stumps.map(() => ({ hits: 0, choppedDay: null }));
    this.beds.forEach((_, i) => this.renderBed(i));
  }

  /** Какой инструмент взять, когда идём к объекту. */
  toolFor(it: Interactable): Tool | null {
    if (it.kind === 'stump') return 'axe';
    if (it.kind === 'stream') return 'bucket';
    if (it.kind === 'bed') return this.beds[it.index!] === 'planted' ? 'can' : 'shovel';
    return null;
  }

  /** Подпись под курсором с состоянием объекта. */
  labelFor(it: Interactable): string {
    const U = CFG.texts.ui;
    if (it.kind === 'bed') {
      const s = this.beds[it.index!];
      const st = { ripe: U.bedRipe, empty: U.bedEmpty, planted: U.bedPlanted, watered: U.bedWatered }[s];
      return `${it.label}: ${st}`;
    }
    if (it.kind === 'stump') {
      return `${it.label}: ${this.isChopped(it.index!) ? U.stumpStub : U.stumpReady}`;
    }
    if (it.kind === 'stream') {
      const w = this.ctx.inv.get('water');
      return `${it.label}: ${U.streamHint} (${w}/${CFG.gather.bucketCapacity})`;
    }
    return it.label;
  }

  /** Герой подошёл к объекту и действует. Возвращает true, если это объект добычи. */
  act(it: Interactable): boolean {
    if (it.kind !== 'bed' && it.kind !== 'stump' && it.kind !== 'stream') return false;
    const now = performance.now() / 1000;
    if (now - this.lastAction < CFG.gather.actionCooldown) return true;
    this.lastAction = now;
    if (it.kind === 'bed') this.actBed(it);
    else if (it.kind === 'stump') this.actStump(it);
    else this.actStream();
    return true;
  }

  /** Новый день: политое выросло, срубленные пни отросли. */
  newDay(day: number) {
    this.beds.forEach((s, i) => {
      if (s === 'watered') this.beds[i] = 'ripe';
      this.renderBed(i);
    });
    this.stumps.forEach((s, i) => {
      if (s.choppedDay !== null && day - s.choppedDay >= CFG.gather.stumpRegrowDays) {
        s.hits = 0;
        s.choppedDay = null;
        this.renderStump(i);
      }
    });
  }

  /** Сколько грядок созреет к утру (для «Итогов дня»). */
  get growingCount() {
    return this.beds.filter((b) => b === 'watered').length;
  }

  // --- грядка ---
  private actBed(it: Interactable) {
    const i = it.index!;
    const { x, z } = it.root.position;
    const c = this.ctx;
    const U = CFG.texts.ui;
    switch (this.beds[i]) {
      case 'ripe': {
        const n = CFG.gather.digYield;
        this.beds[i] = 'empty';
        c.audio.play('dig');
        c.particles.emit('dirt', x, 0.25, z);
        squash(it.root, 1.2);
        const s = c.toScreen(x, 0.4, z);
        c.invUi.fly('potato', s.x, s.y, n);
        c.inv.add('potato', n);
        break;
      }
      case 'empty':
        this.beds[i] = 'planted';
        c.audio.play('plant');
        c.particles.emit('dirt', x, 0.25, z);
        squash(it.root, 0.8);
        break;
      case 'planted': {
        const need = CFG.gather.waterPerWatering;
        if (c.inv.get('water') < need) {
          c.audio.play('bucketFull');
          squash(it.root, 0.3);
          c.message(U.needWater);
          break;
        }
        c.inv.remove('water', need);
        this.beds[i] = 'watered';
        c.audio.play('pour');
        c.particles.emit('drops', x, 0.2, z);
        squash(it.root, 0.6);
        c.message(U.bedGrowing);
        break;
      }
      case 'watered':
        squash(it.root, 0.4);
        c.message(U.bedGrowing);
        break;
    }
    this.renderBed(i);
  }

  private renderBed(i: number) {
    const v = this.area.beds[i];
    const s = this.beds[i];
    v.plants.visible = s === 'ripe';
    v.sprouts.visible = s === 'planted' || s === 'watered';
    (v.soil.material as THREE_Mat).color.set(s === 'watered' ? CFG.colors.soilWet : CFG.colors.bedSoil);
  }

  // --- пень ---
  private isChopped(i: number) {
    return this.stumps[i].hits >= CFG.gather.chopHits;
  }

  private actStump(it: Interactable) {
    const i = it.index!;
    const c = this.ctx;
    const { x, z } = it.root.position;
    if (this.isChopped(i)) {
      squash(it.root, 0.3);
      c.message(CFG.texts.ui.stumpChopped);
      return;
    }
    const st = this.stumps[i];
    st.hits++;
    const top = CFG.world.stumpHeight;
    if (st.hits < CFG.gather.chopHits) {
      // с каждым ударом звук чуть выше — слышно, что дело идёт
      c.audio.play('hit', 1 + st.hits * 0.05);
      c.particles.emit('chips', x, top, z);
      squash(it.root, 1);
      return;
    }
    // последний удар
    st.choppedDay = this.dayRef();
    c.audio.play('chopFinal');
    c.audio.play('hit', 0.8);
    c.particles.emit('chipsBig', x, top, z);
    squash(it.root, 1.6);
    c.rig.shake(CFG.feedback.shakeAmount, CFG.feedback.shakeTime);
    this.renderStump(i);
    const n = CFG.gather.chopYield;
    const s = c.toScreen(x, top, z);
    c.invUi.fly('wood', s.x, s.y, n);
    c.inv.add('wood', n);
  }

  private renderStump(i: number) {
    this.area.stumps[i].body.scale.y = this.isChopped(i) ? CFG.feedback.stumpStubScale : 1;
  }

  /** Текущий день — задаётся снаружи (часы живут в main). */
  dayRef: () => number = () => 1;

  // --- ручей ---
  private actStream() {
    const c = this.ctx;
    const h = c.hero();
    const x = h.x + Math.sin(h.heading) * 1.0;
    const z = h.z + Math.cos(h.heading) * 1.0;
    const cap = CFG.gather.bucketCapacity;
    const have = c.inv.get('water');
    if (have >= cap) {
      c.audio.play('bucketFull');
      c.message(CFG.texts.ui.bucketFull.replaceAll('{n}', String(cap)));
      return;
    }
    const n = Math.min(CFG.gather.scoopAmount, cap - have);
    c.audio.play('splash');
    c.particles.emit('splash', x, 0.05, z);
    const s = c.toScreen(x, 0.2, z);
    c.invUi.fly('water', s.x, s.y, n);
    c.inv.add('water', n);
  }
}

type THREE_Mat = import('three').MeshStandardMaterial;
