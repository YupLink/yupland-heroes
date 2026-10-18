// SQL свободной клетки, порядок жребия и добор «любой суши» для автораздачи.
// Вынесено из scatter-cells.ts ради лимита ≤250 строк.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { WATER_SQL } from "./cell-sql";
import { RUNNER_HERE } from "./runners";
import { SCATTER_SEED_MAX } from "@/lib/raid/scatterPlan";

export type CellRef = { q: number; r: number };

const cellRows = (rows: unknown[]): Array<{ q: number; r: number }> =>
  (rows ?? []) as Array<{ q: number; r: number }>;

/**
 * «Сюда объект поставить можно» — в терминах клетки `c`.
 *
 * Дорога (road_id) в списке запретов не участвует намеренно: объект на дороге
 * законен, по ней к нему и ходят. Всё остальное — занято: земли нет, лежит
 * декорация-преграда, стоит постройка, стоит другой объект, накрыто глухим
 * туманом, под клеткой прячется беглец (runners.ts), на ней стоит игрок или
 * лежит живой мешочек (ПРАВИЛА §8.21) или стоит сундук (и его бугорок,
 * §8.22): объект над ним спрятал бы добычу — тап по клетке с живым объектом
 * открывает бой, а не мешочек.
 *
 * У позиций игроков нет колонки map_id — таблица живёт для одной активной
 * карты, поэтому и сверка идёт только по координатам.
 */
export const FREE_CELL = `c.terrain_id IS NOT NULL
       AND c.decoration_id IS NULL
       AND c.building_id IS NULL
       AND c.group_id IS NULL
       AND c.object_id IS NULL
       AND c.void_fog IS NOT TRUE
       AND NOT ${RUNNER_HERE}
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_positions p
                        WHERE p.q = c.q AND p.r = c.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag lb
                        JOIN yuplink.raid_loot_bag_item li ON li.bag_id = lb.id
                       WHERE lb.map_id = c.map_id AND lb.q = c.q AND lb.r = c.r
                         AND li.count > 0 AND li.expires_at > now())
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc
                        WHERE mc.map_id = c.map_id AND mc.q = c.q AND mc.r = c.r)
       AND NOT EXISTS (SELECT 1 FROM yuplink.raid_plain_chest pc
                        WHERE pc.map_id = c.map_id AND pc.q = c.q AND pc.r = c.r)`;

/** Суша: не вода и не океан. Признак — по НАЗВАНИЮ местности, как везде. */
export const DRY_LAND = `EXISTS (SELECT 1 FROM yuplink.mystic_item_template t
                           WHERE t.id = c.terrain_id AND NOT ${WATER_SQL})`;

/** Сид из плана: мусор и минус гасим в «сида нет», дробь и перебор — в Int32. */
const seedInt = (seed?: number | null): number | null => {
  const n = Number(seed);
  if (seed === null || seed === undefined || !Number.isFinite(n) || n < 0) return null;
  return Math.floor(n) % (SCATTER_SEED_MAX + 1);
};

/**
 * Чем сортируем клетки в жребии.
 *
 * Без сида — прежний `random()`: каждый запуск свой. С сидом — md5 от
 * «сид:q,r»: значение зависит только от клетки и сида, поэтому порядок
 * повторяется на любой машине и в любой версии Postgres, а соседние клетки
 * разбегаются по списку (координаты подряд дают несоседние хэши) — раскладка
 * остаётся рассыпанной, а не полосой.
 */
export const cellOrder = (seed: number | null | undefined, alias: string): string => {
  const s = seedInt(seed);
  return s === null
    ? "random()"
    : `md5(${s}::text || ':' || ${alias}.q::text || ',' || ${alias}.r::text)`;
};

const cellKey = (c: CellRef): string => `${c.q},${c.r}`;

/**
 * Жребий по любой суше — общий котёл для заявок без местности и для недостач.
 *
 * Уже отданные клетки (`taken`) в этом котле лежат — местность-то у них сухая,
 * — и без вычета один сундук и один босс встали бы в одну клетку: второй затёр
 * бы первого. Но вычитаются они ЗДЕСЬ, а не списком координат в SQL: на большой
 * раскладке их тысячи, текст запроса пухнет до сотен килобайт, а мост уже
 * упирался в память на куда меньшем.
 *
 * Взамен берём с запасом ровно на их число. Отданные клетки — часть той же
 * свободной суши, поэтому даже в худшем случае, когда жребий вернёт их все,
 * непойманных в выборке останется не меньше `need`.
 */
export async function pickAnyLand(
  mapId: string,
  need: number,
  taken: CellRef[],
  seed?: number | null,
  /** Только эти местности (уровень местности у боссов); null — любая суша. */
  terrains?: readonly string[] | null,
): Promise<CellRef[]> {
  if (need <= 0 || (terrains && terrains.length === 0)) return [];
  const only = terrains ? `AND c.terrain_id IN (${terrains.map(sqlStr).join(",")})` : "";
  const skip = new Set(taken.map(cellKey));
  const rows = await mcpExec(
    `SELECT c.q, c.r
       FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)} AND ${FREE_CELL} AND ${DRY_LAND} ${only}
      ORDER BY ${cellOrder(seed, "c")} LIMIT ${Math.floor(need) + skip.size};`,
    { wrapJson: true },
  );
  const out: CellRef[] = [];
  for (const row of cellRows(rows)) {
    const cell = { q: Number(row.q), r: Number(row.r) };
    if (skip.has(cellKey(cell))) continue;
    out.push(cell);
    if (out.length >= need) break;
  }
  return out;
}
