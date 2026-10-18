// Шаг 5: ядро поселения — площадь или луг.
//
// Спецификация (docs/town-generation-algorithm.json, шаг 5): в городке
// ратуша встаёт в медоид, а кольцо 1 вокруг неё — площадь (Рынок Кракова и
// Вроцлава: ратуша посреди площади, которую обходит кольцом). В деревнях
// вместо площади общий луг: у Rundling — центр с кольцом 1, у Angerdorf —
// линза между двумя въездами. Лагерь — одна пустая клетка (костёр).
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { hexToXY } from "@/lib/raid/zonegen/noise";
import { bestCell } from "@/lib/raid/zonegen/town/fields";
import {
  disk,
  hashCell,
  hexArea,
  hexDist,
  hexLine,
  keyOf,
  neighbors,
  ring,
  rngFor,
} from "@/lib/raid/zonegen/town/hex";
import type { TownFields, TownForm } from "@/lib/raid/zonegen/town/types";

/** Площадь — кольцо 1, минимум 4 проходимых из 6 (шаг 5). */
const PLAZA_MIN = 4;
/** Длина линзы луга 3–5 клеток вдоль прямой между воротами (шаг 5). */
const LENS_MIN = 3;
const LENS_MAX = 5;
/** Луг меньше 4 клеток — не луг: луговой деревни не выйдет. */
export const GREEN_MIN = 4;

const isLand = (fields: TownFields) => (c: ZoneCell) => fields.land.has(keyOf(c));

/** Проходимые клетки кольца 1 — будущая площадь. */
export const plazaCells = (fields: TownFields, center: ZoneCell): ZoneCell[] =>
  ring(center, 1).filter(isLand(fields));

/**
 * Центр городка: если на кольце 1 меньше 4 проходимых — сдвиг на лучшую
 * клетку в радиусе 2 (больше проходимых на кольце, ближе к исходному центру).
 */
export function settleCenter(fields: TownFields, center: ZoneCell, seed: number): ZoneCell {
  const here = plazaCells(fields, center).length;
  if (here >= PLAZA_MIN) return center;
  const cand = disk(center, 2).filter(
    (c) => fields.land.has(keyOf(c)) && !fields.mapRoads.has(keyOf(c)),
  );
  const best = bestCell(cand, (c) => plazaCells(fields, c).length * 10 - hexDist(c, center), seed);
  return best !== null && plazaCells(fields, best).length > here ? best : center;
}

/** Луг — суша без дороги карты: лежащую дорогу не сотрёшь, а «дорога в луг не пишется». */
const isMeadow = (fields: TownFields) => (c: ZoneCell) =>
  fields.land.has(keyOf(c)) && !fields.mapRoads.has(keyOf(c));

/** Луг Rundling: центр + кольцо 1 (7 клеток — «область близка к кругу»). */
export const roundGreen = (fields: TownFields, center: ZoneCell): ZoneCell[] =>
  disk(center, 1).filter(isMeadow(fields));

/**
 * Место луга Rundling: центр притянут к дороге карты (шаг 2) и часто стоит
 * вплотную к ней — тогда луг сдвигается в радиусе 2 (как центр городка в
 * шаге 5), и тупик дороги упирается в кольцо дворов, где и положен въезд.
 * null — целого луга из 7 клеток рядом нет.
 */
export function roundSpot(fields: TownFields, center: ZoneCell, seed: number): ZoneCell | null {
  const full = disk(center, 2).filter((c) => roundGreen(fields, c).length === hexArea(1));
  return bestCell(full, (c) => -hexDist(c, center), seed);
}

/** Знак стороны клетки относительно прямой a→b (векторное произведение на плоскости). */
function sideOf(a: ZoneCell, b: ZoneCell, c: ZoneCell): number {
  const pa = hexToXY(a.q, a.r);
  const pb = hexToXY(b.q, b.r);
  const pc = hexToXY(c.q, c.r);
  return Math.sign((pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x));
}

/**
 * Луг Angerdorf: линза шириной 2 вдоль прямой между воротами a и b длиной
 * 3–5 (жребий), посередине — у центра. Второй ряд — клетки, касающиеся двух
 * клеток оси с одной стороны: ряд выходит на клетку короче, и концы сами
 * сужаются в линзу. Сторону выбирает хеш центра.
 */
export function lensGreen(
  fields: TownFields,
  center: ZoneCell,
  a: ZoneCell,
  b: ZoneCell,
  seed: number,
): ZoneCell[] {
  const line = hexLine(a, b);
  // Концы прямой — сами ворота и клетка за ними: луг туда не заходит.
  if (line.length < LENS_MIN + 2) return [];
  let mid = 1;
  for (let i = 1; i < line.length - 1; i++) {
    if (hexDist(line[i], center) < hexDist(line[mid], center)) mid = i;
  }
  const len = Math.min(
    line.length - 2,
    LENS_MIN + Math.floor(rngFor(seed, "green")() * (LENS_MAX - LENS_MIN + 1)),
  );
  const from = Math.max(1, Math.min(line.length - 1 - len, mid - Math.floor((len - 1) / 2)));
  const axis = line.slice(from, from + len);
  const axisKeys = new Set(axis.map(keyOf));
  const side = (hashCell(seed, center.q, center.r) & 1) === 0 ? 1 : -1;
  const second = new Map<string, ZoneCell>();
  for (const c of axis) {
    for (const n of neighbors(c)) {
      const k = keyOf(n);
      if (axisKeys.has(k) || second.has(k) || sideOf(a, b, n) !== side) continue;
      const touches = neighbors(n).filter((x) => axisKeys.has(keyOf(x))).length;
      if (touches >= 2) second.set(k, n);
    }
  }
  return [...axis, ...second.values()].filter(isMeadow(fields));
}

export type Core = { center: ZoneCell; plaza: ZoneCell[]; green: ZoneCell[] };

/**
 * Куда дорогу не кладём: луг (Rundling и Angerdorf — «дорога в него не
 * пишется»), место ратуши у городка и порта, костёр лагеря, постройки.
 */
export function reservedOf(form: TownForm, core: Core, built: Iterable<string> = []): Set<string> {
  const out = new Set(core.green.map(keyOf));
  if (form === "town" || form === "port" || form === "camp") out.add(keyOf(core.center));
  for (const k of built) out.add(k);
  return out;
}

/** Ядро под форму: площадь у городка и порта, луг у круглой и луговой, костёр у лагеря. */
export function coreOf(
  form: TownForm,
  fields: TownFields,
  center: ZoneCell,
  gates: readonly ZoneCell[],
  seed: number,
): Core {
  if (form === "town" || form === "port") {
    const c = settleCenter(fields, center, seed);
    return { center: c, plaza: plazaCells(fields, c), green: [] };
  }
  if (form === "round") {
    const c = roundSpot(fields, center, seed) ?? center;
    return { center: c, plaza: [], green: roundGreen(fields, c) };
  }
  if (form === "camp") return { center, plaza: [], green: [center] };
  if (form === "green" && gates.length >= 2) {
    return { center, plaza: [], green: lensGreen(fields, center, gates[0], gates[1], seed) };
  }
  return { center, plaza: [], green: [] };
}
