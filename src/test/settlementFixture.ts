// Обвязка тестов поселений: поле, справочник построек и рецепт.
//
// Вынесена отдельно, потому что тесты расстановки и тесты улиц живут в разных
// файлах (потолок 250 строк), а поле и справочник им нужны одни и те же.
import type { PlanSettlementsInput } from "@/lib/raid/zonegen/settlement";
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import {
  defaultSettlement,
  type BuildingOption,
  type SettlementRecipe,
  type ZoneStructure,
} from "@/lib/raid/zonegen/settlement-types";
import { recipe } from "@/test/zonegenFixture";

export const key = (c: { q: number; r: number }): string => `${c.q},${c.r}`;

/** Поле зоны: прямоугольник гексов w×h. */
export const field = (w = 30, h = 30): ZoneCell[] => {
  const out: ZoneCell[] = [];
  for (let q = 0; q < w; q++) for (let r = 0; r < h; r++) out.push({ q, r });
  return out;
};

export const HALL: BuildingOption = {
  id: "b_hall",
  name: "Ратуша",
  effect: "town_hall",
  tiers: 3,
  needsConfig: false,
};
export const HOUSE: BuildingOption = {
  id: "b_house",
  name: "Лавка",
  effect: "market",
  tiers: 1,
  needsConfig: false,
};
export const MINE: BuildingOption = {
  id: "b_mine",
  name: "Шахта",
  effect: "mine",
  tiers: 2,
  needsConfig: true,
};
/** Шаблон без тиров: тир такому ставить нельзя вовсе. */
export const HUT: BuildingOption = {
  id: "b_hut",
  name: "Хижина",
  effect: null,
  tiers: 0,
  needsConfig: false,
};
export const OPTIONS: BuildingOption[] = [HALL, HOUSE, MINE, HUT];

export const settlement = (over: Partial<SettlementRecipe> = {}): SettlementRecipe => ({
  ...defaultSettlement(),
  enabled: true,
  count: 1,
  size: 12,
  density: 0.2,
  // Старые тесты писаны про ПЯТНО: планировки живут в settlement.layout.test.ts.
  layout: "free",
  // Состав по-новому: ратуша ровно одна, дворы добивают остаток пятна.
  slots: [
    { buildingId: HALL.id, count: 1 },
    { buildingId: HOUSE.id, count: 0, fill: true },
  ],
  roadId: null,
  built: true,
  ...over,
});

export const input = (
  s: Partial<SettlementRecipe> = {},
  over: Partial<PlanSettlementsInput> = {},
): PlanSettlementsInput => {
  const cells = over.cells ?? field();
  return {
    cells,
    free: new Set(cells.map(key)),
    occupied: new Set(),
    roads: new Set(),
    terrainOf: new Map(cells.map((c) => [key(c), "grass"])),
    isWater: (t) => t === "water",
    recipe: recipe({ settlement: settlement(s) }),
    options: OPTIONS,
    ...over,
  };
};

/** Местность поля с водой там, где скажет предикат. */
export const terrainWith = (
  cells: ZoneCell[],
  water: (c: ZoneCell) => boolean,
): Map<string, string> => new Map(cells.map((c) => [key(c), water(c) ? "water" : "grass"]));

export const houses = (st: ZoneStructure[]): ZoneStructure[] =>
  st.filter((s) => s.buildingId !== undefined);
export const streets = (st: ZoneStructure[]): ZoneStructure[] =>
  st.filter((s) => s.roadId !== undefined && s.roadId !== null);
