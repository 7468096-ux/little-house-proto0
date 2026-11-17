import { CFG } from '../config';
import type { Inventory, ItemId } from './inventory';

// Заказы Агаты. Каждое утро в ящике письмо с заказом (config.json → orders).
// Сдать можно в ящик (деньги следующим утром с письмом) или из рук в руки
// у калитки 17:00–21:00 (деньги сразу + пирожок). Несданное переходит дальше.

export interface Order {
  day: number;
  title: string;
  letter: string;
  needs: Partial<Record<ItemId, number>>;
  pay: number;
  handLine: string;
}

export type Letter = { kind: 'order'; order: Order } | { kind: 'payment'; order: Order };

export type DeliveryWay = 'mail' | 'hand';

export class Orders {
  /** Принятые и ещё не сданные заказы. */
  readonly active: Order[] = [];
  /** Непрочитанные письма в ящике. */
  readonly mailbox: Letter[] = [];
  /** Сданные в ящик — оплата придёт утром. */
  private pendingMail: Order[] = [];
  /** Что сдано за всё время (для «Итогов дня»). */
  readonly delivered: { order: Order; way: DeliveryWay; day: number }[] = [];

  constructor(private inv: Inventory) {}

  /** Утро: оплата за ящик и новое письмо. */
  newDay(day: number) {
    for (const o of this.pendingMail) this.mailbox.push({ kind: 'payment', order: o });
    this.pendingMail = [];
    const o = (CFG.orders as Order[]).find((x) => x.day === day);
    if (o && !this.active.includes(o) && !this.delivered.some((d) => d.order === o)) {
      this.mailbox.push({ kind: 'order', order: o });
    }
  }

  get hasMail() {
    return this.mailbox.length > 0;
  }

  /** Прочитать следующее письмо: заказ становится активным, оплата — в монеты. */
  readNext(): Letter | null {
    const l = this.mailbox.shift() ?? null;
    if (!l) return null;
    // монеты за оплату добавляет вызывающий — чтобы они красиво прилетели
    if (l.kind === 'order') this.active.push(l.order);
    return l;
  }

  missing(o: Order): [ItemId, number][] {
    const out: [ItemId, number][] = [];
    for (const [id, n] of Object.entries(o.needs) as [ItemId, number][]) {
      const have = this.inv.get(id);
      if (have < n) out.push([id, n - have]);
    }
    return out;
  }

  private take(o: Order): boolean {
    if (this.missing(o).length > 0) return false;
    for (const [id, n] of Object.entries(o.needs) as [ItemId, number][]) this.inv.remove(id, n);
    this.active.splice(this.active.indexOf(o), 1);
    return true;
  }

  /** В ящик: вещи уходят сейчас, деньги — утром. */
  deliverMail(o: Order, day: number): boolean {
    if (!this.take(o)) return false;
    this.pendingMail.push(o);
    this.delivered.push({ order: o, way: 'mail', day });
    return true;
  }

  /** Из рук в руки: деньги сразу. Монеты и подарок добавляет вызывающий (чтобы они красиво прилетели). */
  deliverHand(o: Order, day: number): boolean {
    if (!this.take(o)) return false;
    this.delivered.push({ order: o, way: 'hand', day });
    return true;
  }

  /** Агата у калитки в этот час? */
  static agataHere(hour: number) {
    return hour >= CFG.agata.from && hour < CFG.agata.to;
  }
}
