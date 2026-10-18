// Обвязка тестов скелета органического поселения (src/lib/raid/zonegen/town).
//
// Отдельным файлом: тесты формы/ворот и тесты улиц живут в разных файлах
// (потолок 250 строк), а поле, дороги карты и составы им нужны одни и те же.
// Справочник построек здесь не нужен — скелет строится до расстановки; он в
// townFixture.ts (зонирование и подборка).
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import type { TownComposition } from "@/lib/raid/zonegen/town/form";
import { drawGateCount } from "@/lib/raid/zonegen/town/gates";
import { disk, keyOf, neighborKeys } from "@/lib/raid/zonegen/town/hex";
import { buildSkeleton } from "@/lib/raid/zonegen/town/skeleton";
import type { TownForm, TownInput, TownSkeleton } from "@/lib/raid/zonegen/town/types";

export const AT: ZoneCell = { q: 0, r: 0 };

/** Зона-круг радиуса R вокруг начала координат. */
export const disc = (radius: number, at: ZoneCell = AT): ZoneCell[] => disk(at, radius);

/** Прямая дорога карты вдоль оси q (r фиксирован) от q0 до q1 включительно. */
export function roadAlongQ(r: number, q0: number, q1: number): Set<string> {
  const out = new Set<string>();
  for (let q = Math.min(q0, q1); q <= Math.max(q0, q1); q++) out.add(`${q},${r}`);
  return out;
}

export function skelInput(cells: ZoneCell[], over: Partial<TownInput> = {}): TownInput {
  return {
    cells,
    occupied: new Set(),
    water: new Set(),
    decorBlocked: new Set(),
    mapRoads: new Set(),
    seed: 7,
    buildings: 12,
    theme: "",
    options: [],
    manual: null,
    roadId: "r_dirt",
    built: true,
    ...over,
  };
}

/** Составы для дерева форм. */
export const VILLAGE: TownComposition = { hall: false, temple: false, tavern: true };
export const HAMLET: TownComposition = { hall: false, temple: false, tavern: false };
export const CAMP: TownComposition = { hall: false, temple: false, tavern: true, barracks: true };
export const TOWN: TownComposition = { hall: true, temple: true, tavern: true, market: true };

/** Связность по дорогам: какие клетки достижимы из from, шагая только по roads. */
export function roadReach(
  roads: ReadonlySet<string> | ReadonlyMap<string, number>,
  from: string[],
): Set<string> {
  const seen = new Set<string>(from.filter((k) => roads.has(k)));
  const queue = [...seen];
  for (let i = 0; i < queue.length; i++) {
    for (const n of neighborKeys(queue[i])) {
      if (!roads.has(n) || seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return seen;
}

/** Снимок скелета для сравнения «байт в байт»: дороги — отсортированным списком. */
export function snapshot(sk: {
  form: string;
  radius: number;
  center: ZoneCell;
  plaza: ZoneCell[];
  green: ZoneCell[];
  gates: ZoneCell[];
  roads: Map<string, number>;
}): string {
  const roads = [...sk.roads.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify({ ...sk, center: keyOf(sk.center), roads });
}

/** Детерминированная перетасовка (обратный порядок + чередование) — порядок входа не должен влиять. */
export function shuffled<T>(xs: readonly T[]): T[] {
  const even = xs.filter((_, i) => i % 2 === 0).reverse();
  const odd = xs.filter((_, i) => i % 2 === 1);
  return [...odd, ...even];
}

/** Скелет или исключение: в тестах «не собрался» — уже провал. */
export function build(input: TownInput, comp: TownComposition, n: number): TownSkeleton {
  const sk = buildSkeleton(input, comp, n);
  if (sk === null) throw new Error("скелет не собрался");
  return sk;
}

/** Сид, при котором жребий ворот даёт нужное число: без дорог карты оно и решает форму. */
export function seedWith(radius: number, count: number): number {
  for (let s = 0; s < 500; s++) if (drawGateCount(radius, s) === count) return s;
  throw new Error(`нет сида на ${count} ворот при Rb=${radius}`);
}

/** Дорожные клетки у ядра (центр, площадь, луг) — от них меряется связность. */
export function hubRoads(sk: TownSkeleton): string[] {
  const out = new Set<string>();
  for (const c of [sk.center, ...sk.plaza, ...sk.green]) {
    for (const x of disk(c, 1)) if (sk.roads.has(keyOf(x))) out.add(keyOf(x));
  }
  return [...out];
}

export type FormCase = { form: TownForm; input: TownInput; comp: TownComposition; n: number };

const WATER_EAST = new Set(
  disc(14)
    .filter((c) => c.q >= 5)
    .map(keyOf),
);

/** По подходящему полю на каждую форму таблицы forms (шаг 3 спецификации). */
export const FORM_CASES: FormCase[] = [
  { form: "camp", input: skelInput(disc(12), { seed: 3 }), comp: CAMP, n: 5 },
  { form: "hamlet", input: skelInput(disc(12), { seed: 3 }), comp: HAMLET, n: 7 },
  {
    form: "port",
    input: skelInput(disc(14), { seed: 3, water: WATER_EAST }),
    comp: { ...TOWN, warehouse: true },
    n: 14,
  },
  { form: "town", input: skelInput(disc(14), { seed: 3 }), comp: TOWN, n: 25 },
  {
    form: "street",
    input: skelInput(disc(14), { seed: 3, mapRoads: roadAlongQ(2, -20, 20) }),
    comp: VILLAGE,
    n: 12,
  },
  { form: "round", input: skelInput(disc(12), { seed: seedWith(3, 1) }), comp: VILLAGE, n: 10 },
  { form: "green", input: skelInput(disc(12), { seed: seedWith(4, 2) }), comp: VILLAGE, n: 15 },
  { form: "cluster", input: skelInput(disc(12), { seed: seedWith(4, 3) }), comp: VILLAGE, n: 16 },
];
