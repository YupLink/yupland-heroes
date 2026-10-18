// Поселения в генераторе зоны: подготовить вход планировщику и сверить его с
// справочником.
//
// Отдельным файлом от ручки, потому что дело тут ровно одно и сугубо серверное:
// планировщик (lib/raid/zonegen/settlement и town/*) — чистая математика и про
// базу не знает, а справочник построек живёт только на сервере. Ручка же
// обязана остаться тонкой.
//
// Две ветки. `organic` (по умолчанию с 25.09) — органический рост по
// docs/town-generation-algorithm.json: центр → въезды → магистрали → службы по
// соседству → жильё (generate-town.ts). ring/cross/grid/free — прежние
// трафареты planSettlements: остались планировками, которые админ выбирает сам.
//
// Главная проверка здесь — «ставим только то, что есть». Шаблон могли
// деактивировать, пока панель держала рецепт открытым; поставить исчезнувшую
// постройку значит развесить по карте «чёрные точки» без картинки и без
// действия, и вычищать их потом придётся кистью по одной.
import { planSettlements } from "@/lib/raid/zonegen/settlement";
import { isWaterName } from "@/lib/shipRules";
import type { ZoneCell, ZonePatch, ZoneRecipe } from "@/lib/raid/zonegen/recipe";
import type {
  BuildingOption,
  SettlementRecipe,
  SettlementReport,
  ZoneStructure,
} from "@/lib/raid/zonegen/settlement-types";
import { loadBuildingOptions, loadRoadOptions } from "./catalog-buildings";
import { planOrganicTowns } from "./generate-town";
import { loadTownContext } from "./town-context";

export type SettlementResult = { structures: ZoneStructure[]; report: SettlementReport };

/** Органический рост с автоподбором: состав тянет жребий, слоты не читаются. */
export const isAutoOrganic = (s: SettlementRecipe): boolean => s.layout === "organic" && s.auto;

/**
 * Ручной состав есть, когда хоть одна строка что-то ставит: точные штуки или
 * фон. Автоподбору органического роста состав не нужен вовсе.
 */
export const hasComposition = (s: SettlementRecipe): boolean =>
  isAutoOrganic(s) || s.slots.some((x) => x.count > 0 || x.fill === true);

/** Рецепт ссылается только на живые шаблоны — иначе пустая клетка с чужим id. */
export function assertKnownBuildings(
  recipe: SettlementRecipe,
  buildings: BuildingOption[],
  roads: Array<{ id: string }>,
): void {
  const known = new Set(buildings.map((b) => b.id));
  // При автоподборе слоты — только запасной состав панели, ставить их не будем.
  const slots = isAutoOrganic(recipe) ? [] : recipe.slots;
  const missing = slots
    .filter((s) => s.count > 0 || s.fill === true)
    .map((s) => s.buildingId)
    .filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new Error(
      `В поселении выбраны постройки, которых нет в справочнике: ${[...new Set(missing)].join(", ")}`,
    );
  }
  if (recipe.roadId !== null && !roads.some((r) => r.id === recipe.roadId)) {
    throw new Error(`Дороги «${recipe.roadId}» нет в справочнике — выбери другую`);
  }
}

/**
 * Разложить поселения по уже посчитанной местности.
 *
 * Планировщик получает КЛЕТКИ ПАТЧЕЙ, а не всё выделение: местность у них
 * только что посчитана этим же вызовом, и ставить дом на клетку, которой
 * генератор не коснулся (занята объектом, под игроком), нельзя — патч туда не
 * поедет, а постройка поедет.
 *
 * `null` — поселений не просили: ни лишнего запроса в справочник, ни раздела в
 * отчёте.
 */
export async function planZoneSettlements(args: {
  recipe: ZoneRecipe;
  patches: ZonePatch[];
  occupied: Set<string>;
  roads: Set<string>;
  terrainNames: Record<string, string>;
  /** Карта и выделение — органическому росту: дороги и вода за краем кисти. */
  mapId: string;
  cells: ZoneCell[];
}): Promise<SettlementResult | null> {
  const recipe = args.recipe.settlement;
  if (!recipe?.enabled || !hasComposition(recipe)) return null;

  const [buildings, roadOptions] = await Promise.all([loadBuildingOptions(), loadRoadOptions()]);
  assertKnownBuildings(recipe, buildings, roadOptions);

  if (recipe.layout === "organic") {
    // Дороги карты — вместе с теми, что уже в зоне: въезды тянутся к трактам
    // и снаружи выделения, на 6 клеток (шаг 4 и 6 спецификации).
    const context = await loadTownContext(args.mapId, args.cells, args.terrainNames);
    for (const k of args.roads) context.mapRoads.add(k);
    return planOrganicTowns({
      settlement: recipe,
      seed: args.recipe.seed,
      patches: args.patches,
      occupied: args.occupied,
      context,
      terrainNames: args.terrainNames,
      buildings,
    });
  }

  // Клетки патчей — это и есть зона планировщика: у них уже посчитана
  // местность, и только они поедут в базу.
  const cells = args.patches.map((p) => ({ q: p.q, r: p.r }));
  const terrainOf = new Map<string, string>();
  for (const p of args.patches) terrainOf.set(`${p.q},${p.r}`, p.terrainId);

  // Воду узнаём по имени местности — тем же признаком, что корабли и генератор.
  const isWater = (terrainId: string) => isWaterName(args.terrainNames[terrainId]);
  // Сид планировщик берёт из рецепта сам: «та же зона» включает и её дворы.
  return planSettlements({
    cells,
    free: new Set(terrainOf.keys()),
    occupied: args.occupied,
    roads: args.roads,
    terrainOf,
    isWater,
    recipe: { ...args.recipe, settlement: recipe },
    options: buildings,
  });
}
