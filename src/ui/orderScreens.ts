import { CFG } from '../config';
import { Cooking } from '../game/cooking';
import type { Inventory, ItemId } from '../game/inventory';
import type { Letter, Order, Orders } from '../game/orders';
import { itemIcon } from './inventoryUi';

// Экраны заказов: письмо, почтовый ящик, разговор с Агатой у калитки,
// список текущих заказов под часами и реплика-«пузырь» над Агатой.
// Пока окно открыто — время стоит.

const U = CFG.texts.ui;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Строка «что нужно»: значок, название, есть/нужно. */
function needsRow(inv: Inventory, needs: Partial<Record<ItemId, number>>) {
  const row = el('div', 'recipe-ing');
  for (const [id, n] of Object.entries(needs) as [ItemId, number][]) {
    const have = inv.get(id);
    const s = el('span', have >= n ? 'ok' : 'lack');
    s.append(itemIcon(id), ` ${CFG.items[id].name} ${Math.min(have, n)}/${n}`);
    row.append(s);
  }
  return row;
}

export class OrderScreens {
  private back = el('div', 'modal-backdrop');
  isOpen = false;
  private finish: () => void = () => {};

  constructor(parent: HTMLElement, private inv: Inventory, private orders: Orders) {
    parent.append(this.back);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isOpen) this.finish();
    });
  }

  private open<T>(title: string, build: (box: HTMLElement, done: (v: T) => void) => void, onEsc: T): Promise<T> {
    this.isOpen = true;
    this.back.innerHTML = '';
    const box = el('div', 'modal station');
    box.append(el('div', 'modal-q', title));
    return new Promise<T>((resolve) => {
      const done = (v: T) => {
        this.back.classList.remove('show');
        this.isOpen = false;
        resolve(v);
      };
      this.finish = () => done(onEsc);
      build(box, done);
      this.back.append(box);
      this.back.classList.add('show');
    });
  }

  /** Письмо: заказ или благодарность с деньгами. */
  letter(l: Letter): Promise<void> {
    return this.open<void>(
      U.letterFrom,
      (box, done) => {
        const paper = el('div', 'letter');
        if (l.kind === 'order') {
          paper.append(el('div', 'letter-title', `«${l.order.title}»`));
          paper.append(el('p', '', l.order.letter));
          paper.append(el('div', 'letter-sign', U.signature));
          box.append(paper);
          const info = el('div', 'recipe');
          info.append(el('div', '', U.needs), needsRow(this.inv, l.order.needs));
          info.append(el('div', 'letter-pay', U.pay.replace('{n}', String(l.order.pay))));
          box.append(info);
        } else {
          paper.append(el('p', '', U.mailThanks.replace('{n}', String(l.order.pay))));
          paper.append(el('div', 'letter-sign', U.signature));
          box.append(paper);
        }
        const ok = el('button', '', U.ok);
        ok.onclick = () => done();
        box.append(ok);
      },
      undefined,
    );
  }

  /** Список активных заказов с кнопкой сдачи. */
  private orderList(box: HTMLElement, button: string, note: string, done: (o: Order | null) => void) {
    for (const o of this.orders.active) {
      const card = el('div', 'recipe');
      const head = el('div', 'recipe-head');
      head.append(el('span', '', `«${o.title}»`), el('span', 'recipe-time', U.pay.replace('{n}', String(o.pay))));
      card.append(head, needsRow(this.inv, o.needs));
      const miss = this.orders.missing(o);
      const b = el('button');
      if (miss.length === 0) {
        b.textContent = button;
        b.onclick = () => done(o);
      } else {
        b.disabled = true;
        b.textContent = U.missing.replace('{list}', Cooking.listText(miss));
      }
      card.append(b);
      box.append(card);
    }
    if (this.orders.active.length > 0) box.append(el('div', 'modal-note', note));
    const close = el('button', 'secondary', U.close);
    close.onclick = () => done(null);
    box.append(close);
  }

  /** Почтовый ящик: положить заказ (деньги утром). */
  mailbox(): Promise<Order | null> {
    return this.open<Order | null>(
      U.mailbox,
      (box, done) => {
        if (this.orders.active.length === 0) box.append(el('div', 'modal-note', U.noMail));
        this.orderList(box, U.mailPut, U.mailNote, done);
      },
      null,
    );
  }

  /** Агата у калитки: одна реплика и сдача из рук в руки. */
  agata(): Promise<Order | null> {
    return this.open<Order | null>(
      CFG.texts.objects.agata,
      (box, done) => {
        box.append(el('div', 'letter', U.agataGreeting));
        this.orderList(box, U.handGive, U.handNote, done);
      },
      null,
    );
  }
}

/** Список текущих заказов под часами. */
export class OrdersPanel {
  private box = el('div', 'orders');

  constructor(parent: HTMLElement, private inv: Inventory, private orders: Orders) {
    parent.append(this.box);
  }

  render() {
    this.box.innerHTML = '';
    const o = this.orders;
    if (o.active.length === 0 && !o.hasMail) {
      this.box.style.display = 'none';
      return;
    }
    this.box.style.display = 'block';
    this.box.append(el('div', 'orders-title', U.orders));
    if (o.hasMail) this.box.append(el('div', 'orders-mail', U.newLetter));
    for (const ord of o.active) {
      const item = el('div', 'orders-item');
      item.append(el('div', 'orders-name', `«${ord.title}» · ${ord.pay}`));
      item.append(needsRow(this.inv, ord.needs));
      this.box.append(item);
    }
  }
}

/** Реплика над головой (Агата). */
export class Bubble {
  private e = el('div', 'bubble');
  private until = 0;

  constructor(parent: HTMLElement) {
    parent.append(this.e);
  }

  say(text: string) {
    this.e.textContent = text;
    this.until = performance.now() + CFG.agata.bubbleMs;
  }

  update(pos: { x: number; y: number } | null) {
    if (!pos || performance.now() > this.until) {
      this.e.style.display = 'none';
      return;
    }
    this.e.style.display = 'block';
    this.e.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
  }
}
