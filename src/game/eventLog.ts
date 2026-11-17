// Журнал событий: каждое действие с реальным и игровым временем.
// Хранится только в памяти страницы, в сеть ничего не отправляется.
// По нему же считаются «Итоги дня».

export type EventType =
  | 'gather' // добыча: item, n
  | 'chop' // удар по пню: stump, hit
  | 'plant'
  | 'waterBed'
  | 'cookStart' // station, product
  | 'craft' // product (забрали из печи/плиты или связали)
  | 'deliver' // way: mail | hand, order, pay
  | 'payment' // деньги пришли письмом
  | 'purchase' // item
  | 'sleep' // auto: true/false
  | 'moreDay' // answer: yes/no
  | 'end'
  | 'start'; // игрок закрыл подсказку и начал

export interface GameEvent {
  type: EventType;
  /** Реальное время (ISO). */
  real: string;
  /** Секунды с начала игры. */
  sec: number;
  day: number;
  /** Игровое время «18:05». */
  time: string;
  [key: string]: unknown;
}

export class EventLog {
  readonly events: GameEvent[] = [];
  private t0 = performance.now();

  constructor(private now: () => { day: number; time: string }) {}

  add(type: EventType, data: Record<string, unknown> = {}) {
    const { day, time } = this.now();
    this.events.push({
      type,
      real: new Date().toISOString(),
      sec: Math.round((performance.now() - this.t0) / 100) / 10,
      day,
      time,
      ...data,
    });
  }

  /** Скачать журнал файлом JSON (только локально, без сети). */
  download(fileBase: string, summary: Record<string, unknown>) {
    const started = new Date(Date.now() - (performance.now() - this.t0));
    const data = { game: 'little-house-proto0', startedAt: started.toISOString(), savedAt: new Date().toISOString(), summary, events: this.events };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    a.href = url;
    a.download = `${fileBase}-${stamp}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  ofDay(day: number) {
    return this.events.filter((e) => e.day === day);
  }
}
