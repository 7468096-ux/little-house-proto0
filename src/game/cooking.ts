import { CFG } from '../config';
import type { Inventory, ItemId } from './inventory';

// Готовка: рецепты из config.json → recipes. Печь и плита готовят по одному
// изделию за раз; таймер считается в игровых часах, поэтому идёт только
// когда идут часы (на улице). Готовое ждёт сколько угодно, пока не заберут.

export type StationId = 'stove' | 'plate';

export interface Recipe {
  product: ItemId;
  station: StationId | 'inventory';
  inputs: Partial<Record<ItemId, number>>;
  hours: number;
}

export const RECIPES = CFG.recipes as Recipe[];

export interface Slot {
  recipe: Recipe;
  /** Сколько игровых часов осталось (0 — готово). */
  left: number;
}

export class Cooking {
  readonly slots: Record<StationId, Slot | null> = { stove: null, plate: null };

  constructor(private inv: Inventory) {}

  recipesFor(station: StationId | 'inventory') {
    return RECIPES.filter((r) => r.station === station);
  }

  /** Чего не хватает для рецепта: [предмет, сколько не хватает]. */
  missing(r: Recipe): [ItemId, number][] {
    const out: [ItemId, number][] = [];
    for (const [id, n] of Object.entries(r.inputs) as [ItemId, number][]) {
      const have = this.inv.get(id);
      if (have < n) out.push([id, n - have]);
    }
    return out;
  }

  /** Списать ингредиенты. false — если не хватает. */
  private consume(r: Recipe): boolean {
    if (this.missing(r).length > 0) return false;
    for (const [id, n] of Object.entries(r.inputs) as [ItemId, number][]) this.inv.remove(id, n);
    return true;
  }

  /** Поставить готовиться на станции. */
  start(station: StationId, r: Recipe): boolean {
    if (this.slots[station]) return false;
    if (!this.consume(r)) return false;
    this.slots[station] = { recipe: r, left: r.hours };
    return true;
  }

  /** Сделать сразу (связка дров в инвентаре). */
  craftNow(r: Recipe): boolean {
    if (!this.consume(r)) return false;
    return true;
  }

  /** Время прошло на hours игровых часов. */
  tick(hours: number) {
    for (const s of Object.values(this.slots)) if (s && s.left > 0) s.left = Math.max(0, s.left - hours);
  }

  /** Ночь прошла — всё, что стояло, готово. */
  finishAll() {
    for (const s of Object.values(this.slots)) if (s) s.left = 0;
  }

  /** Забрать готовое. Возвращает изделие или null. */
  take(station: StationId): ItemId | null {
    const s = this.slots[station];
    if (!s || s.left > 0) return null;
    this.slots[station] = null;
    return s.recipe.product;
  }

  /** «Картофель ×1, Вода ×1». */
  static listText(list: [ItemId, number][]) {
    return list.map(([id, n]) => `${CFG.items[id].name} ×${n}`).join(', ');
  }
}
