// Сравнение кадра с эталоном (клавиша F3). Только для разработки.
// Режимы по кругу: выкл → наложение → половина/половина → «иконка» (две миниатюры) → выкл.
// Пипетка: в любом включённом режиме внизу слева hex пикселя игры и эталона под курсором.
// Цвета в библии сняты с готового кадра, поэтому сверять нужно итоговые пиксели, а не цвета материалов.

const REF_URL = '/reference/target_frame.png';
type Mode = 'off' | 'overlay' | 'split' | 'icon';
const ORDER: Mode[] = ['off', 'overlay', 'split', 'icon'];
const NAMES: Record<Mode, string> = { off: '', overlay: 'наложение', split: 'половина/половина', icon: 'иконка' };

export class RefCompare {
  private mode: Mode = 'off';
  private img = new Image();
  private ready = false;
  private root = document.createElement('div');
  private refCanvas = document.createElement('canvas'); // эталон, подогнанный под окно (cover)
  private gameCanvas = document.createElement('canvas'); // копия кадра игры
  private refView = document.createElement('canvas'); // показ эталона
  private info = document.createElement('div');
  private slider = document.createElement('input');
  private split = 0.5;
  private iconBox = document.createElement('div');
  private mx = 0;
  private my = 0;

  constructor(private game: HTMLCanvasElement, private app: HTMLElement) {
    this.img.onload = () => {
      this.ready = true;
      this.fit();
    };
    this.img.src = REF_URL;

    const r = this.root;
    r.style.cssText = 'position:fixed;inset:0;z-index:900;pointer-events:none;display:none;font:12px monospace';
    this.refView.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    this.info.style.cssText = 'position:absolute;left:8px;bottom:8px;background:#000c;color:#fff;padding:4px 8px;border-radius:4px';
    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.max = '1';
    this.slider.step = '0.01';
    this.slider.value = '0.5';
    this.slider.style.cssText = 'position:absolute;left:50%;top:8px;width:240px;margin-left:-120px;pointer-events:auto';
    this.slider.oninput = () => {
      this.split = Number(this.slider.value);
      this.layout();
    };
    this.iconBox.style.cssText = 'position:absolute;right:8px;bottom:8px;display:flex;gap:8px;background:#000a;padding:8px';
    r.append(this.refView, this.slider, this.info, this.iconBox);
    document.body.append(r);

    window.addEventListener('mousemove', (e) => {
      this.mx = e.clientX;
      this.my = e.clientY;
    });
    window.addEventListener('resize', () => this.fit());
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'F3') return;
      e.preventDefault();
      this.setMode(ORDER[(ORDER.indexOf(this.mode) + 1) % ORDER.length]);
    });
  }

  private setMode(m: Mode) {
    this.mode = m;
    this.root.style.display = m === 'off' ? 'none' : 'block';
    this.app.classList.toggle('compare', m !== 'off');
    this.slider.style.display = m === 'overlay' || m === 'split' ? 'block' : 'none';
    this.refView.style.display = m === 'overlay' || m === 'split' ? 'block' : 'none';
    this.iconBox.style.display = m === 'icon' ? 'flex' : 'none';
    this.fit();
  }

  /** Эталон → холст размером с окно (cover). */
  private fit() {
    if (!this.ready) return;
    const w = this.game.width;
    const h = this.game.height;
    this.refCanvas.width = this.refView.width = w;
    this.refCanvas.height = this.refView.height = h;
    const k = Math.max(w / this.img.width, h / this.img.height);
    const dw = this.img.width * k;
    const dh = this.img.height * k;
    const ctx = this.refCanvas.getContext('2d')!;
    ctx.drawImage(this.img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    this.refView.getContext('2d')!.drawImage(this.refCanvas, 0, 0);
    this.layout();
  }

  private layout() {
    if (this.mode === 'overlay') {
      this.refView.style.clipPath = 'none';
      this.refView.style.opacity = String(this.split);
    } else if (this.mode === 'split') {
      this.refView.style.opacity = '1';
      this.refView.style.clipPath = `inset(0 ${(1 - this.split) * 100}% 0 0)`;
    }
  }

  private hex(c: CanvasRenderingContext2D, x: number, y: number) {
    const d = c.getImageData(Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y)), 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  /** Вызывать сразу после рендера кадра (буфер ещё не очищен). */
  update() {
    if (this.mode === 'off' || !this.ready) return;
    const g = this.game;
    if (this.gameCanvas.width !== g.width) {
      this.gameCanvas.width = g.width;
      this.gameCanvas.height = g.height;
    }
    const gc = this.gameCanvas.getContext('2d', { willReadFrequently: true })!;
    gc.drawImage(g, 0, 0);

    const rect = g.getBoundingClientRect();
    const sx = g.width / rect.width;
    const px = (this.mx - rect.left) * sx;
    const py = (this.my - rect.top) * sx;
    const rc = this.refCanvas.getContext('2d', { willReadFrequently: true })!;
    const a = this.hex(gc, px, py);
    const b = this.hex(rc, px, py);
    this.info.textContent = `${NAMES[this.mode]} · игра ${a} · эталон ${b} · F3 — режим`;

    if (this.mode === 'icon') {
      const boxes = [this.gameCanvas, this.refCanvas];
      if (this.iconBox.childElementCount === 0) {
        for (let i = 0; i < 2; i++) {
          const c = document.createElement('canvas');
          c.width = 200;
          c.height = Math.round((200 * g.height) / g.width);
          this.iconBox.append(c);
        }
      }
      boxes.forEach((src, i) => {
        const c = this.iconBox.children[i] as HTMLCanvasElement;
        c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
      });
    }
  }
}
