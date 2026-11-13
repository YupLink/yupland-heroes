// Зоны тумана номерами клеток — считает BetaRaidCanvas (useMemo), читает
// betaCanvasDraw. Уровни из CLAUDE.md «Fog of war»:
//   active — радиус 20 от героя, лёгкая плёнка;
//   bright — радиус 1 от СВОИХ шахт и полей, без плёнки вовсе; с 02.10 —
//   и от моих бугорков (владелец: «мои закопанные кучки подсвечивать первым
//   обзором, как шахты, на одну клетку в радиусе»).
//
// bright дают ТОЛЬКО mineFlags 'own' (mine-flags.ts: моя шахта и поля, где
// батрачит мой герой). Раньше сюда же клали ВСЕ поля из fieldSlots (17.09 —
// getFieldSlots отдаёт все лимитные поля карты, без фильтра по герою) и склады
// с моими вещами (e702ddfe): 23 чужих поля стояли без плёнки, а яркое кольцо
// вокруг склада накрывало соседей — владелец 21.09: «поля подсвечиваются даже
// те, которые я не захватывал». Бейджи «занято/всего» у полей и «единиц к
// сбору» у складов читаются и под плёнкой — им bright не нужен.
import { FOG_ACTIVE_RADIUS, FOG_REACH_RADIUS } from "@/lib/raid/fogRadius";
import { hexDisc } from "./hexGeometry";

/** Набор номеров клеток, у которого спрашивают только «входит ли». */
export type IndexSet = { has(i: number): boolean };

/** reach — круг досягаемости в неразведанном (sight/fogReach), null — героя нет. */
export type FogZones = {
  active: IndexSet;
  bright: Set<number>;
  reach: { q: number; r: number; radius: number } | null;
};

const NOWHERE: IndexSet = { has: () => false };

/** Колонки карты и поиск клетки — mapStore. */
type StoreLike = {
  index(q: number, r: number): number;
  packed: { q: ArrayLike<number>; r: ArrayLike<number> };
};

/**
 * Круг радиуса R вокруг героя без списка клеток: «входит ли» — арифметикой по
 * координатам клетки. Раньше на КАЖДЫЙ шаг собирались 1261 объект клетки и
 * Set на 1261 номер — ~140 КБ мусора за шаг (замер 06.11.2026).
 */
function discOf(packed: StoreLike["packed"], hq: number, hr: number, radius: number): IndexSet {
  const { q, r } = packed;
  return {
    has: (i) => {
      const dq = q[i] - hq;
      const dr = r[i] - hr;
      return Math.abs(dq) <= radius && Math.abs(dr) <= radius && Math.abs(dq + dr) <= radius;
    },
  };
}

// Радиус активной зоны — общий с сервером (мешочки видно ровно в ней).
export { FOG_ACTIVE_RADIUS };

export function buildFogZones(args: {
  /** Номер клетки по (q,r) или -1 вне карты — mapStore.index. */
  index?: (q: number, r: number) => number;
  /** Сама карта: тогда круг героя считается арифметикой, без списка клеток. */
  store?: StoreLike;
  heroQ: number | null;
  heroR: number | null;
  mineFlags?: Record<string, "own" | "enemy" | "tree">;
  /** Мои бугорки «q,r» (что закопал я сам). */
  mounds?: readonly string[];
  /** Радиус активной зоны: 20, под биноклем 40 (lib/raid/sight). */
  radius?: number;
  /** Досягаемость в неразведанном: 10, под биноклем 20; null — нет (lib/raid/sight). */
  reach?: number | null;
}): FogZones {
  const { store, heroQ, heroR, mineFlags, mounds } = args;
  const radius = args.radius ?? FOG_ACTIVE_RADIUS;
  const index = store ? (q: number, r: number) => store.index(q, r) : (args.index ?? (() => -1));
  const bright = new Set<number>();
  let active: IndexSet = NOWHERE;
  if (heroQ != null && heroR != null) {
    if (store) active = discOf(store.packed, heroQ, heroR, radius);
    else {
      const set = new Set<number>();
      for (const c of hexDisc(heroQ, heroR, radius)) {
        const i = index(c.q, c.r);
        if (i >= 0) set.add(i);
      }
      active = set;
    }
  }
  const lightAround = (key: string) => {
    const [q, r] = key.split(",").map(Number);
    if (isNaN(q) || isNaN(r)) return;
    for (const c of hexDisc(q, r, 1)) {
      const i = index(c.q, c.r);
      if (i >= 0) bright.add(i);
    }
  };
  if (mineFlags) {
    for (const key of Object.keys(mineFlags)) if (mineFlags[key] === "own") lightAround(key);
  }
  for (const key of mounds ?? []) lightAround(key);
  const reach =
    heroQ != null && heroR != null && args.reach !== null
      ? { q: heroQ, r: heroR, radius: args.reach ?? FOG_REACH_RADIUS }
      : null;
  return { active, bright, reach };
}
