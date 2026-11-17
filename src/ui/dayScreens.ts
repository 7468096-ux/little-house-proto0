import { CFG } from '../config';

// Экраны покупки улучшения, «Итогов дня», вопроса «Ещё день?» и финала.

const U = CFG.texts.ui;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface Summary {
  day: number;
  earned: number;
  done: string[];
  grow: number;
  hint: string;
}

export class DayScreens {
  private back = el('div', 'modal-backdrop');
  isOpen = false;
  private esc: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    parent.append(this.back);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isOpen && this.esc) this.esc();
    });
  }

  private open<T>(cls: string, build: (box: HTMLElement, done: (v: T) => void) => void, esc?: T): Promise<T> {
    this.isOpen = true;
    this.back.innerHTML = '';
    this.back.classList.toggle('solid', cls.includes('solid'));
    const box = el('div', `modal station ${cls}`);
    return new Promise<T>((resolve) => {
      const done = (v: T) => {
        this.back.classList.remove('show');
        this.isOpen = false;
        this.esc = null;
        resolve(v);
      };
      this.esc = esc === undefined ? null : () => done(esc);
      build(box, done);
      this.back.append(box);
      this.back.classList.add('show');
    });
  }

  /** Доска улучшений: фонарь. Вернёт true, если купили. */
  board(coins: number, bought: boolean): Promise<boolean> {
    const price = CFG.lantern.price;
    return this.open<boolean>(
      '',
      (box, done) => {
        box.append(el('div', 'modal-q', CFG.texts.objects.board));
        const card = el('div', 'recipe');
        const head = el('div', 'recipe-head');
        head.append(el('span', '', U.lanternTitle), el('span', 'recipe-time', String(price)));
        card.append(head, el('div', '', U.lanternDesc));
        const b = el('button');
        if (bought) {
          b.disabled = true;
          b.textContent = U.bought;
        } else if (coins < price) {
          b.disabled = true;
          b.textContent = U.notEnough.replace('{n}', String(price - coins));
        } else {
          b.textContent = U.buy.replace('{n}', String(price));
          b.onclick = () => done(true);
        }
        card.append(b);
        box.append(card);
        const close = el('button', 'secondary', U.close);
        close.onclick = () => done(false);
        box.append(close);
      },
      false,
    );
  }

  /** «Итоги дня». */
  summary(s: Summary): Promise<void> {
    return this.open<void>('summary solid', (box, done) => {
      box.append(el('div', 'modal-q', U.summaryTitle.replace('{day}', String(s.day))));
      box.append(el('div', 'summary-earned', U.earned.replace('{n}', String(s.earned))));
      const list = el('div', 'recipe');
      list.append(el('div', 'summary-h', U.done));
      if (s.done.length === 0) list.append(el('div', '', U.nothingDone));
      for (const line of s.done) list.append(el('div', '', `· ${line}`));
      box.append(list);
      box.append(
        el('div', '', s.grow > 0 ? U.growTomorrow.replace('{n}', String(s.grow)) : U.growNone),
      );
      box.append(el('div', 'summary-hint', s.hint));
      const b = el('button', '', U.next);
      b.onclick = () => done();
      box.append(b);
    });
  }

  /** «Ещё день?» — true: да, false: хватит. */
  moreDay(): Promise<boolean> {
    return this.open<boolean>('solid', (box, done) => {
      box.append(el('div', 'modal-q', U.moreDay));
      const row = el('div', 'modal-row');
      const yes = el('button', '', U.moreYes);
      yes.onclick = () => done(true);
      const no = el('button', 'secondary', U.moreNo);
      no.onclick = () => done(false);
      row.append(yes, no);
      box.append(row);
    });
  }

  /** Финальный экран. extra — место для кнопок (журнал, этап 7). */
  end(extra?: (box: HTMLElement) => void) {
    this.open<void>('end solid', (box) => {
      box.append(el('div', 'modal-q', U.endTitle));
      box.append(el('div', '', U.endText));
      extra?.(box);
    });
  }
}
