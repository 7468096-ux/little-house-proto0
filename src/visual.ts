import raw from './visual.json';

/**
 * Весь внешний вид игры: цвета, свет, тени, цветокоррекция, материалы.
 * Менять — только в src/visual.json. Объект изменяемый: правка поля видна
 * в следующем кадре (подписки — onVisualChange).
 *
 * Цвета материалов считаются из палитры по ролям: colors[ключ] = смесь palette[роль].light и .shadow
 * с долей shade из colorRoles (0 — светлый, 1 — теневой, можно выходить за 0..1).
 * Ключи без роли (игрок, инструменты, письма) остаются как записаны в colors.
 */
export type Visual = typeof raw;
export const DEFAULT_VISUAL: Visual = raw;
export const VIS: Visual = JSON.parse(JSON.stringify(raw));

type Listener = () => void;
const listeners = new Map<string, Listener[]>();

/** Подписка на изменение секции VIS (например 'grade', 'colors', 'palette'). */
export function onVisualChange(section: string, fn: Listener) {
  const a = listeners.get(section) ?? [];
  a.push(fn);
  listeners.set(section, a);
}

/** Сообщить, что секция изменилась. Правка палитры или ролей пересчитывает colors. */
export function emitVisualChange(section: string) {
  if (section === 'palette' || section === 'colorRoles') {
    applyPalette();
    section = 'colors';
    for (const fn of listeners.get('palette') ?? []) fn();
  }
  for (const fn of listeners.get(section) ?? []) fn();
}

function rgb(h: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function hex(c: number[]): string {
  return '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/** Цвет роли с оттенком shade: 0 — светлый, 1 — теневой. */
export function roleColor(role: string, shade: number): string {
  const p = (VIS.palette as Record<string, { light: string; shadow: string }>)[role];
  const a = rgb(p.light);
  const b = rgb(p.shadow);
  return hex(a.map((v, i) => v + (b[i] - v) * shade));
}

/** Пересчитать VIS.colors из палитры. */
export function applyPalette() {
  const colors = VIS.colors as Record<string, string>;
  for (const [key, r] of Object.entries(VIS.colorRoles as Record<string, { role: string; shade: number }>)) {
    colors[key] = roleColor(r.role, r.shade);
  }
}
applyPalette();

/** Значения, которые каждый кадр считает свет по часам (пресеты → кадр). Не сохраняются. */
export const LIVE = { exposure: 1, bloomStrength: 0.15, saturation: 1, sunAngle: 0, windowGlowColor: '#ffb860', windowGlowIntensity: 0 };
