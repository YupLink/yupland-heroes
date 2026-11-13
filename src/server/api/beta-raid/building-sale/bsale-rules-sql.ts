// Куда встаёт купленная постройка (lib/buildingSale) — одним списком SQL-признаков,
// общим для подсветки круга (bsale-spots) и оператора установки (bsale-place-sql):
// пустая суша — без дороги, постройки, декора, объекта, беглеца, сундука, мешочка,
// жилы, героя и точки возрождения моба, и не вплотную к шахте: постройки города
// закрывают соседей от динамита (dynamite-04), а купленный склад у своей шахты
// сделал бы её вечной (находка критика 05.11).
//
// Строка клетки — `c`, её местность — `t` (LEFT JOIN: клетки без шаблона
// местности тоже читаются и получают no_cell).
import { WATER_SQL } from "@/server/api/beta-raid/cell-sql";
import { mineCellSql } from "@/server/api/beta-raid/mine-cell-sql";
import { BUILDING_REFUSALS, type BuildingRefusal } from "@/lib/buildingSale";

/** Признак «этим клетка постройку не держит» — выражение над c и t. */
export const BSALE_BAD_SQL: Record<BuildingRefusal, string> = {
  "bsale.no_cell": "t.id IS NULL",
  "bsale.void": "COALESCE(c.void_fog, false)",
  "bsale.water": WATER_SQL,
  "bsale.castle": "(t.name ~* '(грядк|замок)')",
  "bsale.road": "COALESCE(btrim(c.road_id), '') <> ''",
  "bsale.built": "(c.building_id IS NOT NULL OR c.group_id IS NOT NULL)",
  "bsale.decor": "c.decoration_id IS NOT NULL",
  "bsale.object": "c.object_id IS NOT NULL",
  "bsale.runner": `EXISTS (SELECT 1 FROM yuplink.beta_raid_runner rr
        WHERE rr.map_id = c.map_id AND rr.q = c.q AND rr.r = c.r)`,
  "bsale.chest": `(EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc
        WHERE mc.map_id = c.map_id AND mc.q = c.q AND mc.r = c.r)
     OR EXISTS (SELECT 1 FROM yuplink.raid_plain_chest pc
        WHERE pc.map_id = c.map_id AND pc.q = c.q AND pc.r = c.r))`,
  "bsale.bag": `EXISTS (SELECT 1 FROM yuplink.raid_loot_bag lb
        WHERE lb.map_id = c.map_id AND lb.q = c.q AND lb.r = c.r)`,
  "bsale.vein": `EXISTS (SELECT 1 FROM yuplink.raid_map_vein v
        WHERE v.map_id = c.map_id AND v.q = c.q AND v.r = c.r)`,
  "bsale.hero": `EXISTS (SELECT 1 FROM yuplink.beta_raid_positions p
        WHERE p.map_id = c.map_id AND p.q = c.q AND p.r = c.r)`,
  "bsale.spawn": `EXISTS (SELECT 1 FROM yuplink.raid_mob_spawn s
        WHERE s.map_id = c.map_id AND s.home_q = c.q AND s.home_r = c.r)`,
  "bsale.near_mine": `EXISTS (SELECT 1 FROM yuplink.raid_map_cells nm
        WHERE nm.map_id = c.map_id
          AND nm.q BETWEEN c.q - 1 AND c.q + 1 AND nm.r BETWEEN c.r - 1 AND c.r + 1
          AND abs(nm.q - c.q) + abs(nm.r - c.r) + abs(nm.q - c.q + nm.r - c.r) = 2
          AND ${mineCellSql("nm")})`,
};

/** Имя столбца признака: bsale.no_cell → f_no_cell. */
export const factCol = (k: BuildingRefusal): string => `f_${k.slice("bsale.".length)}`;

/** Столбцы признаков для SELECT. */
export const bsaleFactColsSql = (): string =>
  BUILDING_REFUSALS.map((k) => `COALESCE(${BSALE_BAD_SQL[k]}, false) AS ${factCol(k)}`).join(",\n");

/** Клетка держит постройку: ни одного признака. */
export const bsaleOkSql = (): string =>
  BUILDING_REFUSALS.map((k) => `NOT COALESCE(${BSALE_BAD_SQL[k]}, false)`).join("\n AND ");

/** Строка ответа со столбцами признаков → признаки lib/buildingSale. */
export function factsFromRow(
  row: Record<string, unknown> | null | undefined,
): Partial<Record<BuildingRefusal, boolean>> | null {
  if (!row) return null;
  const out: Partial<Record<BuildingRefusal, boolean>> = {};
  for (const k of BUILDING_REFUSALS) out[k] = row[factCol(k)] === true;
  return out;
}
