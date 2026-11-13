// Полосы службы шахт — мимо React, как точки игроков (playerDots): ответ
// запроса кладётся сюда (useMineLifeFeed), кадр карты берёт полосы прямо
// отсюда и перерисовывается по подписке (useMapRenderer). Экран рейда от
// прихода полос не пересобирается.
import type { MineBars } from "@/lib/mineLifeBars";

/** Ключ запроса полос (useMineLifeFeed); префикс «beta-raid» — общий сброс при смене этажа. */
export const MINE_LIFE_KEY = ["beta-raid-mine-life"] as const;

const EMPTY: MineBars = new Map();

let bars: MineBars = EMPTY;
/** Сдвиг часов телефона относительно сервера, мс (clientAt − serverNow). */
let skew = 0;
const listeners = new Set<() => void>();

/** Полосы «q,r» → запас. Пусто, пока ответ не пришёл. */
export const getMineBars = (): MineBars => bars;

/** Сейчас по часам сервера. */
export const mineBarsNow = (deviceNow = Date.now()): number => deviceNow - skew;

export function subscribeMineBars(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Разбудить кадр: полосы новые или пора им подтаять (минутный тик). */
export function pokeMineBars(): void {
  for (const fn of listeners) fn();
}

export function setMineBars(next: MineBars, nextSkew: number): void {
  if (next === bars && nextSkew === skew) return;
  bars = next;
  skew = Number.isFinite(nextSkew) ? nextSkew : 0;
  pokeMineBars();
}

/**
 * Задевает ли событие потока «built» чью-то полосу. Смену владельца (owner)
 * не берём: на неё поток и так перечитывает флажки, а полосы едут вслед за
 * флажками (useMineLifeFeed). Остаются починка своей шахты и смена режима —
 * они владельца не меняют, и без этого наблюдатель видел бы старый запас.
 */
export function mineLifeTouched(
  event: { mine?: boolean; owner?: boolean },
  cells: readonly string[],
): boolean {
  if (!event.mine || event.owner || bars.size === 0) return false;
  return cells.some((key) => bars.has(key));
}
