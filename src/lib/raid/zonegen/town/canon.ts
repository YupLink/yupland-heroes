// Канон разблокировки служб и лимиты состава — шаг 1 спецификации
// (docs/town-generation-algorithm.json).
//
// Службы открываются в каноническом порядке, как у watabou (Model.hx), и
// порядок слегка перемешан сидом (⌊len/10⌋ обменов соседей). Заказ шаблона
// (TownKind) правит только сам канон: у хутора нет центральных функций
// (Weiler: 3–20 дворов без них; Кристаллер: малые места — без рынка), у
// лагеря первым идёт найм (таблица forms: «есть казарма или найм»).
import type { TownKind } from "@/lib/raid/zonegen/settlement-types";
import type { TownRole } from "@/lib/raid/zonegen/town/types";

/** Канон разблокировки служб (спецификация, шаг 1). Рынок трижды: №1, №2, №3. */
const CANON: readonly TownRole[] = [
  "tavern",
  "warehouse",
  "market",
  "forge",
  "temple",
  "barracks",
  "market",
  "armory",
  "forge",
  "university",
  "watchtower",
  "museum",
  "arena",
  "market",
];

/**
 * Хутор: ни таверны, ни храма, ни рынка — только хозяйство. Вышки тоже нет
 * (таблица zoning: «Хутор — 0»).
 */
const HAMLET: readonly TownRole[] = ["warehouse", "forge"];

/** Склад и верфь в лимит служб не входят: это хозяйство, а не «район». */
export const FREE_OF_LIMIT: ReadonlySet<TownRole> = new Set(["warehouse", "shipyard"]);

/** С какого размера роль вообще появляется: храм с 8, арена и университет с 25, музей с 30. */
export const MIN_N: Partial<Record<TownRole, number>> = {
  temple: 8,
  arena: 25,
  university: 25,
  museum: 30,
};

/** Лимит служб без склада и верфи (Civ VI). */
export const serviceLimit = (n: number): number => 1 + Math.floor((Math.max(1, n) - 1) / 3);

/** Потолок одной модели: не больше ⌊N/10⌋+1 одинаковых построек. */
export const modelCap = (n: number): number => Math.floor(n / 10) + 1;

/** Канон по заказу: у хутора — своё хозяйство, у лагеря найм впереди. */
function baseCanon(kind: TownKind): TownRole[] {
  if (kind === "hamlet") return [...HAMLET];
  if (kind === "camp") return ["barracks", ...CANON.filter((r) => r !== "barracks")];
  return [...CANON];
}

/**
 * Канон с верфью после склада (при воде) и перемешанный по сиду. У лагеря
 * найм приколот к началу: обмен соседей не должен выбить из лагеря то, что
 * делает его лагерем.
 */
export function canonOrder(
  hasWater: boolean,
  rnd: () => number,
  kind: TownKind = "auto",
): TownRole[] {
  const list = baseCanon(kind);
  const wh = list.indexOf("warehouse");
  if (hasWater && wh >= 0) list.splice(wh + 1, 0, "shipyard");
  const head = kind === "camp" ? 1 : 0;
  const span = list.length - head;
  if (span < 2) return list;
  const swaps = Math.max(1, Math.floor(list.length / 10));
  for (let i = 0; i < swaps; i++) {
    const at = head + Math.floor(rnd() * (span - 1));
    [list[at], list[at + 1]] = [list[at + 1], list[at]];
  }
  return list;
}
