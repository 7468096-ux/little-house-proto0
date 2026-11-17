import { CFG } from '../config';

// Часы в углу экрана и простое окно-вопрос с кнопками.

export class Hud {
  private clock = document.createElement('div');
  private modal = document.createElement('div');
  /** Открыто окно — время и ввод в мире стоят. */
  modalOpen = false;

  constructor(parent: HTMLElement) {
    this.clock.className = 'clock';
    this.modal.className = 'modal-backdrop';
    parent.append(this.clock, this.modal);
  }

  setClock(day: number, time: string, state: 'normal' | 'slow' | 'paused') {
    const U = CFG.texts.ui;
    const main = U.clock.replace('{day}', String(day)).replace('{time}', time);
    this.clock.innerHTML = '';
    this.clock.append(main);
    if (state !== 'normal') {
      const p = document.createElement('span');
      p.className = 'clock-paused';
      p.textContent = state === 'slow' ? U.clockSlow : U.clockPaused;
      this.clock.append(p);
    }
  }

  /** Вопрос с кнопками «Да»/«Нет». */
  ask(question: string): Promise<boolean> {
    const U = CFG.texts.ui;
    this.modalOpen = true;
    this.modal.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'modal';
    const q = document.createElement('div');
    q.className = 'modal-q';
    q.textContent = question;
    const row = document.createElement('div');
    row.className = 'modal-row';
    const yes = document.createElement('button');
    yes.textContent = U.yes;
    const no = document.createElement('button');
    no.textContent = U.no;
    no.className = 'secondary';
    row.append(yes, no);
    box.append(q, row);
    this.modal.append(box);
    this.modal.classList.add('show');
    return new Promise((resolve) => {
      const done = (v: boolean) => {
        this.modal.classList.remove('show');
        this.modalOpen = false;
        resolve(v);
      };
      yes.onclick = () => done(true);
      no.onclick = () => done(false);
    });
  }
}
