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
  | 'end';

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

  ofDay(day: number) {
    return this.events.filter((e) => e.day === day);
  }
}
