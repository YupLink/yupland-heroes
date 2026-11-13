// Урок у столба на копии образца (владелец, 11.11.2026: короткое обучение — всем
// новичкам). Озеро урока на «Бар-На» Кай перерисовала 04.11: к столбу ведёт дорога,
// вода осталась морем на юге. Клетки «переправы» (вода вплотную к островку) стали
// травой — шаг было бы не засчитать. Образец не трогаем: на копии цель переправы —
// ближайшая к столбу вода, куда доходит лодка от верфей острова, а «островок» —
// суша ближе неё. Целое озеро (генератор) остаётся как было.
import { hexDist, keyOf } from "@/lib/raid/zonegen/town/hex";
import type { Cell } from "@/lib/raid/worldgen/geo";
import type { WorldCell } from "@/lib/raid/worldgen/spec";
import type { ShortLesson } from "./shortTutorial";
import { canFundPillar, type ShortSpellPillar } from "./shortSpell";
import type { PortalPrice } from "@/lib/portal";

const STEPS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
];
/** Дальше столба вода — уже не «переправа к столбу». */
const MAX_REACH = 6;

/** Обход от `seeds` по клеткам, где `ok` (ключ «q,r»): клетка → шагов от ближайшего семени. */
export function flood(seeds: readonly Cell[], ok: (key: string) => boolean): Map<string, number> {
  const seen = new Map<string, number>();
  const queue: Cell[] = [];
  for (const s of seeds)
    if (!seen.has(keyOf(s))) { seen.set(keyOf(s), 0); queue.push(s); }
  for (let i = 0; i < queue.length; i++) {
    const d = seen.get(keyOf(queue[i]))! + 1;
    for (const [dq, dr] of STEPS) {
      const n = { q: queue[i].q + dq, r: queue[i].r + dr };
      const k = keyOf(n);
      if (!seen.has(k) && ok(k)) { seen.set(k, d); queue.push(n); }
    }
  }
  return seen;
}

/** Соседи клетки. */
export const around = (c: Cell): Cell[] => STEPS.map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr }));

/** Вода, до которой лодка доплывает от любой верфи (её соседние клетки воды).
 *  Как у судна в маршруте: декор (водоросли) и живой объект на воде — преграда. */
function shipWater(cells: readonly WorldCell[], isShipWater: (t: string | null) => boolean, yard: string) {
  const wet = new Set(cells.filter((c) => isShipWater(c.terrainId) && !c.decorationId && !c.objectId).map(keyOf));
  const launch = cells.filter((c) => c.buildingId === yard).flatMap(around).filter((n) => wet.has(keyOf(n)));
  return new Set(flood(launch, (k) => wet.has(k)).keys());
}

/**
 * Столб заклинаний образца как он есть (её заклинание и цена). Копия образца берёт
 * столб с его клетки, и подарок первого сундука должен оплачивать ИМЕННО его цену,
 * а не столба, подобранного в мире заново. null — столба нет или цену не оплатить.
 */
export function masterPillar(cells: readonly WorldCell[], at: Cell | undefined): ShortSpellPillar | null {
  const c = at ? cells.find((x) => x.q === at.q && x.r === at.r) : undefined;
  const cfg = c?.buildingConfig as { effect?: unknown; spellbook?: Record<string, unknown> } | null | undefined;
  const book = cfg?.effect === "spellbook" ? cfg.spellbook : undefined;
  if (!c?.buildingId || !book) return null;
  const learnPrices = (Array.isArray(book.learnPrices) ? book.learnPrices : []) as PortalPrice[];
  const spells = (Array.isArray(book.spells) ? book.spells : []).filter((s): s is string => typeof s === "string");
  if (!spells.length || !canFundPillar(learnPrices)) return null;
  const forgetPrices = (Array.isArray(book.forgetPrices) ? book.forgetPrices : []) as PortalPrice[];
  return { buildingId: c.buildingId, buildingSkinId: c.buildingSkinId, tier: c.tier ?? 0, spellbook: { learnPrices, forgetPrices, spells } };
}

/** Клетки, где сервер засчитывает переправу (island-facts «sail»). */
export const sailCells = (l: ShortLesson): Cell[] =>
  l.water.filter((c) => (l.islet ?? [l.shore]).some((land) => hexDist(c, land) <= 1));

export function fitShortLesson(
  cells: readonly WorldCell[],
  lesson: ShortLesson,
  isShipWater: (terrainId: string | null) => boolean,
  shipyardId: string,
): ShortLesson {
  const pillar = lesson.pillar;
  if (!pillar) return lesson;
  const reach = shipWater(cells, isShipWater, shipyardId);
  if (sailCells(lesson).some((c) => reach.has(keyOf(c)))) return lesson;
  const near = cells.filter((c) => reach.has(keyOf(c)) && hexDist(c, pillar) <= MAX_REACH);
  if (!near.length) return lesson;
  const d = Math.min(...near.map((c) => hexDist(c, pillar)));
  const water = near.filter((c) => hexDist(c, pillar) === d).map(({ q, r }) => ({ q, r }));
  const islet = cells
    .filter((c) => hexDist(c, pillar) < d && !isShipWater(c.terrainId))
    .map(({ q, r }) => ({ q, r }));
  // Суша островка у самой цели, ближе к столбу.
  const land = islet
    .filter((c) => water.some((w) => hexDist(w, c) === 1))
    .sort((a, b) => hexDist(a, pillar) - hexDist(b, pillar) || a.q - b.q || a.r - b.r)[0];
  // Цель шага «переправа» (stepTarget → shore) — ВОДА у этого берега: к столбу на
  // копии ведёт дорога, и тап по суше увёл бы пешком, а засчитывается только корабль.
  const shore = land
    ? water.filter((w) => hexDist(w, land) === 1).sort((a, b) => a.q - b.q || a.r - b.r)[0]
    : undefined;
  return { ...lesson, water, islet, shore: shore ?? land ?? lesson.shore };
}
