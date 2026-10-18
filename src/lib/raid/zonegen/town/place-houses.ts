// Жильё и предместье — шаги 11 и 13 спецификации
// (docs/town-generation-algorithm.json).
//
// Дома заполняют лоты в порядке убывания стоимости земли, и каждый лот
// принимается с вероятностью p(r) = 0.8·e^(−0.83·r/Rb): 80 % в ядре, 35 % на
// краю — закон Кларка (плотность падает от центра экспоненциально). Пустые
// клетки остаются дворами и огородами: это часть плана, а не брак. Когда ядро
// заполнено на 70 %, рост идёт полосой вдоль магистралей за воротами, а не
// раздуванием круга (faubourg: Бристоль около 1300 г. — 55 га внутри стен из 130).
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { hashCell, hexDist, keyOf, neighborKeys } from "@/lib/raid/zonegen/town/hex";
import { growFor } from "@/lib/raid/zonegen/town/place-grow";
import {
  currentLots,
  commit,
  SUBURB_REACH,
  zoneCtx,
  type TownState,
} from "@/lib/raid/zonegen/town/place-state";
import type { TownPick } from "@/lib/raid/zonegen/town/types";
import { frontsMain, landValue, type Lot } from "@/lib/raid/zonegen/town/value";
import { interest } from "@/lib/raid/zonegen/town/zoning";

/** p(r) = P0·e^(−B·r/Rb): 80 % лотов в ядре и 35 % на краю (шаг 7). */
const P0 = 0.8;
const B = Math.log(0.8 / 0.35);
/** Второй ряд — не больше 30 % простых домов (шаг 8). */
const SECOND_SHARE = 0.3;
/** Предместье начинается, когда лоты ядра заполнены на 70 % (шаг 13). */
const SUBURB_FILL = 0.7;
/** Сколько проходов по лотам: жребий p(r) отсеивает, следующий проход добирает. */
const MAX_PASSES = 12;
/** Сколько раз за жильё можно вырастить улицу. */
const MAX_GROWS = 8;
/** Сдвиг оценки цели улицы: L бывает отрицательной, а цель годится при > 0. */
const GROW_BASE = 10;

const acceptP = (r: number, rb: number): number => P0 * Math.exp((-B * r) / Math.max(1, rb));

type Scored = { lot: Lot; s: number; h: number };

/** Лоты для дома с интересом > 0, по убыванию L (ничья — hash клетки). */
function houseLots(state: TownState, pick: TownPick, inside: (l: Lot) => boolean): Scored[] {
  const ctx = zoneCtx(state, pick, 0);
  const out: Scored[] = [];
  for (const lot of currentLots(state)) {
    if (!inside(lot) || interest("house", lot, ctx) <= 0) continue;
    const s = landValue(lot, state.skeleton, state.fields, state.index);
    out.push({ lot, s, h: hashCell(state.seed, lot.q, lot.r) });
  }
  return out.sort((a, b) => b.s - a.s || a.h - b.h || a.lot.q - b.lot.q || a.lot.r - b.lot.r);
}

/**
 * Следующая модель для лота: одинаковые дома вплотную не ставим, пока в
 * очереди есть другая модель (улица из одинаковых фасадов рябит).
 */
function nextFor(state: TownState, queue: TownPick[], cell: ZoneCell): number {
  const near = new Set(
    neighborKeys(keyOf(cell))
      .map((k) => state.at.get(k)?.option.id)
      .filter((id): id is string => id !== undefined),
  );
  const at = queue.findIndex((p) => !near.has(p.option.id));
  return at >= 0 ? at : 0;
}

type Tally = { simple: number; second: number };

/** Можно ли ещё один дом во второй ряд: не больше 30 % простых домов. */
const secondAllowed = (t: Tally): boolean => t.second + 1 <= SECOND_SHARE * (t.simple + 1);

/** Один проход по лотам ядра с жребием p(r). Возвращает, сколько встало. */
function pass(state: TownState, queue: TownPick[], lotsNow: Scored[], t: Tally): number {
  const rb = state.skeleton.radius;
  const center = state.skeleton.center;
  let n = 0;
  for (const { lot } of lotsNow) {
    if (queue.length === 0) break;
    if (state.occupied.has(lot.key)) continue;
    if (lot.front === "second" && !secondAllowed(t)) continue;
    const at = nextFor(state, queue, lot);
    const pick = queue[at];
    // Интерес пересчитываем: соседние дома этого же прохода меняют картину.
    if (interest("house", lot, zoneCtx(state, pick, 0)) <= 0) continue;
    if (state.rnd() >= acceptP(hexDist(lot, center), rb)) continue;
    queue.splice(at, 1);
    commit(state, lot, pick, null);
    t.simple++;
    if (lot.front === "second") t.second++;
    n++;
  }
  return n;
}

/** Доля заполнения ядра: занятые лоты против занятых + ещё годных. */
function coreFill(state: TownState, free: number): number {
  const rb = state.skeleton.radius;
  const center = state.skeleton.center;
  let built = 0;
  for (const p of state.placed) if (hexDist(p, center) <= rb) built++;
  return built + free > 0 ? built / (built + free) : 1;
}

/**
 * Предместье: полоса глубиной 1 вдоль магистрали за краем Rb, до 4 клеток
 * наружу, от ворот наружу по порядку — смежный рост сам держит полосу.
 */
function suburb(state: TownState, queue: TownPick[]): void {
  const rb = state.skeleton.radius;
  const center = state.skeleton.center;
  const outside = (l: Lot): boolean => {
    const d = hexDist(l, center);
    return d > rb && d <= rb + SUBURB_REACH && l.front !== "second";
  };
  while (queue.length > 0) {
    const cand = houseLots(state, queue[0], outside)
      .filter((x) => frontsMain(x.lot, state.index))
      .sort((a, b) => hexDist(a.lot, center) - hexDist(b.lot, center) || a.h - b.h);
    if (cand.length === 0) return;
    const pick = queue.shift() as TownPick;
    commit(state, cand[0].lot, pick, null);
  }
}

/** Улица к лучшей по L клетке, где дом был бы уместен. */
function growHome(state: TownState, pick: TownPick): boolean {
  const ctx = zoneCtx(state, pick, 0);
  const score = (c: ZoneCell) =>
    interest("house", c, ctx) > 0
      ? GROW_BASE + landValue(c, state.skeleton, state.fields, state.index)
      : 0;
  return growFor(state, score, state.skeleton.radius);
}

/** Расставить жильё; возвращает, сколько не встало (не недобор: фон — «сколько влезет»). */
export function placeHouses(state: TownState, homes: TownPick[]): number {
  const queue = [...homes];
  const rb = state.skeleton.radius;
  const center = state.skeleton.center;
  const inside = (l: Lot): boolean => hexDist(l, center) <= rb;
  const tally: Tally = { simple: 0, second: 0 };
  let grows = 0;
  for (let i = 0; i < MAX_PASSES && queue.length > 0; i++) {
    const lotsNow = houseLots(state, queue[0], inside);
    if (lotsNow.length === 0) {
      // Лотов с I > 0 нет — улица растёт по требованию (шаг 10): к клетке,
      // где дом встал бы (интерес > 0), с наибольшей стоимостью земли.
      if (grows >= MAX_GROWS || !growHome(state, queue[0])) break;
      grows++;
      continue;
    }
    pass(state, queue, lotsNow, tally);
  }
  if (queue.length === 0) return 0;
  const free = houseLots(state, queue[0], inside).length;
  if (coreFill(state, free) >= SUBURB_FILL) suburb(state, queue);
  return queue.length;
}
