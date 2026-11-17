import { CFG } from '../config';

// Игровые часы. Время хранится в игровых часах от полуночи дня:
// 6.0 — 6:00, 25.5 — 1:30 ночи, 26.0 — 2:00 (конец дня).

export class GameClock {
  day = 1;
  hour = CFG.time.dayStartHour;
  /** Множитель скорости (отладка). */
  scale = 1;

  get ended() {
    return this.hour >= CFG.time.dayEndHour;
  }

  /** Продвинуть время на dt реальных секунд. */
  tick(dt: number) {
    if (this.ended) return;
    this.hour = Math.min(CFG.time.dayEndHour, this.hour + (dt * this.scale) / CFG.time.secondsPerHour);
  }

  startDay(day: number) {
    this.day = day;
    this.hour = CFG.time.dayStartHour;
  }

  /** «6:00», «1:30». */
  format(): string {
    const total = Math.floor(this.hour * 60);
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${h}:${m.toString().padStart(2, '0')}`;
  }
}
