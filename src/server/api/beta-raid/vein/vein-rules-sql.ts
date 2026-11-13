// Где может лежать жила (lib/veinPlace) — одним списком SQL-признаков, общим для
// подсветки круга (vein-spots) и оператора укладки (vein-place-sql): правила те
// же, что у раскладки minev2-30, плюс «жилы на клетке ещё нет».
//
//  · известная местность (у клетки есть шаблон местности);
//  · не глухой туман, не вода и не океан (cell-sql.WATER_SQL — океан входит в
//    воду), не грядки и не земля замка;
//  · не дорога, не постройка и не клетка блока режима бога — значит и не шахта;
//  · декор — пусто или убираемый (у шаблона meta.interact.on = true); объект на
//    клетке (босс, сундук) не мешает.
//
// Строка клетки — `c`, её местность — `t` (LEFT JOIN: клетки без шаблона
// местности тоже читаются и получают no_cell).
import { WATER_SQL } from "@/server/api/beta-raid/cell-sql";
import { VEIN_REFUSALS, type VeinRefusal } from "@/lib/veinPlace";

/** Признак «этим клетка жилу не держит» — выражение над c и t. */
export const VEIN_BAD_SQL: Record<VeinRefusal, string> = {
  "vein.no_cell": "t.id IS NULL",
  "vein.void": "COALESCE(c.void_fog, false)",
  "vein.water": WATER_SQL,
  "vein.castle": "(t.name ~* '(грядк|замок)')",
  "vein.road": "COALESCE(btrim(c.road_id), '') <> ''",
  "vein.built": "(c.building_id IS NOT NULL OR c.group_id IS NOT NULL)",
  "vein.decor": `(c.decoration_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM yuplink.mystic_item_template d
        WHERE d.id = c.decoration_id
          AND jsonb_typeof(d.meta->'interact') = 'object'
          AND d.meta->'interact'->>'on' = 'true'))`,
  "vein.taken": `EXISTS (SELECT 1 FROM yuplink.raid_map_vein v
        WHERE v.map_id = c.map_id AND v.q = c.q AND v.r = c.r)`,
  // Родная клетка точки возрождения моба: на жилу моб не встаёт — точка выключилась бы навсегда.
  "vein.spawn": `EXISTS (SELECT 1 FROM yuplink.raid_mob_spawn s
        WHERE s.map_id = c.map_id AND s.home_q = c.q AND s.home_r = c.r)`,
};

/** Имя столбца признака в ответе: vein.no_cell → f_no_cell (приставка — мимо слов SQL). */
export const factCol = (k: VeinRefusal): string => `f_${k.slice("vein.".length)}`;

/** Столбцы признаков для SELECT: «COALESCE(…, false) AS f_no_cell, …». */
export const veinFactColsSql = (): string =>
  VEIN_REFUSALS.map((k) => `COALESCE(${VEIN_BAD_SQL[k]}, false) AS ${factCol(k)}`).join(",\n");

/** Клетка держит жилу: ни одного признака. */
export const veinOkSql = (): string =>
  VEIN_REFUSALS.map((k) => `NOT COALESCE(${VEIN_BAD_SQL[k]}, false)`).join("\n AND ");

/** Строка ответа со столбцами признаков → признаки lib/veinPlace. */
export function factsFromRow(
  row: Record<string, unknown> | null | undefined,
): Partial<Record<VeinRefusal, boolean>> | null {
  if (!row) return null;
  const out: Partial<Record<VeinRefusal, boolean>> = {};
  for (const k of VEIN_REFUSALS) out[k] = row[factCol(k)] === true;
  return out;
}
