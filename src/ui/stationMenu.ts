import { CFG } from '../config';
import { Cooking, type Recipe } from '../game/cooking';
import type { Inventory, ItemId } from '../game/inventory';
import { itemIcon } from './inventoryUi';

// Меню станции (печь/плита): рецепты, что нужно, чего не хватает, кнопка «Готовить».
// Пока меню открыто — время стоит.

export class StationMenu {
  private back = document.createElement('div');
  isOpen = false;

  constructor(parent: HTMLElement, private inv: Inventory, private cooking: Cooking) {
    this.back.className = 'modal-backdrop';
    parent.append(this.back);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isOpen) this.closeWith(null);
    });
  }

  private resolve: (r: Recipe | null) => void = () => {};

  private closeWith(r: Recipe | null) {
    this.back.classList.remove('show');
    this.isOpen = false;
    this.resolve(r);
  }

  /** Открыть меню; вернёт выбранный рецепт или null. */
  open(title: string, recipes: Recipe[]): Promise<Recipe | null> {
    const U = CFG.texts.ui;
    this.isOpen = true;
    this.back.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'modal station';
    const h = document.createElement('div');
    h.className = 'modal-q';
    h.textContent = title;
    box.append(h);

    for (const r of recipes) {
      const card = document.createElement('div');
      card.className = 'recipe';
      const head = document.createElement('div');
      head.className = 'recipe-head';
      const name = document.createElement('span');
      name.textContent = CFG.items[r.product].name;
      const time = document.createElement('span');
      time.className = 'recipe-time';
      time.textContent = U.time.replace('{n}', String(r.hours));
      head.append(itemIcon(r.product), name, time);

      const ing = document.createElement('div');
      ing.className = 'recipe-ing';
      for (const [id, n] of Object.entries(r.inputs) as [ItemId, number][]) {
        const have = this.inv.get(id);
        const row = document.createElement('span');
        row.className = have >= n ? 'ok' : 'lack';
        row.append(itemIcon(id), ` ${CFG.items[id].name} ${Math.min(have, n)}/${n}`);
        ing.append(row);
      }

      const missing = this.cooking.missing(r);
      const btn = document.createElement('button');
      if (missing.length === 0) {
        btn.textContent = U.cook;
        btn.onclick = () => this.closeWith(r);
      } else {
        btn.disabled = true;
        btn.textContent = U.missing.replace('{list}', Cooking.listText(missing));
      }
      card.append(head, ing, btn);
      box.append(card);
    }

    const close = document.createElement('button');
    close.className = 'secondary';
    close.textContent = U.close;
    close.onclick = () => this.closeWith(null);
    box.append(close);

    this.back.append(box);
    this.back.classList.add('show');
    return new Promise((res) => (this.resolve = res));
  }
}
