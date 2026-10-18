// Во что обходится ОДИН шаг по гексу — общая база для маршрута и соседних клеток.
//
// Вынесено из usePathfinding (правило ≤250 строк): там остался сам поиск, а
// здесь — что клетка из себя представляет и почём в неё входить.
import { isWaterName, isOceanName, stepEnergyCost } from "@/lib/shipRules";

export type CellInfo = {
  terrainId?: string;
  objectId?: string;
  roadId?: string | null;
  /** Повержённый объект клетку больше не держит. */
  objectDefeated?: boolean;
  /** Объект на клетке — беглец: он на ней прячется и прохода не закрывает. */
  runner?: boolean;
  /** Декор (дерево/куст) — непроходимая преграда. */
  decorationId?: string | null;
  /** Клетка под глухим туманом — стена. У админа флага нет (см. unpackMap). */
  voidFog?: boolean;
};

export type TerrainInfo = {
  id: string;
  name: string;
  imageUrl: string | null;
  cost: number;
};

/**
 * Клетка накрыта глухим туманом — по флагу САМОЙ КЛЕТКИ, а не её местности.
 *
 * Купол лежит поверх клетки и ничего под собой не переписывает: под ним живут
 * настоящие горы, дорога и постройка. Спрашивать про него у типа местности
 * значило бы стирать эти настройки покраской.
 */
export function isVoidCell(cell: CellInfo | undefined): boolean {
  return cell?.voidFog === true;
}

/** Вода ли клетка — по названию её типа местности. */
export function isWaterCell(
  cell: CellInfo | undefined,
  terrains: Record<string, TerrainInfo>,
): boolean {
  return isWaterName(cell?.terrainId ? terrains[cell.terrainId]?.name : null);
}

/** Океан ли клетка — глубокая вода, куда пройдёт только большой корабль. */
export function isOceanCell(
  cell: CellInfo | undefined,
  terrains: Record<string, TerrainInfo>,
): boolean {
  return isOceanName(cell?.terrainId ? terrains[cell.terrainId]?.name : null);
}

/**
 * Цена самой клетки: есть дорога — по дороге, нет — по местности.
 *
 * Дорога без шаблона всё равно остаётся дорогой и стоит 1 — ровно так считает
 * сервер (helpers.cellMoveCost: `cellRoadId(roadId) || terrainId`, а на пустой
 * выборке `Number(undefined) || 1`). Раньше пропавший шаблон отбрасывал клиент
 * к цене местности: на дороге через болото рисовалось 10, а списывалась 1.
 * Шаблон теряется не в теории — road_id исторически хранился склейкой
 * «path,road_XXX», и разобранного id могло не оказаться в словаре.
 */
export function cellBaseCost(
  cell: CellInfo | undefined,
  terrains: Record<string, TerrainInfo>,
  roads: Record<string, TerrainInfo> | undefined,
): number {
  if (cell?.roadId) return roads?.[cell.roadId]?.cost || 1;
  const terrain = cell?.terrainId ? terrains[cell.terrainId] : null;
  return terrain?.cost ?? 1;
}

/**
 * Цена шага: дорога приоритетнее местности. Проложил дорогу за 1 через
 * болото за 10 — шаг стоит 1 (то же правило на сервере, helpers.cellMoveCost).
 * На корабле вода стоит одинаково — плывёт судно, а не герой.
 *
 * Итог считает общая с сервером stepEnergyCost: здесь только выбираем базу.
 * Замедление входит в КАЖДЫЙ шаг — иначе маршрут показывал бы 18, а сервер
 * списывал 30, и энергия кончалась бы на середине пути. Сюда же приходит скидка
 * героя: на суше она режет клетку ВМЕСТЕ с замедлением (правило 27.09), и без
 * неё кружок на клетке показывал бы цену дороже списанной.
 */
export function stepCost(
  cell: CellInfo | undefined,
  terrains: Record<string, TerrainInfo>,
  roads: Record<string, TerrainInfo> | undefined,
  aboard: boolean | undefined,
  boarding: boolean | undefined,
  slowExtra: number,
  /**
   * Скидка героя за скорость, в ПРОЦЕНТАХ (не в единицах энергии): сервер
   * умножает цену клетки на (1 − pct/100). Нет героя — ноль и прежняя цена.
   */
  stepDiscountPct = 0,
  /** На борту большого корабля — гребок дешевле (2 вместо 3). */
  aboardBig = false,
): number {
  return stepEnergyCost({
    boarding,
    sailing: !!aboard && isWaterCell(cell, terrains),
    bigShip: aboardBig,
    cellCost: cellBaseCost(cell, terrains, roads),
    slowExtra,
    heroStepDiscountPct: stepDiscountPct,
  });
}
