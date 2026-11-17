import raw from './config.json';

/** Все числа и тексты игры. Менять — только в src/config.json. */
export const CFG = raw;
export type Config = typeof raw;

/** Пара чисел [x, z] из конфига → точка на плоскости. */
export function p2(a: number[]): { x: number; z: number } {
  return { x: a[0], z: a[1] };
}
