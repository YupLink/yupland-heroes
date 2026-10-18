// Цена товара в городе — как в пуле ликвидности (владелец, 03.10.2026: «гибкая
// цена на общий объём покупки/продажи, а не по фикс цене»).
//
// Кривая цены за штуку от запаса s — по точкам владельца:
//   запас на НЗ и ниже — ×2 (самая высокая: товар нужен городу);
//   от НЗ до нормы     — плавно от ×2 к ×1;
//   ровно норма        — ×1 (цена при норме, средняя);
//   от нормы до 20 норм — плавно от ×1 к ×0,1;
//   20 норм и выше     — ×0,1 («за бесценок»), но принимают всё: потолка нет.
// Особый спрос (владелец, 09.10.2026): запас 24 часа подряд на НЗ и ниже — город
// скупает до НЗ по ×4 вместо ×2. Набрал НЗ — цена прежняя, отсчёт заново.
// Это цена, по которой город ПОКУПАЕТ у игрока. Продаёт он по той же кривой плюс
// наценка — и не ниже НЗ.
//
// Сделка платит не «цена × количество», а ПЛОЩАДЬ под кривой на всём пути
// запаса: каждая следующая штука покупки дороже, продажи — дешевле. Купить и
// тут же продать обратно в том же городе всегда в минус на наценку (не меньше
// 10 %): печатать золото кругами нельзя.
//
// Один хелпер на сервер и клиент — то, что игрок видит, совпадает со списанием.
import { cityNorm, type TownGood } from "./townConfig";
import type { TownRules } from "./townRules";

/** Цена на НЗ и ниже — самая высокая. */
export const MAX_X = 2;
/** Особый спрос: до НЗ вдвое дороже обычного верха. */
export const RUSH_X = MAX_X * 2;
/** Сколько запас должен пролежать на НЗ и ниже, чтобы начался особый спрос. */
export const RUSH_AFTER_MS = 24 * 3600_000;
/** Цена «за бесценок» — от FLOOR_NORMS норм и выше. */
export const MIN_X = 0.1;
/** Сколько норм на складе, чтобы цена дошла до минимума. */
export const FLOOR_NORMS = 20;

export interface TownCurve {
  /** Цена при норме (×1). */
  base: number;
  /** Норма города, штук. */
  norm: number;
  /** НЗ, штук: ниже город не продаёт. */
  reserve: number;
  /** Наценка продажи игроку, %. */
  markupPct: number;
  /** Множитель на НЗ и ниже: MAX_X, при особом спросе — RUSH_X. */
  lowX?: number;
}

/** Особый спрос: запас на НЗ и ниже не меньше RUSH_AFTER_MS (lowSince — с какого момента). */
export function isRush(c: TownCurve, stock: number, lowSince: string | null, now: number): boolean {
  if (!lowSince || stock > c.reserve + 1e-9) return false;
  const t = new Date(lowSince).getTime();
  return Number.isFinite(t) && now - t >= RUSH_AFTER_MS;
}

export function townCurve(
  good: Pick<TownGood, "marketPrice" | "consumePerResident"> &
    Partial<Pick<TownGood, "producePerDay">>,
  residents: number,
  rules: TownRules,
): TownCurve {
  const norm = cityNorm(good, residents);
  return {
    base: Math.max(0, good.marketPrice),
    norm,
    reserve: (norm * Math.max(0, rules.reservePct)) / 100,
    markupPct: Math.max(0, rules.markupPct),
  };
}

type Pt = [number, number];

/**
 * Точки ломаной: [запас, множитель]. За последней — ровно MIN_X. При особом
 * спросе на НЗ — ступенька: до НЗ ×4, сразу за ним прежние ×2.
 */
function points(c: TownCurve): Pt[] {
  const r = Math.min(c.reserve, c.norm);
  const low = c.lowX ?? MAX_X;
  return [
    [0, low],
    [r, low],
    ...(low !== MAX_X ? [[r, MAX_X] as Pt] : []),
    [c.norm, 1],
    [c.norm * FLOOR_NORMS, MIN_X],
  ];
}

/** Значение отрезка a–b в точке x (у ступеньки нулевой ширины — правый край). */
const segAt = ([x0, y0]: Pt, [x1, y1]: Pt, x: number): number =>
  x1 > x0 ? y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) : y1;

/** Множитель цены при запасе s (на самом НЗ — ещё нижний, «до НЗ включительно»). */
export function priceFactorAt(c: TownCurve, s: number): number {
  const pts = points(c);
  const x = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) return segAt(pts[i - 1], pts[i], x);
  }
  return MIN_X;
}

/** Сколько стоят все штуки между запасом a и b (a ≤ b): площадь под кривой. */
export function areaBetween(c: TownCurve, a: number, b: number): number {
  const lo = Math.max(0, a);
  if (!(b > lo)) return 0;
  const pts = points(c);
  let area = 0;
  for (let i = 1; i < pts.length; i++) {
    const x0 = Math.max(lo, pts[i - 1][0]);
    const x1 = Math.min(b, pts[i][0]);
    // Отрезок ломаной линейный — площадь трапецией по значениям на его краях
    // (по самому отрезку: на ступеньке особого спроса соседи расходятся).
    if (x1 > x0)
      area += ((segAt(pts[i - 1], pts[i], x0) + segAt(pts[i - 1], pts[i], x1)) / 2) * (x1 - x0);
  }
  const tailFrom = Math.max(lo, pts[pts.length - 1][0]);
  if (b > tailFrom) area += MIN_X * (b - tailFrom);
  return c.base * area;
}

/** Деньги к оплате — вверх до копейки: дробная копейка не должна доставаться игроку даром. */
export const ceilMoney = (x: number): number => Math.ceil(x * 100 - 1e-6) / 100;
/** Деньги к выплате — вниз до копейки. */
export const floorMoney = (x: number): number => Math.floor(x * 100 + 1e-6) / 100;

export type TownQuote = { ok: true; total: number } | { ok: false; reason: "market.sold_out" };

/** Сколько можно купить у города прямо сейчас: всё, что выше НЗ. */
export function availableToBuy(c: TownCurve, stock: number): number {
  return Math.max(0, stock - c.reserve);
}

/** Игрок ПОКУПАЕТ units штук: запас уходит stock → stock − units, плюс наценка. */
export function quoteBuy(c: TownCurve, stock: number, units: number): TownQuote {
  if (!(units > 0)) return { ok: true, total: 0 };
  if (units > availableToBuy(c, stock) + 1e-9) return { ok: false, reason: "market.sold_out" };
  const raw = areaBetween(c, stock - units, stock) * (1 + c.markupPct / 100);
  return { ok: true, total: ceilMoney(raw) };
}

/** Игрок ПРОДАЁТ units штук: запас растёт stock → stock + units. Потолка нет. */
export function quoteSell(c: TownCurve, stock: number, units: number): TownQuote {
  if (!(units > 0)) return { ok: true, total: 0 };
  return { ok: true, total: floorMoney(areaBetween(c, stock, stock + units)) };
}

/**
 * Сколько единиц сделки (по perUnit штук) игрок потянет на budget денег.
 * Цена растёт с объёмом, поэтому не «бюджет / цена», а поиск по кривой.
 */
export function maxBuyUnits(c: TownCurve, stock: number, perUnit: number, budget: number): number {
  if (!(perUnit > 0) || !(budget >= 0)) return 0;
  let lo = 0;
  let hi = Math.floor(availableToBuy(c, stock) / perUnit + 1e-9);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const q = quoteBuy(c, stock, mid * perUnit);
    if (q.ok && q.total <= budget + 1e-9) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Сколько штук товара в одной единице позиции лавки — столько двигается склад
 * города. Как у самой выдачи (market-deliver): покупка пака, босса и своего
 * товара даёт по штуке на единицу, остальное — по giveAmount; скупка забирает
 * giveAmount у любого вида (market-sell).
 */
export function listingUnits(it: {
  side: "buy" | "sell";
  kind: string;
  giveAmount: number;
}): number {
  if (it.side === "buy" && (it.kind === "pack" || it.kind === "boss" || it.kind === "custom"))
    return 1;
  return it.giveAmount > 0 ? it.giveAmount : 1;
}
