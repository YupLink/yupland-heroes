// Требование места шахты в операторе постановки (ПРАВИЛА §8.59.8, mine-place-sql):
//  · лесопилка и каменная — не меньше 3 деревьев или гор на шести соседних
//    клетках (raid_nature_around, migrations/minev2-20);
//  · золотая и алмазная — клетка лежит на жиле того же вида (raid_map_vein,
//    владелец 21.10.2026), природа вокруг не считается.
// Читается тем же оператором после локов клетки и карты. Таблицу жил трогает
// только SQL золота и алмазов: дерево и камень от неё не зависят.
import { sqlStr } from "@/server/api/raid-shared";
import {
  MINE_PLACE_NATURE,
  MINE_PLACE_NEED,
  MINE_PLACE_VEIN,
  isVeinBlueprint,
  type PlaceableBlueprint,
  type VeinBlueprint,
} from "@/lib/minePlacement";
import { cellAt, sameCellAsC, type CellAt } from "@/server/api/beta-raid/chest/chest-cell";

/** Кусок оператора: CTE, её имя для FROM, условие и столбцы ответа. */
export type NeedSql = {
  cte: string;
  from: string;
  ok: string;
  trees: string;
  mountains: string;
  vein: string;
};

/**
 * Жила вида шахты под клеткой (at — как сопоставить raid_map_vein с клеткой). Любая —
 * и карты, и купленная игроком: шахту на ней ставит кто угодно (владелец, 29.10.2026).
 */
const veinHereSql = (kind: VeinBlueprint, at: CellAt): string =>
  `EXISTS (SELECT 1 FROM yuplink.raid_map_vein v
                       WHERE ${at("v")}
                         AND v.kind = ${sqlStr(MINE_PLACE_VEIN[kind])})`;

/**
 * То же требование для строки клетки c — пачкой (кандидаты режима стройки):
 * join добавляется к FROM, столбцы — в SELECT. Природа — та же функция базы.
 */
export function needColsSql(kind: PlaceableBlueprint): {
  join: string;
  trees: string;
  mountains: string;
  vein: string;
} {
  if (isVeinBlueprint(kind))
    return {
      join: "",
      trees: "NULL::int",
      mountains: "NULL::int",
      vein: veinHereSql(kind, sameCellAsC),
    };
  return {
    join: "LEFT JOIN LATERAL yuplink.raid_nature_around(c.map_id, c.q, c.r) na ON true",
    trees: "na.trees",
    mountains: "na.mountains",
    vein: "NULL::boolean",
  };
}

export function placeNeedSql(
  kind: PlaceableBlueprint,
  mapId: string,
  q: number,
  r: number,
): NeedSql {
  const m = sqlStr(mapId);
  if (isVeinBlueprint(kind)) {
    return {
      cte: `vn AS (
       SELECT ${veinHereSql(kind, cellAt(mapId, q, r))} AS here
     )`,
      from: "vn",
      ok: "vn.here",
      trees: "NULL::int",
      mountains: "NULL::int",
      vein: "(SELECT vn.here FROM vn)",
    };
  }
  const col = MINE_PLACE_NATURE[kind] === "tree" ? "na.trees" : "na.mountains";
  return {
    cte: `na AS (
       SELECT n.trees, n.mountains FROM yuplink.raid_nature_around(${m}, ${q}, ${r}) n
     )`,
    from: "na",
    ok: `${col} >= ${MINE_PLACE_NEED}`,
    trees: "(SELECT na.trees FROM na)",
    mountains: "(SELECT na.mountains FROM na)",
    vein: "NULL::boolean",
  };
}
