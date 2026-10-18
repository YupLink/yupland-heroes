// Планировка поселения: скелет города — площадь, улицы, участки под дома.
//
// Владелец, 24.09.2026: «генерация городов происходит очень косо… хаотично
// раскидывает разные элементы, причём друг на друга». Дома садились в ПЯТНО —
// связную кляксу без плана, и порядок им задавала одна только близость к
// центру, отчего город выходил россыпью дворов, а не городом.
//
// Здесь пятно заменено ПЛАНОМ: сначала чертим площадь и улицы, и лишь потом
// отдаём под дома клетки ВДОЛЬ улиц. Дом стоит у дороги, а не в чистом поле.
// Планировку выбирает рецепт: ring — площадь, кольцо и спицы; cross — две
// улицы через центр; grid — кварталы; free — прежнее пятно (лагерь, хутор).
//
// Чисто: ни БД, ни Math.random — только переданный кубик и шум, поэтому
// превью админа и запись на карту дают один и тот же город клетка в клетку.
import { hexDistance } from "@/lib/raid/hex";
import type { Noise2D } from "@/lib/raid/zonegen/noise";
import { ZONE_MAX_CELLS, type ZoneCell } from "@/lib/raid/zonegen/recipe";
import {
  blobRadius,
  cellKey,
  growBlob,
  HEX_DIRS,
  type CellTest,
} from "@/lib/raid/zonegen/settlement-place";
import type { SettlementLayout } from "@/lib/raid/zonegen/settlement-types";

/**
 * Шесть направлений ПО КРУГУ: соседние в списке — соседние на карте. Нужен
 * именно круговой порядок, иначе «каждая вторая спица» дала бы не три луча
 * через 120°, а три случайных. Первые три — оси: прямая через центр это ось
 * и её противоположность.
 */
const RAY_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

/** Осей у гекса три; какие две берём под улицы — решает жребий. */
const AXIS_COUNT = 3;
/** Квартал: улица через каждые три клетки. Два — уже не квартал, а решётка. */
const GRID_STEP = 3;
/** Радиус меньше трёх — это хутор: улицы в нём чертить негде. */
const MIN_STREET_R = 3;
/** Площадь вокруг ратуши заводим только крупному поселению. */
const PLAZA_SIZE = 9;

export type LayoutPlan = {
  /** Площадь: сюда встаёт ратуша, дорогу по ней не пишем. Может быть пустой. */
  plaza: ZoneCell[];
  /** Улицы плана: их пишем дорогой, строить на них нельзя. */
  streets: ZoneCell[];
  /** Участки под дома, от центра наружу: важное ближе к сердцу. */
  lots: ZoneCell[];
  center: ZoneCell;
};

export type LayoutInput = {
  center: ZoneCell;
  /** Поперечник застройки в клетках (рецепт). */
  size: number;
  layout: SettlementLayout;
  /** Клетка принадлежит зоне и не занята — по ней можно провести улицу. */
  inZone: CellTest;
  /** Клетка ещё и свободна под постройку (не чужая дорога). */
  free: CellTest;
  rnd: () => number;
  noise: Noise2D;
};

type StreetTest = (dq: number, dr: number) => boolean;

/** Лежит ли клетка на луче: смещение коллинеарно направлению и в его сторону. */
const onRay = (dq: number, dr: number, a: number, b: number): boolean =>
  dq * b - dr * a === 0 && dq * a + dr * b > 0;

/** Остаток по шагу квартала — всегда неотрицательный: координаты бывают и левее центра. */
const modStep = (v: number): number => ((v % GRID_STEP) + GRID_STEP) % GRID_STEP;

/** Спицы: три или шесть лучей, повёрнутых жребием — города не близнецы. */
function spokeDirs(rnd: () => number): Array<readonly [number, number]> {
  const count = rnd() < 0.5 ? 3 : 6;
  const rot = Math.floor(rnd() * RAY_DIRS.length);
  const step = RAY_DIRS.length / count;
  const out: Array<readonly [number, number]> = [];
  for (let i = 0; i < count; i++) out.push(RAY_DIRS[(rot + i * step) % RAY_DIRS.length]);
  return out;
}

/** Две оси из трёх — какие, решает жребий. */
function pickAxes(rnd: () => number): number[] {
  const drop = Math.floor(rnd() * AXIS_COUNT);
  return [0, 1, 2].filter((i) => i !== drop);
}

/** Кольцо и спицы: кольцо примерно посередине между площадью и краем. */
function ringTest(size: number, radius: number, rnd: () => number): StreetTest {
  const ring = Math.min(radius, Math.ceil(size / 4) + 1);
  const dirs = spokeDirs(rnd);
  return (dq, dr) =>
    hexDistance(0, 0, dq, dr) === ring || dirs.some(([a, b]) => onRay(dq, dr, a, b));
}

/** Две прямые через центр: перекрёсток и есть сердце поселения. */
function crossTest(rnd: () => number): StreetTest {
  const axes = pickAxes(rnd).map((i) => RAY_DIRS[i]);
  // Прямая, а не луч: клетка на оси, если смещение коллинеарно направлению
  // в любую сторону. Центр тоже улица — иначе крест распался бы надвое.
  return (dq, dr) => axes.some(([a, b]) => dq * b - dr * a === 0);
}

/** Линия семейства — постоянная координата: dr вдоль (1,0), dq вдоль (0,1), dq+dr вдоль (1,-1). */
const famValue = (fam: number, dq: number, dr: number): number =>
  fam === 0 ? dr : fam === 1 ? dq : dq + dr;

/** Кварталы: улицы через каждые три клетки по двум осям, смещение — от жребия. */
function gridTest(rnd: () => number): StreetTest {
  const fams = pickAxes(rnd);
  const offs = fams.map(() => Math.floor(rnd() * GRID_STEP));
  return (dq, dr) => fams.some((f, i) => modStep(famValue(f, dq, dr) - offs[i]) === 0);
}

function streetTest(inp: LayoutInput, radius: number): StreetTest {
  // Хутор: на круге радиуса 1–2 улица съела бы всю застройку.
  if (radius < MIN_STREET_R) return () => false;
  if (inp.layout === "cross") return crossTest(inp.rnd);
  if (inp.layout === "grid") return gridTest(inp.rnd);
  return ringTest(inp.size, radius, inp.rnd);
}

/**
 * Радиус площади. Она есть только у кольцевой планировки: у креста и кварталов
 * центр — сам перекрёсток, и вырезать из него площадь значит разрезать улицу
 * надвое. Там ратуша встаёт на ближний к центру участок (−1 = площади нет).
 */
function plazaRadius(inp: LayoutInput, radius: number): number {
  if (radius < MIN_STREET_R) return 0;
  if (inp.layout !== "ring") return -1;
  return inp.size >= PLAZA_SIZE ? 1 : 0;
}

/** Клетки круга радиуса R вокруг центра, оставшиеся в зоне. */
function discCells(center: ZoneCell, radius: number, inZone: CellTest): ZoneCell[] {
  const out: ZoneCell[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) {
      // Потолок генератора: план не бывает больше зоны за один вызов.
      if (out.length >= ZONE_MAX_CELLS) return out;
      const c = { q: center.q + dq, r: center.r + dr };
      if (inZone(cellKey(c.q, c.r))) out.push(c);
    }
  }
  return out;
}

/**
 * Участки: дом ставим ВПЛОТНУЮ к улице или площади — иначе двор оказывается
 * посреди поля и дорогу к нему не подвести. Порядок — от центра наружу.
 */
function lotsAlong(
  rest: ZoneCell[],
  plaza: ZoneCell[],
  streets: ZoneCell[],
  center: ZoneCell,
): ZoneCell[] {
  const near = new Set([...plaza, ...streets].map((c) => cellKey(c.q, c.r)));
  // Улиц нет вовсе (хутор) — правило «у дороги» ни о чём: берём весь круг.
  const out =
    streets.length === 0
      ? [...rest]
      : rest.filter((c) => HEX_DIRS.some(([dq, dr]) => near.has(cellKey(c.q + dq, c.r + dr))));
  const away = (c: ZoneCell) => hexDistance(center.q, center.r, c.q, c.r);
  out.sort((a, b) => away(a) - away(b) || a.q - b.q || a.r - b.r);
  return out;
}

/**
 * План из ГОТОВОГО пятна: улиц нет, участки — свободные клетки кляксы, сердце
 * — центр, если он свободен. Вынесено наружу, потому что settlement.ts растит
 * пятно сам (ему нужна ещё и вся клякса — по ней прокладывается улица).
 */
export function freeLayout(blob: ZoneCell[], free: CellTest, center: ZoneCell): LayoutPlan {
  const lots = blob.filter((c) => free(cellKey(c.q, c.r)));
  const heart = lots.find((c) => c.q === center.q && c.r === center.r);
  return { center, plaza: heart === undefined ? [] : [heart], streets: [], lots };
}

/** План поселения вокруг центра: где площадь, где улицы, где дворы. */
export function planLayout(inp: LayoutInput): LayoutPlan {
  const radius = blobRadius(inp.size);
  const center = inp.center;
  if (inp.layout === "free")
    return freeLayout(growBlob(center, radius, inp.inZone, inp.noise), inp.free, center);
  const street = streetTest(inp, radius);
  const plazaR = plazaRadius(inp, radius);
  const plaza: ZoneCell[] = [];
  const streets: ZoneCell[] = [];
  const rest: ZoneCell[] = [];
  for (const c of discCells(center, radius, inp.inZone)) {
    const dq = c.q - center.q;
    const dr = c.r - center.r;
    const buildable = inp.free(cellKey(c.q, c.r));
    // Порядок разбора важен: площадь вырезается из улиц, а не наоборот.
    if (hexDistance(0, 0, dq, dr) <= plazaR) {
      if (buildable) plaza.push(c);
    } else if (street(dq, dr)) streets.push(c);
    else if (buildable) rest.push(c);
  }
  return { center, plaza, streets, lots: lotsAlong(rest, plaza, streets, center) };
}
