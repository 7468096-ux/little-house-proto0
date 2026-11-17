import { CFG } from '../config';
import { ITEM_IDS, type Inventory, type ItemId } from '../game/inventory';

// Панель инвентаря внизу экрана и полёт предмета в неё:
// предмет вылетает из точки на экране, по дуге «впрыгивает» в ячейку,
// счётчик коротко подпрыгивает.

export function itemIcon(id: ItemId): HTMLElement {
  const el = document.createElement('span');
  el.className = `icon icon-${id}`;
  el.style.setProperty('--c', CFG.items[id].color);
  return el;
}

export class InventoryUi {
  private bar = document.createElement('div');
  private slots = new Map<ItemId, { el: HTMLElement; count: HTMLElement }>();
  private shown = {} as Record<ItemId, number>;
  private inFlight = {} as Record<ItemId, number>;
  /** Вызывается, когда предмет долетел (для звука). index — номер в серии. */
  onLand: (id: ItemId, index: number) => void = () => {};

  constructor(parent: HTMLElement, private inv: Inventory) {
    this.bar.className = 'inventory';
    for (const id of ITEM_IDS) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.title = CFG.items[id].name;
      const name = document.createElement('span');
      name.className = 'slot-name';
      name.textContent = CFG.items[id].name;
      const count = document.createElement('span');
      count.className = 'slot-count';
      el.append(itemIcon(id), count, name);
      this.bar.append(el);
      this.slots.set(id, { el, count });
      this.shown[id] = 0;
      this.inFlight[id] = 0;
    }
    parent.append(this.bar);
    this.sync();
  }

  /** Привести цифры к инвентарю (с учётом предметов, что ещё летят). */
  sync() {
    for (const id of ITEM_IDS) {
      this.shown[id] = Math.max(0, this.inv.get(id) - this.inFlight[id]);
      this.render(id);
    }
  }

  private render(id: ItemId) {
    const s = this.slots.get(id)!;
    const n = this.shown[id];
    s.count.textContent = id === 'water' ? `${n}/${CFG.gather.bucketCapacity}` : String(n);
    s.el.classList.toggle('empty', n === 0);
  }

  /** Запустить n предметов из точки экрана (x, y) в ячейку. */
  fly(id: ItemId, x: number, y: number, n: number) {
    const F = CFG.feedback;
    const slot = this.slots.get(id)!.el;
    for (let i = 0; i < n; i++) {
      this.inFlight[id]++;
      window.setTimeout(() => {
        const r = slot.getBoundingClientRect();
        const tx = r.left + r.width / 2;
        const ty = r.top + r.height / 2 - 6;
        const icon = itemIcon(id);
        icon.classList.add('flying');
        document.body.append(icon);
        const sx = x + (Math.random() - 0.5) * 30;
        const sy = y + (Math.random() - 0.5) * 20;
        const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 60;
        const my = Math.min(sy, ty) - F.flyArcHeight;
        const anim = icon.animate(
          [
            { transform: `translate(${sx}px, ${sy}px) scale(0.6)` },
            { transform: `translate(${mx}px, ${my}px) scale(1.5)`, offset: 0.4 },
            { transform: `translate(${tx}px, ${ty}px) scale(1)` },
          ],
          { duration: F.flyTime, easing: 'cubic-bezier(.45,0,.55,1)' },
        );
        anim.onfinish = () => {
          icon.remove();
          this.inFlight[id]--;
          this.shown[id] = Math.min(this.inv.get(id), this.shown[id] + 1);
          this.render(id);
          this.bump(slot);
          this.onLand(id, i);
        };
      }, i * F.flyStagger);
    }
  }

  private bump(el: HTMLElement) {
    el.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.3) translateY(-6px)' }, { transform: 'scale(1)' }],
      { duration: CFG.feedback.bumpTime, easing: 'ease-out' },
    );
  }
}
