// До цели на воде добираются только по воде.
//
// Раньше маршрут к водному боссу мог сойти на берег и подвести героя с суши:
// стоишь на песке, бьёшь того, кто плавает. Сундуки и артефакты вели себя так
// же. Правило владельца (03.09.2026): вода — это вода, к ней нужен корабль.
//
// Проверка стоит ровно один запрос и делается ТОЛЬКО когда цель водная: у боя
// на суше (а это почти весь бой) лишних походов в базу не появилось.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { WATER_SQL } from "./cell-sql";

/** Ключ отказа — humanError переведёт его на язык игрока. */
export const WATER_ONLY_KEY = "braid.water_target_only";

/** Клетка на воде? Один короткий запрос по первичному ключу карты. */
export async function isWaterAt(mapId: string, q: number, r: number): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT EXISTS (SELECT 1 FROM yuplink.mystic_item_template t
                     WHERE t.id = c.terrain_id AND ${WATER_SQL}) AS water
       FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${Math.floor(q)} AND c.r = ${Math.floor(r)}
      LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ water: boolean | null }>;
  return !!rows?.[0]?.water;
}

/**
 * Цель на воде — герой обязан быть на воде (то есть на судне).
 *
 * targetWater приходит готовым из loadCellObject: он и так читает клетку, и
 * отдельного запроса за водой не нужно. За позицию героя спрашиваем только
 * тогда, когда цель действительно водная.
 */
export async function requireWaterReach(
  mapId: string,
  targetWater: boolean,
  pos: { q: number; r: number },
): Promise<void> {
  if (!targetWater) return;
  if (await isWaterAt(mapId, pos.q, pos.r)) return;
  throw new Error(WATER_ONLY_KEY);
}
