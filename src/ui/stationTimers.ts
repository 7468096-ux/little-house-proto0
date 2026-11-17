import { CFG } from '../config';
import type { Slot, StationId } from '../game/cooking';

// Таймер над станцией: полоска и сколько минут осталось, потом «готово — забрать».

export class StationTimers {
  private els = new Map<StationId, { el: HTMLElement; bar: HTMLElement; text: HTMLElement }>();

  constructor(parent: HTMLElement) {
    for (const id of ['stove', 'plate'] as StationId[]) {
      const el = document.createElement('div');
      el.className = 'timer';
      const track = document.createElement('div');
      track.className = 'timer-track';
      const bar = document.createElement('div');
      bar.className = 'timer-bar';
      track.append(bar);
      const text = document.createElement('div');
      text.className = 'timer-text';
      el.append(text, track);
      parent.append(el);
      this.els.set(id, { el, bar, text });
    }
  }

  /** pos — точка на экране над станцией, null — не показывать. */
  update(id: StationId, slot: Slot | null, pos: { x: number; y: number } | null) {
    const e = this.els.get(id)!;
    if (!slot || !pos) {
      e.el.style.display = 'none';
      return;
    }
    const U = CFG.texts.ui;
    e.el.style.display = 'block';
    e.el.style.transform = `translate(${pos.x}px, ${pos.y + CFG.feedback.timerLabelOffsetY}px) translate(-50%, -100%)`;
    const done = slot.left <= 0;
    e.el.classList.toggle('ready', done);
    const frac = 1 - slot.left / slot.recipe.hours;
    e.bar.style.width = `${Math.round(frac * 100)}%`;
    const name = CFG.items[slot.recipe.product].name;
    e.text.textContent = done
      ? `${name}: ${U.ready}`
      : `${name}: ${U.cooking.replace('{m}', String(Math.ceil(slot.left * 60)))}`;
  }
}
