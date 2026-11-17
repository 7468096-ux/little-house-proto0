import { CFG } from '../config';

// HTML-оверлеи поверх canvas: подпись под курсором, затемнение при входе в дом,
// короткое сообщение внизу экрана.

export class Overlay {
  private hover = document.createElement('div');
  private fade = document.createElement('div');
  private msg = document.createElement('div');
  private msgTimer = 0;

  constructor(parent: HTMLElement) {
    this.hover.className = 'hover-label';
    this.fade.className = 'fade';
    this.fade.style.transitionDuration = `${CFG.render.fadeMs}ms`;
    this.msg.className = 'message';
    parent.append(this.hover, this.fade, this.msg);
  }

  setHover(text: string | null, x: number, y: number) {
    if (!text) {
      this.hover.style.display = 'none';
      return;
    }
    const [ox, oy] = CFG.render.hoverLabelOffset;
    this.hover.style.display = 'block';
    this.hover.textContent = text;
    this.hover.style.transform = `translate(${x + ox}px, ${y + oy}px)`;
  }

  message(text: string) {
    this.msg.textContent = text;
    this.msg.classList.add('show');
    clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => this.msg.classList.remove('show'), CFG.render.messageMs);
  }

  /** Затемнить экран, выполнить действие в темноте, снова показать. */
  fadeThrough(action: () => void): Promise<void> {
    const ms = CFG.render.fadeMs;
    return new Promise((resolve) => {
      this.fade.classList.add('on');
      window.setTimeout(() => {
        action();
        this.fade.classList.remove('on');
        window.setTimeout(resolve, ms);
      }, ms);
    });
  }
}
