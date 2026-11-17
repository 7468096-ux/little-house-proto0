import { CFG } from '../config';

// Инвентарь: сколько чего есть. Без лимита, кроме воды (ведро).

export type ItemId = keyof typeof CFG.items;
export const ITEM_IDS = Object.keys(CFG.items) as ItemId[];

export class Inventory {
  readonly counts = Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as Record<ItemId, number>;
  /** Вызывается при любом изменении (для экрана). */
  onChange: () => void = () => {};

  get(id: ItemId) {
    return this.counts[id];
  }

  add(id: ItemId, n: number) {
    this.counts[id] += n;
    this.onChange();
  }

  remove(id: ItemId, n: number): boolean {
    if (this.counts[id] < n) return false;
    this.counts[id] -= n;
    this.onChange();
    return true;
  }
}
