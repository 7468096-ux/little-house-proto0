import { CFG } from '../config';

// Панель отладки по клавише ` (Ё). Только для автора, не для тестеров.

export interface DebugActions {
  setFast(on: boolean): void;
  goToDay(n: number): void;
  reset(): void;
}

export class DebugPanel {
  private el = document.createElement('div');
  private fast = false;
  private speedBtn = document.createElement('button');

  constructor(parent: HTMLElement, private actions: DebugActions) {
    const D = CFG.texts.debug;
    this.el.className = 'debug';
    const title = document.createElement('div');
    title.className = 'debug-title';
    title.textContent = D.title;
    this.el.append(title);

    this.speedBtn.onclick = () => {
      this.fast = !this.fast;
      this.actions.setFast(this.fast);
      this.renderSpeed();
    };
    this.renderSpeed();
    this.el.append(this.speedBtn);

    for (let n = 1; n <= CFG.time.days; n++) {
      const b = document.createElement('button');
      b.textContent = D.day.replace('{n}', String(n));
      b.onclick = () => this.actions.goToDay(n);
      this.el.append(b);
    }

    const give = document.createElement('button');
    give.textContent = `${D.give} (${D.giveLater})`;
    give.disabled = true;
    this.el.append(give);

    const reset = document.createElement('button');
    reset.textContent = D.reset;
    reset.onclick = () => this.actions.reset();
    this.el.append(reset);

    const hint = document.createElement('div');
    hint.className = 'debug-hint';
    hint.textContent = D.hint;
    this.el.append(hint);

    parent.append(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.code === CFG.debug.key) this.el.classList.toggle('show');
    });
  }

  private renderSpeed() {
    const D = CFG.texts.debug;
    const n = String(CFG.debug.timeScaleFast);
    this.speedBtn.textContent = (this.fast ? D.speedOn : D.speedOff).replace('{n}', n);
    this.speedBtn.classList.toggle('active', this.fast);
  }
}
