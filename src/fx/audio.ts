import { CFG } from '../config';

// Звуки. Файлы Kenney (CC0) из public/sfx, плеск воды — синтез из шума.
// Браузер разрешает звук только после первого клика, поэтому контекст
// создаётся при первом нажатии мыши или клавиши.

export type SoundName = keyof typeof CFG.sounds;

interface SoundDef {
  files?: string[];
  synth?: string;
  volume: number;
}

export class Audio {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private noise: AudioBuffer | null = null;

  constructor() {
    const unlock = () => {
      this.init();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    const files = new Set<string>();
    for (const def of Object.values(CFG.sounds) as SoundDef[]) def.files?.forEach((f) => files.add(f));
    for (const f of files) {
      fetch(`${import.meta.env.BASE_URL}sfx/${f}`)
        .then((r) => r.arrayBuffer())
        .then((data) => this.ctx!.decodeAudioData(data))
        .then((buf) => this.buffers.set(f, buf))
        .catch(() => console.warn('Не загрузился звук', f));
    }
    // секунда белого шума для синтеза воды
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Проиграть звук. pitch — дополнительный сдвиг высоты (1 = как есть). */
  play(name: SoundName, pitch = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const def = CFG.sounds[name] as SoundDef;
    const jitter = 1 + (Math.random() * 2 - 1) * CFG.feedback.pitchJitter;
    const rate = pitch * jitter;
    const out = ctx.createGain();
    out.gain.value = def.volume;
    out.connect(ctx.destination);

    if (def.files) {
      const f = def.files[Math.floor(Math.random() * def.files.length)];
      const buf = this.buffers.get(f);
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(out);
      src.start();
    } else if (def.synth === 'splash') {
      this.splash(out, rate);
    } else if (def.synth === 'pour') {
      this.pour(out, rate);
    }
  }

  /** Всплеск: короткий шум через полосовой фильтр + «бульк» с падающим тоном. */
  private splash(out: GainNode, rate: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(2200 * rate, t);
    bp.frequency.exponentialRampToValueAtTime(700 * rate, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    n.connect(bp).connect(g).connect(out);
    n.start(t, Math.random() * 0.5, 0.45);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(520 * rate, t + 0.04);
    o.frequency.exponentialRampToValueAtTime(180 * rate, t + 0.16);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.2);
  }

  /** Полив из лейки: мягкий шелест воды ~0,7 с. */
  private pour(out: GainNode, rate: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.value = 3000 * rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.08);
    g.gain.setValueAtTime(1, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    n.connect(bp).connect(g).connect(out);
    n.start(t, Math.random() * 0.2, 0.8);
  }
}
