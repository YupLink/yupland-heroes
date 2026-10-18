// Можно ли поставить сундук на клетку — признаки клетки одним подзапросом.
//
// Сундук — не постройка карты, а свой слой (raid_magic_chest): клетки карты
// переписывает редактор целиком, и сундук игрока пропал бы при первом
// сохранении админа. Поэтому «клетка свободна» проверяется в том же
// операторе, что и вставка (chest-place-sql.ts): между отдельной проверкой и
// записью успела бы встать постройка или второй сундук.
import { sqlStr } from "@/server/api/raid-shared";
import { WATER_SQL, buildingHeldSql, decorBlocksSql } from "@/server/api/beta-raid/cell-sql";
import { CELL_LAYER, RUNNER_LAYER, deadHpSql } from "@/server/api/beta-raid/runners";
import { objectKnownSql } from "@/server/api/beta-raid/boss-snapshot";
import { voidSql } from "@/server/api/beta-raid/voidCells";

/**
 * Лок клетки под сундук — ОТДЕЛЬНЫМ оператором перед установкой (locksSql).
 * Магический и обычный сундук живут в разных таблицах, и проверка «клетка
 * свободна» в каждой видит соседнюю только снимком: без общего лока двое
 * поставили бы на одну клетку по сундуку разного вида.
 */
export const cellLockKey = (mapId: string, q: number, r: number): string =>
  `chestcell:${mapId}:${q}:${r}`;

/**
 * Что держит клетку, одной строкой: постройка (портал и дверь — тоже
 * постройки; у большого здания — вся его площадь, buildingHeldSql), живой
 * объект или беглец под ним, вода, купол, сундук (магический
 * или обычный, стоящий или закопанный — бугорок сундука тоже держит клетку) и
 * живой охранник без постройки (след снесённой шахты — делить с ним клетку
 * нельзя). Живость объекта — как у шага (step-facts): держит, пока шаблон есть
 * и объект не повержен. Клетки нет на карте — строки нет, и сундук не встанет.
 */
export function cellFlagsSql(mapId: string, q: number, r: number): string {
  const at = (a: string) => `${a}.map_id = ${sqlStr(mapId)} AND ${a}.q = ${q} AND ${a}.r = ${r}`;
  return `SELECT ${buildingHeldSql("c")} AS building,
            ((c.object_id IS NOT NULL AND ${objectKnownSql("c")}
               AND NOT ${deadHpSql("c", CELL_LAYER)})
             OR EXISTS (SELECT 1 FROM yuplink.beta_raid_runner rr
                         WHERE rr.map_id = c.map_id AND rr.q = c.q AND rr.r = c.r
                           AND NOT ${deadHpSql("rr", RUNNER_LAYER)})) AS obj,
            COALESCE(${WATER_SQL}, false) AS water,
            COALESCE(${voidSql("c")}, false) AS dome,
            (EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc WHERE ${at("mc")})
             OR EXISTS (SELECT 1 FROM yuplink.raid_plain_chest pc WHERE ${at("pc")})) AS chest,
            EXISTS (SELECT 1 FROM yuplink.raid_mine_guard g
                     WHERE ${at("g")} AND g.killed_at IS NULL AND g.current_hp > 0) AS guard
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
      WHERE ${at("c")}
      LIMIT 1`;
}

/**
 * Что ещё держит клетку, когда сундук ставят не под себя, а на соседнюю (оба
 * сундука, §8.22): декор, через который не пройти, и судно у берега. Одной
 * строкой, как cellFlagsSql; клетки нет — строки нет.
 */
export function cellExtraSql(mapId: string, q: number, r: number): string {
  const at = (a: string) => `${a}.map_id = ${sqlStr(mapId)} AND ${a}.q = ${q} AND ${a}.r = ${r}`;
  return `SELECT ${decorBlocksSql("c")} AS decor,
            EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s WHERE ${at("s")}) AS ship
       FROM yuplink.raid_map_cells c
      WHERE ${at("c")}
      LIMIT 1`;
}

/** Клетку держит хоть что-то: f — cellFlagsSql, ex — cellExtraSql. */
export const CELL_HELD =
  "(f.building OR f.obj OR f.water OR f.dome OR f.chest OR f.guard OR ex.decor OR ex.ship)";
