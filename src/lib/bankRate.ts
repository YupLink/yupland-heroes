// График курса золото/DARAI для игроков (владелец, 23.10.2026: «на каждый час —
// линией или свечами, переключение промежутков как в обычном графике, макс шаг —
// 1 день»). Курс после каждого события пула (lib/bankStats.poolStats) делится на
// корзины по времени — свечи «открытие / макс / мин / закрытие».

import type { RatePoint } from "./bankStats";

export type RateStep = "1h" | "4h" | "1d";
export const RATE_STEP_IDS: readonly RateStep[] = ["1h", "4h", "1d"];

/** Свеча: начало корзины и курс (B за 1 A) на открытии, максимум, минимум, закрытие. */
export type Candle = { t: number; o: number; h: number; l: number; c: number };

const HOUR = 3_600_000;

/**
 * Шаг свечи и сколько свечей на экране. Ширина телефона (Xiaomi 13T, ~393 px) —
 * до ~48 свечей, иначе тело свечи тоньше 4 px: 1ч — 2 дня, 4ч — неделя,
 * 1д — 30 дней.
 */
export const RATE_STEPS: Record<RateStep, { ms: number; count: number }> = {
  "1h": { ms: HOUR, count: 48 },
  "4h": { ms: 4 * HOUR, count: 42 },
  "1d": { ms: 24 * HOUR, count: 30 },
};

/**
 * Начало корзины по местному времени игрока: tzMs — сдвиг от UTC (Москва +3 ч), иначе
 * дневная свеча начиналась бы в 03:00. Летнее время внутри окна не учитываем.
 */
export const bucketStart = (t: number, ms: number, tzMs: number): number =>
  Math.floor((t + tzMs) / ms) * ms - tzMs;

// 7 значащих цифр — курс на экране короче (fmtRate), а ответ, который опрашивают
// каждые 15 с, легче вдвое.
const r7 = (v: number): number => Number(v.toPrecision(7));

/**
 * Свечи за последние `count` корзин до «сейчас». Курс меняется только событиями,
 * поэтому открытие — закрытие прошлой свечи, а пустая корзина — свеча-черта на
 * прежнем курсе. Пул старше окна — курс на его начало переносится из последнего
 * события до него; моложе — свечи с корзины первого события. Точки — по времени.
 */
export function candles(
  points: RatePoint[],
  now: number,
  step: { ms: number; count: number },
  tzMs = 0,
): Candle[] {
  if (points.length === 0) return [];
  const { ms, count } = step;
  // Часы базы могут убежать на секунду вперёд — свежий обмен всё равно в последней свече.
  const last = bucketStart(Math.max(now, points[points.length - 1].t), ms, tzMs);
  let from = last - (count - 1) * ms;
  let i = 0;
  let prev: number | null = null;
  while (i < points.length && points[i].t < from) prev = points[i++].p;
  if (prev === null) from = bucketStart(points[0].t, ms, tzMs);
  const out: Candle[] = [];
  for (let b = from; b <= last; b += ms) {
    let o = prev;
    let h = prev ?? -Infinity;
    let l = prev ?? Infinity;
    let c = prev;
    while (i < points.length && points[i].t < b + ms) {
      const p = points[i++].p;
      o ??= p;
      h = Math.max(h, p);
      l = Math.min(l, p);
      c = p;
    }
    if (o === null || c === null) continue; // до первого события свечей нет
    out.push({ t: b, o: r7(o), h: r7(h), l: r7(l), c: r7(c) });
    prev = c;
  }
  return out;
}

/** Свечи на все шаги сразу — переключение на телефоне без нового запроса. */
export function allCandles(points: RatePoint[], now: number, tzMs = 0): Record<RateStep, Candle[]> {
  return {
    "1h": candles(points, now, RATE_STEPS["1h"], tzMs),
    "4h": candles(points, now, RATE_STEPS["4h"], tzMs),
    "1d": candles(points, now, RATE_STEPS["1d"], tzMs),
  };
}
